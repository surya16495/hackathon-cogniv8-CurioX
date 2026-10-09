// Voice controls in the zine style: a yellow mini-blob mic, an ink status pill, and a help sheet.
import { useEffect, useRef } from 'react';
import { Animated, Easing, Platform, Pressable, Text, View, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { HELP_TEXT } from '@curiox/shared';
import { BottomSheet } from '../ui/BottomSheet';
import { Icon } from '../ui/Icon';
import { Btn, useReduceMotion } from '../ui/kit';
import { fonts, paper, type, useGround } from '../ui/tokens';
import { useVoice, type VoiceStatus } from './VoiceProvider';

const LABEL: Record<VoiceStatus, string> = {
  off: 'Turn on voice mode',
  idle: 'Tap to talk',
  listening: 'Listening… tap when done',
  transcribing: 'Working out what you said',
  thinking: 'Thinking',
  speaking: 'Speaking… tap to interrupt',
};

// Marks the element so a web "tap anywhere to resume" ignores taps on voice controls themselves.
const voiceControl = Platform.OS === 'web' ? ({ dataSet: { voiceControl: 'true' } } as object) : {};

function Bars() {
  const reduce = useReduceMotion();
  const anims = useRef([0, 1, 2].map(() => new Animated.Value(0.4))).current;
  useEffect(() => {
    if (reduce) return;
    const loops = anims.map((a, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 120),
          Animated.timing(a, { toValue: 1, duration: 350, useNativeDriver: true }),
          Animated.timing(a, { toValue: 0.25, duration: 350, useNativeDriver: true }),
        ]),
      ),
    );
    loops.forEach((l) => l.start());
    return () => loops.forEach((l) => l.stop());
  }, [anims, reduce]);
  return (
    <View style={{ flexDirection: 'row', gap: 3, alignItems: 'flex-end', height: 18 }}>
      {anims.map((a, i) => (
        <Animated.View key={i} style={{ width: 4, height: 18, borderRadius: 2, backgroundColor: paper.ink, transform: [{ scaleY: a }] }} />
      ))}
    </View>
  );
}

/** The mic: a small yellow blob. Pulses while listening, shows bars while speaking. */
export function MicButton({ size = 44, style }: { size?: number; style?: ViewStyle }) {
  const voice = useVoice();
  const g = useGround();
  const reduce = useReduceMotion();
  const pulse = useRef(new Animated.Value(1)).current;
  const s = voice.status;

  useEffect(() => {
    if (s !== 'listening' || reduce) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.15, duration: 600, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 600, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => {
      loop.stop();
      pulse.setValue(1);
    };
  }, [s, pulse, reduce]);

  const off = s === 'off';
  return (
    <Animated.View style={[{ transform: [{ scale: pulse }] }, style]}>
      <Pressable
        {...voiceControl}
        accessibilityRole="button"
        accessibilityLabel={voice.needsTap ? 'Resume voice mode' : LABEL[s]}
        accessibilityState={{ selected: voice.enabled }}
        onPress={voice.micPress}
        style={({ pressed }) => ({
          width: size,
          height: size,
          backgroundColor: off ? g.strip : paper.yellow,
          borderTopLeftRadius: size * 0.54,
          borderTopRightRadius: size * 0.44,
          borderBottomRightRadius: size * 0.5,
          borderBottomLeftRadius: size * 0.48,
          borderWidth: s === 'listening' ? 2.5 : 0,
          borderColor: paper.ink,
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: g.sh,
          ...(pressed ? { transform: [{ scale: 0.92 }] } : {}),
        })}
      >
        {s === 'speaking' ? <Bars /> : <Icon name={off ? 'mic' : s === 'thinking' || s === 'transcribing' ? 'search' : 'mic'} size={size * 0.5} color={paper.ink} />}
      </Pressable>
    </Animated.View>
  );
}

/** A floating mic for screens without a composer. */
export function MicFab({ bottom = 16 }: { bottom?: number }) {
  const insets = useSafeAreaInsets();
  return (
    <View pointerEvents="box-none" style={{ position: 'absolute', right: 18, bottom: Math.max(insets.bottom, 8) + bottom }}>
      <MicButton size={52} />
    </View>
  );
}

/** Live status, what was heard, errors, and the "what can I say" sheet. Rendered once, app-wide. */
export function VoiceOverlay() {
  const voice = useVoice();
  const insets = useSafeAreaInsets();
  // Over the screen's top bar, so it never sits on a headline or a card.
  const top = insets.top + 6;

  const pill = (content: React.ReactNode) => (
    <View pointerEvents="box-none" style={{ position: 'absolute', top, left: 60, right: 60, alignItems: 'center', zIndex: 60 }}>
      <View style={{ backgroundColor: paper.ink, borderRadius: 18, paddingHorizontal: 14, paddingVertical: 9, maxWidth: 420, transform: [{ rotate: '-0.6deg' }] }}>{content}</View>
    </View>
  );
  const text = { fontFamily: fonts.body, fontSize: 14.5, lineHeight: 20, color: paper.white } as const;

  return (
    <>
      {voice.needsTap && pill(<Text style={[text, { fontFamily: fonts.bodyBold }]}>Tap anywhere to carry on in voice mode</Text>)}
      {voice.enabled &&
        voice.screen !== 'talk' &&
        (voice.status === 'listening' || voice.status === 'transcribing' || !!voice.error) &&
        pill(
          voice.error ? (
            <Text style={text}>{voice.error}</Text>
          ) : voice.status === 'transcribing' ? (
            <Text style={text}>Working out what you said…</Text>
          ) : voice.interim ? (
            <Text style={text}>“{voice.interim}”</Text>
          ) : (
            <Text style={text}>
              <Text style={{ color: paper.yellow }}>● </Text>Listening… say “help” for what you can say
            </Text>
          ),
        )}
      <BottomSheet open={voice.helpOpen} title="What you can say" onClose={() => voice.setHelpOpen(false)}>
        <View style={{ gap: 10 }}>
          {voice.screen && <Text style={[type.body, { color: paper.ink }]}>{HELP_TEXT[voice.screen]}</Text>}
          <Text style={{ fontFamily: fonts.disp800, fontSize: 17, color: paper.ink, marginTop: 6 }}>Anywhere</Text>
          {['“help”: hear these again', '“repeat”: say the last thing again', '“stop”: stop talking', '“go home”, “talk”, “pinboard”, “ask a question”', '“voice off”: turn voice mode off'].map((t) => (
            <Text key={t} style={{ fontFamily: fonts.body, fontSize: 14.5, lineHeight: 20, color: paper.ink2 }}>
              {t}
            </Text>
          ))}
          <Text style={[type.typed, { color: paper.ink2, marginTop: 6 }]}>Tap the yellow mic to talk, or tap it while CurioX is speaking to interrupt.</Text>
          <Btn label="Got it" onYellow wide onPress={() => voice.setHelpOpen(false)} style={{ marginTop: 8 }} />
        </View>
      </BottomSheet>
    </>
  );
}
