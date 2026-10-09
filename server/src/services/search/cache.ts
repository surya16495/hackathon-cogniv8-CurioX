import { createHash } from 'node:crypto';
import { SearchCache } from '../../db/models';

export interface RawResult {
  title: string;
  url: string;
  snippet: string;
}

/** "  What's NEW in AI? " and "what's new in ai?" share one cache entry. */
export function normalizeQuery(query: string): string {
  return query.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function hashQuery(query: string): string {
  return createHash('sha256').update(normalizeQuery(query)).digest('hex');
}

export async function readCache(query: string): Promise<RawResult[] | null> {
  const hit = await SearchCache.findOne({ queryHash: hashQuery(query), expiresAt: { $gt: new Date() } }).lean();
  if (!hit) return null;
  return hit.results.map((r) => ({ title: r.title ?? '', url: r.url ?? '', snippet: r.snippet ?? '' }));
}

export async function writeCache(query: string, results: RawResult[], ttlHours: number): Promise<void> {
  const now = new Date();
  await SearchCache.updateOne(
    { queryHash: hashQuery(query) },
    { $set: { query: normalizeQuery(query), results, createdAt: now, expiresAt: new Date(now.getTime() + ttlHours * 3600_000) } },
    { upsert: true },
  );
}
