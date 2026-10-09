import { useIsFocused, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { useSession } from '@/hooks/useSession';
import { useZine } from '@/hooks/useZine';
import { Home } from '@/screens/Home';

export default function HomeRoute() {
  const router = useRouter();
  const focused = useIsFocused();
  const { session } = useSession();
  const z = useZine();

  // Coming back to Home draws the tick on whatever was just finished, once.
  useEffect(() => {
    if (!focused || !z.fresh) return;
    const t = setTimeout(z.clearFresh, 1500);
    return () => clearTimeout(t);
  }, [focused, z.fresh, z.clearFresh]);

  const { status, loadToday } = z;
  useEffect(() => {
    if (status === 'idle' && session) void loadToday();
  }, [status, session, loadToday]);

  const open = (id: string) => router.push({ pathname: '/deck/[id]', params: { id } });

  return (
    <Home
      today={z.today}
      status={z.status}
      error={z.error}
      interests={session?.profile.interests ?? []}
      isRead={z.isRead}
      fresh={z.fresh}
      onOpenDeck={open}
      onAsk={() => router.push('/ask')}
      onYou={() => router.push('/you')}
      onRetry={() => void z.loadToday()}
      onOnboard={() => router.push('/onboard')}
    />
  );
}
