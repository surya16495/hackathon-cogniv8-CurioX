import type { ReactElement } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { Redirect } from 'expo-router';
import { Button, Logo } from '@/components/ui';
import { onboardingDone, useSession } from '@/hooks/useSession';
import { useColors } from '@/theme';
import { MicFab } from '@/voice/VoiceControls';
import { useVoiceScreen } from '@/voice/VoiceProvider';

/**
 * Keep each screen for the right user: onboarding screens before the profile exists,
 * the app after. Returns a redirect when the user belongs elsewhere, otherwise null.
 */
export function useGuard(area: 'onboarding' | 'ready'): ReactElement | null {
  const { phase, session } = useSession();
  if (phase !== 'ready' || !session) return <Redirect href="/" />;
  const done = onboardingDone(session);
  if (area === 'onboarding' && done) return <Redirect href="/chat" />;
  if (area === 'ready' && !done) return <Redirect href="/welcome" />;
  return null;
}

export function Splash({ slow }: { slow?: boolean }) {
  const c = useColors();
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: c.bg, gap: 16 }}>
      <Logo size={80} />
      <ActivityIndicator color={c.primary} />
      <Text style={{ color: c.text, fontSize: 18, fontWeight: '600' }}>{slow ? 'Waking up CurioX…' : 'Loading…'}</Text>
      {slow && (
        <Text style={{ color: c.muted, textAlign: 'center', maxWidth: 300 }}>The server was asleep to save energy. This can take up to a minute the first time.</Text>
      )}
    </View>
  );
}

export function ConnectionError() {
  const { error, retry } = useSession();
  const c = useColors();
  useVoiceScreen({
    screen: 'error',
    intro: "I can't connect to CurioX right now. Say try again, or tap the button.",
    onCommand: (cmd) => {
      if (cmd.type !== 'retry') return false;
      retry();
    },
  });
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: c.bg, gap: 12 }}>
      <Logo size={72} />
      <Text style={{ color: c.text, fontSize: 18, fontWeight: '600', textAlign: 'center' }}>CurioX can't connect right now</Text>
      <Text style={{ color: c.muted, textAlign: 'center', maxWidth: 320 }}>{error}</Text>
      <Button label="Try again" onPress={retry} style={{ marginTop: 8 }} />
      <MicFab />
    </View>
  );
}
