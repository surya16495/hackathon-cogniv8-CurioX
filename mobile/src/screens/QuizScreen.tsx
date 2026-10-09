// A short quiz: pick an option, see it ticked or crossed in pen with the reason, then the score.
import { useEffect, useRef, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { DeckQuizQuestion } from '@curiox/shared';
import { Cross, Ring, Tick } from '../ui/Marks';
import { Bar, Btn, Ground, Highlight, Note, Pill, Strip, T, useSize } from '../ui/kit';
import { fonts, paper, type } from '../ui/tokens';

function Option({ letter, text, state, onPress }: { letter: string; text: string; state: 'idle' | 'right' | 'wrong' | 'answer' | 'dim'; onPress: () => void }) {
  const [size, onLayout] = useSize();
  const picked = state === 'right' || state === 'wrong';
  return (
    <Strip
      onPress={state === 'idle' ? onPress : undefined}
      accessibilityLabel={`${letter}. ${text}${state === 'right' ? ', your answer, correct' : state === 'wrong' ? ', your answer, wrong' : state === 'answer' ? ', the right answer' : ''}`}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 60, paddingVertical: 10, paddingLeft: 12, paddingRight: 48 }}
    >
      <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: paper.ink, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ fontFamily: fonts.disp800, fontSize: 14.5, color: paper.white }}>{letter}</Text>
      </View>
      <View onLayout={onLayout} style={{ flexShrink: 1 }}>
        {picked && <Highlight on inset={{ top: -3, bottom: -3, left: -8, right: -8 }} />}
        <Text style={{ fontFamily: fonts.disp700, fontSize: 17, lineHeight: 21, color: paper.ink }}>{text}</Text>
        {picked && <Ring width={size.width} height={size.height} pad={9} color={paper.ink} />}
      </View>
      {(state === 'right' || state === 'answer') && <Tick size={30} color={paper.good} style={{ position: 'absolute', right: 10, top: '50%', marginTop: -15 }} />}
      {state === 'wrong' && <Cross size={30} color={paper.bad} style={{ position: 'absolute', right: 10, top: '50%', marginTop: -15 }} />}
    </Strip>
  );
}

export interface QuizProps {
  questions: DeckQuizQuestion[];
  loading?: boolean;
  error?: string | null;
  onClose: () => void;
  onHome: () => void;
  onReexplain: (q: DeckQuizQuestion) => void;
  /** Voice: the current question and whether it is waiting for an answer. */
  onState?: (s: { index: number; picked: number | null; done: boolean; score: number; missed: number[] }) => void;
  /** Voice can answer by index. */
  answerRef?: React.MutableRefObject<((i: number) => void) | null>;
  nextRef?: React.MutableRefObject<(() => void) | null>;
}

export function QuizScreen(p: QuizProps) {
  const insets = useSafeAreaInsets();
  const [i, setI] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [score, setScore] = useState(0);
  const [missed, setMissed] = useState<number[]>([]);
  const [done, setDone] = useState(false);
  const scroll = useRef<ScrollView>(null);
  const q = p.questions[i];
  const n = p.questions.length;

  useEffect(() => {
    p.onState?.({ index: i, picked, done, score, missed });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [i, picked, done, score, missed]);

  const pick = (k: number) => {
    if (!q || picked !== null) return;
    setPicked(k);
    if (k === q.a) setScore((s) => s + 1);
    else setMissed((m) => [...m, i]);
    setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 50);
  };
  const next = () => {
    if (picked === null) return;
    if (i + 1 < n) {
      setI(i + 1);
      setPicked(null);
      scroll.current?.scrollTo({ y: 0, animated: false });
    } else setDone(true);
  };
  if (p.answerRef) p.answerRef.current = pick;
  if (p.nextRef) p.nextRef.current = next;

  const state = (k: number) => (picked === null ? 'idle' : k === picked ? (k === q!.a ? 'right' : 'wrong') : k === q!.a ? 'answer' : 'dim');
  const firstMiss = missed.length ? p.questions[missed[0]!] : null;

  return (
    <Ground>
      <View style={{ flex: 1, paddingTop: insets.top, paddingBottom: insets.bottom }}>
        <Bar title="Quiz" onBack={p.onClose} backIcon="x" backLabel="Close quiz" right={!done && n > 0 ? <Pill label={`${i + 1}/${n}`} /> : undefined} />
        <ScrollView ref={scroll} contentContainerStyle={{ gap: 14, paddingTop: 6, paddingHorizontal: 20, paddingBottom: 22 }}>
          {p.loading && <Note>writing your questions…</Note>}
          {!!p.error && <T>{p.error}</T>}
          {!done && q && (
            <>
              <T v="quizQ" accessibilityRole="header" style={{ marginVertical: 8 }}>
                {q.q}
              </T>
              <View style={{ gap: 10 }}>
                {q.opts.map((o, k) => (
                  <Option key={`${i}-${k}`} letter={'ABCD'[k]!} text={o} state={state(k)} onPress={() => pick(k)} />
                ))}
              </View>
              {picked !== null && (
                <View style={{ gap: 10 }} accessibilityLiveRegion="polite">
                  <T style={{ marginTop: 6, marginBottom: 4 }}>{q.why}</T>
                  <Btn label={i + 1 < n ? 'Next question' : 'See my score'} wide onPress={next} />
                </View>
              )}
            </>
          )}
          {done && (
            <View style={{ gap: 14 }}>
              <Text style={[type.score, { marginTop: 26 }]} accessibilityLabel={`You scored ${score} out of ${n}`}>
                <T v="score">{score}</T>
                <T v="xl" muted style={{ letterSpacing: 0 }}>
                  /{n}
                </T>
              </Text>
              <T v="l">{score === n ? `${n === 2 ? 'Both right.' : n === 3 ? 'All three.' : 'Full marks.'} That stuck.` : score ? 'Nearly there.' : 'Worth another look.'}</T>
              {firstMiss ? (
                <>
                  <Note arrow>one to revisit: {firstMiss.tag}</Note>
                  <Btn label="Explain that one another way" wide onPress={() => p.onReexplain(firstMiss)} />
                </>
              ) : (
                <Note>nothing to revisit</Note>
              )}
              <Btn label="Back to Home" variant="paper" wide onPress={p.onHome} />
            </View>
          )}
        </ScrollView>
      </View>
    </Ground>
  );
}
