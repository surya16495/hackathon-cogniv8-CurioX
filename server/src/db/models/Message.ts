import { Schema, Types, model, type HydratedDocument, type InferSchemaType } from 'mongoose';
import { LEARN_ACTION_IDS, PROVIDERS, type ChatMessage } from '@lumora/shared';

const sourceSchema = new Schema(
  {
    id: { type: Number, required: true },
    title: { type: String, default: '' },
    url: { type: String, required: true },
    snippet: { type: String, default: '' },
  },
  { _id: false },
);

const messageSchema = new Schema(
  {
    conversationId: { type: Types.ObjectId, ref: 'Conversation', required: true },
    role: { type: String, enum: ['user', 'assistant'], required: true },
    content: { type: String, default: '' },
    sources: { type: [sourceSchema], default: [] },
    action: { type: String, enum: [...LEARN_ACTION_IDS, null], default: null },
    provider: { type: String, enum: [...PROVIDERS, null], default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

messageSchema.index({ conversationId: 1, createdAt: 1 });

export type MessageDoc = HydratedDocument<InferSchemaType<typeof messageSchema>>;
export const Message = model('Message', messageSchema);

export function toChatMessage(m: MessageDoc): ChatMessage {
  return {
    id: m._id.toString(),
    conversationId: m.conversationId.toString(),
    role: m.role,
    content: m.content ?? '',
    sources: (m.sources ?? []).map((s) => ({ id: s.id, title: s.title ?? '', url: s.url, snippet: s.snippet ?? '' })),
    action: (m.action ?? null) as ChatMessage['action'],
    provider: (m.provider ?? null) as ChatMessage['provider'],
    createdAt: (m.createdAt ?? new Date()).toISOString(),
  };
}
