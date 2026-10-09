import { useCallback, useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LIMITS, type OnboardingResponse, type Profile } from '@curiox/shared';
import { ApiError, api } from '@/api/client';
import Composer from '@/components/Composer';
import { Button, Card, Logo } from '@/components/ui';
import { useSession } from '@/hooks/useSession';
import { useColors } from '@/theme';
import { MicButton, MicFab } from '@/voice/VoiceControls';
import { useVoiceScreen } from '@/voice/VoiceProvider';

interface Turn {
  id: number;
  role: 'curiox' | 'you';
  text: string;
  skipped?: boolean;
}

type Stage = 'intro' | 'asking' | 'finished';

function list(items: string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

function readySpeech(p: Profile): string {
  const parts: string[] = [];
  if (p.interests.length) parts.push(`you're into ${list(p.interests.slice(0, 4))}`);
  if (p.goals.length) parts.push(`you want to ${p.goals[0]!.replace(/^to\s+/i, '')}`);
  if (p.explanationStyle) parts.push(`you like explanations with ${p.explanationStyle}`);
  const summary = parts.length ? `Here's what I learned: ${list(parts)}.` : "No problem, we'll figure it out as we go.";
  return `${summary} Say start learning to begin, or start over to answer again.`;
}

export default function WelcomeScreen() {
  const c = useColors();
  const { session, update } = useSession();
  const [stage, setStage] = useState<Stage>(session?.onboarding.status === 'in_progress' ? 'asking' : 'intro');
  const [turns, setTurns] = useState<Turn[]>([]);
  const [state, setState] = useState<OnboardingResponse | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const turnId = useRef(0);
  const scroller = useRef<ScrollView>(null);

  const push = (t: Omit<Turn, 'id'>) => setTurns((l) => [...l, { ...t, id: ++turnId.current }]);

  const call = useCallback(async (body: Parameters<typeof api.onboarding>[0]) => {
    setPending(true);
    setError(null);
    try {
      let res: OnboardingResponse;
      try {
        res = await api.onboarding(body);
      } catch (err) {
        // Another device tap or a double tap moved onboarding on: fetch where we are now.
        if (err instanceof ApiError && err.status === 409) res = await api.onboarding({});
        else throw err;
      }
      setState(res);
      if (res.question) {
        push({ role: 'curiox', text: res.question.text });
        setStage('asking');
      } else setStage('finished');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setPending(false);
    }
  }, []);

  // Resume an onboarding that was interrupted (app closed mid-way).
  const resumed = useRef(false);
  useEffect(() => {
    if (stage === 'asking' && !resumed.current) {
      resumed.current = true;
      void call({});
    }
  }, [stage, call]);

  const answer = (text: string) => {
    push({ role: 'you', text });
    void call({ message: text.slice(0, LIMITS.onboardingAnswerMaxChars) });
  };
  const skipQuestion = () => {
    push({ role: 'you', text: 'Skipped', skipped: true });
    void call({ skip: 'question' });
  };
  const begin = () => {
    resumed.current = true;
    void call({});
  };
  const finishNow = () => void call({ skip: 'all' });
  const startLearning = () => state?.profile && update(state.profile, state.onboarding);
  const startOver = () => {
    setTurns([]);
    void call({ restart: true });
  };

  // ---- Voice: every step can be done by speaking ----
  const lastQuestion = [...turns].reverse().find((t) => t.role === 'curiox')?.text ?? null;
  const voice = useVoiceScreen(
    stage === 'intro'
      ? {
          screen: 'welcome',
          intro: "Hi, I'm CurioX, your learning companion. I'll ask six quick questions so my answers fit you. Say start to begin, or skip to explore right away.",
          onCommand: (cmd) => {
            if (cmd.type === 'start') begin();
            else if (cmd.type === 'skipAll') finishNow();
            else return false;
          },
        }
      : stage === 'asking'
        ? {
            screen: 'onboarding',
            intro: lastQuestion && !pending ? (state?.onboarding.step === 0 ? `${lastQuestion} You can just say your answer.` : lastQuestion) : null,
            onCommand: (cmd) => {
              if (pending) return true;
              if (cmd.type === 'skipQuestion') skipQuestion();
              else if (cmd.type === 'finish') finishNow();
              else return false;
            },
            onDictation: (text) => {
              if (!pending && state?.question) answer(text);
            },
          }
        : {
            screen: 'ready',
            intro: state?.profile ? readySpeech(state.profile) : null,
            onCommand: (cmd) => {
              if (cmd.type === 'startLearning') startLearning();
              else if (cmd.type === 'startOver') startOver();
              else return false;
            },
          },
  );
  useEffect(() => voice.setThinking(pending), [pending, voice.setThinking]);
  useEffect(() => {
    if (error && voice.enabled) void voice.say(`${error} Say try again.`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [error]);

  // ---------------- Intro ----------------
  if (stage === 'intro') {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }}>
        <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 24, gap: 18 }}>
          <Logo size={72} />
          <Text style={{ color: c.text, fontSize: 32, fontWeight: '800', letterSpacing: -0.5 }}>Learn anything, your way.</Text>
          <Text style={{ color: c.muted, fontSize: 17, lineHeight: 25 }}>
            CurioX gets to know how you like to learn, then explains anything with live sources, quick quizzes and one-tap ways to go simpler or deeper.
          </Text>
          <View style={{ gap: 8 }}>
            {['💬  Six quick questions so answers fit you', '🎤  Talk or type, whatever you like', '🔎  Up-to-date answers with sources', '🧠  Quizzes on whatever you just learned'].map((t) => (
              <Text key={t} style={{ color: c.text, fontSize: 16 }}>
                {t}
              </Text>
            ))}
          </View>
          {error && <Text style={{ color: c.danger }}>{error}</Text>}
          <View style={{ gap: 10, marginTop: 8 }}>
            <Button label={pending ? 'Starting…' : "Let's get started"} onPress={begin} loading={pending} />
            {!voice.enabled && voice.canListen && <Button label="🎤  Talk to CurioX" variant="secondary" onPress={voice.enable} />}
            <Button label="Skip, just let me explore" variant="ghost" onPress={finishNow} disabled={pending} />
          </View>
          <Text style={{ color: c.subtle, fontSize: 12 }}>
            No sign-up. Your profile is tied to this device and you can clear it anytime.
            {voice.enabled ? ' Voice mode is on: say “start” or “skip”.' : ''}
          </Text>
        </ScrollView>
        <MicFab />
      </SafeAreaView>
    );
  }

  // ---------------- Profile ready ----------------
  if (stage === 'finished' && state?.profile) {
    const p = state.profile;
    const empty = !p.interests.length && !p.goals.length && !p.curiosities.length && !p.explanationStyle && !p.tone;
    const chips = (items: string[]) => (
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
        {items.map((i) => (
          <Text key={i} style={{ backgroundColor: c.accentBg, color: c.accentText, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, overflow: 'hidden', fontSize: 14 }}>
            {i}
          </Text>
        ))}
      </View>
    );
    const label = (t: string) => <Text style={{ color: c.muted, fontSize: 12, fontWeight: '700', letterSpacing: 0.5 }}>{t}</Text>;
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }}>
        <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 24, gap: 16 }}>
          <Logo size={56} />
          <Text style={{ color: c.text, fontSize: 26, fontWeight: '800' }}>{empty ? "No problem, let's explore!" : "Here's what I learned about you"}</Text>
          {empty ? (
            <Text style={{ color: c.muted, fontSize: 16 }}>I'll adapt as we go. You can fill in your profile anytime.</Text>
          ) : (
            <Card style={{ gap: 14 }}>
              {p.interests.length > 0 && (
                <View>
                  {label('INTERESTS')}
                  {chips(p.knowledgeLevels.length ? p.knowledgeLevels.map((k) => `${k.topic} · ${k.level}`) : p.interests)}
                </View>
              )}
              {p.goals.length > 0 && (
                <View>
                  {label('GOALS')}
                  {chips(p.goals)}
                </View>
              )}
              {Boolean(p.explanationStyle || p.tone) && (
                <View>
                  {label("HOW I'LL EXPLAIN")}
                  <Text style={{ color: c.text, marginTop: 4 }}>{[p.explanationStyle, p.tone].filter(Boolean).join(' · ')}</Text>
                </View>
              )}
              {p.curiosities.length > 0 && (
                <View>
                  {label('CURIOUS ABOUT')}
                  {chips(p.curiosities)}
                </View>
              )}
            </Card>
          )}
          <Button label="Start learning →" onPress={startLearning} />
          <Button label="Start over" variant="ghost" onPress={startOver} />
        </ScrollView>
        <MicFab />
      </SafeAreaView>
    );
  }

  // ---------------- Questions ----------------
  const step = state?.onboarding.step ?? 0;
  const total = state?.onboarding.totalSteps ?? 6;
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }} edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: c.border }}>
          <Logo size={28} />
          <View style={{ flex: 1, gap: 6 }}>
            <Text style={{ color: c.text, fontWeight: '700' }}>Getting to know you</Text>
            <View style={{ flexDirection: 'row', gap: 4 }} accessibilityLabel={`Question ${Math.min(step + 1, total)} of ${total}`}>
              {Array.from({ length: total }, (_, i) => (
                <View key={i} style={{ flex: 1, height: 5, borderRadius: 3, backgroundColor: i < step ? c.primary : i === step ? c.citeBg : c.border }} />
              ))}
            </View>
          </View>
          <Pressable accessibilityRole="button" onPress={finishNow} disabled={pending}>
            <Text style={{ color: c.muted }}>Finish now</Text>
          </Pressable>
        </View>

        <ScrollView ref={scroller} onContentSizeChange={() => scroller.current?.scrollToEnd({ animated: true })} contentContainerStyle={{ padding: 16, gap: 12 }}>
          {turns.map((t) =>
            t.role === 'curiox' ? (
              <View key={t.id} style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8, maxWidth: '88%' }}>
                <Logo size={24} />
                <View style={{ backgroundColor: c.card, borderColor: c.border, borderWidth: 1, borderRadius: 18, borderBottomLeftRadius: 6, padding: 12, flexShrink: 1 }}>
                  <Text style={{ color: c.text, fontSize: 16, lineHeight: 22 }}>{t.text}</Text>
                </View>
              </View>
            ) : (
              <View key={t.id} style={{ alignSelf: 'flex-end', maxWidth: '85%', backgroundColor: t.skipped ? c.codeBg : c.primary, borderRadius: 18, borderBottomRightRadius: 6, padding: 12 }}>
                <Text style={{ color: t.skipped ? c.muted : c.onPrimary, fontSize: 16, fontStyle: t.skipped ? 'italic' : 'normal' }}>{t.text}</Text>
              </View>
            ),
          )}
          {pending && <Text style={{ color: c.muted, marginLeft: 32 }}>CurioX is typing…</Text>}
          {error && (
            <View style={{ backgroundColor: c.dangerBg, borderRadius: 12, padding: 10, gap: 6 }}>
              <Text style={{ color: c.dangerText }}>{error}</Text>
              <Pressable onPress={() => void call({})}>
                <Text style={{ color: c.dangerText, fontWeight: '700' }}>Retry</Text>
              </Pressable>
            </View>
          )}
        </ScrollView>

        <View style={{ paddingHorizontal: 12, paddingTop: 8, paddingBottom: 8, gap: 6, borderTopWidth: 1, borderTopColor: c.border }}>
          <Composer
            busy={pending}
            disabled={!state?.question}
            maxLength={LIMITS.onboardingAnswerMaxChars}
            placeholder={voice.enabled ? 'Say or type your answer…' : 'Type your answer…'}
            onSend={answer}
            voiceButton={voice.canListen ? <MicButton /> : null}
          />
          <Pressable accessibilityRole="button" onPress={skipQuestion} disabled={pending || !state?.question} style={{ paddingHorizontal: 6, paddingVertical: 4 }}>
            <Text style={{ color: c.muted }}>Skip this question</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
