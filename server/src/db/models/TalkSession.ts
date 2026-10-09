import { Schema, Types, model, type HydratedDocument, type InferSchemaType } from 'mongoose';

/** One finished talk: what it was about, what to remember, and how keen the reader was. */
const talkSessionSchema = new Schema(
  {
    userId: { type: Types.ObjectId, ref: 'User', required: true },
    date: { type: String, required: true },
    topic: { type: String, required: true, maxlength: 120 },
    keyPoints: { type: [String], default: [] },
    points: { type: [{ _id: false, h: String, say: String }], default: [] },
    interest: { type: Number, required: true, min: 0, max: 100 },
    transcript: { type: [{ _id: false, role: { type: String, enum: ['user', 'assistant'] }, content: String }], default: [] },
    /** Set when the talk added a story to the day's issue. */
    deckId: { type: Types.ObjectId, ref: 'Deck', default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

talkSessionSchema.index({ userId: 1, createdAt: -1 });

export type TalkSessionDoc = HydratedDocument<InferSchemaType<typeof talkSessionSchema>>;
export const TalkSession = model('TalkSession', talkSessionSchema);
