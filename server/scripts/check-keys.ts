// Checks each API key with one tiny request and confirms the configured model IDs exist.
// Never prints the keys. Usage: npm run check-keys -w server
import { GoogleGenAI, type ThinkingLevel } from '@google/genai';
import Groq from 'groq-sdk';
import { tavily } from '@tavily/core';

const env = process.env;
let failures = 0;

async function check(name: string, configured: string | undefined, fn: () => Promise<string>) {
  if (!configured?.trim()) {
    console.log(`  - ${name}: not set`);
    return;
  }
  try {
    console.log(`  ✓ ${name}: ${await fn()}`);
  } catch (err) {
    const e = err as { status?: number; message?: string };
    if (e.status === 503 || e.status === 429) {
      console.log(`  ~ ${name}: key works, but the model is busy or rate-limited right now (${e.status}). CurioX will fall back.`);
      return;
    }
    failures++;
    console.log(`  ✗ ${name}: ${e.status ?? ''} ${(e.message ?? String(err)).slice(0, 300)}`);
  }
}

async function main() {
  console.log('Checking API keys (one tiny request each)\n');

  const gemini = env.GEMINI_API_KEY ? new GoogleGenAI({ apiKey: env.GEMINI_API_KEY }) : null;
  for (const model of [env.GEMINI_MODEL_MAIN ?? 'gemini-3.8-flash', env.GEMINI_MODEL_LITE ?? 'gemini-3.5-flash-lite']) {
    await check(`Gemini ${model}`, env.GEMINI_API_KEY, async () => {
      const res = await gemini!.models.generateContent({ model, contents: 'Reply with the single word: ok', config: { maxOutputTokens: 200, thinkingConfig: { thinkingLevel: (model === (env.GEMINI_MODEL_LITE ?? 'gemini-3.5-flash-lite') ? 'MINIMAL' : 'LOW') as ThinkingLevel } } });
      return `replied "${(res.text ?? '').trim().slice(0, 40)}"`;
    });
  }

  await check(`Groq ${env.GROQ_MODEL ?? 'openai/gpt-oss-120b'}`, env.GROQ_API_KEY, async () => {
    const groq = new Groq({ apiKey: env.GROQ_API_KEY, maxRetries: 0 });
    const res = await groq.chat.completions.create({
      model: env.GROQ_MODEL ?? 'openai/gpt-oss-120b',
      messages: [{ role: 'user', content: 'Reply with the single word: ok' }],
      max_completion_tokens: 200,
      reasoning_effort: 'low',
      include_reasoning: false,
    });
    return `replied "${(res.choices[0]?.message?.content ?? '').trim().slice(0, 40)}"`;
  });

  await check('Tavily (uses 1 search credit)', env.TAVILY_API_KEY, async () => {
    const res = await tavily({ apiKey: env.TAVILY_API_KEY }).search('Gemini API', { searchDepth: 'basic', maxResults: 1 });
    return `${res.results.length} result(s), e.g. ${res.results[0]?.url ?? 'none'}`;
  });

  console.log(failures ? `\n${failures} check(s) failed` : '\nDone');
  process.exit(failures ? 1 : 0);
}

main();
