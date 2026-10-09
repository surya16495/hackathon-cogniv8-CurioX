import { useCallback, useEffect, useRef, useState } from 'react';
import { LIMITS, type OnboardingResponse, type Profile } from '@curiox/shared';
import { ApiError, api } from '../api/client';
import Composer from '../components/Composer';
import { Logo } from '../components/Logo';
import { useSession } from '../hooks/useSession';

interface Turn {
  id: number;
  role: 'curiox' | 'you';
  text: string;
  skipped?: boolean;
}

type Stage = 'intro' | 'asking' | 'finished';

export default function Welcome() {
  const { session, update } = useSession();
  const [stage, setStage] = useState<Stage>(session?.onboarding.status === 'in_progress' ? 'asking' : 'intro');
  const [turns, setTurns] = useState<Turn[]>([]);
  const [state, setState] = useState<OnboardingResponse | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const turnId = useRef(0);
  const bottom = useRef<HTMLDivElement>(null);

  const push = (t: Omit<Turn, 'id'>) => setTurns((list) => [...list, { ...t, id: ++turnId.current }]);

  const call = useCallback(async (body: Parameters<typeof api.onboarding>[0]) => {
    setPending(true);
    setError(null);
    try {
      let res: OnboardingResponse;
      try {
        res = await api.onboarding(body);
      } catch (err) {
        // Another tab or a double tap moved onboarding on: fetch where we are now.
        if (err instanceof ApiError && err.status === 409) res = await api.onboarding({});
        else throw err;
      }
      setState(res);
      if (res.question) {
        push({ role: 'curiox', text: res.question.text });
        setStage('asking');
      } else {
        setStage('finished');
      }
      return res;
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');
      return null;
    } finally {
      setPending(false);
    }
  }, []);

  // Resume an onboarding that was interrupted by a refresh.
  const resumed = useRef(false);
  useEffect(() => {
    if (stage === 'asking' && !resumed.current) {
      resumed.current = true;
      void call({});
    }
  }, [stage, call]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [turns, pending, stage]);

  const answer = (text: string) => {
    push({ role: 'you', text });
    void call({ message: text });
  };
  const skipQuestion = () => {
    push({ role: 'you', text: 'Skipped', skipped: true });
    void call({ skip: 'question' });
  };

  if (stage === 'intro') {
    return (
      <main className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center px-6 py-10">
        <Logo size={64} />
        <h1 className="mt-6 text-3xl font-bold tracking-tight sm:text-4xl">Learn anything, your way.</h1>
        <p className="mt-3 text-lg text-slate-600 dark:text-slate-300">
          CurioX gets to know how you like to learn, then explains anything with live sources, quick quizzes and one-tap ways to go simpler or deeper.
        </p>
        <ul className="mt-6 space-y-2 text-slate-700 dark:text-slate-300">
          <li>💬 Six quick questions so answers fit you</li>
          <li>🔎 Up-to-date answers with clickable sources</li>
          <li>🧠 Quizzes on whatever you just learned</li>
        </ul>
        {error && <p className="mt-4 text-sm text-red-600 dark:text-red-400">{error}</p>}
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <button
            disabled={pending}
            onClick={() => {
              resumed.current = true;
              void call({});
            }}
            className="rounded-xl bg-brand-600 px-6 py-3 text-base font-semibold text-white shadow-sm hover:bg-brand-700 disabled:opacity-60"
          >
            {pending ? 'Starting…' : "Let's get started"}
          </button>
          <button
            disabled={pending}
            onClick={() => void call({ skip: 'all' })}
            className="rounded-xl px-6 py-3 text-base font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-60 dark:text-slate-300 dark:hover:bg-slate-900"
          >
            Skip, just let me explore
          </button>
        </div>
        <p className="mt-6 text-xs text-slate-500">No sign-up. Your profile is tied to this device and you can clear it anytime.</p>
      </main>
    );
  }

  if (stage === 'finished' && state?.profile) {
    return <ProfileReady profile={state.profile} onStart={() => update(state.profile!, state.onboarding)} onRestart={() => { setTurns([]); void call({ restart: true }); }} />;
  }

  const step = state?.onboarding.step ?? 0;
  const total = state?.onboarding.totalSteps ?? 6;

  return (
    <main className="mx-auto flex h-dvh max-w-2xl flex-col">
      <header className="flex items-center gap-3 border-b border-slate-200 px-4 py-3 dark:border-slate-800">
        <Logo size={28} />
        <div className="flex-1">
          <p className="text-sm font-semibold">Getting to know you</p>
          <div className="mt-1 flex gap-1" aria-label={`Question ${Math.min(step + 1, total)} of ${total}`}>
            {Array.from({ length: total }, (_, i) => (
              <span key={i} className={`h-1.5 flex-1 rounded-full ${i < step ? 'bg-brand-600' : i === step ? 'bg-brand-300' : 'bg-slate-200 dark:bg-slate-800'}`} />
            ))}
          </div>
        </div>
        <button onClick={() => void call({ skip: 'all' })} disabled={pending} className="text-sm text-slate-500 hover:text-slate-800 disabled:opacity-50 dark:hover:text-slate-200">
          Finish now
        </button>
      </header>

      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {turns.map((t) =>
          t.role === 'curiox' ? (
            <div key={t.id} className="flex items-end gap-2">
              <Logo size={24} className="shrink-0" />
              <p className="max-w-[85%] rounded-2xl rounded-bl-md border border-slate-200 bg-white px-4 py-2.5 text-[15px] shadow-sm dark:border-slate-800 dark:bg-slate-900">{t.text}</p>
            </div>
          ) : (
            <div key={t.id} className="flex justify-end">
              <p className={`max-w-[85%] rounded-2xl rounded-br-md px-4 py-2.5 text-[15px] ${t.skipped ? 'italic text-slate-500 bg-slate-100 dark:bg-slate-800' : 'bg-brand-600 text-white'}`}>{t.text}</p>
            </div>
          ),
        )}
        {pending && (
          <div className="flex items-center gap-2 pl-8 text-slate-400" role="status" aria-label="CurioX is typing">
            {[0, 1, 2].map((i) => (
              <span key={i} className="typing-dot h-2 w-2 rounded-full bg-current" style={{ animationDelay: `${i * 0.15}s` }} />
            ))}
          </div>
        )}
        {error && (
          <div className="flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/50 dark:text-red-300">
            {error}
            <button onClick={() => void call({})} className="ml-auto font-semibold underline">
              Retry
            </button>
          </div>
        )}
        <div ref={bottom} />
      </div>

      <footer className="border-t border-slate-200 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] dark:border-slate-800">
        <Composer busy={pending} disabled={!state?.question} maxLength={LIMITS.onboardingAnswerMaxChars} placeholder="Type your answer…" autoFocus onSend={answer} />
        <button onClick={skipQuestion} disabled={pending || !state?.question} className="mt-2 text-sm text-slate-500 hover:text-slate-800 disabled:opacity-50 dark:hover:text-slate-200">
          Skip this question
        </button>
      </footer>
    </main>
  );
}

function ProfileReady({ profile, onStart, onRestart }: { profile: Profile; onStart: () => void; onRestart: () => void }) {
  const chips = (items: string[]) => (
    <div className="mt-1 flex flex-wrap gap-1.5">
      {items.map((i) => (
        <span key={i} className="rounded-full bg-brand-50 px-2.5 py-1 text-sm text-brand-800 dark:bg-brand-950 dark:text-brand-200">
          {i}
        </span>
      ))}
    </div>
  );
  const empty = !profile.interests.length && !profile.goals.length && !profile.curiosities.length && !profile.explanationStyle && !profile.tone;
  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center px-6 py-10">
      <Logo size={48} />
      <h1 className="mt-5 text-2xl font-bold">{empty ? "No problem, let's explore!" : "Here's what I learned about you"}</h1>
      {empty ? (
        <p className="mt-2 text-slate-600 dark:text-slate-300">I'll adapt as we go. You can fill in your profile anytime.</p>
      ) : (
        <dl className="mt-5 space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          {profile.interests.length > 0 && (
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Interests</dt>
              <dd>{chips(profile.knowledgeLevels.length ? profile.knowledgeLevels.map((k) => `${k.topic} · ${k.level}`) : profile.interests)}</dd>
            </div>
          )}
          {profile.goals.length > 0 && (
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Goals</dt>
              <dd>{chips(profile.goals)}</dd>
            </div>
          )}
          {(profile.explanationStyle || profile.tone) && (
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">How I'll explain</dt>
              <dd className="mt-1 text-sm">{[profile.explanationStyle, profile.tone].filter(Boolean).join(' · ')}</dd>
            </div>
          )}
          {profile.curiosities.length > 0 && (
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Curious about</dt>
              <dd>{chips(profile.curiosities)}</dd>
            </div>
          )}
        </dl>
      )}
      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <button onClick={onStart} className="rounded-xl bg-brand-600 px-6 py-3 font-semibold text-white shadow-sm hover:bg-brand-700">
          Start learning →
        </button>
        <button onClick={onRestart} className="rounded-xl px-6 py-3 font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-900">
          Start over
        </button>
      </div>
    </main>
  );
}
