import { Router } from 'express';
import { createDeckSchema, talkFinishSchema, talkOpenSchema, talkRequestSchema, teachRequestSchema, type Source, type TalkFinishResponse } from '@curiox/shared';
import { Conversation, Message, TalkSession, User, type UserDoc } from '../db/models';
import { currentUser } from '../middleware/session';
import { quotaLimiter } from '../middleware/rateLimit';
import { addTopicStory, deckFromConversation, deckFromTalk, deckFromTalkSummary, discardIssue, getDeck, issueDate, todayIfMade, todayIssue } from '../services/issues';
import { finishTalk, openTalk, talk, teachBack } from '../services/learn/talk';
import { sanitizeProfile } from '../services/onboarding/extract';
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
    const messageCount = await Message.countDocuments({ conversationId: conversation._id });
    res.status(201).json(await deckFromConversation(user, conversation._id.toString(), conversation.title ?? 'Your chat', transcript, sources, messageCount, services.llm));
  });

  return router;
}

export function talkRouter(services: Services): Router {
  const router = Router();
  const issueFor = (user: UserDoc, date: unknown) => todayIfMade(user, issueDate(date));

  // POST /api/talk/open: the greeting with today's updates, then "what do you want to learn about?"
  router.post('/open', quotaLimiter(20), async (req, res) => {
    const user = currentUser(req);
    const body = talkOpenSchema.parse(req.body ?? {});
    const issue = await issueFor(user, body.date);
    res.json(await openTalk(userProfile(user), issue, body.hour ?? new Date().getHours(), services.llm));
  });

  // POST /api/talk: one spoken turn, returned as key points, with the next stage.
  router.post('/', quotaLimiter(30), async (req, res) => {
    const user = currentUser(req);
    const body = talkRequestSchema.parse(req.body ?? {});
    const issue = await issueFor(user, body.date);
    res.json(await talk({ message: body.message, history: body.history, stage: body.stage, topic: body.topic, issue }, userProfile(user), services.llm));
  });

  // POST /api/talk/finish: keep the key points, score the interest, update the reader.
  router.post('/finish', quotaLimiter(10), async (req, res) => {
    const user = currentUser(req);
    const body = talkFinishSchema.parse(req.body ?? {});
    const date = issueDate(body.date);
    const profile = userProfile(user);
    const result = await finishTalk({ topic: body.topic, history: body.history, points: body.points }, profile, services.llm);

    let addedInterest = false;
    let deckId: string | null = null;
    let updatedProfile = profile;
    if (result.level === 'high') {
      const topic = result.topic.trim();
      const known = profile.interests.some((i) => i.toLowerCase() === topic.toLowerCase());
      if (!known && topic) {
        const reader = profile.reader ? { ...profile.reader, interests: [...profile.reader.interests, topic] } : undefined;
        updatedProfile = sanitizeProfile({ ...profile, interests: [...profile.interests, topic], ...(reader ? { reader } : {}) });
        await User.updateOne({ _id: user._id }, { $set: { profile: updatedProfile } });
        addedInterest = true;
      }
      deckId = await addTopicStory(user, topic, date, services).catch(() => null);
    }

    // The talk's own summary, under Back issues, whatever the interest score.
    const summary = body.history.length ? await deckFromTalkSummary(user, result.topic, result.keyPoints, body.points).catch(() => null) : null;

    await TalkSession.create({
      userId: user._id,
      date,
      topic: result.topic,
      keyPoints: result.keyPoints,
      points: body.points,
      interest: result.interest,
      transcript: body.history,
      deckId: deckId ?? summary?.id ?? null,
    });

    const payload: TalkFinishResponse = { ...result, addedInterest, deckId, summaryDeckId: summary?.id ?? null, profile: updatedProfile };
    res.json(payload);
  });

  // POST /api/talk/teach: mark a teach-it-back answer.
  router.post('/teach', quotaLimiter(20), async (req, res) => {
    const body = teachRequestSchema.parse(req.body ?? {});
    res.json(await teachBack(body, services.llm));
  });

  return router;
}
