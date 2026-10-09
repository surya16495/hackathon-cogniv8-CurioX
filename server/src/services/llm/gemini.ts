import { GoogleGenAI, type ThinkingLevel } from '@google/genai';
import { createKeyPool, parseKeys } from './keys';
import { normalizeMessages, type LlmProvider, type LlmRequest } from './types';

export interface GeminiOptions {
  /** One key, or several separated by commas: the next is used when one is rate-limited. */
  apiKey?: string;
  modelMain: string;
  modelLite: string;
  /** Gemini 3.x thinking level; "" leaves the model default. Less thinking = faster first token. */
  thinkingMain?: string;
  thinkingLite?: string;
}

export function createGeminiProvider(opts: GeminiOptions): LlmProvider {
  const pool = createKeyPool(parseKeys(opts.apiKey), (apiKey) => new GoogleGenAI({ apiKey }));

  const params = (req: LlmRequest) => {
    const lite = req.tier === 'lite';
    const thinkingLevel = lite ? opts.thinkingLite : opts.thinkingMain;
    return {
      model: lite ? opts.modelLite : opts.modelMain,
      contents: normalizeMessages(req.messages).map((m) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      })),
      config: {
        systemInstruction: req.system,
        temperature: req.temperature ?? 0.7,
        maxOutputTokens: req.maxOutputTokens,
        responseMimeType: req.json ? 'application/json' : undefined,
        thinkingConfig: thinkingLevel ? { thinkingLevel: thinkingLevel.toUpperCase() as ThinkingLevel } : undefined,
        abortSignal: req.signal,
      },
    };
  };

  const requireClient = () => {
    const client = pool.current();
    if (!client) throw new Error('GEMINI_API_KEY is not set');
    return client;
  };

  return {
    name: 'gemini',
    available: () => pool.size > 0,
    async *stream(req) {
      // A rate-limited key is swapped for the next one, but only before any text has gone out.
      for (let attempt = 0; ; attempt++) {
        const client = requireClient();
        let sent = false;
        try {
          const stream = await client.models.generateContentStream(params(req));
          for await (const chunk of stream) {
            const text = chunk.text;
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
          const res = await client.models.generateContent(params(req));
          const text = res.text;
          if (!text) throw new Error('Gemini returned an empty response');
          return text;
        } catch (err) {
          if (attempt >= pool.size - 1 || !pool.rotate(client, err)) throw err;
        }
      }
    },
  };
}
