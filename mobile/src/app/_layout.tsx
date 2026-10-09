import { AtkinsonHyperlegible_400Regular, AtkinsonHyperlegible_400Regular_Italic, AtkinsonHyperlegible_700Bold } from '@expo-google-fonts/atkinson-hyperlegible';
import { CourierPrime_400Regular, CourierPrime_700Bold } from '@expo-google-fonts/courier-prime';
import { Gabarito_500Medium, Gabarito_700Bold, Gabarito_800ExtraBold, Gabarito_900Black } from '@expo-google-fonts/gabarito';
import { ReenieBeanie_400Regular } from '@expo-google-fonts/reenie-beanie';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { SessionProvider } from '@/hooks/useSession';
import { ZineProvider } from '@/hooks/useZine';
import { paper, useGround } from '@/ui/tokens';
import { VoiceOverlay } from '@/voice/VoiceControls';
import { VoiceProvider } from '@/voice/VoiceProvider';

void SplashScreen.preventAutoHideAsync().catch(() => undefined);

export default function RootLayout() {
  const g = useGround();
  const [loaded, failed] = useFonts({
    Gabarito_500Medium,
    Gabarito_700Bold,
    Gabarito_800ExtraBold,
    Gabarito_900Black,
    AtkinsonHyperlegible_400Regular,
    AtkinsonHyperlegible_400Regular_Italic,
    AtkinsonHyperlegible_700Bold,
    CourierPrime_400Regular,
    CourierPrime_700Bold,
    ReenieBeanie_400Regular,
  });
  const ready = loaded || !!failed;

  useEffect(() => {
    if (ready) void SplashScreen.hideAsync().catch(() => undefined);
  }, [ready]);

  // The native splash is the lock screen's colour, so this hand-off is seamless.
  if (!ready) return <View style={{ flex: 1, backgroundColor: paper.lock }} />;

  return (
    <SafeAreaProvider>
      <SessionProvider>
        <ZineProvider>
          <VoiceProvider>
            <StatusBar style={g.scheme === 'dark' ? 'light' : 'dark'} />
            <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: g.ground }, animation: 'fade' }}>
              <Stack.Screen name="index" options={{ contentStyle: { backgroundColor: paper.lock }, animation: 'none' }} />
              <Stack.Screen name="deck/[id]" options={{ animation: 'slide_from_bottom' }} />
              <Stack.Screen name="quiz" options={{ animation: 'slide_from_bottom' }} />
            </Stack>
            <VoiceOverlay />
          </VoiceProvider>
        </ZineProvider>
      </SessionProvider>
    </SafeAreaProvider>
  );
}
