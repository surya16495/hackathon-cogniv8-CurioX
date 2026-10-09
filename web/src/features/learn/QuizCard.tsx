import { useState } from 'react';
import type { QuizItem } from '../../hooks/useChatStream';

export default function QuizCard({ item, onRetry }: { item: QuizItem; onRetry?: () => void }) {
  const [answers, setAnswers] = useState<Record<number, number>>({});

  const shell = 'rounded-2xl border border-brand-200 bg-brand-50/60 p-4 shadow-sm dark:border-brand-900 dark:bg-brand-950/40';

  if (item.status === 'loading') {
    return (
      <div className={shell} role="status">
        <p className="text-sm font-medium text-brand-700 dark:text-brand-200">🧠 Writing your quiz…</p>
        <div className="mt-3 space-y-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-10 animate-pulse rounded-lg bg-white/70 dark:bg-slate-800" />
          ))}
        </div>
      </div>
    );
  }

  if (item.status === 'error' || !item.quiz) {
    return (
      <div className={`${shell} flex items-center gap-2 text-sm`}>
        <span className="text-red-700 dark:text-red-300">{item.error ?? 'Could not make a quiz.'}</span>
        {onRetry && (
          <button onClick={onRetry} className="ml-auto rounded-md bg-brand-600 px-2.5 py-1 text-xs font-semibold text-white">
            Try again
          </button>
        )}
      </div>
    );
  }

  const { quiz } = item;
  const answered = Object.keys(answers).length;
  const score = quiz.questions.reduce((n, q, i) => n + (answers[i] === q.answerIndex ? 1 : 0), 0);
  const finished = answered === quiz.questions.length;

  return (
    <section className={shell} aria-label={`Quiz: ${quiz.topic}`}>
      <header className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-semibold text-brand-800 dark:text-brand-100">🧠 Quiz: {quiz.topic.replace(/ \(demo quiz\)$/, '')}</h3>
        {quiz.provider === 'demo' && (
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">demo quiz</span>
        )}
        <span className="ml-auto text-xs text-slate-500 dark:text-slate-400">
          {answered}/{quiz.questions.length} answered
        </span>
      </header>

      <ol className="mt-3 space-y-4">
        {quiz.questions.map((q, qi) => {
          const picked = answers[qi];
          const done = picked !== undefined;
          return (
            <li key={qi}>
              <p className="text-[15px] font-medium text-slate-800 dark:text-slate-100">
                {qi + 1}. {q.question}
              </p>
              <div className="mt-2 grid gap-1.5">
                {q.options.map((opt, oi) => {
                  const correct = oi === q.answerIndex;
                  const state = !done ? 'idle' : correct ? 'correct' : oi === picked ? 'wrong' : 'other';
                  const style = {
                    idle: 'border-slate-200 bg-white hover:border-brand-300 dark:border-slate-700 dark:bg-slate-900',
                    correct: 'border-emerald-400 bg-emerald-50 text-emerald-900 dark:border-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-100',
                    wrong: 'border-red-300 bg-red-50 text-red-900 dark:border-red-700 dark:bg-red-950/50 dark:text-red-100',
                    other: 'border-slate-200 bg-white opacity-60 dark:border-slate-800 dark:bg-slate-900',
                  }[state];
                  return (
                    <button
                      key={oi}
                      disabled={done}
                      onClick={() => setAnswers((a) => ({ ...a, [qi]: oi }))}
                      className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-left text-sm transition ${style}`}
                    >
                      <span className="font-semibold">{String.fromCharCode(65 + oi)}.</span>
                      <span className="flex-1">{opt}</span>
                      {state === 'correct' && <span aria-label="correct">✓</span>}
                      {state === 'wrong' && <span aria-label="your answer, incorrect">✗</span>}
                    </button>
                  );
                })}
              </div>
              {done && (
                <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                  <strong>{picked === q.answerIndex ? 'Correct! ' : 'Not quite. '}</strong>
                  {q.explanation}
                </p>
              )}
            </li>
          );
        })}
      </ol>

      {finished && (
        <p className="mt-4 rounded-lg bg-white px-3 py-2 text-center text-sm font-semibold text-brand-800 dark:bg-slate-900 dark:text-brand-100">
          You scored {score}/{quiz.questions.length} {score === quiz.questions.length ? '🎉' : score >= quiz.questions.length / 2 ? '👏' : '💪 Try "Simplify" and quiz again.'}
        </p>
      )}
    </section>
  );
}
