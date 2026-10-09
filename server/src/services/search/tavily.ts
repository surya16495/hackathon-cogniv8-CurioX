import { tavily } from '@tavily/core';
import { createKeyPool, parseKeys } from '../llm/keys';
import type { RawResult } from './cache';

export interface SearchOptions {
  /** "news" searches recent news articles only. */
  topic?: 'general' | 'news';
  /** With topic "news": how many days back. */
  days?: number;
  /** Only these sites, e.g. ["youtube.com"]. */
  includeDomains?: string[];
}

export interface WebSearcher {
  available(): boolean;
  search(query: string, maxResults: number, opts?: SearchOptions): Promise<RawResult[]>;
}

/** `apiKey` may be several keys separated by commas; the next is used when one runs out of credits. */
export function createTavilySearcher(apiKey?: string): WebSearcher {
  const pool = createKeyPool(parseKeys(apiKey), (key) => tavily({ apiKey: key }));
  return {
    available: () => pool.size > 0,
    async search(query, maxResults, opts = {}) {
      for (let attempt = 0; ; attempt++) {
        const client = pool.current();
        if (!client) throw new Error('TAVILY_API_KEY is not set');
        try {
          // Basic depth costs 1 credit; advanced costs 2. The free plan has 1,000 credits a month.
          const res = await client.search(query, {
            searchDepth: 'basic',
            maxResults,
            includeAnswer: false,
            ...(opts.topic ? { topic: opts.topic } : {}),
            ...(opts.topic === 'news' && opts.days ? { days: opts.days } : {}),
            ...(opts.includeDomains?.length ? { includeDomains: opts.includeDomains } : {}),
          });
          return (res.results ?? []).map((r) => ({ title: r.title ?? '', url: r.url ?? '', snippet: r.content ?? '' }));
        } catch (err) {
          if (attempt >= pool.size - 1 || !pool.rotate(client, err)) throw err;
        }
      }
    },
  };
}
