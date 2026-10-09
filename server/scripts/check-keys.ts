// Checks every API key with one tiny request and confirms the configured model IDs exist.
// Keys may be comma-separated lists (several accounts); each key is tried on its own.
// Never prints the keys. Usage: npm run check-keys -w server
import { GoogleGenAI, type ThinkingLevel } from '@google/genai';
import Groq from 'groq-sdk';
import { tavily } from '@tavily/core';
import { parseKeys } from '../src/services/llm/keys';

const env = process.env;
let failures = 0;

async function check(name: string, fn: () => Promise<string>) {
  try {
    console.log(`  ✓ ${name}: ${await fn()}`);
  } catch (err) {
    const e = err as { status?: number; message?: string };
    if (e.status === 503 || e.status === 429) {
      console.log(`  ~ ${name}: key works, but the model is busy or rate-limited right now (${e.status}). CurioX will use the next key or fall back.`);
      return;
    }
    failures++;
    console.log(`  ✗ ${name}: ${e.status ?? ''} ${(e.message ?? String(err)).slice(0, 300)}`);
  }
}

/** "key 1 of 2" when there are several, "" for one. */
const nth = (i: number, n: number) => (n > 1 ? ` (key ${i + 1} of ${n})` : '');

async function main() {
  console.log('Checking API keys (one tiny request each; comma-separated keys are tried one by one)\n');

  const geminiKeys = parseKeys(env.GEMINI_API_KEY);
  const mainModel = env.GEMINI_MODEL_MAIN ?? 'gemini-3.8-flash';
  const liteModel = env.GEMINI_MODEL_LITE ?? 'gemini-3.5-flash-lite';
  if (!geminiKeys.length) console.log('  - Gemini: not set');
  for (const [i, key] of geminiKeys.entries()) {
    const gemini = new GoogleGenAI({ apiKey: key });
    for (const model of [mainModel, liteModel]) {
      await check(`Gemini ${model}${nth(i, geminiKeys.length)}`, async () => {
        const res = await gemini.models.generateContent({ model, contents: 'Reply with the single word: ok', config: { maxOutputTokens: 200, thinkingConfig: { thinkingLevel: (model === liteModel ? 'MINIMAL' : 'LOW') as ThinkingLevel } } });
        return `replied "${(res.text ?? '').trim().slice(0, 40)}"`;
      });
    }
  }

  const groqKeys = parseKeys(env.GROQ_API_KEY);
  const groqModel = env.GROQ_MODEL ?? 'openai/gpt-oss-120b';
  if (!groqKeys.length) console.log('  - Groq: not set');
  for (const [i, key] of groqKeys.entries()) {
    await check(`Groq ${groqModel}${nth(i, groqKeys.length)}`, async () => {
      const res = await new Groq({ apiKey: key, maxRetries: 0 }).chat.completions.create({
        model: groqModel,
        messages: [{ role: 'user', content: 'Reply with the single word: ok' }],
        max_completion_tokens: 200,
        reasoning_effort: 'low',
        include_reasoning: false,
      });
      return `replied "${(res.choices[0]?.message?.content ?? '').trim().slice(0, 40)}"`;
    });
  }

  const tavilyKeys = parseKeys(env.TAVILY_API_KEY);
  if (!tavilyKeys.length) console.log('  - Tavily: not set');
  for (const [i, key] of tavilyKeys.entries()) {
    await check(`Tavily (uses 1 search credit)${nth(i, tavilyKeys.length)}`, async () => {
      const res = await tavily({ apiKey: key }).search('Gemini API', { searchDepth: 'basic', maxResults: 1 });
      return `${res.results.length} result(s), e.g. ${res.results[0]?.url ?? 'none'}`;
    });
  }

  console.log(failures ? `\n${failures} check(s) failed` : '\nDone');
  process.exit(failures ? 1 : 0);
}

main();
