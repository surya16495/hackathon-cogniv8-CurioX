// Marks made by pen: a loop around what is chosen, ticks and crosses, arrows, underlines.
// Each one can draw itself in, the way the design animates stroke-dashoffset.
import { useEffect, useMemo, useRef } from 'react';
import { AccessibilityInfo, Animated, Easing, View, type ViewStyle } from 'react-native';
import Svg, { Path } from 'react-native-svg';

const AnimatedPath = Animated.createAnimatedComponent(Path);

/** One stroke that draws itself in over `duration` ms when `draw` is true. */
export function DrawPath({ d, length, draw, delay = 0, duration = 340, color, width }: { d: string; length: number; draw: boolean; delay?: number; duration?: number; color: string; width: number }) {
  const offset = useRef(new Animated.Value(draw ? length : 0)).current;
  useEffect(() => {
    if (!draw) return;
    let cancelled = false;
    void AccessibilityInfo.isReduceMotionEnabled().then((reduce) => {
      if (cancelled) return;
      if (reduce) return offset.setValue(0);
      Animated.timing(offset, { toValue: 0, duration, delay, easing: Easing.bezier(0.5, 0, 0.2, 1), useNativeDriver: false }).start();
    });
    return () => {
      cancelled = true;
    };
  }, [draw, delay, duration, offset]);
  return (
    <AnimatedPath
      d={d}
      fill="none"
      stroke={color}
      strokeWidth={width}
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeDasharray={[length, length]}
      strokeDashoffset={offset}
    />
  );
}

/** The design's circle(): a loop that overshoots its start, like a pen ring around a chip. */
export function ringPath(w: number, h: number): { d: string; length: number } {
  const TAU = Math.PI * 2;
  const rx = w / 2 - 4;
  const ry = h / 2 - 4;
  const n = 26;
  const pts: [number, number][] = [];
  for (let i = 0; i <= n; i++) {
    const t = -1.1 - ((TAU + 0.7) * i) / n;
    const k = 1 - (0.06 * i) / n + 0.025 * Math.sin(i * 2.1);
    pts.push([w / 2 + rx * k * Math.cos(t), h / 2 + ry * k * Math.sin(t)]);
  }
  const f = (v: number) => v.toFixed(1);
  let d = `M${f(pts[0]![0])} ${f(pts[0]![1])}`;
  for (let i = 1; i < n; i++) {
    const [x, y] = pts[i]!;
    const [nx, ny] = pts[i + 1]!;
    d += `Q${f(x)} ${f(y)} ${f((x + nx) / 2)} ${f((y + ny) / 2)}`;
  }
  let length = 0;
  for (let i = 1; i < pts.length; i++) length += Math.hypot(pts[i]![0] - pts[i - 1]![0], pts[i]![1] - pts[i - 1]![1]);
  return { d, length: length * 1.02 };
}

/** A pen loop drawn around its parent. Put it inside a view with position: relative and a known size. */
export function Ring({ width, height, pad = 0, draw = true, color, strokeWidth = 2.6 }: { width: number; height: number; pad?: number; draw?: boolean; color: string; strokeWidth?: number }) {
  const padX = pad * 1.8;
  const w = width + padX * 2;
  const h = height + pad * 2;
  const { d, length } = useMemo(() => ringPath(w, h), [w, h]);
  if (!width || !height) return null;
  return (
    <View pointerEvents="none" style={{ position: 'absolute', left: -padX, top: -pad, width: w, height: h, overflow: 'visible' }}>
      <Svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ overflow: 'visible' }}>
        <DrawPath d={d} length={length} draw={draw} color={color} width={strokeWidth} />
      </Svg>
    </View>
  );
}

type MarkProps = { size?: number; color: string; draw?: boolean; style?: ViewStyle };

export function Tick({ size = 28, color, draw = true, style }: MarkProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 40 40" style={[{ overflow: 'visible' }, style]}>
      <DrawPath d="M5 22c4 3 7 7 10 12C20 20 27 10 37 4" length={53.7} draw={draw} color={color} width={4} />
    </Svg>
  );
}

export function Cross({ size = 28, color, draw = true, style }: MarkProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 40 40" style={[{ overflow: 'visible' }, style]}>
      <DrawPath d="M6 6c8 7 17 17 28 28" length={39.6} draw={draw} color={color} width={4} />
      <DrawPath d="M34 5C25 14 15 25 6 35" length={41} draw={draw} delay={160} color={color} width={4} />
    </Svg>
  );
}

/** The curly pen arrow that points at a handwritten note. */
export function Arrow({ color, style }: { color: string; style?: ViewStyle }) {
  return (
    <Svg width={34} height={26} viewBox="0 0 40 30" style={[{ overflow: 'visible', marginRight: 6 }, style]}>
      <DrawPath d="M36 27C22 26 9 19 6 5" length={40.1} draw={false} color={color} width={2.6} />
      <DrawPath d="M1 12 6 3l8 6" length={20.3} draw={false} color={color} width={2.6} />
    </Svg>
  );
}

/** Under the current tab. */
export function Squiggle({ width, color }: { width: number; color: string }) {
  return (
    <Svg width={width} height={7} viewBox="0 0 60 8" preserveAspectRatio="none">
      <Path d="M2 5c8-4 14 3 22-1s14 2 20-1 9 1 14-1" fill="none" stroke={color} strokeWidth={2.6} strokeLinecap="round" />
    </Svg>
  );
}

/** "swipe →" on the first card. */
export function SwipeArrow({ color }: { color: string }) {
  return (
    <Svg width={44} height={20} viewBox="0 0 46 20" style={{ marginLeft: 4, marginBottom: -4 }}>
      <Path d="M2 12c12-6 26-7 40-3" fill="none" stroke={color} strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M33 2l10 7-10 8" fill="none" stroke={color} strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

/** "tap the notification ↓" on the lock screen. */
export function DownArrow({ color }: { color: string }) {
  return (
    <Svg width={24} height={24} viewBox="0 0 26 26" style={{ marginLeft: 6, marginBottom: -6 }}>
      <Path d="M13 2v20M5 15l8 8 8-8" fill="none" stroke={color} strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

/** A green pen line under what the reader wrote, on teach-it-back. */
export function SaidUnderline({ width, color }: { width: number; color: string }) {
  return (
    <Svg width={width} height={12} viewBox="0 0 300 12" preserveAspectRatio="none" style={{ position: 'absolute', left: 0, bottom: 0 }}>
      <DrawPath d="M3 7c40-6 70 5 110 0s80-5 110 1 50-2 74-3" length={295.1} draw color={color} width={3} />
    </Svg>
  );
}
