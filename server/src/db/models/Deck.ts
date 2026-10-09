import { Schema, Types, model, type HydratedDocument, type InferSchemaType } from 'mongoose';
import { DECK_KINDS, PROVIDERS, type Deck as DeckDto, type DeckSummary } from '@curiox/shared';

// Cards, the teach prompt and the quiz are validated with the shared zod schemas before they are saved,
// so they are stored as plain objects rather than mirrored field by field.
const deckSchema = new Schema(
  {
    userId: { type: Types.ObjectId, ref: 'User', required: true },
    no: { type: Number, required: true },
    kind: { type: String, enum: DECK_KINDS, required: true },
    title: { type: String, required: true, maxlength: 120 },
    tag: { type: String, default: '' },
    topic: { type: String, default: '' },
    art: { type: String, default: 'bulb' },
    cards: { type: [Schema.Types.Mixed], default: [] },
    teach: { type: Schema.Types.Mixed, required: true },
    quiz: { type: [Schema.Types.Mixed], default: [] },
    sources: { type: [Schema.Types.Mixed], default: [] },
    provider: { type: String, enum: PROVIDERS, default: 'demo' },
    /** The issue date (YYYY-MM-DD) for lead and story decks. */
    date: { type: String, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

deckSchema.index({ userId: 1, createdAt: -1 });

export type DeckDoc = HydratedDocument<InferSchemaType<typeof deckSchema>>;
export const DeckModel = model('Deck', deckSchema);

export function toDeck(d: DeckDoc): DeckDto {
  return {
    id: d._id.toString(),
    no: d.no,
    kind: d.kind as DeckDto['kind'],
    title: d.title,
    tag: d.tag ?? '',
    topic: d.topic ?? '',
    art: d.art as DeckDto['art'],
    cards: d.cards as DeckDto['cards'],
    teach: d.teach as DeckDto['teach'],
    quiz: d.quiz as DeckDto['quiz'],
    sources: d.sources as DeckDto['sources'],
    provider: d.provider as DeckDto['provider'],
    createdAt: (d.createdAt ?? new Date()).toISOString(),
  };
}

export function toDeckSummary(d: DeckDoc): DeckSummary {
  const { id, no, kind, title, tag, topic, art, createdAt, cards } = toDeck(d);
  // +1: every deck ends with the "You came this far" card.
  return { id, no, kind, title, tag, topic, art, createdAt, cardCount: cards.length + 1 };
}
