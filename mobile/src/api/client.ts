// The only module that talks to the API. Contract: docs/api-contract.md.
import { fetch } from 'expo/fetch';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import type {
  ChatRequest,
  CreateDeckRequest,
  Deck,
  ReaderCard,
  TailorResponse,
  TalkResponse,
  TeachResponse,
  TodayResponse,
  HealthResponse,
  MessagesResponse,
  OnboardingMessageRequest,
  OnboardingResponse,
  ProfileResponse,
  ProfileUpdate,
  QuizResponse,
  SessionResponse,
  SseEvent,
  SuggestedTopicsResponse,
  TranscribeResponse,
} from '@curiox/shared';
import { KEYS, storage } from '../lib/storage';

/**
 * EXPO_PUBLIC_API_URL wins. Otherwise, in development, use the laptop running Expo:
 * a phone on the same Wi-Fi reaches the API on the same IP, port 4000.
 */
function resolveApiUrl(): string {
  const configured = process.env.EXPO_PUBLIC_API_URL?.trim();
  if (configured) return configured.replace(/\/$/, '');
  if (Platform.OS === 'web' && typeof window !== 'undefined') return `${window.location.protocol}//${window.location.hostname}:4000`;
  const host = Constants.expoConfig?.hostUri?.split(':')[0];
  return `http://${host ?? 'localhost'}:4000`;
}

export const API_URL = resolveApiUrl();

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

function uuid(): string {
  const c = globalThis.crypto as Crypto | undefined;
  if (c?.randomUUID) return c.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    return (ch === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

/** One anonymous ID per install. */
export function deviceId(): string {
  let id = storage.get(KEYS.deviceId);
  if (!id || !/^[A-Za-z0-9_-]{8,128}$/.test(id)) {
    id = uuid();
    storage.set(KEYS.deviceId, id);
  }
  return id;
}

function headers(json: boolean, extra: Record<string, string> = {}): Record<string, string> {
  return { ...(json ? { 'Content-Type': 'application/json' } : {}), 'X-Device-Id': deviceId(), ...extra };
}

async function toApiError(res: { status: number; json: () => Promise<unknown> }): Promise<ApiError> {
  try {
    const body = (await res.json()) as { error?: { code?: string; message?: string } };
    return new ApiError(res.status, body?.error?.code ?? 'HTTP_ERROR', body?.error?.message ?? `Request failed (${res.status})`);
  } catch {
    if (res.status >= 500) return new ApiError(res.status, 'SERVER_UNAVAILABLE', "CurioX's server isn't responding. Please try again in a moment.");
    return new ApiError(res.status, 'HTTP_ERROR', `Request failed (${res.status})`);
  }
}

function networkError(err: unknown): ApiError {
  if (err instanceof ApiError) return err;
  const name = (err as { name?: string })?.name;
  if (name === 'AbortError') return new ApiError(0, 'ABORTED', 'Cancelled');
  return new ApiError(0, 'NETWORK', "Can't reach CurioX. Check your connection and that the server is running.");
}

async function request<T>(method: string, path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  let res: Awaited<ReturnType<typeof fetch>>;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method,
      headers: headers(body !== undefined),
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    });
  } catch (err) {
    throw networkError(err);
  }
  if (!res.ok) throw await toApiError(res);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  health: (signal?: AbortSignal) => request<HealthResponse>('GET', '/api/health', undefined, signal),
  session: () => request<SessionResponse>('POST', '/api/session'),
  onboarding: (body: OnboardingMessageRequest) => request<OnboardingResponse>('POST', '/api/onboarding/message', body),
  getProfile: () => request<ProfileResponse>('GET', '/api/profile'),
  updateProfile: (patch: ProfileUpdate) => request<ProfileResponse>('PUT', '/api/profile', patch),
  clearProfile: (history: boolean) => request<ProfileResponse>('DELETE', `/api/profile${history ? '?history=true' : ''}`),
  topics: () => request<SuggestedTopicsResponse>('GET', '/api/topics/suggested'),
  messages: (conversationId: string) => request<MessagesResponse>('GET', `/api/conversations/${encodeURIComponent(conversationId)}/messages`),
  quiz: (body: { conversationId?: string; topic?: string; count?: number }) => request<QuizResponse>('POST', '/api/learn/quiz', body),

  // The zine: reader card, issues, decks, talk.
  tailor: (interests: string[], signal?: AbortSignal) => request<TailorResponse>('POST', '/api/onboarding/tailor', { interests }, signal),
  completeOnboarding: (reader: ReaderCard) => request<ProfileResponse>('POST', '/api/onboarding/complete', { reader }),
  today: (date: string, signal?: AbortSignal) => request<TodayResponse>('GET', `/api/issues/today?date=${date}`, undefined, signal),
  discardToday: (date: string) => request<void>('DELETE', `/api/issues/today?date=${date}`),
  deck: (id: string) => request<Deck>('GET', `/api/decks/${encodeURIComponent(id)}`),
  createDeck: (body: CreateDeckRequest) => request<Deck>('POST', '/api/decks', body),
  talk: (message: string, history: { role: 'user' | 'assistant'; content: string }[], signal?: AbortSignal) =>
    request<TalkResponse>('POST', '/api/talk', { message, history }, signal),
  teach: (body: { q: string; said: string; sample?: string }) => request<TeachResponse>('POST', '/api/talk/teach', body),

  /** Server speech-to-text. `audio` is a recorded file (native) or Blob (web). */
  async transcribe(audio: Blob | { uri: string; type: string }, lang: string): Promise<string> {
    let body: Blob | import('expo-file-system').File;
    let type: string;
    if (audio instanceof Blob) {
      body = audio;
      type = audio.type || 'audio/webm';
    } else {
      const { File } = await import('expo-file-system');
      body = new File(audio.uri);
      type = audio.type;
    }
    let res: Awaited<ReturnType<typeof fetch>>;
    try {
      res = await fetch(`${API_URL}/api/voice/transcribe`, {
        method: 'POST',
        headers: headers(false, { 'Content-Type': type, 'X-Voice-Lang': lang }),
        body: body as never,
      });
    } catch (err) {
      throw networkError(err);
    }
    if (!res.ok) throw await toApiError(res);
    return ((await res.json()) as TranscribeResponse).text;
  },
};

/**
 * Wake the server (Render's free tier sleeps after 15 minutes and takes about a minute to start).
 * Calls onSlow once if it takes more than 2.5s.
 */
export async function wakeServer(opts: { onSlow?: () => void; timeoutMs?: number; signal?: AbortSignal } = {}): Promise<HealthResponse> {
  const deadline = Date.now() + (opts.timeoutMs ?? 90_000);
  const slowTimer = setTimeout(() => opts.onSlow?.(), 2500);
  try {
    let lastError: unknown;
    while (Date.now() < deadline) {
      if (opts.signal?.aborted) throw new ApiError(0, 'ABORTED', 'Cancelled');
      const attempt = new AbortController();
      const t = setTimeout(() => attempt.abort(), 15_000);
      try {
        return await api.health(attempt.signal);
      } catch (err) {
        lastError = err;
        await new Promise((r) => setTimeout(r, 2000));
      } finally {
        clearTimeout(t);
      }
    }
    throw lastError instanceof ApiError ? lastError : networkError(lastError);
  } finally {
    clearTimeout(slowTimer);
  }
}

/** POST /api/chat and read the Server-Sent Events stream. Resolves when the stream ends. */
export async function streamChat(body: ChatRequest, onEvent: (event: SseEvent) => void, signal?: AbortSignal): Promise<void> {
  let res: Awaited<ReturnType<typeof fetch>>;
  try {
    res = await fetch(`${API_URL}/api/chat`, {
      method: 'POST',
      headers: headers(true, { Accept: 'text/event-stream' }),
      body: JSON.stringify(body),
      signal,
    });
  } catch (err) {
    throw networkError(err);
  }
  // Validation and 404 errors arrive as JSON before any stream starts.
  if (!res.ok) throw await toApiError(res);
  if (!res.body) throw new ApiError(0, 'NO_STREAM', 'Streaming is not supported here.');

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let sep: number;
      // Events are separated by a blank line; tolerate \r\n from proxies.
      while ((sep = buffer.search(/\r?\n\r?\n/)) !== -1) {
        const block = buffer.slice(0, sep);
        buffer = buffer.slice(sep).replace(/^\r?\n\r?\n/, '');
        const event = parseBlock(block);
        if (event) onEvent(event);
      }
    }
    const tail = parseBlock(buffer + decoder.decode());
    if (tail) onEvent(tail);
  } catch (err) {
    throw networkError(err);
  }
}

function parseBlock(block: string): SseEvent | null {
  let event = '';
  const data: string[] = [];
  for (const line of block.split(/\r?\n/)) {
    if (!line || line.startsWith(':')) continue; // heartbeat comments
    if (line.startsWith('event:')) event = line.slice(6).trim();
    else if (line.startsWith('data:')) data.push(line.slice(5).trimStart());
  }
  if (!event || !data.length) return null;
  try {
    return { event, data: JSON.parse(data.join('\n')) } as SseEvent;
  } catch {
    return null;
  }
}
