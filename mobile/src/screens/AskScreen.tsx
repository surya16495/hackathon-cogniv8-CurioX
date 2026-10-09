// Ask CurioX: questions on ink strips, answers on taped-down paper, learn actions underneath,
// and any answer can be turned into a deck of cards.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Animated, Easing, KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LEARN_ACTIONS, type LearnActionId, type Source } from '@curiox/shared';
import { circled, Markdown } from '../components/Markdown';
import type { ChatItem, ChatStatus, UiMessage } from '../hooks/useChatStream';
import { BottomSheet } from '../ui/BottomSheet';
import { Icon } from '../ui/Icon';
import { Bar, Btn, Chip, Ground, IconBtn, Mini, Note, Sheet, Stamp, T, useReduceMotion } from '../ui/kit';
import { cutCorners, fonts, paper, type, useGround } from '../ui/tokens';

const DEMO_PREFIX = /^_Demo answer:[^\n]*\n*/;

function StatusLine({ text }: { text: string }) {
  const g = useGround();
  const reduce = useReduceMotion();
  const x = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduce) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(x, { toValue: 1, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(x, { toValue: 0, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [reduce, x]);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }} accessibilityLiveRegion="polite">
      <Icon name="search" size={18} color={g.onGround2} />
      <Text style={[type.hint, { color: g.onGround2, flexShrink: 1 }]}>{text}</Text>
      <Animated.View style={{ width: 28, height: 3, borderRadius: 2, backgroundColor: g.onGround2, transform: [{ translateX: x.interpolate({ inputRange: [0, 1], outputRange: [0, 16] }) }] }} />
    </View>
  );
}

function UserStrip({ m }: { m: UiMessage }) {
  const g = useGround();
  const label = m.action ? LEARN_ACTIONS.find((a) => a.id === m.action)?.label : null;
  return (
    <View style={{ alignSelf: 'flex-end', maxWidth: '84%', backgroundColor: g.onGround, paddingVertical: 11, paddingHorizontal: 14, borderRadius: 4, transform: [{ rotate: '0.7deg' }], boxShadow: g.sh }}>
      <Text style={{ fontFamily: fonts.disp700, fontSize: 16, lineHeight: 21, color: g.ground }}>{m.content || label}</Text>
    </View>
  );
}

function Answer({ m, last, status, onSources, onCards, cardsBusy, onRetry, canCards }: { m: UiMessage; last: boolean; status: ChatStatus | null; onSources: (s: Source[]) => void; onCards: () => void; cardsBusy: boolean; onRetry: () => void; canCards: boolean }) {
  const demo = m.provider === 'demo' || DEMO_PREFIX.test(m.content);
  const text = m.content.replace(DEMO_PREFIX, '');
  const waiting = m.streaming && !text;
  if (waiting) return <StatusLine text={status?.message ?? 'Thinking…'} />;
  const done = !m.streaming && !m.error && !!text;
  return (
    <Sheet tape style={{ marginTop: 8, paddingTop: demo ? 38 : 20 }}>
      {demo && <Stamp label="Demo answer" bg={paper.white} style={{ position: 'absolute', right: 12, top: -18 }} />}
      <Markdown text={text} sources={m.sources} cursor={m.streaming} />
      {m.stopped && <T v="typed" onPaper muted style={{ marginTop: 8 }}>Stopped.</T>}
      {!!m.error && (
        <View style={{ marginTop: 10, gap: 8 }}>
          <T onPaper>{m.error}</T>
          {last && <Mini label="Try again" icon="refresh" onPress={onRetry} />}
        </View>
      )}
      {done && (m.sources.length > 0 || (last && canCards && !demo)) && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14, paddingTop: 14, borderTopWidth: 1.5, borderTopColor: paper.rule }}>
          {m.sources.length > 0 && <Mini label={`${m.sources.length} source${m.sources.length > 1 ? 's' : ''}`} icon="link" onPress={() => onSources(m.sources)} />}
          {last && canCards && !demo && <Mini label={cardsBusy ? 'Making cards…' : 'Show as cards'} icon="cards" fill onPress={onCards} />}
        </View>
      )}
    </Sheet>
  );
}

export interface AskProps {
  items: ChatItem[];
  status: ChatStatus | null;
  busy: boolean;
  hasAnswer: boolean;
  suggestions: string[];
  cardsBusy: boolean;
  canCards: boolean;
  onSend: (text: string) => void;
  onAction: (a: LearnActionId) => void;
  onStop: () => void;
  onRetry: () => void;
  onCards: () => void;
  onBack: () => void;
  onNewChat: () => void;
  mic?: ReactNode;
}

export function AskScreen(p: AskProps) {
  const g = useGround();
  const insets = useSafeAreaInsets();
  const [draft, setDraft] = useState('');
  const [sources, setSources] = useState<Source[] | null>(null);
  const scroll = useRef<ScrollView>(null);
  const messages = p.items.filter((i): i is UiMessage => i.kind === 'message');
  const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant');

  const send = () => {
    const t = draft.trim();
    if (!t || p.busy) return;
    setDraft('');
    p.onSend(t);
  };

  return (
    <Ground>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, paddingTop: insets.top, paddingBottom: Math.max(insets.bottom, 0) }}>
        <Bar title="Ask CurioX" onBack={p.onBack} backLabel="Back to Home" right={messages.length ? <Btn label="New" variant="text" onPress={p.onNewChat} accessibilityLabel="Start a new chat" /> : undefined} />
        <ScrollView ref={scroll} onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: true })} keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 16, paddingTop: 8, paddingHorizontal: 16, paddingBottom: 18 }}>
          {!messages.length && (
            <View style={{ gap: 16, paddingTop: 10, paddingHorizontal: 4 }}>
              <T v="l" accessibilityRole="header">
                Ask anything
              </T>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                {p.suggestions.map((s, i) => (
                  <Chip key={s} label={s} index={i} onPress={() => p.onSend(s)} />
                ))}
              </View>
              <Note>or type your own below</Note>
            </View>
          )}
          {messages.map((m) =>
            m.role === 'user' ? (
              <UserStrip key={m.id} m={m} />
            ) : (
              <Answer key={m.id} m={m} last={m === lastAssistant} status={p.status} onSources={setSources} onCards={p.onCards} cardsBusy={p.cardsBusy} onRetry={p.onRetry} canCards={p.canCards} />
            ),
          )}
        </ScrollView>

        {p.hasAnswer && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={{ gap: 8, paddingTop: 8, paddingHorizontal: 16, paddingBottom: 10 }}>
            {LEARN_ACTIONS.map((a, i) => (
              <Pressable
                key={a.id}
                accessibilityRole="button"
                disabled={p.busy}
                onPress={() => p.onAction(a.id)}
                style={({ pressed }) => ({ minHeight: 42, paddingHorizontal: 14, justifyContent: 'center', backgroundColor: g.strip, ...cutCorners, boxShadow: g.sh, opacity: p.busy ? 0.5 : 1, transform: [{ rotate: i % 2 ? '0deg' : '-0.7deg' }, ...(pressed ? [{ scale: 0.985 }] : [])] })}
              >
                <Text style={[type.act, { color: paper.ink }]}>{a.label}</Text>
              </Pressable>
            ))}
          </ScrollView>
        )}

        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', marginTop: 2, marginHorizontal: 16, marginBottom: 10, paddingVertical: 5, paddingRight: 5, paddingLeft: 16, borderRadius: 14, backgroundColor: g.strip, boxShadow: g.sh }}>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            onSubmitEditing={send}
            placeholder={messages.length ? 'Ask a follow-up' : 'Ask anything'}
            placeholderTextColor={paper.ink2}
            returnKeyType="send"
            accessibilityLabel="Your question"
            maxLength={4000}
            style={{ flex: 1, minWidth: 0, fontFamily: fonts.body, fontSize: 16, color: paper.ink, paddingVertical: 10 }}
          />
          {p.mic}
          {p.busy ? (
            <IconBtn name="pause" label="Stop the answer" color={paper.ink} onPress={p.onStop} />
          ) : (
            <Pressable accessibilityRole="button" accessibilityLabel="Send" onPress={send} style={({ pressed }) => ({ width: 42, height: 42, borderRadius: 21, backgroundColor: paper.ink, alignItems: 'center', justifyContent: 'center', transform: pressed ? [{ scale: 0.92 }] : undefined })}>
              <Icon name="up" size={22} color={paper.white} />
            </Pressable>
          )}
        </View>
      </KeyboardAvoidingView>

      <BottomSheet open={!!sources} title="Sources" onClose={() => setSources(null)}>
        {(sources ?? []).map((s) => (
          <Pressable key={s.id} accessibilityRole="link" onPress={() => void Linking.openURL(s.url)} style={{ flexDirection: 'row', gap: 10, paddingVertical: 14, borderBottomWidth: 1.5, borderBottomColor: paper.rule }}>
            <Text style={{ fontFamily: fonts.typeBold, fontSize: 22, color: paper.ink, width: 30 }}>{circled(s.id)}</Text>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={{ fontFamily: fonts.disp800, fontSize: 17, lineHeight: 20, color: paper.ink }}>{s.title}</Text>
              {!!s.snippet && <Text numberOfLines={3} style={{ fontFamily: fonts.body, fontSize: 14.5, lineHeight: 20, color: paper.ink2 }}>{s.snippet}</Text>}
            </View>
          </Pressable>
        ))}
      </BottomSheet>
    </Ground>
  );
}
