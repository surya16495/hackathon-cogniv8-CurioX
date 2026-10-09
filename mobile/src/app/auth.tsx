import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ApiError } from '@/api/client';
import type { SessionResponse } from '@curiox/shared';
import { onboardingDone, useSession } from '@/hooks/useSession';
import { KEYS, storage } from '@/lib/storage';
import { AuthScreen } from '@/screens/AuthScreen';

export default function AuthRoute() {
  const router = useRouter();
  const { session, signIn, signUp } = useSession();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const done = !!session && onboardingDone(session);

  // Route on the account's own session: signing in to an onboarded account goes straight home.
  const run = async (fn: () => Promise<SessionResponse>) => {
    setBusy(true);
    setError(null);
    try {
      const next = await fn();
      router.replace(onboardingDone(next) ? '/home' : '/onboard');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthScreen
      busy={busy}
      error={error}
      hasCard={done}
      onSignUp={(name, email, password) => void run(() => signUp(name, email, password))}
      onSignIn={(email, password) => void run(() => signIn(email, password))}
      onSkip={() => {
        storage.set(KEYS.skippedAuth, '1');
        router.replace(done ? '/home' : '/onboard');
      }}
    />
  );
}
