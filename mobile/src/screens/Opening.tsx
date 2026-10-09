// The opening: today's notification arriving on paper. The mark drops in, the notification slides
// down, and tapping it (or waiting) opens the app with a yellow flood. The same message goes out as
// a real notification (lib/notify.ts), so this is what readers see on their lock screen too.
// The server wakes up underneath, so the animation is never dead time.
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { ArtKey } from '@curiox/shared';
import { topicName } from '@curiox/shared';
import { Sticker } from '../ui/Art';
import { Ground, Stamp, useReduceMotion } from '../ui/kit';
import { curves, fonts, paper, type } from '../ui/tokens';

export interface OpeningNotice {
  title: string;
  body: string;
  art: ArtKey;
}

const slap = Easing.bezier(...curves.slap);

export function Opening({ notice, ready, onOpen }: { notice: OpeningNotice; ready: boolean; onOpen: () => void }) {
  const reduce = useReduceMotion();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const [stamped, setStamped] = useState(false);
  const [opening, setOpening] = useState(false);
  const [waited, setWaited] = useState(false);

  const mark = useRef(new Animated.Value(0)).current;
  const notif = useRef(new Animated.Value(0)).current;
  const hint = useRef(new Animated.Value(0)).current;
  const flood = useRef(new Animated.Value(0)).current;
  const bob = useRef(new Animated.Value(0)).current;
  const onOpenRef = useRef(onOpen);
  onOpenRef.current = onOpen;

  // The entrance: the mark drops in, the notification slides down, the hint appears.
  useEffect(() => {
    if (reduce) {
      for (const v of [mark, notif, hint]) v.setValue(1);
      setStamped(true);
      setWaited(true);
      return;
    }
    const a = Animated.parallel([
      Animated.timing(mark, { toValue: 1, duration: 500, easing: slap, useNativeDriver: true }),
      Animated.timing(notif, { toValue: 1, duration: 420, delay: 350, easing: slap, useNativeDriver: true }),
      Animated.timing(hint, { toValue: 1, duration: 300, delay: 1000, useNativeDriver: true }),
    ]);
    a.start(() => {
      Animated.loop(
        Animated.sequence([
          Animated.timing(bob, { toValue: 1, duration: 1400, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
          Animated.timing(bob, { toValue: 0, duration: 1400, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        ]),
      ).start();
    });
    const s = setTimeout(() => setStamped(true), 800);
    const w = setTimeout(() => setWaited(true), 2200);
    return () => {
      a.stop();
      clearTimeout(s);
      clearTimeout(w);
    };
  }, [reduce, mark, notif, hint, bob]);

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

  const floodSize = Math.hypot(width, height) * 2.1;
  const cardTop = insets.top + 16;

  return (
    <Ground>
      <Pressable accessibilityRole="button" accessibilityLabel={`${notice.title}. ${notice.body}. Open CurioX`} onPress={open} style={{ flex: 1, alignItems: 'center', overflow: 'hidden' }}>
        {/* The notification, as it would arrive on the phone. */}
        <Animated.View
          style={{
            position: 'absolute',
            top: cardTop,
            left: 12,
            right: 12,
            opacity: notif,
            transform: [{ translateY: notif.interpolate({ inputRange: [0, 1], outputRange: [-90, 0] }) }, { scale: notif.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1] }) }],
          }}
        >
          <View style={{ flexDirection: 'row', gap: 11, alignItems: 'flex-start', paddingVertical: 13, paddingHorizontal: 14, borderRadius: 20, backgroundColor: paper.white, boxShadow: '0px 14px 30px -14px rgba(20,19,16,0.6)' }}>
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

        {/* The mark, bobbing gently while the server wakes. */}
        <View style={{ flex: 1 }} />
        <Animated.View style={{ alignItems: 'center', gap: 14, opacity: mark, transform: [{ translateY: Animated.add(mark.interpolate({ inputRange: [0, 1], outputRange: [-20, 0] }), bob.interpolate({ inputRange: [0, 1], outputRange: [0, -6] })) }, { rotate: mark.interpolate({ inputRange: [0, 1], outputRange: ['-6deg', '-3deg'] }) }] }}>
          <AppIcon size={96} />
          <Text style={[type.word, { fontSize: 44, lineHeight: 44, color: paper.ink }]}>CurioX</Text>
        </Animated.View>
        <View style={{ flex: 1 }} />

        <Animated.View style={{ opacity: hint, marginBottom: Math.max(insets.bottom, 16) + 24, flexDirection: 'row', alignItems: 'flex-end' }}>
          <Text style={[type.note, { color: paper.pen, lineHeight: 25 }]}>{ready ? 'tap the notification to open' : 'waking up CurioX'}</Text>
        </Animated.View>

        {/* Opening: yellow floods out from the notification's icon. */}
        <Animated.View
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: 12 + 14 + 20 - floodSize / 2,
            top: cardTop + 33 - floodSize / 2,
            width: floodSize,
            height: floodSize,
            borderRadius: floodSize / 2,
            backgroundColor: paper.yellow,
            transform: [{ scale: flood.interpolate({ inputRange: [0, 1], outputRange: [0.001, 1] }) }],
          }}
        />
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

/** What the notification says: a hello for new readers, today's issue for everyone else. */
export function openingNotice(opts: { onboarded: boolean; last: { no: number; date: string; title: string; art: ArtKey } | null; today: string; interests: string[] }): OpeningNotice {
  const { onboarded, last, today, interests } = opts;
  if (!onboarded) {
    return { title: "Hi, I'm CurioX", body: 'Five quick questions, then your first issue is ready. No sign-up.', art: 'wave_hand' };
  }
  if (last && last.date === today) {
    return { title: `Issue No. ${last.no} is out`, body: `${last.title}. A few cards, about three minutes.`, art: last.art };
  }
  const topics = interests.slice(0, 2).map(topicName).join(' and ');
  return {
    title: 'Your new issue is out',
    body: topics ? `Fresh cards on ${topics}, picked for you.` : 'Fresh cards, picked for you.',
    art: 'newspaper',
  };
}
