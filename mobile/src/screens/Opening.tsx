// The opening: the design's lock screen as an animated splash. A yellow halftone field blooms,
// the date and time settle, and a CurioX notification slides in. Tapping it (or waiting) opens the app
// with a yellow flood. The server wakes up underneath, so the animation is never dead time.
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Defs, Pattern } from 'react-native-svg';
import type { ArtKey } from '@curiox/shared';
import { topicName } from '@curiox/shared';
import { Sticker } from '../ui/Art';
import { DownArrow } from '../ui/Marks';
import { Stamp, useReduceMotion } from '../ui/kit';
import { curves, fonts, paper, type } from '../ui/tokens';

export interface OpeningNotice {
  title: string;
  body: string;
  art: ArtKey;
  /** An older, greyed notification under the live one. */
  old?: { title: string; when: string };
}

const slap = Easing.bezier(...curves.slap);

/** Yellow dots on a 12px grid inside a 270px circle, like the lock screen's halftone field. */
function DotField({ cx, cy, scale, opacity }: { cx: number; cy: number; scale: Animated.Value; opacity: Animated.Value }) {
  const R = 270;
  return (
    <Animated.View
      pointerEvents="none"
      style={{ position: 'absolute', left: cx - R, top: cy - R, width: R * 2, height: R * 2, opacity, transform: [{ scale }] }}
    >
      <Svg width={R * 2} height={R * 2}>
        <Defs>
          <Pattern id="dots" x={0} y={0} width={12} height={12} patternUnits="userSpaceOnUse">
            <Circle cx={6} cy={6} r={2.9} fill={paper.yellow} />
          </Pattern>
        </Defs>
        <Circle cx={R} cy={R} r={R} fill="url(#dots)" />
      </Svg>
    </Animated.View>
  );
}

function clock(d: Date) {
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }).replace(/\s?[AP]M$/i, '');
  const date = d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' }).replace(',', '');
  return { time, date };
}

export function Opening({ notice, ready, onOpen }: { notice: OpeningNotice; ready: boolean; onOpen: () => void }) {
  const reduce = useReduceMotion();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const [now, setNow] = useState(() => new Date());
  const [stamped, setStamped] = useState(false);
  const [opening, setOpening] = useState(false);
  const [waited, setWaited] = useState(false);

  const field = useRef({ scale: new Animated.Value(0.25), opacity: new Animated.Value(0) }).current;
  const head = useRef(new Animated.Value(0)).current;
  const notif = useRef(new Animated.Value(0)).current;
  const hint = useRef(new Animated.Value(0)).current;
  const flood = useRef(new Animated.Value(0)).current;
  const breathe = useRef(new Animated.Value(1)).current;
  const onOpenRef = useRef(onOpen);
  onOpenRef.current = onOpen;

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 15_000);
    return () => clearInterval(t);
  }, []);

  // The entrance.
  useEffect(() => {
    if (reduce) {
      for (const v of [field.scale, field.opacity, head, notif, hint]) v.setValue(1);
      setStamped(true);
      setWaited(true);
      return;
    }
    const a = Animated.parallel([
      Animated.timing(field.scale, { toValue: 1, duration: 900, easing: slap, useNativeDriver: true }),
      Animated.timing(field.opacity, { toValue: 1, duration: 500, useNativeDriver: true }),
      Animated.timing(head, { toValue: 1, duration: 450, delay: 150, easing: slap, useNativeDriver: true }),
      Animated.timing(notif, { toValue: 1, duration: 400, delay: 600, easing: slap, useNativeDriver: true }),
      Animated.timing(hint, { toValue: 1, duration: 300, delay: 1300, useNativeDriver: true }),
    ]);
    a.start(() => {
      Animated.loop(
        Animated.sequence([
          Animated.timing(breathe, { toValue: 1.025, duration: 1600, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
          Animated.timing(breathe, { toValue: 1, duration: 1600, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        ]),
      ).start();
    });
    const s = setTimeout(() => setStamped(true), 1050);
    const w = setTimeout(() => setWaited(true), 2700);
    return () => {
      a.stop();
      clearTimeout(s);
      clearTimeout(w);
    };
  }, [reduce, field, head, notif, hint, breathe]);

  const open = () => {
    if (opening) return;
    setOpening(true);
    if (reduce) return onOpenRef.current();
    Animated.timing(flood, { toValue: 1, duration: 420, easing: Easing.bezier(0.5, 0, 0.2, 1), useNativeDriver: true }).start(() => onOpenRef.current());
  };

  // Open by itself once the entrance has played and the app is ready.
  useEffect(() => {
    if (waited && ready) open();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [waited, ready]);

  const { time, date } = clock(now);
  const cx = width / 2;
  const cy = height * 0.82;
  const floodSize = Math.hypot(width, height) * 2.1;

  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${notice.title}. ${notice.body}. Open CurioX`} onPress={open} style={{ flex: 1, backgroundColor: paper.lock, alignItems: 'center', overflow: 'hidden' }}>
      <Animated.View style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, transform: [{ scale: breathe }] }} pointerEvents="none">
        <DotField cx={cx} cy={cy} scale={field.scale} opacity={field.opacity} />
      </Animated.View>

      <Animated.View style={{ alignItems: 'center', marginTop: insets.top + 36, opacity: head, transform: [{ translateY: head.interpolate({ inputRange: [0, 1], outputRange: [-10, 0] }) }] }}>
        <Text style={{ fontFamily: fonts.disp700, fontSize: 17, lineHeight: 17, color: paper.lockInk2 }}>{date}</Text>
        <Text style={[type.lockTime, { color: paper.lockInk, marginTop: 4, fontVariant: ['tabular-nums'] }]}>{time}</Text>
      </Animated.View>

      <View style={{ flex: 1 }} />

      <Animated.View style={{ opacity: hint, marginBottom: 12, paddingTop: 6, paddingBottom: 3, paddingHorizontal: 12, borderRadius: 5, backgroundColor: paper.lock, flexDirection: 'row', alignItems: 'flex-end' }}>
        <Text style={[type.note, { color: paper.lockInk, lineHeight: 25 }]}>{ready ? 'tap the notification' : 'waking up CurioX'}</Text>
        {ready && <DownArrow color={paper.lockInk} />}
      </Animated.View>

      <View style={{ alignSelf: 'stretch', marginHorizontal: 12, marginBottom: Math.max(insets.bottom, 12) + 22, gap: 8 }}>
        <Animated.View
          style={{
            opacity: notif,
            transform: [
              { translateY: notif.interpolate({ inputRange: [0, 1], outputRange: [-22, 0] }) },
              { scale: notif.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1] }) },
            ],
          }}
        >
          <View style={{ flexDirection: 'row', gap: 11, alignItems: 'flex-start', paddingVertical: 13, paddingHorizontal: 14, borderRadius: 20, backgroundColor: paper.white, boxShadow: '0px 14px 30px -14px rgba(0,0,0,0.9)' }}>
            <AppIcon />
            <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ fontFamily: fonts.disp700, fontSize: 14.5, lineHeight: 19, color: paper.ink }}>CurioX</Text>
                <Text style={{ fontFamily: fonts.body, fontSize: 13, color: paper.ink2 }}>now</Text>
              </View>
              <Text style={{ fontFamily: fonts.disp800, fontSize: 17, lineHeight: 21, color: paper.ink }}>{notice.title}</Text>
              <Text style={{ fontFamily: fonts.body, fontSize: 14.5, lineHeight: 19, color: paper.ink }}>{notice.body}</Text>
            </View>
            <View style={{ alignSelf: 'center', width: 54, height: 54, borderRadius: 27, backgroundColor: paper.yellow, alignItems: 'center', justifyContent: 'center' }}>
              <Sticker art={notice.art} size={36} rotate={8} />
            </View>
          </View>
          <Stamp label="New" small thump={stamped} bg={paper.white} style={{ position: 'absolute', right: 16, bottom: -11 }} />
        </Animated.View>

        {notice.old && (
          <Animated.View style={{ opacity: notif, flexDirection: 'row', gap: 11, alignItems: 'flex-start', paddingVertical: 13, paddingHorizontal: 14, borderRadius: 20, backgroundColor: paper.lock2, transform: [{ scale: 0.95 }] }}>
            <View style={{ opacity: 0.75 }}>
              <AppIcon />
            </View>
            <View style={{ flex: 1, gap: 1 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ fontFamily: fonts.disp700, fontSize: 14.5, color: paper.lockInk2 }}>CurioX</Text>
                <Text style={{ fontFamily: fonts.body, fontSize: 13, color: paper.lockInk2 }}>{notice.old.when}</Text>
              </View>
              <Text numberOfLines={1} style={{ fontFamily: fonts.body, fontSize: 14.5, lineHeight: 19, color: paper.lockInk2 }}>
                {notice.old.title}
              </Text>
            </View>
          </Animated.View>
        )}
      </View>

      {/* Opening: yellow floods out from the notification's icon. */}
      <Animated.View
        pointerEvents="none"
        style={{
          position: 'absolute',
          left: 12 + 14 + 20 - floodSize / 2,
          top: height - (Math.max(insets.bottom, 12) + 22) - 60 - floodSize / 2,
          width: floodSize,
          height: floodSize,
          borderRadius: floodSize / 2,
          backgroundColor: paper.yellow,
          transform: [{ scale: flood.interpolate({ inputRange: [0, 1], outputRange: [0.001, 1] }) }],
        }}
      />
    </Pressable>
  );
}

export function AppIcon({ size = 40 }: { size?: number }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size / 4, backgroundColor: paper.yellow, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ fontFamily: fonts.disp900, fontSize: size * 0.75, lineHeight: size * 0.82, color: paper.ink, marginTop: size * 0.04 }}>C</Text>
    </View>
  );
}

/** What the notification says: a hello for new readers, today's issue for everyone else. */
export function openingNotice(opts: { onboarded: boolean; last: { no: number; date: string; title: string; art: ArtKey } | null; today: string; interests: string[] }): OpeningNotice {
  const { onboarded, last, today, interests } = opts;
  if (!onboarded) {
    return { title: "Hi, I'm CurioX", body: 'Six quick questions, then your first issue is ready. No sign-up.', art: 'wave_hand' };
  }
  if (last && last.date === today) {
    return { title: `Issue No. ${last.no} is out`, body: `${last.title}. A few cards, about three minutes.`, art: last.art };
  }
  const topics = interests.slice(0, 2).map(topicName).join(' and ');
  return {
    title: 'Your new issue is out',
    body: topics ? `Fresh cards on ${topics}, picked for you.` : 'Fresh cards, picked for you.',
    art: 'newspaper',
    old: last ? { title: `No. ${last.no} · ${last.title}`, when: 'earlier' } : undefined,
  };
}
