import { GoogleGenAI } from '@google/genai';
import { normalizeMessages, type LlmProvider, type LlmRequest } from './types';

export interface GeminiOptions {
  apiKey?: string;
  modelMain: string;
  modelLite: string;
}

export function createGeminiProvider(opts: GeminiOptions): LlmProvider {
  const client = opts.apiKey ? new GoogleGenAI({ apiKey: opts.apiKey }) : null;

  const params = (req: LlmRequest) => ({
    model: req.tier === 'lite' ? opts.modelLite : opts.modelMain,
    contents: normalizeMessages(req.messages).map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    })),
    config: {
      systemInstruction: req.system,
      temperature: req.temperature ?? 0.7,
      maxOutputTokens: req.maxOutputTokens,
      responseMimeType: req.json ? 'application/json' : undefined,
      abortSignal: req.signal,
    },
  });

  const requireClient = () => {
    if (!client) throw new Error('GEMINI_API_KEY is not set');
    return client;
  };

  return {
    name: 'gemini',
    available: () => client !== null,
    async *stream(req) {
      const stream = await requireClient().models.generateContentStream(params(req));
      for await (const chunk of stream) {
        const text = chunk.text;
        if (text) yield text;
      }
    },
    async complete(req) {
      const res = await requireClient().models.generateContent(params(req));
      const text = res.text;
      if (!text) throw new Error('Gemini returned an empty response');
      return text;
    },
  };
}
