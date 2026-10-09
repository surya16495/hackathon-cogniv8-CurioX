import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import type { DeckQuizQuestion } from '@curiox/shared';
import { ApiError, api } from '@/api/client';
import { useZine } from '@/hooks/useZine';
import { QuizScreen } from '@/screens/QuizScreen';
import { MicFab } from '@/voice/VoiceControls';
import { useVoiceScreen } from '@/voice/VoiceProvider';

type State = { index: number; picked: number | null; done: boolean; score: number; missed: number[] };

export default function QuizRoute() {
  const router = useRouter();
  const { deck: deckId, conversation } = useLocalSearchParams<{ deck?: string; conversation?: string }>();
  const z = useZine();
  const [questions, setQuestions] = useState<DeckQuizQuestion[]>(() => (deckId ? z.deck(deckId)?.quiz ?? [] : []));
  const [loading, setLoading] = useState(!questions.length);
  const [error, setError] = useState<string | null>(null);
  const [st, setSt] = useState<State>({ index: 0, picked: null, done: false, score: 0, missed: [] });
  const answerRef = useRef<((i: number) => void) | null>(null);
  const nextRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (questions.length) return;
    (async () => {
      try {
        if (deckId) setQuestions((await z.fetchDeck(deckId)).quiz);
        else if (conversation) {
          const res = await api.quiz({ conversationId: conversation, count: 3 });
          setQuestions(res.questions.map((q) => ({ q: q.question, opts: q.options, a: q.answerIndex, why: q.explanation, tag: q.question.replace(/\?$/, '').toLowerCase(), re: q.explanation })));
        }
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Could not make a quiz right now.');
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const close = () => (router.canGoBack() ? router.back() : router.replace('/home'));
  const reexplain = (q: DeckQuizQuestion) => router.replace({ pathname: '/ask', params: { reQ: `Explain it another way: ${q.tag}`, reA: q.re } });

  const q = questions[st.index];
  const letters = 'ABCD';
  const intro = loading
    ? null
    : st.done
      ? `You got ${st.score} out of ${questions.length}. ${st.missed.length ? `One to revisit: ${questions[st.missed[0]!]!.tag}. Say explain that another way, or go home.` : 'Nothing to revisit. Say go home.'}`
      : q && st.picked === null
        ? `Question ${st.index + 1} of ${questions.length}. ${q.q} ${q.opts.map((o, k) => `${letters[k]}: ${o}.`).join(' ')}`
        : q
          ? `${st.picked === q.a ? 'Yes!' : `Not quite. It's ${letters[q.a]}: ${q.opts[q.a]}.`} ${q.why} Say next.`
          : null;

  useVoiceScreen({
    screen: 'quiz',
    intro,
    quizOptions: q && st.picked === null && !st.done ? q.opts : undefined,
    onCommand: (cmd) => {
      switch (cmd.type) {
        case 'quizAnswer':
          answerRef.current?.(cmd.index);
          return;
        case 'next':
          nextRef.current?.();
          return;
        case 'reexplain': {
          const miss = questions[st.missed[0] ?? -1];
          if (miss) reexplain(miss);
          return;
        }
        case 'close':
        case 'back':
          close();
          return;
        case 'goHome':
          router.replace('/home');
          return;
      }
      return false;
    },
  });

  return (
    <>
      <QuizScreen questions={questions} loading={loading} error={error} onClose={close} onHome={() => router.replace('/home')} onReexplain={reexplain} onState={setSt} answerRef={answerRef} nextRef={nextRef} />
      <MicFab />
    </>
  );
}
