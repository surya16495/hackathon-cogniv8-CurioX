import type { Provider } from '@curiox/shared';

export interface LlmMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface LlmRequest {
  system: string;
  messages: LlmMessage[];
  /** "main" for chat answers, "lite" for routing, extraction and JSON jobs. */
  tier?: 'main' | 'lite';
  temperature?: number;
  /** Ask the provider for a JSON object. */
  json?: boolean;
  maxOutputTokens?: number;
  signal?: AbortSignal;
}

export interface LlmProvider {
  readonly name: Exclude<Provider, 'demo'>;
  /** False when the key is missing; the chain skips the provider without calling it. */
  available(): boolean;
  stream(req: LlmRequest): AsyncIterable<string>;
  complete(req: LlmRequest): Promise<string>;
}

/**
 * Merge consecutive same-role turns and drop leading assistant turns.
 * Gemini rejects histories that do not start with a user turn, and both
 * providers behave better with strictly alternating roles.
 */
export function normalizeMessages(messages: LlmMessage[]): LlmMessage[] {
  const out: LlmMessage[] = [];
  for (const m of messages) {
    const content = m.content.trim();
    if (!content) continue;
    if (!out.length && m.role === 'assistant') continue;
    const last = out[out.length - 1];
    if (last && last.role === m.role) last.content += `\n\n${content}`;
    else out.push({ role: m.role, content });
  }
  if (!out.length) out.push({ role: 'user', content: 'Hello' });
  return out;
}
