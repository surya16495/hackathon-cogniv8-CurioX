// Welcome, then five chip questions. Questions 2 to 5 follow the interests picked in question 1 and
// every answer since: tailored on the phone straight away, then rewritten by the server's model.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  blankReader,
  interestsQuestion,
  tailorQuestions,
  type ReaderCard,
  type ReaderQuestion,
} from '@curiox/shared';
import { api } from '../api/client';
import { ChipGroup, withDraft } from '../components/ChipGroup';
import { ReaderCardView } from '../components/ReaderCard';
import { Cut } from '../ui/Art';
import { Btn, Bump, Ground, IconBtn, Note, Panel, PasteIn, Pill, Pop, SlideIn, T, useReduceMotion } from '../ui/kit';

/** Interests, level, goals, style, tone. What the reader wonders about comes from how they use the app. */
export const STEPS = 5;

export function useOnboardFlow(initial?: ReaderCard) {
  const [step, setStepState] = useState(0); // 0 welcome, 1..5 questions, 6 summary
  const [ans, setAnsState] = useState<ReaderCard>(() => initial ?? blankReader());
  const [tailored, setTailored] = useState<ReaderQuestion[]>(() => tailorQuestions(initial?.interests ?? []));
  const [draft, setDraftState] = useState('');
  // Refs hold the latest values, so voice can pick a chip and move on in one go.
  const stepRef = useRef(step);
  const ansRef = useRef(ans);
  const draftRef = useRef(draft);
  const tailoredRef = useRef(tailored);
  const visited = useRef(new Set<number>());
  const tailorFor = useRef('');

  const setStep = (n: number) => {
    stepRef.current = n;
    setStepState(n);
  };
  const setAns = (a: ReaderCard) => {
    ansRef.current = a;
    setAnsState(a);
  };
  const setDraft = (t: string) => {
    draftRef.current = t;
    setDraftState(t);
  };

  const questions = useMemo(() => [interestsQuestion(), ...tailored], [tailored]);
  const questionAt = (n: number) => (n >= 1 && n <= STEPS ? [interestsQuestion(), ...tailoredRef.current][n - 1]! : null);
  const q = questionAt(step);

  /** Ask the server to write the questions not yet reached, for these interests and answers. */
  const retailor = (interests: string[], answers: ReaderCard, interestsChanged: boolean) => {
    if (interestsChanged) {
      const old = tailoredRef.current;
      const local = tailorQuestions(interests);
      tailoredRef.current = local;
      setTailored(local);
      // Keep answers that still make sense: anything still offered, or typed by the reader.
      const next = { ...ansRef.current };
      for (const lq of local) {
        const was = old.find((x) => x.key === lq.key)?.options ?? [];
        next[lq.key] = next[lq.key].filter((v) => lq.options.includes(v) || !was.includes(v));
      }
      setAns(next);
      answers = next;
    }
    if (!interests.length) return;
    const given = { level: answers.level, goals: answers.goals, style: answers.style };
    const key = JSON.stringify([interests, given]);
    if (key === tailorFor.current) return;
    tailorFor.current = key;
    api
      .tailor(interests, given)
      .then((res) => {
        if (tailorFor.current !== key) return;
        // Only replace questions the reader has not reached yet.
        const merged = tailoredRef.current.map((o, i) => (visited.current.has(i + 2) ? o : res.questions[i] ?? o));
        tailoredRef.current = merged;
        setTailored(merged);
      })
      .catch(() => undefined);
  };

  const go = (to: number) => {
    setDraft('');
    if (to >= 1 && to <= STEPS) visited.current.add(to);
    setStep(to);
  };

  const next = () => {
    const cur = questionAt(stepRef.current);
    if (!cur) return go(stepRef.current + 1);
    const values = withDraft(cur, ansRef.current[cur.key], draftRef.current);
    const answers = { ...ansRef.current, [cur.key]: values };
    setAns(answers);
    retailor(answers.interests, answers, cur.key === 'interests');
    go(stepRef.current + 1);
  };

  const skip = () => {
    const cur = questionAt(stepRef.current);
    if (!cur) return go(stepRef.current + 1);
    const answers = { ...ansRef.current, [cur.key]: [] };
    setAns(answers);
    retailor(answers.interests, answers, cur.key === 'interests');
    go(stepRef.current + 1);
  };

  const set = (values: string[]) => {
    const cur = questionAt(stepRef.current);
    if (cur) setAns({ ...ansRef.current, [cur.key]: values });
  };
  const canNext = !!q && (ans[q.key].length > 0 || draft.trim().length > 0);

  return { step, q, ans, questions, draft, setDraft, set, next, skip, back: () => go(Math.max(0, stepRef.current - 1)), go, canNext, start: () => go(1) };
}

/** The bulb on the welcome page sways gently, like it is hanging from the panel. */
function Sway({ children }: { children: React.ReactNode }) {
  const reduce = useReduceMotion();
  const a = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduce) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(a, { toValue: 1, duration: 2200, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(a, { toValue: 0, duration: 2200, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [a, reduce]);
  return <Animated.View style={{ transform: [{ rotate: a.interpolate({ inputRange: [0, 1], outputRange: ['-4deg', '4deg'] }) }, { translateY: a.interpolate({ inputRange: [0, 1], outputRange: [0, -6] }) }] }}>{children}</Animated.View>;
}

export function Onboard({ flow, saving, error, onDone }: { flow: ReturnType<typeof useOnboardFlow>; saving?: boolean; error?: string | null; onDone: (r: ReaderCard) => void }) {
  const insets = useSafeAreaInsets();
  const scroll = useRef<ScrollView>(null);
  const { step, q, ans } = flow;
  // Which way the next page comes from: forward slides in from the right, back from the left.
  const lastStep = useRef(step);
  const dir = step >= lastStep.current ? 1 : -1;
  lastStep.current = step;

  useEffect(() => {
    scroll.current?.scrollTo({ y: 0, animated: false });
  }, [step]);

  if (step === 0) {
    return (
      <Ground>
        <View style={{ flex: 1, paddingTop: insets.top + 6, paddingHorizontal: 20, paddingBottom: Math.max(insets.bottom, 18), overflow: 'hidden' }}>
          <Panel
            radius={250}
            style={{ position: 'absolute', right: -150, top: -90, width: 520, height: 520, borderTopLeftRadius: 245, borderTopRightRadius: 275, borderBottomRightRadius: 230, borderBottomLeftRadius: 285 }}
          />
          <View style={{ position: 'absolute', right: 20, top: insets.top + 66 }}>
            <Pop delay={200}>
              <Sway>
                <Cut art="bulb" size={190} rotate={8} />
              </Sway>
            </Pop>
          </View>
          <View style={{ flex: 1 }} />
          <PasteIn delay={80} style={{ gap: 14, paddingBottom: 8 }}>
            <T v="word" accessibilityRole="header">
              CurioX
            </T>
            <T v="m" style={{ maxWidth: 220 }}>
              Learn anything in cards made for you.
            </T>
          </PasteIn>
          <PasteIn delay={260} style={{ marginTop: 22, gap: 10 }}>
            <Btn label="Start" wide onPress={flow.start} />
            <T v="hint" muted>
              Five quick questions. No sign-up.
            </T>
          </PasteIn>
        </View>
      </Ground>
    );
  }

  if (step > STEPS || !q) {
    return (
      <Ground>
        <ScrollView ref={scroll} contentContainerStyle={{ flexGrow: 1, paddingTop: insets.top + 20, paddingHorizontal: 20, paddingBottom: Math.max(insets.bottom, 18) }}>
          <View style={{ gap: 18 }}>
            <PasteIn>
              <T v="l" accessibilityRole="header">
                Here is what I learned about you
              </T>
            </PasteIn>
            <PasteIn delay={160}>
              <ReaderCardView reader={ans} />
            </PasteIn>
            <PasteIn delay={420}>
              <Note arrow>change any of it later under You</Note>
            </PasteIn>
          </View>
          <View style={{ flex: 1, minHeight: 24 }} />
          <View style={{ gap: 10 }}>
            {!!error && <T muted>{error}</T>}
            <Btn label={saving ? 'Making your first deck…' : 'Make my first deck'} wide disabled={saving} onPress={() => onDone(ans)} />
            <Btn label="Change something" variant="text" onPress={() => flow.go(1)} />
          </View>
        </ScrollView>
      </Ground>
    );
  }

  return (
    <Ground>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView ref={scroll} keyboardShouldPersistTaps="handled" contentContainerStyle={{ flexGrow: 1, paddingTop: insets.top + 6, paddingHorizontal: 20, paddingBottom: Math.max(insets.bottom, 18) }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginLeft: -12, marginRight: -10, marginBottom: 18 }}>
            <IconBtn name="back" label="Back" onPress={flow.back} />
            <Bump on={step > 0}>
              <Pill label={`${step}/${STEPS}`} />
            </Bump>
            <Btn label="Skip" variant="text" onPress={flow.skip} />
          </View>
          <SlideIn key={step} from={dir * 44}>
            <T v="l" accessibilityRole="header" style={{ marginBottom: 8 }}>
              {q.q}
            </T>
            <T v="hint" muted>
              {q.hint}
            </T>
            <View style={{ marginTop: 20 }}>
              <ChipGroup key={q.key} q={q} values={ans[q.key]} onChange={flow.set} onDraft={flow.setDraft} onFreeSubmit={() => flow.canNext && flow.next()} />
            </View>
          </SlideIn>
          <View style={{ flex: 1, minHeight: 24 }} />
          <Btn label={step === STEPS ? 'Finish' : 'Next'} wide disabled={!flow.canNext} onPress={flow.next} />
        </ScrollView>
      </KeyboardAvoidingView>
    </Ground>
  );
}
