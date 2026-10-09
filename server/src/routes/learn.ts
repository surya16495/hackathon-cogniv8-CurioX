import { Router } from 'express';
import { quizRequestSchema } from '@lumora/shared';
import { Conversation, Message } from '../db/models';
import { currentUser } from '../middleware/session';
import { quotaLimiter } from '../middleware/rateLimit';
import { generateQuiz } from '../services/learn/quiz';
import { userProfile } from '../services/onboarding/steps';
import { notFound } from '../utils/errors';
import type { Services } from '../services';

export function learnRouter(services: Services): Router {
  const router = Router();

  // POST /api/learn/quiz: 3 to 5 multiple-choice questions for the current topic.
  router.post('/quiz', quotaLimiter(10), async (req, res) => {
    const user = currentUser(req);
    const body = quizRequestSchema.parse(req.body ?? {});

    let topic = body.topic;
    let context: string | undefined;
    if (body.conversationId) {
      const conversation = await Conversation.findOne({ _id: body.conversationId, userId: user._id });
      if (!conversation) throw notFound('Conversation not found');
      const recent = (await Message.find({ conversationId: conversation._id }).sort({ createdAt: -1, _id: -1 }).limit(4)).reverse();
      context = recent
        .map((m) => `${m.role === 'user' ? 'Learner' : 'Lumora'}: ${(m.content ?? '').slice(0, 800)}`)
        .join('\n');
      topic ??= conversation.title ?? 'this topic';
    }

    res.json(await generateQuiz({ topic: topic!, context, profile: userProfile(user), count: body.count }, services.llm));
  });

  return router;
}
