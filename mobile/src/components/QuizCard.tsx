import { Pressable, Text, View } from 'react-native';
import type { QuizItem } from '../hooks/useChatStream';
import { useColors } from '../theme';
import { Badge, Button, Skeleton } from './ui';

interface Props {
  item: QuizItem;
  onAnswer: (question: number, option: number) => void;
  onRetry?: () => void;
}

export default function QuizCard({ item, onAnswer, onRetry }: Props) {
  const c = useColors();
  const shell = { backgroundColor: c.accentBg, borderColor: c.citeBg, borderWidth: 1, borderRadius: 18, padding: 14, gap: 10 } as const;

  if (item.status === 'loading') {
    return (
      <View style={shell} accessibilityLabel="Writing your quiz">
        <Text style={{ color: c.accentText, fontWeight: '600' }}>🧠 Writing your quiz…</Text>
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} height={40} />
        ))}
      </View>
    );
  }

  if (item.status === 'error' || !item.quiz) {
    return (
      <View style={shell}>
        <Text style={{ color: c.dangerText }}>{item.error ?? 'Could not make a quiz.'}</Text>
        {onRetry && <Button label="Try again" onPress={onRetry} style={{ alignSelf: 'flex-start', paddingVertical: 8 }} />}
      </View>
    );
  }

  const { quiz, answers } = item;
  const answered = Object.keys(answers).length;
  const score = quiz.questions.reduce((n, q, i) => n + (answers[i] === q.answerIndex ? 1 : 0), 0);
  const finished = answered === quiz.questions.length;

  return (
    <View style={shell} accessibilityLabel={`Quiz: ${quiz.topic}`}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <Text style={{ color: c.accentText, fontWeight: '700', fontSize: 15, flexShrink: 1 }}>🧠 Quiz: {quiz.topic.replace(/ \(demo quiz\)$/, '')}</Text>
        {quiz.provider === 'demo' && <Badge label="demo quiz" />}
        <Text style={{ color: c.muted, fontSize: 12, marginLeft: 'auto' }}>
          {answered}/{quiz.questions.length}
        </Text>
      </View>

      {quiz.questions.map((q, qi) => {
        const picked = answers[qi];
        const done = picked !== undefined;
        return (
          <View key={qi} style={{ gap: 6 }}>
            <Text style={{ color: c.text, fontSize: 15, fontWeight: '600' }}>
              {qi + 1}. {q.question}
            </Text>
            {q.options.map((opt, oi) => {
              const correct = oi === q.answerIndex;
              const state = !done ? 'idle' : correct ? 'correct' : oi === picked ? 'wrong' : 'other';
              const look = {
                idle: { bg: c.card, border: c.border, fg: c.text },
                correct: { bg: c.successBg, border: c.successBorder, fg: c.text },
                wrong: { bg: c.dangerBg, border: c.danger, fg: c.text },
                other: { bg: c.card, border: c.border, fg: c.muted },
              }[state];
              return (
                <Pressable
                  key={oi}
                  accessibilityRole="button"
                  accessibilityLabel={`Option ${String.fromCharCode(65 + oi)}: ${opt}${state === 'correct' ? ', correct' : state === 'wrong' ? ', your answer, incorrect' : ''}`}
                  disabled={done || item.ended}
                  onPress={() => onAnswer(qi, oi)}
                  style={{ flexDirection: 'row', gap: 8, padding: 11, borderRadius: 12, borderWidth: 1, backgroundColor: look.bg, borderColor: look.border }}
                >
                  <Text style={{ color: look.fg, fontWeight: '700' }}>{String.fromCharCode(65 + oi)}.</Text>
                  <Text style={{ color: look.fg, flex: 1 }}>{opt}</Text>
                  {state === 'correct' && <Text style={{ color: c.success }}>✓</Text>}
                  {state === 'wrong' && <Text style={{ color: c.danger }}>✗</Text>}
                </Pressable>
              );
            })}
            {done && (
              <Text style={{ color: c.muted, fontSize: 14 }}>
                <Text style={{ fontWeight: '700', color: c.text }}>{picked === q.answerIndex ? 'Correct! ' : 'Not quite. '}</Text>
                {q.explanation}
              </Text>
            )}
          </View>
        );
      })}

      {item.ended && !finished && <Text style={{ color: c.muted, textAlign: 'center' }}>Quiz ended.</Text>}
      {finished && (
        <Text style={{ backgroundColor: c.card, color: c.accentText, fontWeight: '700', textAlign: 'center', padding: 10, borderRadius: 12, overflow: 'hidden' }}>
          You scored {score}/{quiz.questions.length} {score === quiz.questions.length ? '🎉' : score >= quiz.questions.length / 2 ? '👏' : '💪 Try "Simplify" and quiz again.'}
        </Text>
      )}
    </View>
  );
}
