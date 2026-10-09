// "Waking up CurioX" (the free server naps) and "Can't reach CurioX".
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Cut } from '../ui/Art';
import { Btn, Ground, T, useReduceMotion } from '../ui/kit';
import { paper, useGround } from '../ui/tokens';

/** Grey paper shapes with a photocopier light sweeping over them. */
export function CopierSkeleton({ cover = true }: { cover?: boolean }) {
  const g = useGround();
  const reduce = useReduceMotion();
  const sweep = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduce) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(sweep, { toValue: 1, duration: 1700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(sweep, { toValue: 0, duration: 1700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [reduce, sweep]);
  const sk = { backgroundColor: g.strip, opacity: 0.7, borderRadius: 3, boxShadow: g.sh, height: 44 } as const;
  return (
    <View style={{ gap: 12, overflow: 'hidden', paddingTop: 4, paddingHorizontal: 4, paddingBottom: 12, marginHorizontal: -4, marginBottom: 14 }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {cover && <View style={{ height: 170, borderRadius: 26, backgroundColor: paper.yellow, opacity: 0.55 }} />}
      <View style={sk} />
      <View style={[sk, { width: '62%' }]} />
      <Animated.View
        pointerEvents="none"
        style={{ position: 'absolute', left: 0, right: 0, top: -70, height: 70, transform: [{ translateY: sweep.interpolate({ inputRange: [0, 1], outputRange: [0, 400] }) }] }}
      >
        <View style={{ flex: 1, backgroundColor: paper.white, opacity: 0.12 }} />
        <View style={{ flex: 1, backgroundColor: paper.white, opacity: 0.55 }} />
        <View style={{ flex: 1, backgroundColor: paper.white, opacity: 0.12 }} />
      </Animated.View>
    </View>
  );
}

export function Waking({ title = 'Waking up CurioX', body = 'The free server naps after 15 quiet minutes. Waking it takes about a minute.', status = 'Warming up' }: { title?: string; body?: string; status?: string }) {
  const insets = useSafeAreaInsets();
  const [secs, setSecs] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setSecs((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <Ground>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 16, paddingHorizontal: 24, paddingBottom: 20, gap: 14 }}>
        <CopierSkeleton />
        <T v="xl" accessibilityRole="header">
          {title}
        </T>
        <T style={{ maxWidth: 300 }}>{body}</T>
        <T v="typed" muted accessibilityRole="text">
          {status}, {Math.floor(secs / 60)}:{String(secs % 60).padStart(2, '0')}
        </T>
      </ScrollView>
    </Ground>
  );
}

export function CantReach({ message, onRetry }: { message?: string | null; onRetry: () => void }) {
  const insets = useSafeAreaInsets();
  return (
    <Ground>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 16, paddingHorizontal: 24, paddingBottom: 20, gap: 14 }}>
        <Cut art="plug" size={150} rotate={-8} style={{ marginTop: 10, marginLeft: -8 }} />
        <T v="xl" accessibilityRole="header">
          Can't reach CurioX
        </T>
        <T style={{ maxWidth: 300 }}>{message || 'Your connection dropped, or the server is still waking. Check your internet, then try again.'}</T>
        <Btn label="Try again" icon="refresh" onPress={onRetry} style={{ marginTop: 6 }} />
      </ScrollView>
    </Ground>
  );
}
