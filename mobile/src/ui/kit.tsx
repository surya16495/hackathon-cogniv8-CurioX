// The paper kit: everything on screen is cut from paper, pasted down and marked by hand.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  ImageBackground,
  Pressable,
  Text,
  View,
  type LayoutChangeEvent,
  type PressableProps,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { Icon, type IconName } from './Icon';
import { Arrow, Ring, Tick } from './Marks';
import { curves, cutCorners, paper, stripCorners, type, useGround } from './tokens';

const GROUND = require('../../assets/paper/ground-light.jpg');
const YELLOW = require('../../assets/paper/yellow.jpg');

export function useReduceMotion(): boolean {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    let alive = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((r) => alive && setReduce(r));
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduce);
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);
  return reduce;
}

export function useSize(): [{ width: number; height: number }, (e: LayoutChangeEvent) => void] {
  const [size, setSize] = useState({ width: 0, height: 0 });
  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setSize((s) => (Math.abs(s.width - width) < 0.5 && Math.abs(s.height - height) < 0.5 ? s : { width, height }));
  };
  return [size, onLayout];
}

// ---------- surfaces ----------

/** The textured paper ground every screen sits on. */
export function Ground({ children, style }: { children?: ReactNode; style?: StyleProp<ViewStyle> }) {
  const g = useGround();
  return (
    // Clipped: an unclipped texture would widen the page on web and make phones zoom out.
    <ImageBackground source={GROUND} resizeMode="repeat" style={[{ flex: 1, backgroundColor: g.ground, overflow: 'hidden' }, style]}>
      {children}
    </ImageBackground>
  );
}

/** Yellow paper: the big panel every card is built on. */
export function Panel({ children, style, radius = 26 }: { children?: ReactNode; style?: StyleProp<ViewStyle>; radius?: number }) {
  const g = useGround();
  return (
    <View style={[{ borderRadius: radius, boxShadow: g.sh, backgroundColor: paper.yellow }, style]}>
      {/* The texture sits in its own clipped layer, so cut-outs inside the panel can still cross its edge. */}
      <View pointerEvents="none" style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, borderRadius: radius, overflow: 'hidden' }}>
        <ImageBackground source={YELLOW} resizeMode="cover" style={{ flex: 1 }} />
      </View>
      {children}
    </View>
  );
}

export const panelPad: ViewStyle = { paddingVertical: 24, paddingHorizontal: 22 };

/** A torn white strip of paper. */
export function Strip({ children, style, onPress, rotate, accessibilityLabel, disabled }: { children?: ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void; rotate?: number; accessibilityLabel?: string; disabled?: boolean }) {
  const g = useGround();
  const base: ViewStyle = { backgroundColor: g.strip, ...stripCorners, paddingVertical: 12, paddingHorizontal: 14, boxShadow: g.sh, ...(rotate ? { transform: [{ rotate: `${rotate}deg` }] } : {}) };
  if (!onPress) return <View style={[base, style]}>{children}</View>;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel} disabled={disabled} onPress={onPress} style={({ pressed }) => [base, style, pressed && { transform: [...(rotate ? [{ rotate: `${rotate}deg` }] : []), { scale: 0.985 }] }]}>
      {children}
    </Pressable>
  );
}

/** A sheet of paper with square corners: answers, sources, the reader card. */
export function Sheet({ children, style, tape = false, staple = false }: { children?: ReactNode; style?: StyleProp<ViewStyle>; tape?: boolean; staple?: boolean }) {
  const g = useGround();
  return (
    <View style={[{ backgroundColor: g.strip, borderRadius: 4, paddingTop: 20, paddingHorizontal: 18, paddingBottom: 16, boxShadow: g.sh }, style]}>
      {tape && <Tape />}
      {staple && <Staple />}
      {children}
    </View>
  );
}

export function Tape({ style }: { style?: StyleProp<ViewStyle> }) {
  return <View pointerEvents="none" style={[{ position: 'absolute', top: -10, left: 22, width: 72, height: 22, backgroundColor: paper.tape, transform: [{ rotate: '-3deg' }], boxShadow: '0px 1px 2px rgba(20,19,16,0.16)', zIndex: 4 }, style]} />;
}

export function Staple({ style }: { style?: StyleProp<ViewStyle> }) {
  return <View pointerEvents="none" style={[{ position: 'absolute', left: 22, top: -3, width: 30, height: 6, borderRadius: 3, backgroundColor: paper.staple, boxShadow: '0px 1px 1px rgba(20,19,16,0.35)', transform: [{ rotate: '-7deg' }], zIndex: 4 }, style]} />;
}

// ---------- type ----------

type Variant = keyof typeof type;

/** Text on the ground (follows the theme) unless `onPaper`, which keeps paper ink. */
export function T({ v = 'body', children, style, onPaper, muted, pen, numberOfLines, accessibilityRole }: { v?: Variant; children?: ReactNode; style?: StyleProp<TextStyle>; onPaper?: boolean; muted?: boolean; pen?: boolean; numberOfLines?: number; accessibilityRole?: 'header' | 'text' }) {
  const g = useGround();
  const color = pen ? (onPaper ? paper.pen : g.pen) : onPaper ? (muted ? paper.ink2 : paper.ink) : muted ? g.onGround2 : g.onGround;
  return (
    <Text accessibilityRole={accessibilityRole} numberOfLines={numberOfLines} style={[type[v], { color }, style]}>
      {children}
    </Text>
  );
}

/** Handwriting in pen, optionally with the curly arrow. */
export function Note({ children, arrow = false, onPaper, style, color }: { children: ReactNode; arrow?: boolean; onPaper?: boolean; style?: StyleProp<ViewStyle>; color?: string }) {
  const g = useGround();
  const c = color ?? (onPaper ? paper.pen : g.pen);
  return (
    <View style={[{ flexDirection: 'row', alignItems: 'flex-start' }, style]}>
      {arrow && <Arrow color={c} style={{ marginTop: 2 }} />}
      <Text style={[type.note, { color: c, flexShrink: 1 }]}>{children}</Text>
    </View>
  );
}

// ---------- buttons ----------

type BtnVariant = 'ink' | 'paper' | 'text';

export function Btn({ label, onPress, variant = 'ink', icon, wide, disabled, style, accessibilityLabel, onYellow }: { label: string; onPress?: () => void; variant?: BtnVariant; icon?: IconName; wide?: boolean; disabled?: boolean; style?: StyleProp<ViewStyle>; accessibilityLabel?: string; onYellow?: boolean }) {
  const g = useGround();
  // On paper (yellow panels, sheets) the ink button is always black; on the ground it follows the theme.
  const inkBg = onYellow ? paper.ink : g.onGround;
  const inkFg = onYellow ? paper.white : g.ground;
  const bg = variant === 'ink' ? inkBg : variant === 'paper' ? g.strip : 'transparent';
  const fg = variant === 'ink' ? inkFg : variant === 'paper' ? paper.ink : onYellow ? paper.ink : g.onGround;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        {
          minHeight: variant === 'text' ? 44 : 52,
          paddingHorizontal: variant === 'text' ? 10 : 22,
          borderRadius: 12,
          backgroundColor: bg,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 10,
          boxShadow: variant === 'text' || disabled ? undefined : g.sh,
          opacity: disabled ? 0.42 : 1,
          alignSelf: wide ? 'stretch' : 'flex-start',
        },
        pressed && !disabled && { transform: [{ translateY: 1 }, { scale: 0.985 }] },
        style,
      ]}
    >
      {icon && <Icon name={icon} size={22} color={fg} fill={icon === 'play'} />}
      <Text style={[type.btn, { color: fg }, variant === 'text' && { textDecorationLine: 'underline', fontFamily: type.chip.fontFamily }]}>{label}</Text>
    </Pressable>
  );
}

/** Small black (or yellow) tag button: "3 sources", "Show as cards", "Open". */
export function Mini({ label, onPress, icon, fill, style, accessibilityLabel }: { label: string; onPress?: () => void; icon?: IconName; fill?: boolean; style?: StyleProp<ViewStyle>; accessibilityLabel?: string }) {
  const fg = fill ? paper.ink : paper.white;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      onPress={onPress}
      style={({ pressed }) => [
        { minHeight: 40, paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: fill ? paper.yellow : paper.ink, ...cutCorners },
        pressed && { transform: [{ scale: 0.96 }] },
        style,
      ]}
    >
      {icon && <Icon name={icon} size={18} color={fg} fill={icon === 'play'} />}
      <Text style={[type.mini, { color: fg }]}>{label}</Text>
    </Pressable>
  );
}

export function IconBtn({ name, onPress, label, color, disabled, size = 24, rotate }: { name: IconName; onPress?: () => void; label: string; color?: string; disabled?: boolean; size?: number; rotate?: number }) {
  const g = useGround();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      hitSlop={4}
      style={({ pressed }) => ({ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 12, opacity: disabled ? 0.25 : 1, ...(pressed && !disabled ? { transform: [{ scale: 0.92 }] } : {}) })}
    >
      <Icon name={name} size={size} color={color ?? g.onGround} rotate={rotate} />
    </Pressable>
  );
}

/** The counter pill: "1/9". */
export function Pill({ label, style }: { label: string; style?: StyleProp<ViewStyle> }) {
  const g = useGround();
  return (
    <View style={[{ paddingTop: 8, paddingBottom: 6, paddingHorizontal: 11, borderRadius: 999, backgroundColor: g.onGround }, style]}>
      <Text style={[type.pill, { color: g.ground, fontVariant: ['tabular-nums'] }]}>{label}</Text>
    </View>
  );
}

// ---------- chips: chosen = a highlighter swipe plus a pen ring ----------

export function Highlight({ on, inset = { top: '24%', bottom: '20%', left: 7, right: 7 } }: { on: boolean; inset?: { top: number | `${number}%`; bottom: number | `${number}%`; left: number; right: number } }) {
  const reduce = useReduceMotion();
  const scale = useRef(new Animated.Value(on ? 1 : 0)).current;
  const [w, setW] = useState(0);
  useEffect(() => {
    Animated.timing(scale, { toValue: on ? 1 : 0, duration: reduce ? 0 : 220, easing: Easing.bezier(...curves.out), useNativeDriver: true }).start();
  }, [on, reduce, scale]);
  // scaleX from the left edge: shift by half the width as it grows.
  const translateX = scale.interpolate({ inputRange: [0, 1], outputRange: [-w / 2, 0] });
  return (
    <Animated.View
      pointerEvents="none"
      onLayout={(e) => setW(e.nativeEvent.layout.width)}
      style={{
        position: 'absolute',
        ...inset,
        backgroundColor: paper.yellow,
        borderTopLeftRadius: 3,
        borderTopRightRadius: 9,
        borderBottomRightRadius: 4,
        borderBottomLeftRadius: 10,
        transform: [{ translateX }, { scaleX: scale }, { rotate: '-0.8deg' }],
      }}
    />
  );
}

export function Chip({ label, selected = false, onPress, index = 0, style, icon, textStyle, accessibilityLabel }: { label: string; selected?: boolean; onPress?: () => void; index?: number; style?: StyleProp<ViewStyle>; icon?: IconName; textStyle?: StyleProp<TextStyle>; accessibilityLabel?: string }) {
  const g = useGround();
  const [size, onLayout] = useSize();
  // Draw the ring only when it changes under the reader's finger, not on first paint.
  const [fresh, setFresh] = useState(false);
  const rot = index % 3 === 0 ? -0.8 : index % 3 === 1 ? 0.6 : 0;
  return (
    <Pressable
      accessibilityRole="button"
      // Screen readers don't get "selected" on a button, so the label says it.
      accessibilityLabel={`${accessibilityLabel ?? label}${selected ? ', picked' : ''}`}
      accessibilityState={{ selected }}
      onPress={() => {
        setFresh(true);
        onPress?.();
      }}
      onLayout={onLayout}
      style={({ pressed }) => [
        {
          backgroundColor: g.strip,
          ...cutCorners,
          paddingVertical: 13,
          paddingHorizontal: 16,
          boxShadow: g.sh,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          transform: [{ rotate: `${rot}deg` }, ...(pressed ? [{ scale: 0.985 }] : [])],
        },
        style,
      ]}
    >
      <Highlight on={selected} />
      {icon && <Icon name={icon} size={18} color={paper.ink} rotate={icon === 'pin' ? 28 : 0} />}
      <Text style={[type.chip, { color: paper.ink }, textStyle]}>{label}</Text>
      {selected && <Ring width={size.width} height={size.height} draw={fresh} color={paper.ink} />}
    </Pressable>
  );
}

// ---------- stamps and boxes ----------

/** A rubber stamp: thumps down when `thump` turns true. */
export function Stamp({ label, big, small, thump, style, color = paper.ink, bg }: { label: string; big?: boolean; small?: boolean; thump?: boolean; style?: StyleProp<ViewStyle>; color?: string; bg?: string }) {
  const reduce = useReduceMotion();
  const anim = useRef(new Animated.Value(thump === false ? 0 : 1)).current;
  useEffect(() => {
    if (thump === undefined) return;
    if (!thump) return anim.setValue(0);
    Animated.timing(anim, { toValue: 1, duration: reduce ? 0 : 200, easing: Easing.bezier(...curves.thump), useNativeDriver: true }).start();
  }, [thump, reduce, anim]);
  const size = big ? 30 : small ? 13 : 14.5;
  const border = big ? 4 : small ? 2 : 3;
  const pad = big ? { paddingTop: 9, paddingBottom: 7, paddingHorizontal: 15 } : small ? { paddingTop: 4, paddingBottom: 3, paddingHorizontal: 7 } : { paddingTop: 7, paddingBottom: 6, paddingHorizontal: 11 };
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        { alignSelf: 'flex-start', borderWidth: border, borderColor: color, borderRadius: 7, ...pad, backgroundColor: bg },
        { opacity: anim.interpolate({ inputRange: [0, 1], outputRange: [0, 0.88] }), transform: [{ rotate: '-7deg' }, { scale: anim.interpolate({ inputRange: [0, 1], outputRange: [1.9, 1] }) }] },
        style,
      ]}
    >
      <Text style={[type.stamp, { color, fontSize: size, lineHeight: size }]}>{label}</Text>
    </Animated.View>
  );
}

/** Read or not read: an empty printed box, or one ticked in green pen. */
export function Tickbox({ done, fresh, scale = 1 }: { done: boolean; fresh?: boolean; scale?: number }) {
  return (
    <View
      accessibilityLabel={done ? 'Read' : 'Not read yet'}
      style={{ width: 26 * scale, height: 26 * scale, borderWidth: 2.5, borderColor: paper.ink, ...cutCorners, backgroundColor: paper.white }}
    >
      {done && <Tick size={30 * scale} color={paper.good} draw={!!fresh} style={{ position: 'absolute', left: 2 * scale, bottom: 4 * scale }} />}
    </View>
  );
}

/** A dashed box for "nothing here yet". */
export function EmptyCard({ note, body, action, onAction }: { note: string; body: string; action?: string; onAction?: () => void }) {
  const g = useGround();
  return (
    <View style={{ gap: 14, alignItems: 'flex-start', borderWidth: 2, borderStyle: 'dashed', borderColor: g.rule, borderRadius: 14, paddingVertical: 22, paddingHorizontal: 18 }}>
      <Note>{note}</Note>
      <T>{body}</T>
      {action && <Btn label={action} onPress={onAction} />}
    </View>
  );
}

/** A screen's top bar: back button, title, and an optional right side. */
export function Bar({ title, onBack, backIcon = 'back', backLabel = 'Back', right }: { title?: string; onBack?: () => void; backIcon?: IconName; backLabel?: string; right?: ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingLeft: 6, paddingRight: 14, paddingVertical: 4, minHeight: 52 }}>
      {onBack && <IconBtn name={backIcon} label={backLabel} onPress={onBack} />}
      <T v="barH" accessibilityRole="header" style={{ flex: 1 }}>
        {title ?? ''}
      </T>
      {right}
    </View>
  );
}

export { paper };
