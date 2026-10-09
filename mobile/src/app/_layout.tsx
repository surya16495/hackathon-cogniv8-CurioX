import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { SessionProvider } from '@/hooks/useSession';
import { useColors } from '@/theme';
import { VoiceOverlay } from '@/voice/VoiceControls';
import { VoiceProvider } from '@/voice/VoiceProvider';

export default function RootLayout() {
  const c = useColors();
  return (
    <SafeAreaProvider>
      <SessionProvider>
        <VoiceProvider>
          <StatusBar style="auto" />
          <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.bg }, animation: 'fade' }} />
          <VoiceOverlay />
        </VoiceProvider>
      </SessionProvider>
    </SafeAreaProvider>
  );
}
