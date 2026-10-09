import type { Source } from '@curiox/shared';
import { withTimeout, truncate } from '../../utils/async';
import { describeError } from '../../utils/errors';
import { demoSources } from '../llm/demo';
import { readCache, writeCache, type RawResult } from './cache';
import type { SearchOptions, WebSearcher } from './tavily';

export interface SearchOutcome {
  sources: Source[];
  /** Where the results came from. "none" means search was unavailable or failed. */
  origin: 'live' | 'cache' | 'demo' | 'none';
}

export interface SearchService {
  search(query: string, opts?: SearchOptions & { max?: number }): Promise<SearchOutcome>;
  available(): boolean;
}

export interface SearchServiceOptions {
  searcher: WebSearcher;
  demoMode: boolean;
  ttlHours: number;
  maxResults?: number;
  timeoutMs?: number;
}

/** Keep http(s) links only, drop duplicates and empties, cap snippet size, number them 1..n. */
export function toSources(results: RawResult[], max: number): Source[] {
  const seen = new Set<string>();
  const out: Source[] = [];
  for (const r of results) {
    let url: URL;
    try {
      url = new URL(r.url);
    } catch {
      continue;
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') continue;
    const key = url.href.replace(/#.*$/, '').replace(/\/$/, '');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      id: out.length + 1,
      title: truncate((r.title || url.hostname).trim(), 200),
      url: url.href,
      snippet: truncate((r.snippet || '').replace(/\s+/g, ' ').trim(), 500),
    });
    if (out.length >= max) break;
  }
  return out;
}

export function createSearchService(opts: SearchServiceOptions): SearchService {
  const max = opts.maxResults ?? 5;
  const timeoutMs = opts.timeoutMs ?? 12000;

  return {
    available: () => opts.demoMode || opts.searcher.available(),

    async search(query, { max: maxOverride, ...searchOpts } = {}) {
      const q = query.trim().slice(0, 400);
      if (!q) return { sources: [], origin: 'none' };
      const limit = maxOverride ?? max;
      // Different search options must not share a cache entry with a plain search.
      const cacheKey = searchOpts.topic || searchOpts.includeDomains?.length ? `${JSON.stringify(searchOpts)} ${q}` : q;
      if (opts.demoMode) return { sources: demoSources(q), origin: 'demo' };
      if (!opts.searcher.available()) return { sources: [], origin: 'none' };

      try {
        const cached = await readCache(cacheKey);
        if (cached) return { sources: toSources(cached, limit), origin: 'cache' };
      } catch (err) {
        console.warn(`[search] cache read failed (${describeError(err)})`);
      }

      try {
        const raw = await withTimeout(opts.searcher.search(q, limit, searchOpts), timeoutMs, 'tavily search');
        const sources = toSources(raw, limit);
        // Do not cache empty results: a retry later may find something.
        if (sources.length) {
          writeCache(cacheKey, raw, opts.ttlHours).catch((err) => console.warn(`[search] cache write failed (${describeError(err)})`));
        }
        return { sources, origin: sources.length ? 'live' : 'none' };
      } catch (err) {
        console.warn(`[search] tavily failed (${describeError(err)})`);
        return { sources: [], origin: 'none' };
      }
    },
  };
}
