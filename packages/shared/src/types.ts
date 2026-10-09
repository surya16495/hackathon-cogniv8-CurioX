// The request/response contract shared by server, web and mobile.
// Request bodies are zod schemas so the server validates exactly what clients send.
import { z } from 'zod';
import { LEARN_ACTION_IDS, type LearnActionId } from './actions';
import { readerCardSchema } from './zine';

// ---------- Limits ----------
export const LIMITS = {
  deviceIdPattern: /^[A-Za-z0-9_-]{8,128}$/,
  messageMaxChars: 4000,
  onboardingAnswerMaxChars: 1000,
  historyMessages: 10,
  quizMin: 3,
  quizMax: 5,
  topicsMin: 4,
  topicsMax: 6,
} as const;

export const DEVICE_ID_HEADER = 'x-device-id';

// ---------- Profile ----------
export const KNOWLEDGE_LEVELS = ['beginner', 'intermediate', 'advanced'] as const;
export type KnowledgeLevel = (typeof KNOWLEDGE_LEVELS)[number];

const shortText = z.string().trim().min(1).max(200);

export const knowledgeLevelSchema = z.object({
  topic: shortText,
  level: z.enum(KNOWLEDGE_LEVELS),
});

export const profileSchema = z.object({
  interests: z.array(shortText).max(20).default([]),
  knowledgeLevels: z.array(knowledgeLevelSchema).max(20).default([]),
  goals: z.array(shortText).max(10).default([]),
  explanationStyle: z.string().trim().max(300).default(''),
  tone: z.string().trim().max(200).default(''),
  curiosities: z.array(shortText).max(20).default([]),
  /** The six answers exactly as picked on the reader card. The fields above are derived from it. */
  reader: readerCardSchema.optional(),
});
export type Profile = z.infer<typeof profileSchema>;

/** PUT /api/profile: any subset of fields; omitted fields are kept. */
export const profileUpdateSchema = profileSchema.partial().strict();
export type ProfileUpdate = z.infer<typeof profileUpdateSchema>;

// ---------- Onboarding ----------
export const ONBOARDING_STEPS = [
  'interests',
  'knowledgeLevels',
  'goals',
  'explanationStyle',
  'tone',
  'curiosities',
] as const;
export type OnboardingStepKey = (typeof ONBOARDING_STEPS)[number];

export const ONBOARDING_STATUSES = ['not_started', 'in_progress', 'completed', 'skipped'] as const;
export type OnboardingStatus = (typeof ONBOARDING_STATUSES)[number];

export interface OnboardingState {
  status: OnboardingStatus;
  /** 0-based index into ONBOARDING_STEPS of the question being asked. */
  step: number;
  totalSteps: number;
}

export const onboardingMessageSchema = z
  .object({
    /** The user's answer to the current question. Omit to start or re-fetch the current question. */
    message: z.string().trim().max(LIMITS.onboardingAnswerMaxChars).optional(),
    /** "question" skips the current question; "all" ends onboarding with whatever is known. */
    skip: z.enum(['question', 'all']).optional(),
    /** Start over from the first question. Clears earlier answers. */
    restart: z.boolean().optional(),
  })
  .strict();
export type OnboardingMessageRequest = z.infer<typeof onboardingMessageSchema>;

export interface OnboardingResponse {
  onboarding: OnboardingState;
  /** The next question, or null once onboarding is finished. */
  question: { key: OnboardingStepKey; text: string } | null;
  /** Present once onboarding is finished (completed or skipped). */
  profile: Profile | null;
}

// ---------- Accounts ----------
export interface Account {
  name: string;
  email: string;
}

/** PUT /api/account: the display name and a small photo (a data URL, at most 48 KB). */
export const accountUpdateSchema = z
  .object({
    name: z.string().trim().min(1).max(60).optional(),
    avatar: z.string().regex(/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/).max(48 * 1024).nullable().optional(),
  })
  .strict();
export type AccountUpdate = z.infer<typeof accountUpdateSchema>;

export const signUpSchema = z
  .object({
    name: z.string().trim().min(1).max(60),
    email: z.string().trim().toLowerCase().email().max(200),
    password: z.string().min(6).max(200),
  })
  .strict();
export type SignUpRequest = z.infer<typeof signUpSchema>;

export const signInSchema = z.object({ email: z.string().trim().toLowerCase().email().max(200), password: z.string().min(1).max(200) }).strict();
export type SignInRequest = z.infer<typeof signInSchema>;

/** Returned by sign-up and sign-in: keep `token` and send it as `Authorization: Bearer <token>`. */
export interface AuthResponse {
  token: string;
  account: Account;
  session: SessionResponse;
}

// ---------- Session ----------
export interface SessionResponse {
  userId: string;
  deviceId: string;
  profile: Profile;
  onboarding: OnboardingState;
  isNew: boolean;
  /** The signed-in account, or null for an anonymous device. */
  account: Account | null;
  /** The reader's photo as a data URL, if they set one (kept even without an account). */
  avatar: string | null;
  /** The display name, with or without an account. */
  name: string;
}

// ---------- Pins (saved per account, or per device when anonymous) ----------
export const pinSchema = z
  .object({
    /** The source URL or the video id. */
    id: z.string().trim().min(1).max(500),
    kind: z.enum(['article', 'video']),
    title: z.string().trim().min(1).max(300),
    site: z.string().trim().max(100).default(''),
    summary: z.string().trim().max(600).default(''),
    url: z.string().trim().url().max(2000),
    videoId: z.string().trim().max(40).optional(),
    deckId: z.string().trim().max(40),
    deckNo: z.number().int().min(0),
    deckTitle: z.string().trim().max(200),
    /** For a video: the card it sits on. */
    card: z.number().int().min(0).optional(),
  })
  .strict();
export type PinDto = z.infer<typeof pinSchema>;
export interface PinsResponse {
  pins: PinDto[];
}

export interface ProfileResponse {
  profile: Profile;
  onboarding: OnboardingState;
}

// ---------- Topics ----------
export interface SuggestedTopic {
  title: string;
  /** A ready-to-send opening question for this topic. */
  prompt: string;
}
export interface SuggestedTopicsResponse {
  topics: SuggestedTopic[];
  provider: Provider;
}

// ---------- Chat ----------
export const PROVIDERS = ['gemini', 'groq', 'demo'] as const;
export type Provider = (typeof PROVIDERS)[number];

export interface Source {
  /** 1-based number used for [n] citations in the answer. */
  id: number;
  title: string;
  url: string;
  snippet: string;
}

export type Role = 'user' | 'assistant';

export interface ChatMessage {
  id: string;
  conversationId: string;
  role: Role;
  content: string;
  sources: Source[];
  action: LearnActionId | null;
  provider: Provider | null;
  createdAt: string;
}

export const chatRequestSchema = z
  .object({
    message: z.string().trim().max(LIMITS.messageMaxChars).optional(),
    conversationId: z.string().regex(/^[a-f0-9]{24}$/i, 'Invalid conversationId').optional(),
    action: z.enum(LEARN_ACTION_IDS).optional(),
    /** false returns one JSON body instead of an SSE stream. Also accepted as ?stream=false. */
    stream: z.boolean().optional(),
  })
  .strict()
  .refine((b) => (b.message && b.message.length > 0) || b.action, {
    message: 'Send a message, an action, or both',
  })
  .refine((b) => !b.action || b.message || b.conversationId, {
    message: 'An action without a message needs a conversationId to act on',
  });
export type ChatRequest = z.infer<typeof chatRequestSchema>;

/** Non-streaming reply (stream=false). */
export interface ChatResponse {
  conversationId: string;
  userMessage: ChatMessage;
  assistantMessage: ChatMessage;
  provider: Provider;
  demo: boolean;
}

// ---------- SSE events (POST /api/chat) ----------
export type ChatStage = 'thinking' | 'searching' | 'writing' | 'retrying';

export type SseEvent =
  | { event: 'status'; data: { stage: ChatStage; message: string; conversationId?: string; provider?: Provider; reset?: boolean } }
  | { event: 'token'; data: { text: string } }
  | { event: 'sources'; data: { sources: Source[] } }
  | { event: 'done'; data: { conversationId: string; messageId: string; provider: Provider; demo: boolean } }
  | { event: 'error'; data: { message: string; code: string; conversationId?: string } };

export type SseEventName = SseEvent['event'];

// ---------- Conversations ----------
export interface MessagesResponse {
  conversationId: string;
  title: string;
  messages: ChatMessage[];
}

export interface ConversationSummary {
  id: string;
  title: string;
  updatedAt: string;
}

// ---------- Quiz ----------
export const quizRequestSchema = z
  .object({
    topic: z.string().trim().min(1).max(200).optional(),
    conversationId: z.string().regex(/^[a-f0-9]{24}$/i, 'Invalid conversationId').optional(),
    count: z.number().int().min(LIMITS.quizMin).max(LIMITS.quizMax).optional(),
  })
  .strict()
  .refine((b) => b.topic || b.conversationId, { message: 'Send a topic or a conversationId' });
export type QuizRequest = z.infer<typeof quizRequestSchema>;

export const quizQuestionSchema = z.object({
  question: z.string().trim().min(1),
  options: z.array(z.string().trim().min(1)).length(4),
  answerIndex: z.number().int().min(0).max(3),
  explanation: z.string().trim().min(1),
});
export type QuizQuestion = z.infer<typeof quizQuestionSchema>;

export const quizSchema = z.object({
  topic: z.string().trim().min(1),
  questions: z.array(quizQuestionSchema).min(LIMITS.quizMin).max(LIMITS.quizMax),
});
export type Quiz = z.infer<typeof quizSchema>;

export interface QuizResponse extends Quiz {
  provider: Provider;
}

// ---------- Errors / health ----------
export interface ApiError {
  error: { code: string; message: string; details?: unknown };
}

// ---------- Voice ----------
/** POST /api/voice/transcribe (fallback speech-to-text for browsers without built-in recognition). */
export interface TranscribeResponse {
  text: string;
}

export interface HealthResponse {
  status: 'ok';
  uptimeSeconds: number;
  db: 'connected' | 'connecting' | 'disconnected';
  demoMode: boolean;
  /** stt: the server can transcribe audio for browsers without built-in speech recognition. */
  providers: { gemini: boolean; groq: boolean; tavily: boolean; stt: boolean };
  version: string;
}
