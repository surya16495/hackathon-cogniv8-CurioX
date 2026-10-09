// Small key-value store: AsyncStorage on disk, mirrored in memory so reads are synchronous.
// Call loadStorage() once at startup (the session provider does) before reading.
import AsyncStorage from '@react-native-async-storage/async-storage';

export const KEYS = {
  deviceId: 'curiox.deviceId',
  conversationId: 'curiox.conversationId',
  voice: 'curiox.voice',
  /** JSON: Pin[] — sources and videos kept for a deeper read. */
  pins: 'curiox.pins',
  /** JSON: deck ids the reader has swiped to the end of. */
  read: 'curiox.read',
  /** JSON: the last issue's number and lead, for the opening notification. */
  lastIssue: 'curiox.lastIssue',
  /** Prefix: issues already posted as a notification. */
  notified: 'curiox.notified',
} as const;

export function getJson<T>(key: string, fallback: T): T {
  const raw = storage.get(key);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function setJson(key: string, value: unknown): void {
  storage.set(key, JSON.stringify(value));
}

const memory = new Map<string, string>();
let loaded: Promise<void> | null = null;

export function loadStorage(): Promise<void> {
  loaded ??= AsyncStorage.multiGet(Object.values(KEYS))
    .then((pairs) => {
      for (const [k, v] of pairs) if (v !== null && !memory.has(k)) memory.set(k, v);
    })
    .catch(() => undefined); // storage unavailable: memory only
  return loaded;
}

export const storage = {
  get(key: string): string | null {
    return memory.get(key) ?? null;
  },
  set(key: string, value: string): void {
    memory.set(key, value);
    AsyncStorage.setItem(key, value).catch(() => undefined);
  },
  remove(key: string): void {
    memory.delete(key);
    AsyncStorage.removeItem(key).catch(() => undefined);
  },
};
