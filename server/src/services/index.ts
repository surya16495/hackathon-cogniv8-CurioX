import type { Env } from '../config/env';
import { createLlmService, type LlmService } from './llm';
import { createGeminiProvider } from './llm/gemini';
import { createGroqProvider } from './llm/groq';
import { createSearchService, type SearchService } from './search';
import { createTavilySearcher } from './search/tavily';
import { createGroqStt, type SttService } from './voice/stt';

export interface Services {
  llm: LlmService;
  search: SearchService;
  /** Whether a Tavily key is set (shown on /api/health). */
  tavilyConfigured: boolean;
  stt: SttService;
}

export function buildServices(env: Env): Services {
  const llm = createLlmService({
    providers: [
      createGeminiProvider({
        apiKey: env.GEMINI_API_KEY,
        modelMain: env.GEMINI_MODEL_MAIN,
        modelLite: env.GEMINI_MODEL_LITE,
        thinkingMain: env.GEMINI_THINKING_MAIN,
        thinkingLite: env.GEMINI_THINKING_LITE,
      }),
      createGroqProvider({ apiKey: env.GROQ_API_KEY, model: env.GROQ_MODEL }),
    ],
    demoMode: env.DEMO_MODE,
    timeoutMs: env.LLM_TIMEOUT_MS,
    chatOrder: env.LLM_CHAT_ORDER,
    demoDelayMs: env.NODE_ENV === 'test' ? 0 : 15,
  });
  const searcher = createTavilySearcher(env.TAVILY_API_KEY);
  const search = createSearchService({ searcher, demoMode: env.DEMO_MODE, ttlHours: env.SEARCH_CACHE_TTL_HOURS });
  const stt = createGroqStt({ apiKey: env.GROQ_API_KEY, model: env.GROQ_STT_MODEL });
  return { llm, search, tavilyConfigured: searcher.available(), stt };
}
