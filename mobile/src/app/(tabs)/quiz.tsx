import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import type { DeckQuizQuestion } from '@curiox/shared';
import { ApiError, api } from '@/api/client';
import { useZine } from '@/hooks/useZine';
import { QuizScreen } from '@/screens/QuizScreen';

export default function QuizRoute() {
  const router = useRouter();
  const { deck: deckId, conversation } = useLocalSearchParams<{ deck?: string; conversation?: string }>();
  const z = useZine();
  const [questions, setQuestions] = useState<DeckQuizQuestion[]>(() => (deckId ? z.deck(deckId)?.quiz ?? [] : []));
  const [loading, setLoading] = useState(!questions.length);
  const [error, setError] = useState<string | null>(null);

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

  return <QuizScreen questions={questions} loading={loading} error={error} onClose={close} onHome={() => router.replace('/home')} onReexplain={reexplain} />;
}
