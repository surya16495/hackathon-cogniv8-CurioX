// Talk: a blob that owns the screen. Press it and ask out loud; CurioX answers point by point,
// each point landing as a yellow slip. "Staple into a deck" keeps the talk as cards.
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, ScrollView, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { TalkPoint } from '@curiox/shared';
import { api } from '../api/client';
import { Blob, type BlobPhase } from '../talk/Blob';
import { Bar, Btn, Ground, IconBtn, useReduceMotion } from '../ui/kit';
import { curves, fonts, paper, useGround } from '../ui/tokens';
import { useVoiceScreen } from '../voice/VoiceProvider';

function Slip({ n, text, index }: { n: number; text: string; index: number }) {
  const reduce = useReduceMotion();
  const drop = useRef(new Animated.Value(reduce ? 1 : 0)).current;
  useEffect(() => {
    Animated.timing(drop, { toValue: 1, duration: 400, easing: Easing.bezier(...curves.slap), useNativeDriver: true }).start();
  }, [drop]);
  const g = useGround();
  const tilt = index % 2 ? 1.2 : -1.6;
  return (
    <Animated.View
      accessibilityLabel={`Point ${n}: ${text}`}
      style={{
        width: 152,
        minHeight: 150,
        marginTop: index % 2 ? 8 : 0,
        paddingTop: 13,
        paddingHorizontal: 13,
        paddingBottom: 14,
        borderRadius: 14,
        backgroundColor: paper.yellow,
        boxShadow: g.sh,
        opacity: drop,
        transform: [
          { translateY: drop.interpolate({ inputRange: [0, 1], outputRange: [-130, 0] }) },
          { scale: drop.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] }) },
          { rotate: drop.interpolate({ inputRange: [0, 1], outputRange: ['-14deg', `${tilt}deg`] }) },
        ],
      }}
    >
      <Text style={{ fontFamily: fonts.typeBold, fontSize: 13, lineHeight: 13, color: paper.ink, marginBottom: 9 }}>{n}</Text>
      <Text style={{ fontFamily: fonts.disp700, fontSize: 16, lineHeight: 20, color: paper.ink }}>{text}</Text>
    </Animated.View>
  );
}

export interface TalkProps {
  onClose: () => void;
  onStaple: (points: TalkPoint[]) => Promise<void>;
  active: boolean;
}

export function TalkScreen({ onClose, onStaple, active }: TalkProps) {
  const g = useGround();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const [points, setPoints] = useState<TalkPoint[]>([]);
  const [caption, setCaption] = useState<{ who: 'you' | 'curiox'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [label, setLabel] = useState<string | null>(null);
  const [stapling, setStapling] = useState(false);
  const [typed, setTyped] = useState('');
  const [area, setArea] = useState({ x: 0, y: 0, w: 0, h: 0 });
  const run = useRef(0);
  const history = useRef<{ role: 'user' | 'assistant'; content: string }[]>([]);
  const slipsRef = useRef<ScrollView>(null);

  const ask = async (text: string) => {
    const mine = ++run.current;
    setLabel(null);
    setCaption({ who: 'you', text });
    setBusy(true);
    voice.setThinking(true);
    let reply: TalkPoint[];
    try {
      const res = await api.talk(text, history.current);
      reply = res.points;
    } catch {
      reply = [{ h: 'Lost the line', say: "Sorry, I couldn't reach my brain just then. Ask me again in a moment." }];
    } finally {
      voice.setThinking(false);
      setBusy(false);
    }
    if (mine !== run.current) return;
    history.current = [...history.current, { role: 'user' as const, content: text }, { role: 'assistant' as const, content: reply.map((p) => p.say).join(' ') }].slice(-8);
    for (let i = 0; i < reply.length; i++) {
      if (mine !== run.current) return;
      const p = reply[i]!;
      setCaption({ who: 'curiox', text: p.say });
      if (voice.enabled) await voice.say(p.say, { listenAfter: i === reply.length - 1 });
      else await new Promise((r) => setTimeout(r, 700 + p.say.split(' ').length * 140));
      if (mine !== run.current) return;
      setPoints((list) => [...list, p]);
      setTimeout(() => slipsRef.current?.scrollToEnd({ animated: true }), 60);
    }
  };

  const voice = useVoiceScreen({
    screen: 'talk',
    intro: null,
    onCommand: (cmd) => {
      if (cmd.type === 'staple') {
        void staple();
        return;
      }
      if (cmd.type === 'startOver') {
        reset();
        void voice.say('Fresh start. What do you want to talk about?');
        return;
      }
      if (cmd.type === 'stop') {
        run.current++;
        setLabel('Stopped. ');
        return;
      }
      if (cmd.type === 'back' || cmd.type === 'goHome') {
        onClose();
        return;
      }
      return false;
    },
    onDictation: (text) => void ask(text),
  });

  const reset = () => {
    run.current++;
    history.current = [];
    setPoints([]);
    setCaption(null);
    setLabel(null);
  };

  const staple = async () => {
    if (!points.length || stapling) return;
    setStapling(true);
    try {
      await onStaple(points);
    } finally {
      setStapling(false);
    }
  };

  // Leaving the tab stops whatever was being said.
  useEffect(() => {
    if (!active) run.current++;
  }, [active]);

  const s = voice.status;
  const phase: BlobPhase = busy || s === 'thinking' || s === 'transcribing' ? 'thinking' : s === 'listening' ? 'listening' : s === 'speaking' ? 'speaking' : 'idle';
  const say =
    phase === 'listening' ? 'Listening' : phase === 'thinking' ? 'Thinking' : phase === 'speaking' ? 'Press to interrupt' : `${label ?? ''}${points.length ? 'Press to ask the next thing' : 'Press and ask out loud'}`;
  const hasSlips = points.length > 0;
  const R = Math.min(area.w * 0.6, area.h * 0.46, 330);

  const pressBlob = () => {
    if (phase === 'speaking' || phase === 'thinking') run.current++;
    voice.micPress();
  };

  return (
    <Ground>
      <View style={{ flex: 1, paddingTop: insets.top, alignItems: 'center' }}>
        <Blob width={width} height={height} cx={area.x + area.w / 2} cy={area.y + area.h / 2} R={R} phase={phase} />
        <View style={{ alignSelf: 'stretch' }}>
          <Bar title="Talk" onBack={onClose} backIcon="x" backLabel="Close talk mode" right={<Btn label="Start over" variant="text" onPress={reset} />} />
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={say}
          onPress={pressBlob}
          onLayout={(e) => {
            const { x, y, width: w, height: h } = e.nativeEvent.layout;
            setArea({ x, y, w, h });
          }}
          style={{ alignSelf: 'stretch', ...(hasSlips ? { height: Math.min(280, height * 0.34) } : { flex: 1 }), alignItems: 'center', justifyContent: 'center' }}
        >
          <Text
            style={{
              maxWidth: hasSlips ? 170 : 190,
              fontFamily: fonts.disp900,
              fontSize: hasSlips ? 17 : 30,
              lineHeight: hasSlips ? 18 : 30,
              letterSpacing: -0.6,
              color: paper.ink,
              backgroundColor: paper.yellow,
              paddingHorizontal: 8,
              paddingVertical: 2,
              borderRadius: 4,
              textAlign: 'center',
              marginRight: hasSlips ? 30 : 44,
              marginBottom: hasSlips ? 46 : 64,
              overflow: 'hidden',
            }}
          >
            {say}
          </Text>
        </Pressable>

        <Text
          accessibilityLiveRegion="polite"
          style={[
            caption?.who === 'you' ? { fontFamily: fonts.bodyItalic, fontSize: 17, lineHeight: 24 } : { fontFamily: fonts.disp800, fontSize: 21, lineHeight: 25 },
            { minHeight: 76, marginTop: 8, marginHorizontal: 24, textAlign: 'center', color: g.onGround },
          ]}
        >
          {caption ? (caption.who === 'you' ? `“${caption.text}”` : caption.text) : ''}
        </Text>

        {hasSlips && (
          <ScrollView ref={slipsRef} horizontal showsHorizontalScrollIndicator={false} style={{ alignSelf: 'stretch', flex: 1 }} contentContainerStyle={{ gap: 12, alignItems: 'flex-start', paddingTop: 14, paddingHorizontal: 20, paddingBottom: 10 }}>
            {points.map((p, i) => (
              <Slip key={`${i}-${p.h}`} n={i + 1} text={p.say} index={i} />
            ))}
          </ScrollView>
        )}

        <View style={{ alignSelf: 'stretch', gap: 8, alignItems: 'center', paddingTop: 2, paddingHorizontal: 20, paddingBottom: 8 }}>
          {hasSlips && <Btn label={stapling ? 'Stapling…' : 'Staple into a deck'} icon="clip" disabled={stapling} onPress={() => void staple()} />}
          {!voice.canListen && (
            <View style={{ alignSelf: 'stretch', flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 5, paddingRight: 5, paddingLeft: 16, borderRadius: 14, backgroundColor: g.strip, boxShadow: g.sh }}>
              <TextInput
                value={typed}
                onChangeText={setTyped}
                placeholder="Type to talk"
                placeholderTextColor={paper.ink2}
                onSubmitEditing={() => {
                  const t = typed.trim();
                  if (!t) return;
                  setTyped('');
                  void ask(t);
                }}
                returnKeyType="send"
                style={{ flex: 1, fontFamily: fonts.body, fontSize: 16, color: paper.ink, paddingVertical: 10 }}
              />
              <IconBtn name="up" label="Send" color={paper.ink} onPress={() => {
                const t = typed.trim();
                if (!t) return;
                setTyped('');
                void ask(t);
              }} />
            </View>
          )}
        </View>
      </View>
    </Ground>
  );
}

