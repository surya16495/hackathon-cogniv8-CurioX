import { Schema, Types, model, type HydratedDocument, type InferSchemaType } from 'mongoose';
import type { PinDto } from '@curiox/shared';

/** A source or video the reader kept for a deeper read. One row per (user, pin id). */
const pinSchema = new Schema(
  {
    userId: { type: Types.ObjectId, ref: 'User', required: true },
    pinId: { type: String, required: true },
    kind: { type: String, enum: ['article', 'video'], required: true },
    title: { type: String, required: true },
    site: { type: String, default: '' },
    summary: { type: String, default: '' },
    url: { type: String, required: true },
    videoId: { type: String, default: null },
    deckId: { type: String, default: '' },
    deckNo: { type: Number, default: 0 },
    deckTitle: { type: String, default: '' },
    card: { type: Number, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

pinSchema.index({ userId: 1, pinId: 1 }, { unique: true });

export type PinDoc = HydratedDocument<InferSchemaType<typeof pinSchema>>;
export const PinModel = model('Pin', pinSchema);

export function toPin(p: PinDoc): PinDto {
  return {
    id: p.pinId,
    kind: p.kind as PinDto['kind'],
    title: p.title,
    site: p.site ?? '',
    summary: p.summary ?? '',
    url: p.url,
    ...(p.videoId ? { videoId: p.videoId } : {}),
    deckId: p.deckId ?? '',
    deckNo: p.deckNo ?? 0,
    deckTitle: p.deckTitle ?? '',
    ...(p.card != null ? { card: p.card } : {}),
  };
}
