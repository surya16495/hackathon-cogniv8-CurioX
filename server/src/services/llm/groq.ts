import Groq from 'groq-sdk';
import { normalizeMessages, type LlmProvider, type LlmRequest } from './types';

export interface GroqOptions {
  apiKey?: string;
  model: string;
}

export function createGroqProvider(opts: GroqOptions): LlmProvider {
  // maxRetries 0: the fallback chain decides what happens next, not the SDK.
  const client = opts.apiKey ? new Groq({ apiKey: opts.apiKey, maxRetries: 0 }) : null;

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
    if (!client) throw new Error('GROQ_API_KEY is not set');
    return client;
  };

  return {
    name: 'groq',
    available: () => client !== null,
    async *stream(req) {
      const stream = await requireClient().chat.completions.create({ ...body(req), stream: true }, { signal: req.signal });
      for await (const chunk of stream) {
        const text = chunk.choices[0]?.delta?.content;
        if (text) yield text;
      }
    },
    async complete(req) {
      const res = await requireClient().chat.completions.create({ ...body(req), stream: false }, { signal: req.signal });
      const text = res.choices[0]?.message?.content;
      if (!text) throw new Error('Groq returned an empty response');
      return text;
    },
  };
}
