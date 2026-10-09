// Validate environment variables once at boot. A bad config fails fast with a clear message.
import { z } from 'zod';

const bool = z
  .string()
  .optional()
  .transform((v) => ['1', 'true', 'yes', 'on'].includes((v ?? '').trim().toLowerCase()));

const optionalKey = z
  .string()
  .optional()
  .transform((v) => (v && v.trim() ? v.trim() : undefined));

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  MONGODB_URI: z.string().trim().min(1, 'MONGODB_URI is required'),
  GEMINI_API_KEY: optionalKey,
  GEMINI_MODEL_MAIN: z.string().trim().min(1).default('gemini-3.8-flash'),
  GEMINI_MODEL_LITE: z.string().trim().min(1).default('gemini-3.5-flash-lite'),
  // Gemini 3.x thinking level per tier. "" sends nothing (model default). flash-lite supports minimal; 3.8-flash does not.
  GEMINI_THINKING_MAIN: z.enum(['', 'minimal', 'low', 'medium', 'high']).default('low'),
  GEMINI_THINKING_LITE: z.enum(['', 'minimal', 'low', 'medium', 'high']).default('minimal'),
  GROQ_API_KEY: optionalKey,
  GROQ_MODEL: z.string().trim().min(1).default('openai/gpt-oss-120b'),
  GROQ_STT_MODEL: z.string().trim().min(1).default('whisper-large-v3-turbo'),
  TAVILY_API_KEY: optionalKey,
  CORS_ORIGIN: z
    .string()
    .default('http://localhost:8081')
    .transform((v) =>
      v
        .split(',')
        .map((o) => o.trim().replace(/\/$/, ''))
        .filter(Boolean),
    ),
  DEMO_MODE: bool,
  LLM_TIMEOUT_MS: z.coerce.number().int().min(1000).default(30000),
  // Provider order for every model call (answers, JSON jobs, talk). Groq first streams much faster.
  LLM_CHAT_ORDER: z
    .string()
    .default('groq,gemini')
    .transform((v) => {
      const order = v.split(',').map((s) => s.trim().toLowerCase()).filter((s) => s === 'gemini' || s === 'groq');
      // A typo must not silently switch every answer to demo mode.
      return order.length ? [...new Set(order)] : ['groq', 'gemini'];
    }),
  SEARCH_CACHE_TTL_HOURS: z.coerce.number().positive().default(6),
  /** Signs account tokens. Unset: a random secret per boot, so tokens stop working on restart. */
  AUTH_SECRET: optionalKey,
});

export type Env = z.infer<typeof envSchema>;

/** Providers that take several keys: GROQ_API_KEY=k1,k2 or GROQ_API_KEY_2=k2, GROQ_API_KEY_3=k3 … */
const POOLED_KEYS = ['GEMINI_API_KEY', 'GROQ_API_KEY', 'TAVILY_API_KEY'] as const;

/**
 * Some dashboards (Render's blueprint form) take one value per variable, so a second account's key
 * can also go in `<NAME>_2`, `<NAME>_3` … up to `_9`. They are folded into the comma list.
 */
function foldNumberedKeys(source: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const out = { ...source };
  for (const name of POOLED_KEYS) {
    const extra: string[] = [];
    for (let n = 2; n <= 9; n++) {
      const v = source[`${name}_${n}`]?.trim();
      if (v) extra.push(v);
    }
    if (extra.length) out[name] = [source[name]?.trim(), ...extra].filter(Boolean).join(',');
  }
  return out;
}

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = envSchema.safeParse(foldNumberedKeys(source));
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`);
    throw new Error(`Invalid environment configuration:\n${lines.join('\n')}`);
  }
  const env = parsed.data;
  if (!env.DEMO_MODE && !env.GEMINI_API_KEY && !env.GROQ_API_KEY) {
    console.warn('[env] No GEMINI_API_KEY or GROQ_API_KEY set: every answer will be a labelled demo answer.');
  }
  if (!env.DEMO_MODE && !env.TAVILY_API_KEY) {
    console.warn('[env] No TAVILY_API_KEY set: research questions will be answered without live sources.');
  }
  return env;
}
