// Home · Talk · Pinboard. Talk is a raised yellow blob; the current tab gets a pen squiggle.
import { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle } from 'react-native-svg';
import { Icon, type IconName } from '../ui/Icon';
import { Squiggle } from '../ui/Marks';
import { Bump, useReduceMotion } from '../ui/kit';
import { paper, type, useGround } from '../ui/tokens';

/** Halftone dots that grow towards one corner, like the blob's shading. */
function CornerDots({ size, cell = 5, color = paper.ink }: { size: number; cell?: number; color?: string }) {
  const dots = useMemo(() => {
    const out: { x: number; y: number; r: number }[] = [];
    for (let y = cell / 2; y < size; y += cell)
      for (let x = cell / 2; x < size; x += cell) {
        const k = ((x + y) / (2 * size) - 0.42) / 0.58;
        if (k <= 0.03) continue;
        out.push({ x, y, r: cell * 0.36 * Math.min(1, k) });
      }
    return out;
  }, [size, cell]);
  return (
    <Svg width={size} height={size} style={{ position: 'absolute', left: 0, top: 0 }}>
      {dots.map((d, i) => (
        <Circle key={i} cx={d.x} cy={d.y} r={d.r} fill={color} />
      ))}
    </Svg>
  );
}

export function MiniBlob({ wobble }: { wobble: boolean }) {
  const g = useGround();
  const reduce = useReduceMotion();
  const turn = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!wobble || reduce) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(turn, { toValue: 1, duration: 1600, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(turn, { toValue: 0, duration: 1600, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [wobble, reduce, turn]);
  return (
    <Animated.View
      style={{
        width: 50,
        height: 50,
        backgroundColor: paper.yellow,
        borderTopLeftRadius: 27,
        borderTopRightRadius: 22,
        borderBottomRightRadius: 25,
        borderBottomLeftRadius: 24,
        boxShadow: g.sh,
        overflow: 'hidden',
        transform: [{ rotate: turn.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '14deg'] }) }],
      }}
    >
      <CornerDots size={50} />
    </Animated.View>
  );
}

export type TabKey = 'home' | 'talk' | 'pins';

const TABS: { key: TabKey; label: string; icon?: IconName }[] = [
  { key: 'home', label: 'Home', icon: 'home' },
  { key: 'talk', label: 'Talk' },
  { key: 'pins', label: 'Pinboard', icon: 'pin' },
];

export function TabBar({ current, onTab }: { current: TabKey; onTab: (k: TabKey) => void }) {
  const g = useGround();
  const insets = useSafeAreaInsets();
  return (
    <View
      accessibilityRole="tablist"
      style={{ height: 68 + insets.bottom, paddingBottom: insets.bottom, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', paddingHorizontal: 20, borderTopWidth: 1.5, borderTopColor: g.rule, backgroundColor: 'transparent' }}
    >
      {TABS.map((t) => {
        const on = current === t.key;
        return (
          <Pressable
            key={t.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            accessibilityLabel={t.label}
            onPress={() => onTab(t.key)}
            style={({ pressed }) => ({ width: 86, height: 58, alignItems: 'center', justifyContent: 'center', gap: t.key === 'talk' ? 5 : 3, marginTop: t.key === 'talk' ? -22 : 0, ...(pressed ? { transform: [{ scale: 0.94 }] } : {}) })}
          >
            <Bump on={on}>{t.icon ? <Icon name={t.icon} color={g.onGround} rotate={t.key === 'pins' ? 28 : 0} /> : <MiniBlob wobble={on} />}</Bump>
            <Text style={[type.tab, { color: g.onGround }]}>{t.label}</Text>
            {on && (
              // The Talk blob makes that tab taller than its box, so its squiggle sits lower.
              <View style={{ position: 'absolute', left: 24, right: 24, bottom: t.key === 'talk' ? -12 : 0 }}>
                <Squiggle width={38} color={g.onGround} />
              </View>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}
