import { useEffect, useRef } from 'react';
import { ActivityIndicator, Animated, Modal, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { HELP_TEXT } from '@curiox/shared';
import { Button } from '../components/ui';
import { useColors } from '../theme';
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

function MicGlyph({ size, color }: { size: number; color: string }) {
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ width: size * 0.38, height: size * 0.56, borderRadius: size * 0.2, backgroundColor: color }} />
      <View style={{ width: size * 0.62, height: size * 0.3, marginTop: -size * 0.18, borderBottomLeftRadius: size * 0.31, borderBottomRightRadius: size * 0.31, borderWidth: 2, borderTopWidth: 0, borderColor: color }} />
      <View style={{ width: 2, height: size * 0.14, backgroundColor: color }} />
    </View>
  );
}

function Bars({ color }: { color: string }) {
  const anims = useRef([0, 1, 2, 3].map(() => new Animated.Value(0.4))).current;
  useEffect(() => {
    const loops = anims.map((a, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 110),
          Animated.timing(a, { toValue: 1, duration: 300, useNativeDriver: true }),
          Animated.timing(a, { toValue: 0.4, duration: 300, useNativeDriver: true }),
        ]),
      ),
    );
    loops.forEach((l) => l.start());
    return () => loops.forEach((l) => l.stop());
  }, [anims]);
  return (
    <View style={{ flexDirection: 'row', gap: 3, alignItems: 'center', height: 20 }}>
      {anims.map((a, i) => (
        <Animated.View key={i} style={{ width: 3, height: 18, borderRadius: 2, backgroundColor: color, transform: [{ scaleY: a }] }} />
      ))}
    </View>
  );
}

/** The main voice button. "inline" sits in a composer; "fab" floats on screens without one. */
export function MicButton({ variant = 'inline' }: { variant?: 'inline' | 'fab' }) {
  const voice = useVoice();
  const c = useColors();
  const pulse = useRef(new Animated.Value(1)).current;
  const s = voice.status;

  useEffect(() => {
    if (s !== 'listening') return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.15, duration: 600, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 600, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => {
      loop.stop();
      pulse.setValue(1);
    };
  }, [s, pulse]);

  const size = variant === 'fab' ? 64 : 44;
  const bg = s === 'listening' ? c.listening : s === 'speaking' ? c.primary : s === 'off' ? c.codeBg : c.accentBg;
  const fg = s === 'listening' || s === 'speaking' ? '#fff' : s === 'off' ? c.text : c.accentText;

  return (
    <Animated.View style={{ transform: [{ scale: pulse }] }}>
      <Pressable
        {...voiceControl}
        accessibilityRole="button"
        accessibilityLabel={voice.needsTap ? 'Resume voice mode' : LABEL[s]}
        accessibilityState={{ selected: voice.enabled }}
        onPress={voice.micPress}
        style={({ pressed }) => ({
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: bg,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: pressed ? 0.8 : 1,
          ...(variant === 'fab' ? { shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 6 } : {}),
        })}
      >
        {s === 'speaking' ? (
          <Bars color={fg} />
        ) : s === 'thinking' || s === 'transcribing' ? (
          <ActivityIndicator color={fg} />
        ) : (
          <MicGlyph size={variant === 'fab' ? 28 : 22} color={fg} />
        )}
      </Pressable>
    </Animated.View>
  );
}

/** Floating mic for screens that have no message box. */
export function MicFab() {
  const insets = useSafeAreaInsets();
  return (
    <View style={{ position: 'absolute', right: 20, bottom: Math.max(insets.bottom, 16) + 8 }}>
      <MicButton variant="fab" />
    </View>
  );
}

/** Header switch for voice mode. */
export function VoiceToggle() {
  const voice = useVoice();
  const c = useColors();
  const on = voice.enabled;
  return (
    <Pressable
      {...voiceControl}
      accessibilityRole="switch"
      accessibilityState={{ checked: on }}
      accessibilityLabel={on ? 'Turn off voice mode' : 'Turn on voice mode'}
      onPress={voice.toggle}
      style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, backgroundColor: on ? c.primary : 'transparent' }}
    >
      <Text style={{ color: on ? c.onPrimary : c.muted, fontWeight: '600', fontSize: 14 }}>{on ? '🔊 Voice' : '🔈 Voice'}</Text>
    </Pressable>
  );
}

/** Live status, what was heard, errors, and the "what can I say" sheet. Rendered once, app-wide. */
export function VoiceOverlay() {
  const voice = useVoice();
  const c = useColors();
  const insets = useSafeAreaInsets();
  const top = insets.top + 60;

  const pill = (content: React.ReactNode) => (
    <View pointerEvents="box-none" style={{ position: 'absolute', top, left: 16, right: 16, alignItems: 'center' }}>
      <View style={{ backgroundColor: c.overlay, borderRadius: 18, paddingHorizontal: 14, paddingVertical: 9, maxWidth: 420 }}>{content}</View>
    </View>
  );

  return (
    <>
      {voice.needsTap &&
        pill(<Text style={{ color: c.onOverlay, fontWeight: '600' }}>🎤 Tap anywhere to continue in voice mode</Text>)}
      {voice.enabled &&
        (voice.status === 'listening' || voice.status === 'transcribing' || !!voice.error) &&
        pill(
          voice.error ? (
            <Text style={{ color: c.onOverlay }}>⚠️ {voice.error}</Text>
          ) : voice.status === 'transcribing' ? (
            <Text style={{ color: c.onOverlay }}>Working out what you said…</Text>
          ) : voice.interim ? (
            <Text style={{ color: c.onOverlay }}>“{voice.interim}”</Text>
          ) : (
            <Text style={{ color: c.onOverlay }}>
              <Text style={{ color: c.listening }}>● </Text>Listening… say “help” for commands
            </Text>
          ),
        )}
      <Modal visible={voice.helpOpen} transparent animationType="slide" onRequestClose={() => voice.setHelpOpen(false)}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' }} onPress={() => voice.setHelpOpen(false)}>
          <Pressable
            accessibilityLabel="Voice commands"
            onPress={() => undefined}
            style={{ backgroundColor: c.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: insets.bottom + 20, maxHeight: '80%' }}
          >
            <ScrollView contentContainerStyle={{ gap: 10 }}>
              <Text style={{ color: c.text, fontSize: 18, fontWeight: '700' }}>What you can say</Text>
              {voice.screen && <Text style={{ color: c.text, fontSize: 15, lineHeight: 22 }}>{HELP_TEXT[voice.screen]}</Text>}
              <Text style={{ color: c.text, fontWeight: '700', marginTop: 6 }}>Anywhere</Text>
              {['“help”: hear these commands', '“repeat”: say the last thing again', '“stop”: stop the current answer', '“go back”, “open profile”', '“voice off”: turn voice mode off'].map((t) => (
                <Text key={t} style={{ color: c.muted, fontSize: 14 }}>
                  {t}
                </Text>
              ))}
              <Text style={{ color: c.subtle, fontSize: 12, marginTop: 6 }}>Tap the mic to talk, or tap it while CurioX is speaking to interrupt.</Text>
              <Button label="Got it" onPress={() => voice.setHelpOpen(false)} style={{ marginTop: 8 }} />
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}
