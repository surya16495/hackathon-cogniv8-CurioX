// The opening: the yellow mark on paper, wobbling like the Talk blob with sound rings spreading
// out of it, while the server wakes. Once the app is ready the mark swells and its yellow floods
// the screen, and Home is underneath. Notifications are the phone's own (lib/notify.ts), never
// drawn inside the app.
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Image, Pressable, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ground, useReduceMotion } from '../ui/kit';
import { fonts, paper, type } from '../ui/tokens';

const MARK = require('../../assets/splash-icon.png');
/** Same size as the native splash image, so the hand-off from the splash is seamless. */
const MARK_SIZE = 120;
const MIN_SHOW_MS = 1500;

function Ring({ delay, go }: { delay: number; go: boolean }) {
  const a = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!go) return;
    const loop = Animated.loop(Animated.sequence([Animated.delay(delay), Animated.timing(a, { toValue: 1, duration: 1900, easing: Easing.out(Easing.quad), useNativeDriver: true }), Animated.timing(a, { toValue: 0, duration: 0, useNativeDriver: true })]));
    loop.start();
    return () => loop.stop();
  }, [a, delay, go]);
  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute',
        width: MARK_SIZE + 24,
        height: MARK_SIZE + 24,
        borderRadius: (MARK_SIZE + 24) / 2,
        borderWidth: 3,
        borderColor: paper.ink,
        opacity: a.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0, 0.4, 0] }),
        transform: [{ scale: a.interpolate({ inputRange: [0, 1], outputRange: [0.9, 2.9] }) }],
      }}
    />
  );
}

export function Opening({ ready, onOpen }: { ready: boolean; onOpen: () => void }) {
  const reduce = useReduceMotion();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const [shown, setShown] = useState(false);
  const [opening, setOpening] = useState(false);
  const onOpenRef = useRef(onOpen);
  onOpenRef.current = onOpen;

  const wobble = useRef(new Animated.Value(0)).current;
  const breathe = useRef(new Animated.Value(0)).current;
  const words = useRef(new Animated.Value(0)).current;
  const swell = useRef(new Animated.Value(0)).current;
  const flood = useRef(new Animated.Value(0)).current;

  // The mark wobbles and breathes like the Talk blob; the name settles under it.
  useEffect(() => {
    const t = setTimeout(() => setShown(true), MIN_SHOW_MS);
    if (reduce) {
      words.setValue(1);
      return () => clearTimeout(t);
    }
    const loops = [
      Animated.loop(Animated.sequence([Animated.timing(wobble, { toValue: 1, duration: 1500, easing: Easing.inOut(Easing.sin), useNativeDriver: true }), Animated.timing(wobble, { toValue: 0, duration: 1500, easing: Easing.inOut(Easing.sin), useNativeDriver: true })])),
      Animated.loop(Animated.sequence([Animated.timing(breathe, { toValue: 1, duration: 950, easing: Easing.inOut(Easing.sin), useNativeDriver: true }), Animated.timing(breathe, { toValue: 0, duration: 950, easing: Easing.inOut(Easing.sin), useNativeDriver: true })])),
    ];
    for (const l of loops) l.start();
    Animated.timing(words, { toValue: 1, duration: 500, delay: 350, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    return () => {
      clearTimeout(t);
      for (const l of loops) l.stop();
    };
  }, [reduce, wobble, breathe, words]);

  // The mark swells and its yellow floods the screen; then the app is underneath.
  const open = () => {
    if (opening) return;
    setOpening(true);
    if (reduce) return onOpenRef.current();
    Animated.parallel([
      Animated.timing(words, { toValue: 0, duration: 200, useNativeDriver: true }),
      Animated.timing(swell, { toValue: 1, duration: 560, easing: Easing.bezier(0.7, 0, 0.3, 1), useNativeDriver: true }),
      Animated.timing(flood, { toValue: 1, duration: 520, delay: 120, easing: Easing.bezier(0.6, 0, 0.2, 1), useNativeDriver: true }),
    ]).start(() => onOpenRef.current());
  };

  useEffect(() => {
    if (shown && ready) open();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown, ready]);

  const floodSize = Math.hypot(width, height) * 2.1;

  return (
    <Ground>
      <Pressable accessibilityRole="button" accessibilityLabel="CurioX. Opening" onPress={() => ready && open()} style={{ flex: 1, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
        {/* The yellow flood, centred on the mark. */}
        <Animated.View
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: width / 2 - floodSize / 2,
            top: height / 2 - 30 - floodSize / 2,
            width: floodSize,
            height: floodSize,
            borderRadius: floodSize / 2,
            backgroundColor: paper.yellow,
            transform: [{ scale: flood.interpolate({ inputRange: [0, 1], outputRange: [0.001, 1] }) }],
          }}
        />
        <View style={{ alignItems: 'center', justifyContent: 'center', marginTop: -60 }}>
          {[0, 650, 1300].map((d) => (
            <Ring key={d} delay={d} go={!reduce && !opening} />
          ))}
          <Animated.View
            style={{
              transform: [
                { rotate: wobble.interpolate({ inputRange: [0, 1], outputRange: ['-5deg', '5deg'] }) },
                { scale: Animated.add(breathe.interpolate({ inputRange: [0, 1], outputRange: [0.97, 1.03] }), swell.interpolate({ inputRange: [0, 1], outputRange: [0, 9] })) },
              ],
              opacity: swell.interpolate({ inputRange: [0, 0.7, 1], outputRange: [1, 1, 0] }),
            }}
          >
            <Image source={MARK} style={{ width: MARK_SIZE, height: MARK_SIZE, borderRadius: MARK_SIZE / 4 }} accessibilityIgnoresInvertColors />
          </Animated.View>
        </View>
        <Animated.View style={{ position: 'absolute', top: height / 2 + 50, alignItems: 'center', gap: 6, opacity: words, transform: [{ translateY: words.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }] }}>
          <Text style={[type.word, { fontSize: 44, lineHeight: 48, color: paper.ink }]}>CurioX</Text>
          <Text style={{ fontFamily: fonts.body, fontSize: 15, color: paper.ink2 }}>{ready ? 'Opening…' : 'Waking up…'}</Text>
        </Animated.View>
        <Animated.Text style={[type.note, { position: 'absolute', bottom: Math.max(insets.bottom, 16) + 24, color: paper.pen, opacity: words }]}>learn anything in cards made for you</Animated.Text>
      </Pressable>
    </Ground>
  );
}

export function AppIcon({ size = 40 }: { size?: number }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size / 4, backgroundColor: paper.yellow, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ fontFamily: fonts.disp900, fontSize: size * 0.75, lineHeight: size * 0.82, color: paper.ink, marginTop: size * 0.04 }}>C</Text>
    </View>
  );
}
