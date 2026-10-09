import { Router } from 'express';
import { chatRequestSchema, type ChatResponse, type SseEvent } from '@lumora/shared';
import { currentUser } from '../middleware/session';
import { quotaLimiter } from '../middleware/rateLimit';
import { prepareChat, runChat, type Emit } from '../services/chat/orchestrator';
import { openSse } from '../utils/sse';
import { describeError } from '../utils/errors';
import type { Services } from '../services';

export function chatRouter(services: Services): Router {
  const router = Router();

  // POST /api/chat: streamed reply over SSE, or one JSON body with stream=false.
  router.post('/', quotaLimiter(20), async (req, res) => {
    const body = chatRequestSchema.parse(req.body ?? {});
    const wantsStream = body.stream !== false && req.query.stream !== 'false';

    // Validation and ownership errors become normal JSON errors, before any stream starts.
    const prepared = await prepareChat(currentUser(req), body);

    // Stop spending model quota when the client goes away mid-answer.
    const controller = new AbortController();
    res.on('close', () => {
      if (!res.writableEnded) controller.abort(new Error('Client disconnected'));
    });

    if (!wantsStream) {
      const result = await runChat(prepared, services, () => undefined, controller.signal);
      if (controller.signal.aborted || !result.assistantMessage) return;
      const payload: ChatResponse = {
        conversationId: result.conversationId,
        userMessage: result.userMessage,
        assistantMessage: result.assistantMessage,
        provider: result.provider,
        demo: result.provider === 'demo',
      };
      res.json(payload);
      return;
    }

    const sse = openSse(res);
    const emit: Emit = (e: SseEvent) => sse.send(e.event, e.data);
    try {
      await runChat(prepared, services, emit, controller.signal);
    } catch (err) {
      if (!controller.signal.aborted) {
        console.error(`[chat] failed: ${describeError(err)}`);
        sse.send('error', {
          message: 'Lumora could not finish this answer. Please try again.',
          code: 'CHAT_FAILED',
          conversationId: prepared.conversation._id.toString(),
        });
      }
    } finally {
      sse.close();
    }
  });

  return router;
}
