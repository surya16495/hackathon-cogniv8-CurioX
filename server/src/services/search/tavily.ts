import { tavily } from '@tavily/core';
import type { RawResult } from './cache';

export interface WebSearcher {
  available(): boolean;
  search(query: string, maxResults: number): Promise<RawResult[]>;
}

export function createTavilySearcher(apiKey?: string): WebSearcher {
  const client = apiKey ? tavily({ apiKey }) : null;
  return {
    available: () => client !== null,
    async search(query, maxResults) {
      if (!client) throw new Error('TAVILY_API_KEY is not set');
      // Basic depth costs 1 credit; advanced costs 2. The free plan has 1,000 credits a month.
      const res = await client.search(query, { searchDepth: 'basic', maxResults, includeAnswer: false });
      return (res.results ?? []).map((r) => ({ title: r.title ?? '', url: r.url ?? '', snippet: r.content ?? '' }));
    },
  };
}
