import { Router } from 'express';
import { createDeckSchema, talkRequestSchema, teachRequestSchema, type Source } from '@curiox/shared';
import { Conversation, Message } from '../db/models';
import { currentUser } from '../middleware/session';
import { quotaLimiter } from '../middleware/rateLimit';
import { deckFromConversation, deckFromTalk, discardIssue, getDeck, issueDate, todayIssue } from '../services/issues';
import { talk, teachBack } from '../services/learn/talk';
import { userProfile } from '../services/onboarding/steps';
import { notFound } from '../utils/errors';
import type { Services } from '../services';

export function issuesRouter(services: Services): Router {
  const router = Router();

  // GET /api/issues/today?date=YYYY-MM-DD: today's issue, made on first request (can take ~20 s), then kept.
  router.get('/today', quotaLimiter(10), async (req, res) => {
    res.json(await todayIssue(currentUser(req), issueDate(req.query.date), services));
  });

  // DELETE /api/issues/today?date=…: forget today's issue so the next GET makes a fresh one.
  router.delete('/today', async (req, res) => {
    await discardIssue(currentUser(req), issueDate(req.query.date));
    res.status(204).end();
  });

  return router;
}

export function decksRouter(services: Services): Router {
  const router = Router();

  router.get('/:id', async (req, res) => {
    const deck = await getDeck(currentUser(req), req.params.id);
    if (!deck) throw notFound('Deck not found');
    res.json(deck);
  });

  // POST /api/decks: "Show as cards" from a chat, or "Staple into a deck" from a talk.
  router.post('/', quotaLimiter(10), async (req, res) => {
    const user = currentUser(req);
    const body = createDeckSchema.parse(req.body ?? {});
    if (body.from === 'talk') {
      res.status(201).json(await deckFromTalk(user, body.title, body.points));
      return;
    }
    const conversation = await Conversation.findOne({ _id: body.conversationId, userId: user._id });
    if (!conversation) throw notFound('Conversation not found');
    const recent = (await Message.find({ conversationId: conversation._id }).sort({ createdAt: -1, _id: -1 }).limit(6)).reverse();
    const transcript = recent.map((m) => `${m.role === 'user' ? 'Learner' : 'CurioX'}: ${m.content ?? ''}`).join('\n\n');
    const last = [...recent].reverse().find((m) => m.role === 'assistant' && m.sources?.length);
    const sources: Source[] = (last?.sources ?? []).map((s) => ({ id: s.id, title: s.title ?? '', url: s.url, snippet: s.snippet ?? '' }));
    res.status(201).json(await deckFromConversation(user, conversation.title ?? 'Your chat', transcript, sources, services.llm));
  });

  return router;
}

export function talkRouter(services: Services): Router {
  const router = Router();

  // POST /api/talk: one spoken turn, returned as key points.
  router.post('/', quotaLimiter(20), async (req, res) => {
    const body = talkRequestSchema.parse(req.body ?? {});
    res.json(await talk(body.message, body.history, userProfile(currentUser(req)), services.llm));
  });

  // POST /api/talk/teach: mark a teach-it-back answer.
  router.post('/teach', quotaLimiter(20), async (req, res) => {
    const body = teachRequestSchema.parse(req.body ?? {});
    res.json(await teachBack(body, services.llm));
  });

  return router;
}
