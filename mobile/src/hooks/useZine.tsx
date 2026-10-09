// Today's issue, every deck seen so far, what has been read, and the pinboard. Shared app-wide.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { ArtKey, Deck, DeckSummary, TodayResponse } from '@curiox/shared';
import { ApiError, api } from '../api/client';
import { useSession } from './useSession';
import { notifyIssue } from '../lib/notify';
import { KEYS, getJson, loadStorage, setJson } from '../lib/storage';

export interface Pin {
  /** The source URL or the video id. */
  id: string;
  kind: 'article' | 'video';
  title: string;
  site: string;
  summary: string;
  url: string;
  videoId?: string;
  deckId: string;
  deckNo: number;
  deckTitle: string;
  /** For a video: the card it sits on, so "Watch" opens the deck there. */
  card?: number;
}

export interface LastIssue {
  no: number;
  date: string;
  title: string;
  art: ArtKey;
}

type Status = 'idle' | 'loading' | 'slow' | 'ready' | 'error';

interface ZineValue {
  today: TodayResponse | null;
  status: Status;
  error: string | null;
  loadToday: (opts?: { fresh?: boolean }) => Promise<void>;
  deck: (id: string) => Deck | undefined;
  fetchDeck: (id: string) => Promise<Deck>;
  addDeck: (d: Deck) => void;
  isRead: (id: string) => boolean;
  markRead: (id: string) => void;
  signal: (topic: string | undefined, kind: 'read' | 'ask' | 'talk') => void;
  /** The deck most recently finished, so Home can draw its tick in. Cleared once shown. */
  fresh: string | null;
  clearFresh: () => void;
  pins: Pin[];
  isPinned: (id: string) => boolean;
  togglePin: (p: Pin) => void;
  /** Today's stories in reading order: the lead, then the rest. */
  order: string[];
  nextUnread: (afterId: string) => Deck | DeckSummary | null;
}

const ZineContext = createContext<ZineValue | null>(null);

export function localDate(d = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function ZineProvider({ children }: { children: ReactNode }) {
  const { session } = useSession();
  const [today, setToday] = useState<TodayResponse | null>(null);
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);
  const [decks, setDecks] = useState<Record<string, Deck>>({});
  const [read, setRead] = useState<string[]>(() => getJson<string[]>(KEYS.read, []));
  const [fresh, setFresh] = useState<string | null>(null);
  const [pins, setPins] = useState<Pin[]>(() => getJson<Pin[]>(KEYS.pins, []));
  const inflight = useRef<Promise<void> | null>(null);

  // Storage loads asynchronously at startup: pick up what was saved last time once it has.
  useEffect(() => {
    void loadStorage().then(() => {
      setRead((r) => (r.length ? r : getJson<string[]>(KEYS.read, [])));
      setPins((p) => (p.length ? p : getJson<Pin[]>(KEYS.pins, [])));
    });
  }, []);

  // Pins live on the server (per account, or per device): fetch them whenever the user changes.
  const userId = session?.userId;
  useEffect(() => {
    if (!userId) return;
    let alive = true;
    api
      .pins()
      .then((res) => {
        if (!alive) return;
        setPins(res.pins as Pin[]);
        setJson(KEYS.pins, res.pins);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [userId]);

  const remember = useCallback((list: Deck[]) => {
    setDecks((m) => {
      const next = { ...m };
      for (const d of list) next[d.id] = d;
      return next;
    });
  }, []);

  const loadToday = useCallback(
    async ({ fresh: forceFresh = false }: { fresh?: boolean } = {}) => {
      if (inflight.current && !forceFresh) return inflight.current;
      const date = localDate();
      const job = (async () => {
        setStatus('loading');
        setError(null);
        // A new issue takes a model a few seconds to write: say so if it is slow.
        const slow = setTimeout(() => setStatus((s) => (s === 'loading' ? 'slow' : s)), 2500);
        try {
          if (forceFresh) await api.discardToday(date).catch(() => undefined);
          const res = await api.today(date);
          remember([res.issue.lead, ...res.issue.stories]);
          setToday(res);
          setJson(KEYS.lastIssue, { no: res.issue.no, date, title: res.issue.lead.title, art: res.issue.lead.art } satisfies LastIssue);
          setStatus('ready');
          // The top update goes out as a notification, once per issue.
          void notifyIssue({ key: `${date}:${res.issue.lead.id}`, no: res.issue.no, title: res.issue.lead.title, deckId: res.issue.lead.id });
        } catch (err) {
          setError(err instanceof ApiError ? err.message : 'Could not load today’s issue.');
          setStatus('error');
        } finally {
          clearTimeout(slow);
          inflight.current = null;
        }
      })();
      inflight.current = job;
      return job;
    },
    [remember],
  );

  const fetchDeck = useCallback(
    async (id: string) => {
      const d = await api.deck(id);
      remember([d]);
      return d;
    },
    [remember],
  );

  const markRead = useCallback((id: string) => {
    setRead((r) => {
      if (r.includes(id)) return r;
      const next = [id, ...r].slice(0, 300);
      setJson(KEYS.read, next);
      return next;
    });
    setFresh(id);
  }, []);

  /** Reading a deck counts towards its subject; a few reads make it an interest. */
  const signal = useCallback((topic: string | undefined, kind: 'read' | 'ask' | 'talk') => {
    if (!topic || topic === 'Today') return;
    api.signal(topic, kind).catch(() => undefined);
  }, []);

  const togglePin = useCallback((p: Pin) => {
    setPins((list) => {
      const had = list.some((x) => x.id === p.id);
      const next = had ? list.filter((x) => x.id !== p.id) : [p, ...list];
      setJson(KEYS.pins, next);
      (had ? api.deletePin(p.id) : api.savePin(p)).catch(() => undefined);
      return next;
    });
  }, []);

  const order = useMemo(() => {
    if (!today) return [];
    const rest = today.issue.stories.map((s) => s.id).filter((id) => !today.issue.featured.includes(id));
    return [...today.issue.featured, ...rest];
  }, [today]);

  const value = useMemo<ZineValue>(() => {
    const isRead = (id: string) => read.includes(id);
    return {
      today,
      status,
      error,
      loadToday,
      deck: (id) => decks[id],
      fetchDeck,
      addDeck: (d) => remember([d]),
      isRead,
      markRead,
      signal,
      fresh,
      clearFresh: () => setFresh(null),
      pins,
      isPinned: (id) => pins.some((p) => p.id === id),
      togglePin,
      order,
      nextUnread: (afterId) => {
        const i = order.indexOf(afterId);
        if (i < 0) return null;
        const rest = [...order.slice(i + 1), ...order.slice(0, i)];
        const id = rest.find((x) => !isRead(x));
        return id ? decks[id] ?? null : null;
      },
    };
  }, [today, status, error, loadToday, decks, fetchDeck, remember, read, markRead, signal, fresh, pins, togglePin, order]);

  return <ZineContext.Provider value={value}>{children}</ZineContext.Provider>;
}

export function useZine(): ZineValue {
  const ctx = useContext(ZineContext);
  if (!ctx) throw new Error('useZine must be used inside <ZineProvider>');
  return ctx;
}
