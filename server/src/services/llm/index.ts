// The fallback chain: Gemini, then Groq, then a labelled demo answer.
// Any provider error (429, 5xx, timeout, bad key) moves to the next provider,
// because during a live demo any answer beats an error message.
import type { ZodType } from 'zod';
import type { Provider } from '@lumora/shared';
import { describeError } from '../../utils/errors';
import { withIdleTimeout, withTimeout } from '../../utils/async';
import { extractJson } from '../../utils/json';
import { streamText } from './demo';
import type { LlmProvider, LlmRequest } from './types';

export interface StreamAnswerOptions {
  /** Build the request per provider, so Groq can get a trimmed prompt. */
  build: (provider: Provider) => LlmRequest;
  /** Text for the demo fallback. */
  demo: () => string;
  onToken: (text: string) => void;
  /** Called before switching provider. `reset` is true when partial text was already streamed. */
  onSwitch?: (next: Provider, reset: boolean) => void;
  signal?: AbortSignal;
}

export interface StreamAnswerResult {
  text: string;
  provider: Provider;
}

export interface LlmService {
  streamAnswer(opts: StreamAnswerOptions): Promise<StreamAnswerResult>;
  completeJson<T>(req: LlmRequest, schema: ZodType<T>, fallback: () => T): Promise<{ data: T; provider: Provider }>;
  completeText(req: LlmRequest, fallback: () => string): Promise<{ text: string; provider: Provider }>;
  configured(): Record<Exclude<Provider, 'demo'>, boolean>;
  readonly demoMode: boolean;
}

export interface LlmServiceOptions {
  providers: LlmProvider[];
  demoMode: boolean;
  /** Abort a call when no data arrives for this long. */
  timeoutMs: number;
  /** Delay between demo words; 0 in tests. */
  demoDelayMs?: number;
  log?: (msg: string) => void;
}

export function createLlmService(opts: LlmServiceOptions): LlmService {
  const log = opts.log ?? ((m: string) => console.warn(m));
  const active = () => (opts.demoMode ? [] : opts.providers.filter((p) => p.available()));

  /** A controller that aborts when the caller's signal does. */
  const linked = (signal?: AbortSignal) => {
    const controller = new AbortController();
    if (signal) {
      if (signal.aborted) controller.abort(signal.reason);
      else signal.addEventListener('abort', () => controller.abort(signal.reason), { once: true });
    }
    return controller;
  };

  return {
    demoMode: opts.demoMode,

    configured() {
      const has = (name: string) => opts.providers.some((p) => p.name === name && p.available());
      return { gemini: has('gemini'), groq: has('groq') };
    },

    async streamAnswer({ build, demo, onToken, onSwitch, signal }) {
      const chain = active();
      let emitted = false;

      for (let i = 0; i < chain.length; i++) {
        const provider = chain[i]!;
        const controller = linked(signal);
        let text = '';
        try {
          const source = provider.stream({ ...build(provider.name), signal: controller.signal });
          for await (const chunk of withIdleTimeout(source, opts.timeoutMs, controller)) {
            text += chunk;
            emitted = true;
            onToken(chunk);
          }
          if (!text.trim()) throw new Error('empty response');
          return { text, provider: provider.name };
        } catch (err) {
          if (signal?.aborted) throw err; // the client went away: stop, do not fall back
          const next = chain[i + 1]?.name ?? 'demo';
          log(`[llm] ${provider.name} stream failed (${describeError(err)}); falling back to ${next}`);
          onSwitch?.(next, emitted);
          emitted = false;
        }
      }

      const text = demo();
      for await (const chunk of streamText(text, opts.demoDelayMs ?? 15, signal)) onToken(chunk);
      return { text, provider: 'demo' };
    },

    async completeJson(req, schema, fallback) {
      for (const provider of active()) {
        const controller = linked(req.signal);
        try {
          const raw = await withTimeout(
            provider.complete({ tier: 'lite', temperature: 0.3, ...req, json: true, signal: controller.signal }),
            opts.timeoutMs,
            `${provider.name} json`,
          );
          const parsed = schema.safeParse(extractJson(raw));
          if (parsed.success) return { data: parsed.data, provider: provider.name };
          log(`[llm] ${provider.name} returned JSON that failed validation: ${parsed.error.issues[0]?.message}`);
        } catch (err) {
          controller.abort();
          if (req.signal?.aborted) throw err;
          log(`[llm] ${provider.name} json call failed (${describeError(err)})`);
        }
      }
      return { data: fallback(), provider: 'demo' };
    },

    async completeText(req, fallback) {
      for (const provider of active()) {
        const controller = linked(req.signal);
        try {
          const text = await withTimeout(
            provider.complete({ tier: 'lite', ...req, signal: controller.signal }),
            opts.timeoutMs,
            `${provider.name} text`,
          );
          if (text.trim()) return { text: text.trim(), provider: provider.name };
        } catch (err) {
          controller.abort();
          if (req.signal?.aborted) throw err;
          log(`[llm] ${provider.name} text call failed (${describeError(err)})`);
        }
      }
      return { text: fallback(), provider: 'demo' };
    },
  };
}

export type { LlmProvider, LlmRequest, LlmMessage } from './types';
