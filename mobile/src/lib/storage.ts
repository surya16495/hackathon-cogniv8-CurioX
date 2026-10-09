// Small key-value store: AsyncStorage on disk, mirrored in memory so reads are synchronous.
// Call loadStorage() once at startup (the session provider does) before reading.
import AsyncStorage from '@react-native-async-storage/async-storage';

export const KEYS = {
  deviceId: 'curiox.deviceId',
  conversationId: 'curiox.conversationId',
  voice: 'curiox.voice',
} as const;

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
