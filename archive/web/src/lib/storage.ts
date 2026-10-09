// localStorage that never throws (private mode, blocked storage) and falls back to memory.
const memory = new Map<string, string>();

export const storage = {
  get(key: string): string | null {
    try {
      return window.localStorage.getItem(key) ?? memory.get(key) ?? null;
    } catch {
      return memory.get(key) ?? null;
    }
  },
  set(key: string, value: string): void {
    memory.set(key, value);
    try {
      window.localStorage.setItem(key, value);
    } catch {
      // memory only
    }
  },
  remove(key: string): void {
    memory.delete(key);
    try {
      window.localStorage.removeItem(key);
    } catch {
      // ignore
    }
  },
};
