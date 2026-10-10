import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { onboardingDone, useSession } from '@/hooks/useSession';
import { useZine } from '@/hooks/useZine';
import { KEYS, storage } from '@/lib/storage';
import { Opening } from '@/screens/Opening';
import { CantReach, Waking } from '@/screens/Status';

// Entry: the opening (the mark, swelling into the app) plays while the server wakes and today's issue is fetched.
export default function Index() {
  const router = useRouter();
  const { phase, session, error, retry } = useSession();
  const { loadToday } = useZine();
  const [opened, setOpened] = useState(false);
  const onboarded = onboardingDone(session);
  const ready = phase === 'ready' && !!session;

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

  return <Opening ready={ready} onOpen={() => setOpened(true)} />;
}
