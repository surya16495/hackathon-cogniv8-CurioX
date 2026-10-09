// The daily-zine contract: the reader card (onboarding), issues and their decks of cards,
// talk mode and teach-it-back. Model output is validated with these schemas on the server.
import { z } from 'zod';
import { toArtKey, type ArtKey } from './art';
import type { Provider, Source } from './types';

// ---------- Reader card (six chip questions) ----------
export const READER_KEYS = ['interests', 'level', 'goals', 'style', 'tone', 'curious'] as const;
export type ReaderKey = (typeof READER_KEYS)[number];
export type ReaderCard = Record<ReaderKey, string[]>;

export interface ReaderQuestion {
  key: ReaderKey;
  /** Short label on the reader card, e.g. "Into". */
  label: string;
  q: string;
  hint: string;
  multi: boolean;
  /** Shows a "write your own" field under the chips. */
  free?: boolean;
  options: string[];
}

const chip = z.string().trim().min(1).max(120);
export const readerCardSchema = z.object({
  interests: z.array(chip).max(12).default([]),
  level: z.array(chip).max(1).default([]),
  goals: z.array(chip).max(8).default([]),
  style: z.array(chip).max(8).default([]),
  tone: z.array(chip).max(1).default([]),
  curious: z.array(z.string().trim().min(1).max(200)).max(8).default([]),
});

/** POST /api/onboarding/tailor: questions 2 to 6, shaped by the interests picked in question 1. */
export const tailorRequestSchema = z.object({ interests: z.array(chip).min(1).max(12) }).strict();
export interface TailorResponse {
  questions: ReaderQuestion[];
  provider: Provider;
}

/** POST /api/onboarding/complete: save the whole card at once. */
export const completeOnboardingSchema = z.object({ reader: readerCardSchema }).strict();

// ---------- Cards ----------
const text = (max: number) => z.string().trim().min(1).max(max);
/** Art from the model: any string, mapped to a known key so a typo never fails a whole deck. */
const art = z.unknown().transform((v) => toArtKey(v));

export const sourceRefSchema = z.object({
  title: text(200),
  url: z.string().url().max(2000),
  site: text(100),
  summary: z.string().trim().max(300).default(''),
});
export type SourceRef = z.infer<typeof sourceRefSchema>;

export const videoSchema = z.object({
  title: text(160),
  videoId: z.string().regex(/^[A-Za-z0-9_-]{6,20}$/),
  url: z.string().url(),
  channel: z.string().trim().max(100).default(''),
});
export type Video = z.infer<typeof videoSchema>;

export const cardSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('hook'), title: text(40), lead: text(260), art, stickers: z.array(art).max(3).default([]) }),
  z.object({ kind: z.literal('what'), title: text(40), strips: z.array(text(120)).min(2).max(4), art, sticker: art, source: sourceRefSchema.nullable().default(null) }),
  z.object({ kind: z.literal('why'), title: text(60), body: text(320), art, note: z.string().trim().max(140).default('') }),
  z.object({ kind: z.literal('myth'), claim: text(140), answer: z.enum(['myth', 'fact']), explain: text(300), sticker: art, note: z.string().trim().max(80).default('guess first, then the card flips') }),
  z.object({
    kind: z.literal('ways'),
    question: text(120),
    ways: z.array(z.object({ label: text(24), text: text(300), art })).length(3),
    note: z.string().trim().max(140).default(''),
    sticker: art,
  }),
  z.object({
    kind: z.literal('vs'),
    title: text(40),
    left: z.object({ label: text(16), art }),
    right: z.object({ label: text(16), art }),
    rows: z.array(z.object({ k: text(24), l: text(60), r: text(60), more: text(200) })).min(2).max(4),
    art,
    sticker: art,
  }),
  z.object({
    kind: z.literal('guess'),
    question: text(200),
    min: z.number().finite(),
    max: z.number().finite(),
    answer: z.number().finite(),
    unit: z.string().trim().max(24).default(''),
    explain: text(260),
    art,
    sticker: art,
  }),
  z.object({ kind: z.literal('watch'), thumbTitle: text(40), video: videoSchema, art }),
  z.object({ kind: z.literal('simple'), h: text(80), body: text(360), art, note: z.string().trim().max(140).default(''), source: sourceRefSchema.nullable().default(null) }),
]);
export type Card = z.infer<typeof cardSchema>;
export type CardKind = Card['kind'];

export const deckQuizSchema = z.object({
  q: text(200),
  opts: z.array(text(120)).length(4),
  a: z.number().int().min(0).max(3),
  why: text(260),
  /** A few words naming what the question checks: "one to revisit: {tag}". */
  tag: text(60),
  /** The same idea explained another way, for "Explain that one another way". */
  re: text(320),
});
export type DeckQuizQuestion = z.infer<typeof deckQuizSchema>;

export const teachSchema = z.object({ q: text(160), sample: text(200), add: text(160) });
export type TeachPrompt = z.infer<typeof teachSchema>;

export const DECK_KINDS = ['lead', 'story', 'chat', 'talk', 'demo'] as const;
export type DeckKind = (typeof DECK_KINDS)[number];

export interface Deck {
  id: string;
  /** Issue number shown as "No. 14". */
  no: number;
  kind: DeckKind;
  title: string;
  /** Typewriter tag beside the number: "today", "from your talk", "demo issue". */
  tag: string;
  /** The interest this story belongs to, for grouping on Home. */
  topic: string;
  art: ArtKey;
  cards: Card[];
  teach: TeachPrompt;
  quiz: DeckQuizQuestion[];
  sources: Source[];
  provider: Provider;
  createdAt: string;
}

export type DeckSummary = Pick<Deck, 'id' | 'no' | 'kind' | 'title' | 'tag' | 'topic' | 'art' | 'createdAt'> & { cardCount: number };

export interface Issue {
  no: number;
  /** The reader's local date, YYYY-MM-DD. */
  date: string;
  lead: Deck;
  stories: Deck[];
  /** Interests with nothing new today. */
  quiet: string[];
}

/** GET /api/issues/today?date=YYYY-MM-DD */
export interface TodayResponse {
  issue: Issue;
  backIssues: DeckSummary[];
}

/** POST /api/decks: turn a chat or a talk into a deck. */
export const createDeckSchema = z.discriminatedUnion('from', [
  z.object({ from: z.literal('chat'), conversationId: z.string().regex(/^[a-f0-9]{24}$/i) }).strict(),
  z.object({
    from: z.literal('talk'),
    title: z.string().trim().max(80).optional(),
    points: z.array(z.object({ h: text(80), say: text(400) })).min(1).max(12),
  }).strict(),
]);
export type CreateDeckRequest = z.infer<typeof createDeckSchema>;

// ---------- Talk ----------
export const talkPointSchema = z.object({ h: text(60), say: text(300) });
export type TalkPoint = z.infer<typeof talkPointSchema>;

export const talkRequestSchema = z
  .object({
    message: text(1000),
    history: z.array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().max(2000) })).max(12).default([]),
  })
  .strict();
export interface TalkResponse {
  /** Spoken reply, plain text. */
  reply: string;
  /** The same reply as key points, each dropped onto the screen as a slip. */
  points: TalkPoint[];
  provider: Provider;
}

// ---------- Teach it back ----------
export const teachRequestSchema = z
  .object({
    q: text(200),
    said: text(1000),
    /** The deck's own one-line answer, so the marking stays on topic. */
    sample: z.string().trim().max(300).optional(),
  })
  .strict();
export interface TeachResponse {
  verdict: 'got_it' | 'nearly' | 'not_yet';
  /** One line in the companion's voice. */
  feedback: string;
  /** "one thing to add: …" */
  add: string;
  provider: Provider;
}
