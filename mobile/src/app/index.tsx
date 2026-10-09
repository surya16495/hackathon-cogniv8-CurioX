import { Redirect } from 'expo-router';
import { onboardingDone, useSession } from '@/hooks/useSession';
import { ConnectionError, Splash } from '@/screens/Gate';

// Entry: wake the API, load the device's user, then go to onboarding or chat.
export default function Index() {
  const { phase, session } = useSession();
  if (phase === 'waking' || phase === 'slow') return <Splash slow={phase === 'slow'} />;
  if (phase === 'error' || !session) return <ConnectionError />;
  return <Redirect href={onboardingDone(session) ? '/chat' : '/welcome'} />;
}
