// The only module that talks to the API. Contract: docs/api-contract.md.
import type {
  ChatRequest,
  ChatResponse,
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
} from '@curiox/shared';
import { storage } from '../lib/storage';

// Empty in local dev: Vite proxies /api to the server, so phones on the same Wi-Fi work without CORS.
const API_URL = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '');

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

const DEVICE_KEY = 'curiox.deviceId';

/** One anonymous ID per browser, kept in localStorage (memory only in private mode). */
export function deviceId(): string {
  let id = storage.get(DEVICE_KEY);
  if (!id || !/^[A-Za-z0-9_-]{8,128}$/.test(id)) {
    id = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `d-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
    storage.set(DEVICE_KEY, id);
  }
  return id;
}

function headers(json: boolean): HeadersInit {
  return { ...(json ? { 'Content-Type': 'application/json' } : {}), 'X-Device-Id': deviceId() };
}

async function toApiError(res: Response): Promise<ApiError> {
  try {
    const body = await res.json();
    return new ApiError(res.status, body?.error?.code ?? 'HTTP_ERROR', body?.error?.message ?? `Request failed (${res.status})`);
  } catch {
    // No JSON body: a proxy or the host answered, not CurioX (server down, restarting or asleep).
    if (res.status >= 500) return new ApiError(res.status, 'SERVER_UNAVAILABLE', "CurioX's server isn't responding. Please try again in a moment.");
    return new ApiError(res.status, 'HTTP_ERROR', `Request failed (${res.status})`);
  }
}

function networkError(err: unknown): ApiError {
  if (err instanceof ApiError) return err;
  if (err instanceof DOMException && err.name === 'AbortError') return new ApiError(0, 'ABORTED', 'Cancelled');
  return new ApiError(0, 'NETWORK', navigator.onLine ? "Can't reach CurioX right now. Please try again." : "You're offline. Check your connection.");
}

async function request<T>(method: string, path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  let res: Response;
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
  return res.json() as Promise<T>;
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
  chatOnce: (body: ChatRequest) => request<ChatResponse>('POST', '/api/chat', { ...body, stream: false }),
};

/**
 * Wake the server (Render's free tier sleeps after 15 minutes and takes about a minute to start).
 * Retries until it answers or `timeoutMs` passes. Calls onSlow once if it takes more than 2.5s.
 */
export async function wakeServer(opts: { onSlow?: () => void; timeoutMs?: number; signal?: AbortSignal } = {}): Promise<HealthResponse> {
  const deadline = Date.now() + (opts.timeoutMs ?? 90_000);
  const slowTimer = setTimeout(() => opts.onSlow?.(), 2500);
  try {
    let lastError: unknown;
    while (Date.now() < deadline) {
      if (opts.signal?.aborted) throw new ApiError(0, 'ABORTED', 'Cancelled');
      try {
        const attempt = new AbortController();
        const t = setTimeout(() => attempt.abort(), 15_000);
        opts.signal?.addEventListener('abort', () => attempt.abort(), { once: true });
        try {
          return await api.health(attempt.signal);
        } finally {
          clearTimeout(t);
        }
      } catch (err) {
        lastError = err;
        await new Promise((r) => setTimeout(r, 2000));
      }
    }
    throw lastError instanceof ApiError ? lastError : networkError(lastError);
  } finally {
    clearTimeout(slowTimer);
  }
}

export interface StreamHandlers {
  onEvent: (event: SseEvent) => void;
}

/**
 * POST /api/chat and read the Server-Sent Events stream with fetch
 * (EventSource cannot POST or send headers). Resolves when the stream ends.
 */
export async function streamChat(body: ChatRequest, { onEvent }: StreamHandlers, signal?: AbortSignal): Promise<void> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}/api/chat`, { method: 'POST', headers: headers(true), body: JSON.stringify(body), signal });
  } catch (err) {
    throw networkError(err);
  }
  // Validation and 404 errors arrive as JSON before any stream starts.
  if (!res.ok) throw await toApiError(res);
  if (!res.body) throw new ApiError(0, 'NO_STREAM', 'This browser cannot read streamed replies.');

  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = '';
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += value;
      let sep: number;
      // Events are separated by a blank line; tolerate \r\n from proxies.
      while ((sep = buffer.search(/\r?\n\r?\n/)) !== -1) {
        const block = buffer.slice(0, sep);
        buffer = buffer.slice(sep).replace(/^\r?\n\r?\n/, '');
        const event = parseBlock(block);
        if (event) onEvent(event);
      }
    }
    const tail = parseBlock(buffer);
    if (tail) onEvent(tail);
  } catch (err) {
    throw networkError(err);
  } finally {
    reader.releaseLock();
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
