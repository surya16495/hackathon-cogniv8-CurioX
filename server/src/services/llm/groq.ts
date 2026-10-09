import Groq from 'groq-sdk';
import { createKeyPool, parseKeys } from './keys';
import { normalizeMessages, type LlmProvider, type LlmRequest } from './types';

export interface GroqOptions {
  /** One key, or several separated by commas: the next is used when one is rate-limited. */
  apiKey?: string;
  model: string;
}

export function createGroqProvider(opts: GroqOptions): LlmProvider {
  // maxRetries 0: the fallback chain decides what happens next, not the SDK.
  const pool = createKeyPool(parseKeys(opts.apiKey), (apiKey) => new Groq({ apiKey, maxRetries: 0 }));

  const body = (req: LlmRequest) => ({
    model: opts.model,
    messages: [
      { role: 'system' as const, content: req.system },
      ...normalizeMessages(req.messages).map((m) => ({ role: m.role, content: m.content })),
    ],
    temperature: req.temperature ?? 0.7,
    max_completion_tokens: req.maxOutputTokens,
    response_format: req.json ? { type: 'json_object' as const } : undefined,
    // gpt-oss is a reasoning model; low effort keeps us inside the 8k tokens/min free limit.
    reasoning_effort: 'low' as const,
    include_reasoning: false,
  });

  const requireClient = () => {
    const client = pool.current();
    if (!client) throw new Error('GROQ_API_KEY is not set');
    return client;
  };

  return {
    name: 'groq',
    available: () => pool.size > 0,
    async *stream(req) {
      // A rate-limited key is swapped for the next one, but only before any text has gone out.
      for (let attempt = 0; ; attempt++) {
        const client = requireClient();
        let sent = false;
        try {
          const stream = await client.chat.completions.create({ ...body(req), stream: true }, { signal: req.signal });
          for await (const chunk of stream) {
            const text = chunk.choices[0]?.delta?.content;
            if (text) {
              sent = true;
              yield text;
            }
          }
          return;
        } catch (err) {
          if (sent || attempt >= pool.size - 1 || !pool.rotate(client, err)) throw err;
        }
      }
    },
    async complete(req) {
      for (let attempt = 0; ; attempt++) {
        const client = requireClient();
        try {
          const res = await client.chat.completions.create({ ...body(req), stream: false }, { signal: req.signal });
          const text = res.choices[0]?.message?.content;
          if (!text) throw new Error('Groq returned an empty response');
          return text;
        } catch (err) {
          if (attempt >= pool.size - 1 || !pool.rotate(client, err)) throw err;
        }
      }
    },
  };
}
