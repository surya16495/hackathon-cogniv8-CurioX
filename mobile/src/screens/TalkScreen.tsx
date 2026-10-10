// Talk: the one place CurioX speaks and listens. Opening it starts a guided conversation:
// hello and today's updates → what do you want to learn about? → the explanation → your view →
// the impact → what you make of it → open chat, until you wrap up. While it runs, only the
// transcript shows (scrolling as it grows); after the wrap-up a summary card opens the deck made
// from the talk. A deck's mic button opens Talk straight onto that topic. Voice is on only here.
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { VOICE_TONES, VOICE_TONE_LABEL, VOICE_TONE_SPEECH, type TalkFinishResponse, type TalkPoint, type TalkStage, type VoiceTone } from '@curiox/shared';
import { api } from '../api/client';
import { localDate } from '../hooks/useZine';
import { Blob, type BlobPhase } from '../talk/Blob';
import { Bar, Btn, Chip, Ground, IconBtn, Note, Panel, PasteIn } from '../ui/kit';
import { Icon } from '../ui/Icon';
import { fonts, paper, useGround } from '../ui/tokens';
import { useVoiceScreen } from '../voice/VoiceProvider';

/** After the wrap-up: the talk's takeaways on a yellow card; tapping opens the deck made from it. */
function SummaryCard({ topic, points, deckId, onOpen }: { topic: string; points: string[]; deckId: string | null; onOpen: () => void }) {
  const g = useGround();
  return (
    <PasteIn style={{ alignSelf: 'stretch', paddingHorizontal: 20 }}>
      <Pressable accessibilityRole="button" accessibilityLabel={`Summary of ${topic}. ${deckId ? 'Open the cards' : ''}`} onPress={onOpen} disabled={!deckId}>
        <Panel style={{ paddingTop: 18, paddingHorizontal: 20, paddingBottom: 16, gap: 8, transform: [{ rotate: '-0.8deg' }] }}>
          <Text style={{ fontFamily: fonts.typeBold, fontSize: 13, letterSpacing: 0.78, textTransform: 'uppercase', color: paper.onYellow2 }}>What we talked about</Text>
          <Text style={{ fontFamily: fonts.disp800, fontSize: 22, lineHeight: 26, color: paper.ink }}>{topic}</Text>
          {points.slice(0, 3).map((pt, i) => (
            <View key={i} style={{ flexDirection: 'row', gap: 8 }}>
              <Text style={{ fontFamily: fonts.typeBold, fontSize: 14, lineHeight: 20, color: paper.ink }}>{i + 1}</Text>
              <Text style={{ fontFamily: fonts.disp700, fontSize: 15.5, lineHeight: 20, color: paper.ink, flex: 1 }}>{pt}</Text>
            </View>
          ))}
          {deckId ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 }}>
              <Icon name="cards" size={20} color={paper.ink} />
              <Text style={{ fontFamily: fonts.disp800, fontSize: 15.5, color: paper.ink }}>Open the summary cards</Text>
              <Icon name="chev" size={20} color={paper.ink} />
            </View>
          ) : (
            <Text style={{ fontFamily: fonts.body, fontSize: 14, color: g.onGround2 }}>making the cards…</Text>
          )}
        </Panel>
      </Pressable>
    </PasteIn>
  );
}

type Phase = 'idle' | 'opening' | 'talking' | 'finishing' | 'done';

export interface TalkProps {
  /** The tab is on screen. Voice switches on with it and off without it. */
  active: boolean;
  tone: VoiceTone;
  onTone: (t: VoiceTone) => void;
  onClose: () => void;
  onStaple: (points: TalkPoint[]) => Promise<void>;
  onFinished: (result: TalkFinishResponse) => void;
  onOpenDeck: (id: string) => void;
  /** Open straight onto a topic (from a deck's mic button). `key` changes for each request. */
  openWith?: { key: string; topic: string; title: string } | null;
}

export function TalkScreen({ active, tone, onTone, onClose, onStaple, onFinished, onOpenDeck, openWith }: TalkProps) {
  const g = useGround();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const [phase, setPhase] = useState<Phase>('idle');
  const [points, setPoints] = useState<TalkPoint[]>([]);
  const [caption, setCaption] = useState<{ who: 'you' | 'curiox'; text: string } | null>(null);
  /** Everything said so far, by both sides, as shown on screen. */
  const [transcript, setTranscript] = useState<{ who: 'you' | 'curiox'; text: string }[]>([]);
  const [summaryDeckId, setSummaryDeckId] = useState<string | null>(null);
  const [summary, setSummary] = useState<{ topic: string; points: string[] } | null>(null);
  const transcriptRef = useRef<ScrollView>(null);
  const [busy, setBusy] = useState(false);
  const [label, setLabel] = useState<string | null>(null);
  const [stapling, setStapling] = useState(false);
  const [typed, setTyped] = useState('');
  const [area, setArea] = useState({ x: 0, y: 0, w: 0, h: 0 });
  const run = useRef(0);
  const phaseRef = useRef<Phase>('idle');
  const stage = useRef<TalkStage>('topic');
  const topic = useRef<string | undefined>(undefined);
  const history = useRef<{ role: 'user' | 'assistant'; content: string }[]>([]);
  const pointsRef = useRef<TalkPoint[]>([]);
  const date = localDate();

  const setPhaseBoth = (p: Phase) => {
    phaseRef.current = p;
    setPhase(p);
  };

  const voice = useVoiceScreen({
    screen: 'talk',
    active,
    intro: null,
    onCommand: (cmd) => {
      if (cmd.type === 'staple') return void staple();
      if (cmd.type === 'startOver') return void start();
      if (cmd.type === 'stop') {
        run.current++;
        setLabel('Stopped. ');
        return;
      }
      if (cmd.type === 'back' || cmd.type === 'goHome' || cmd.type === 'close') return onClose();
      return false;
    },
    onDictation: (text) => void heard(text),
  });
  const voiceRef = useRef(voice);
  voiceRef.current = voice;

  /** Say each point out loud and drop it as a slip; the last one hands over to listening. */
  const deliver = async (mine: number, reply: TalkPoint[], listenAfter = true) => {
    for (let i = 0; i < reply.length; i++) {
      if (mine !== run.current) return false;
      const p = reply[i]!;
      setCaption({ who: 'curiox', text: p.say });
      setTranscript((t) => [...t, { who: 'curiox', text: p.say }]);
      setTimeout(() => transcriptRef.current?.scrollToEnd({ animated: true }), 60);
      const v = voiceRef.current;
      if (v.enabled) await v.say(p.say, { listenAfter: listenAfter && i === reply.length - 1 });
      else await new Promise((r) => setTimeout(r, 700 + p.say.split(' ').length * 140));
      if (mine !== run.current) return false;
      pointsRef.current = [...pointsRef.current, p];
      setPoints(pointsRef.current);
    }
    return true;
  };

  /** A fresh conversation about a given topic: no greeting, straight into the explanation. */
  const startWith = async (topic: string, title: string) => {
    run.current++;
    history.current = [];
    pointsRef.current = [];
    stage.current = 'topic';
    setPoints([]);
    setCaption(null);
    setTranscript([]);
    setSummaryDeckId(null);
    setSummary(null);
    setLabel(null);
    setPhaseBoth('talking');
    await heard(`Tell me about ${title || topic}.`);
  };

  /** The greeting: hello, today's updates, and "what do you want to learn about?" */
  const start = useCallback(async () => {
    const mine = ++run.current;
    history.current = [];
    pointsRef.current = [];
    topic.current = undefined;
    stage.current = 'topic';
    setPoints([]);
    setCaption(null);
    setTranscript([]);
    setSummaryDeckId(null);
    setSummary(null);
    setLabel(null);
    setPhaseBoth('opening');
    setBusy(true);
    voiceRef.current.setThinking(true);
    let open: TalkPoint[];
    try {
      const res = await api.talkOpen({ date, hour: new Date().getHours() });
      open = res.points;
    } catch {
      open = [
        { h: 'Hello!', say: "Hello! I couldn't fetch today's updates just now, but I'm all ears." },
        { h: 'Your pick', say: 'What do you want to learn about today?' },
      ];
    } finally {
      voiceRef.current.setThinking(false);
      setBusy(false);
    }
    if (mine !== run.current) return;
    history.current = [{ role: 'assistant', content: open.map((p) => p.say).join(' ') }];
    setPhaseBoth('talking');
    await deliver(mine, open);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  /** One turn of the conversation. */
  const heard = async (text: string) => {
    if (phaseRef.current === 'finishing') return;
    if (phaseRef.current !== 'talking') return void start();
    const mine = ++run.current;
    setLabel(null);
    setCaption({ who: 'you', text });
    setTranscript((t) => [...t, { who: 'you', text }]);
    setBusy(true);
    voiceRef.current.setThinking(true);
    let reply: TalkPoint[];
    let done = false;
    try {
      const res = await api.talk({ message: text, history: history.current, stage: stage.current, topic: topic.current, date });
      reply = res.points;
      done = res.done;
      stage.current = res.stage;
      if (res.topic) topic.current = res.topic;
    } catch {
      reply = [{ h: 'Lost the line', say: "Sorry, I couldn't reach my brain just then. Say that again in a moment?" }];
    } finally {
      voiceRef.current.setThinking(false);
      setBusy(false);
    }
    if (mine !== run.current) return;
    history.current = [...history.current, { role: 'user' as const, content: text }, { role: 'assistant' as const, content: reply.map((p) => p.say).join(' ') }].slice(-16);
    const delivered = await deliver(mine, reply, !done);
    if (delivered && done) void finish();
  };

  /** Wrap up: keep the key points, score the interest, update the reader and Home. */
  const finish = async () => {
    if (phaseRef.current !== 'talking') return;
    const mine = ++run.current;
    setPhaseBoth('finishing');
    setCaption({ who: 'curiox', text: 'Let me jot down the key points…' });
    setBusy(true);
    try {
      const res = await api.talkFinish({ topic: topic.current, history: history.current, points: pointsRef.current, date });
      if (mine !== run.current) return;
      onFinished(res);
      setSummaryDeckId(res.summaryDeckId);
      setSummary({ topic: res.topic || topic.current || 'Our talk', points: res.keyPoints });
      const extra = res.addedInterest
        ? ` I've added ${res.topic} to what you follow${res.deckId ? ', and put the latest on it on your home' : ''}.`
        : res.deckId
          ? ' There is a fresh story on it on your home.'
          : '';
      const closing: TalkPoint[] = [...res.keyPoints.slice(0, 3).map((k, i) => ({ h: `Takeaway ${i + 1}`, say: k })), { h: 'Bye for now', say: `${res.reply}${extra}` }];
      setBusy(false);
      await deliver(mine, closing, false);
    } catch {
      setBusy(false);
      await deliver(mine, [{ h: 'Bye for now', say: "That was a good one. I'll remember it. See you next time!" }], false);
    }
    if (mine !== run.current) return;
    setPhaseBoth('done');
    setLabel('That was fun. ');
    voiceRef.current.disable();
  };

  const staple = async () => {
    if (!pointsRef.current.length || stapling) return;
    setStapling(true);
    try {
      await onStaple(pointsRef.current);
    } finally {
      setStapling(false);
    }
  };

  // Voice lives only on this screen. The first time Talk opens in a session it says hello by itself;
  // after a wrap-up, or when the reader comes back from another page, it waits for the blob.
  const greeted = useRef(false);
  const openedWith = useRef<string | null>(null);
  useEffect(() => {
    const v = voiceRef.current;
    if (active) {
      v.setSpeechStyle(VOICE_TONE_SPEECH[tone]);
      if (openWith && openedWith.current !== openWith.key) {
        openedWith.current = openWith.key;
        greeted.current = true;
        v.enable({ quiet: true });
        void startWith(openWith.topic, openWith.title);
      } else if (!greeted.current && phaseRef.current === 'idle') {
        greeted.current = true;
        v.enable({ quiet: true });
        void start();
      }
    } else {
      run.current++;
      v.disable();
      setBusy(false);
      if (phaseRef.current === 'opening') setPhaseBoth('idle');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, openWith?.key]);

  useEffect(() => {
    voiceRef.current.setSpeechStyle(VOICE_TONE_SPEECH[tone]);
  }, [tone]);

  const s = voice.status;
  const blobPhase: BlobPhase = busy || s === 'thinking' || s === 'transcribing' ? 'thinking' : s === 'listening' ? 'listening' : s === 'speaking' ? 'speaking' : 'idle';
  const say =
    phase === 'done'
      ? `${label ?? ''}Press to start a new talk`
      : !voice.enabled && (phase === 'talking' || phase === 'finishing')
        ? 'Press to carry on'
        : blobPhase === 'listening'
        ? 'Listening'
        : blobPhase === 'thinking'
          ? 'Thinking'
          : blobPhase === 'speaking'
            ? 'Press to interrupt'
            : `${label ?? ''}${points.length ? 'Press and say more' : 'Press and ask out loud'}`;
  // While the talk runs the transcript has the screen; the blob shrinks to the top.
  const compact = transcript.length > 0 || phase === 'done';
  const hasSlips = compact;
  const R = Math.min(area.w * 0.6, area.h * 0.46, 330);

  const pressBlob = () => {
    if (!voice.enabled) voice.enable({ quiet: true });
    if (phase === 'idle' || phase === 'done') return void start();
    if (blobPhase === 'speaking' || blobPhase === 'thinking') run.current++;
    voice.micPress();
  };

  const send = () => {
    const t = typed.trim();
    if (!t) return;
    setTyped('');
    void heard(t);
  };

  return (
    <Ground>
      <View style={{ flex: 1, paddingTop: insets.top, alignItems: 'center' }}>
        <Blob width={width} height={height} cx={area.x + area.w / 2} cy={area.y + area.h / 2} R={R} phase={blobPhase} />
        <View style={{ alignSelf: 'stretch' }}>
          <Bar title="Talk" onBack={onClose} backIcon="x" backLabel="Close talk mode" right={phase === 'talking' ? <Btn label="Wrap up" variant="text" onPress={() => void finish()} /> : <Btn label="Start over" variant="text" onPress={() => void start()} />} />
          <View accessibilityRole="radiogroup" accessibilityLabel="Voice tone" style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingBottom: 4 }}>
            {VOICE_TONES.map((t, i) => (
              <Chip key={t} label={VOICE_TONE_LABEL[t]} index={i} selected={tone === t} onPress={() => onTone(t)} style={{ paddingVertical: 8, paddingHorizontal: 12 }} textStyle={{ fontSize: 14.5 }} />
            ))}
          </View>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={say}
          onPress={pressBlob}
          onLayout={(e) => {
            const { x, y, width: w, height: h } = e.nativeEvent.layout;
            setArea({ x, y, w, h });
          }}
          style={{ alignSelf: 'stretch', ...(compact ? { height: Math.min(220, height * 0.26) } : { flex: 1 }), alignItems: 'center', justifyContent: 'center' }}
        >
          <Text
            style={{
              maxWidth: hasSlips ? 170 : 190,
              fontFamily: fonts.disp900,
              fontSize: hasSlips ? 17 : 30,
              lineHeight: hasSlips ? 18 : 30,
              letterSpacing: -0.6,
              color: paper.ink,
              // No box behind the words: the blob itself is the button.
              paddingHorizontal: 8,
              paddingVertical: 2,
              textAlign: 'center',
              marginRight: hasSlips ? 30 : 44,
              marginBottom: hasSlips ? 46 : 64,
              overflow: 'hidden',
            }}
          >
            {say}
          </Text>
        </Pressable>

        {/* The transcript: what you said in pen, what CurioX said in print. */}
        <ScrollView
          ref={transcriptRef}
          onContentSizeChange={() => transcriptRef.current?.scrollToEnd({ animated: true })}
          style={{ alignSelf: 'stretch', ...(phase === 'done' ? { flexGrow: 0, maxHeight: 150 } : compact ? { flex: 1 } : { flexGrow: 0, maxHeight: 220 }), minHeight: 76 }}
          contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 8, paddingBottom: 12, gap: 10 }}
          accessibilityLiveRegion="polite"
          accessibilityLabel="Transcript"
        >
          {transcript.length === 0 && !!caption && (
            <Text style={{ fontFamily: fonts.disp800, fontSize: 21, lineHeight: 25, textAlign: 'center', color: g.onGround }}>{caption.text}</Text>
          )}
          {transcript.map((t, i) => (
            <Text key={i} style={t.who === 'you' ? { fontFamily: fonts.hand, fontSize: 23, lineHeight: 27, color: g.pen, textAlign: 'right' } : { fontFamily: fonts.disp700, fontSize: 17, lineHeight: 22, color: g.onGround }}>
              {t.who === 'you' ? `“${t.text}”` : t.text}
            </Text>
          ))}
        </ScrollView>

        {phase === 'done' && summary ? (
          <View style={{ alignSelf: 'stretch', flex: 1, justifyContent: 'flex-start', paddingTop: 6 }}>
            <SummaryCard topic={summary.topic} points={summary.points} deckId={summaryDeckId} onOpen={() => summaryDeckId && onOpenDeck(summaryDeckId)} />
          </View>
        ) : (
          phase === 'idle' && <Note style={{ marginHorizontal: 24 }}>press the blob and I'll say hello</Note>
        )}

        <View style={{ alignSelf: 'stretch', gap: 8, alignItems: 'center', paddingTop: 2, paddingHorizontal: 20, paddingBottom: 8 }}>
          {phase === 'done' && points.length > 0 && !summaryDeckId && !summary && <Btn label={stapling ? 'Stapling…' : 'Staple into a deck'} icon="clip" disabled={stapling} onPress={() => void staple()} />}
          {!voice.canListen && (
            <View style={{ alignSelf: 'stretch', flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 5, paddingRight: 5, paddingLeft: 16, borderRadius: 14, backgroundColor: g.strip, boxShadow: g.sh }}>
              <TextInput value={typed} onChangeText={setTyped} placeholder="Type to talk" placeholderTextColor={paper.ink2} onSubmitEditing={send} returnKeyType="send" style={{ flex: 1, fontFamily: fonts.body, fontSize: 16, color: paper.ink, paddingVertical: 10 }} />
              <IconBtn name="up" label="Send" color={paper.ink} onPress={send} />
            </View>
          )}
        </View>
      </View>
    </Ground>
  );
}
