// Wakes the API, then creates or loads this device's user. Shared by every page through context.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { HealthResponse, OnboardingState, Profile, SessionResponse } from '@curiox/shared';
import { ApiError, api, wakeServer } from '../api/client';
import { KEYS, loadStorage, storage } from '../lib/storage';

export type SessionPhase = 'waking' | 'slow' | 'ready' | 'error';

interface SessionContextValue {
  phase: SessionPhase;
  session: SessionResponse | null;
  health: HealthResponse | null;
  error: string | null;
  retry: () => void;
  /** Update the cached profile/onboarding after onboarding or a profile edit. */
  update: (profile: Profile, onboarding: OnboardingState) => void;
  /** Both resolve with the account's session, so the caller can route on it straight away. */
  signUp: (name: string, email: string, password: string) => Promise<SessionResponse>;
  signIn: (email: string, password: string) => Promise<SessionResponse>;
  signOut: () => void;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [phase, setPhase] = useState<SessionPhase>('waking');
  const [session, setSession] = useState<SessionResponse | null>(null);
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    const controller = new AbortController();
    setPhase('waking');
    setError(null);
    (async () => {
      try {
        await loadStorage(); // the device ID must be read before the first request
        const h = await wakeServer({ signal: controller.signal, onSlow: () => mounted.current && setPhase('slow') });
        setHealth(h);
        setSession(await api.session());
        if (mounted.current) setPhase('ready');
      } catch (err) {
        if (controller.signal.aborted || !mounted.current) return;
        setError(err instanceof ApiError ? err.message : 'Something went wrong while starting CurioX.');
        setPhase('error');
      }
    })();
    return () => {
      mounted.current = false;
      controller.abort();
    };
  }, [attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  const take = useCallback((res: { token: string; session: SessionResponse }) => {
    storage.set(KEYS.token, res.token);
    storage.remove(KEYS.skippedAuth);
    setSession(res.session);
    return res.session;
  }, []);
  const signUp = useCallback(async (name: string, email: string, password: string) => take(await api.signUp({ name, email, password })), [take]);
  const signIn = useCallback(async (email: string, password: string) => take(await api.signIn({ email, password })), [take]);
  // Signing out goes back to this device's anonymous user.
  const signOut = useCallback(() => {
    storage.remove(KEYS.token);
    setAttempt((n) => n + 1);
  }, []);
  const update = useCallback((profile: Profile, onboarding: OnboardingState) => {
    setSession((s) => (s ? { ...s, profile, onboarding } : s));
  }, []);

  const value = useMemo(() => ({ phase, session, health, error, retry, update, signUp, signIn, signOut }), [phase, session, health, error, retry, update, signUp, signIn, signOut]);
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used inside <SessionProvider>');
  return ctx;
}

export function onboardingDone(session: SessionResponse | null): boolean {
  const s = session?.onboarding.status;
  return s === 'completed' || s === 'skipped';
}
