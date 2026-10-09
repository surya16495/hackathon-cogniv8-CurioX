import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { onboardingDone, useSession } from '@/hooks/useSession';
import { localDate, useZine, type LastIssue } from '@/hooks/useZine';
import { KEYS, getJson, loadStorage, storage } from '@/lib/storage';
import { Opening, openingNotice } from '@/screens/Opening';
import { CantReach, Waking } from '@/screens/Status';

// Entry: the lock-screen opening plays while the server wakes and today's issue is fetched.
export default function Index() {
  const router = useRouter();
  const { phase, session, error, retry } = useSession();
  const { loadToday } = useZine();
  const [opened, setOpened] = useState(false);
  const [last, setLast] = useState<LastIssue | null>(null);
  const onboarded = onboardingDone(session);
  const ready = phase === 'ready' && !!session;

  useEffect(() => {
    void loadStorage().then(() => setLast(getJson<LastIssue | null>(KEYS.lastIssue, null)));
  }, []);

  // Start printing today's issue during the animation, so Home opens on it.
  useEffect(() => {
    if (ready && onboarded) void loadToday();
  }, [ready, onboarded, loadToday]);

  useEffect(() => {
    if (!opened || !ready) return;
    const needsAuth = !session?.account && !onboarded && !storage.get(KEYS.skippedAuth);
    router.replace(needsAuth ? '/auth' : onboarded ? '/home' : '/onboard');
  }, [opened, ready, onboarded, session, router]);

  if (phase === 'error') {
    return (
      <CantReach
        message={error}
        onRetry={() => {
          setOpened(false);
          retry();
        }}
      />
    );
  }
  if (opened && !ready) return <Waking />;

  // Until the session arrives, a saved issue means a returning reader.
  const returning = session ? onboarded : !!last;
  const notice = openingNotice({ onboarded: returning, last, today: localDate(), interests: session?.profile.interests ?? [] });
  return <Opening notice={notice} ready={ready} onOpen={() => setOpened(true)} />;
}
