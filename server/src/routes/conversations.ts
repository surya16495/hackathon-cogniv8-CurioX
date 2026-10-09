import { Router } from 'express';
import type { ConversationSummary, MessagesResponse } from '@lumora/shared';
import { Conversation, Message, toChatMessage } from '../db/models';
import { currentUser } from '../middleware/session';
import { notFound } from '../utils/errors';

const OBJECT_ID = /^[a-f0-9]{24}$/i;
const MAX_MESSAGES = 200;

export function conversationsRouter(): Router {
  const router = Router();

  // GET /api/conversations: the device's recent conversations (newest first).
  router.get('/', async (req, res) => {
    const user = currentUser(req);
    const list = await Conversation.find({ userId: user._id }).sort({ updatedAt: -1 }).limit(50).lean();
    const body: ConversationSummary[] = list.map((c) => ({
      id: c._id.toString(),
      title: c.title ?? 'Conversation',
      updatedAt: (c.updatedAt ?? c.createdAt ?? new Date()).toISOString(),
    }));
    res.json({ conversations: body });
  });

  // GET /api/conversations/:id/messages: reload history after a refresh.
  router.get('/:id/messages', async (req, res) => {
    const user = currentUser(req);
    const { id } = req.params;
    if (!OBJECT_ID.test(id)) throw notFound('Conversation not found');
    const conversation = await Conversation.findOne({ _id: id, userId: user._id });
    if (!conversation) throw notFound('Conversation not found');

    const latest = await Message.find({ conversationId: conversation._id }).sort({ createdAt: -1, _id: -1 }).limit(MAX_MESSAGES);
    const body: MessagesResponse = {
      conversationId: conversation._id.toString(),
      title: conversation.title ?? 'Conversation',
      messages: latest.reverse().map(toChatMessage),
    };
    res.json(body);
  });

  return router;
}
