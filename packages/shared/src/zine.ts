// The daily-zine contract: the reader card (onboarding), issues and their decks of cards,
// talk mode and teach-it-back. Model output is validated with these schemas on the server.
import { z } from 'zod';
import { toArtKey, type ArtKey } from './art';
import type { Profile, Provider, Source } from './types';

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
    points: z.array(z.object({ h: text(80), say: text(400) })).min(1).max(40),
  }).strict(),
]);
export type CreateDeckRequest = z.infer<typeof createDeckSchema>;

// ---------- Talk ----------
export const talkPointSchema = z.object({ h: text(60), say: text(300) });
export type TalkPoint = z.infer<typeof talkPointSchema>;

/** How the voice sounds: the words and the speech (rate, pitch) both follow it. */
export const VOICE_TONES = ['friendly', 'casual', 'playful'] as const;
export type VoiceTone = (typeof VOICE_TONES)[number];
export const VOICE_TONE_LABEL: Record<VoiceTone, string> = { friendly: 'Friendly', casual: 'Casual', playful: 'Playful' };

/** The reader card's tone chip ("Witty", "Like a coach"…) mapped onto the three voice tones. */
export function voiceToneOf(tone: string | undefined | null): VoiceTone {
  const t = (tone ?? '').toLowerCase();
  if (/playful|witty|fun/.test(t)) return 'playful';
  if (/casual|blunt|chill|relaxed/.test(t)) return 'casual';
  return 'friendly';
}

/** How the device voice speaks each tone. */
export const VOICE_TONE_SPEECH: Record<VoiceTone, { rate: number; pitch: number }> = {
  friendly: { rate: 1.0, pitch: 1.0 },
  casual: { rate: 1.02, pitch: 0.94 },
  playful: { rate: 1.08, pitch: 1.12 },
};

/**
 * The guided conversation. The server drives it: every reply ends with the question the next
 * stage needs, and the client only passes the stage back.
 *   topic   → the reader says what to learn about
 *   view    → CurioX explained it and asked for their view
 *   reflect → CurioX reacted, explained the impact, and asked what they make of that
 *   free    → open conversation until they wrap up
 */
export const TALK_STAGES = ['topic', 'view', 'reflect', 'free'] as const;
export type TalkStage = (typeof TALK_STAGES)[number];

const talkHistory = z.array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().max(2000) })).max(16).default([]);

/** POST /api/talk/open: the greeting, with today's updates. */
export const talkOpenSchema = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), hour: z.number().int().min(0).max(23).optional() }).strict();
export interface TalkOpenResponse {
  points: TalkPoint[];
  reply: string;
  stage: TalkStage;
  provider: Provider;
}

export const talkRequestSchema = z
  .object({
    message: text(1000),
    history: talkHistory,
    stage: z.enum(TALK_STAGES).default('free'),
    topic: z.string().trim().max(80).optional(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  })
  .strict();
export interface TalkResponse {
  /** Spoken reply, plain text. */
  reply: string;
  /** The same reply as key points, each dropped onto the screen as a slip. */
  points: TalkPoint[];
  /** Where the conversation is now. */
  stage: TalkStage;
  /** The topic being talked about, once there is one. */
  topic: string | null;
  /** The reader said goodbye in their own words. */
  done: boolean;
  provider: Provider;
}

/** POST /api/talk/finish: keep the key points, score the interest, update the reader. */
export const talkFinishSchema = z
  .object({
    topic: z.string().trim().max(80).optional(),
    history: talkHistory,
    points: z.array(talkPointSchema).max(30).default([]),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  })
  .strict();
export interface TalkFinishResponse {
  topic: string;
  keyPoints: string[];
  /** 0 to 100: how keen the reader seemed on the topic. */
  interest: number;
  level: 'low' | 'medium' | 'high';
  /** The topic was added to the reader's interests. */
  addedInterest: boolean;
  /** A story on the topic was added to today's issue. */
  deckId: string | null;
  /** One spoken line to say goodbye with. */
  reply: string;
  profile: Profile;
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
