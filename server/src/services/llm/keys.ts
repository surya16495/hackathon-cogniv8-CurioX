// Several API keys per provider, so the free tiers of two or three accounts add up:
// GEMINI_API_KEY=key1,key2 — when one key is rate-limited the next is tried, and it stays first
// until it is limited in turn.

/** "k1, k2" → ["k1", "k2"], de-duplicated, empty for unset. */
export function parseKeys(value?: string | null): string[] {
  return [...new Set((value ?? '').split(/[,\s]+/).map((k) => k.trim()).filter(Boolean))];
}

/** 429s and quota messages from either SDK. */
export function isRateLimited(err: unknown): boolean {
  const e = err as { status?: number; code?: number; message?: string } | null;
  if (!e) return false;
  if (e.status === 429 || e.code === 429 || e.status === 432 || e.status === 433) return true;
  const m = String(e.message ?? '');
  return /\b429\b|rate.?limit|quota|RESOURCE_EXHAUSTED|too many requests|usage limit|credits? (exceeded|exhausted|remaining: 0)/i.test(m);
}

export interface KeyPool<T> {
  readonly size: number;
  /** The client to use now, or null when no key is set. */
  current(): T | null;
  /**
   * After a failure with `client`: moves to the next key and returns true if the failure was a
   * rate limit and another key exists, so the caller can try once more. A client that is no longer
   * current (someone else already rotated) does not rotate again.
   */
  rotate(client: T, err: unknown): boolean;
}

export function createKeyPool<T>(keys: string[], make: (key: string) => T): KeyPool<T> {
  const clients = keys.map(make);
  let index = 0;
  return {
    size: clients.length,
    current: () => clients[index] ?? null,
    rotate(client, err) {
      if (clients.length < 2 || !isRateLimited(err)) return false;
      if (clients[index] === client) index = (index + 1) % clients.length;
      return true;
    },
  };
}
