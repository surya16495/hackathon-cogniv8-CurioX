import { useEffect, useState } from 'react';
import type { SuggestedTopic } from '@curiox/shared';
import { api } from '../api/client';

export default function TopicChips({ onPick }: { onPick: (prompt: string) => void }) {
  const [topics, setTopics] = useState<SuggestedTopic[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api
      .topics()
      .then((r) => !cancelled && setTopics(r.topics))
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, []);

  if (failed) return null;

  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {topics === null
        ? Array.from({ length: 4 }, (_, i) => <div key={i} className="h-[72px] animate-pulse rounded-xl bg-slate-200/70 dark:bg-slate-800" />)
        : topics.map((t) => (
            <button
              key={t.title}
              onClick={() => onPick(t.prompt)}
              className="rounded-xl border border-slate-200 bg-white p-3 text-left shadow-sm transition hover:border-brand-300 hover:shadow dark:border-slate-800 dark:bg-slate-900 dark:hover:border-brand-700"
            >
              <span className="block text-sm font-semibold text-slate-800 dark:text-slate-100">{t.title}</span>
              {t.prompt.trim().toLowerCase() !== t.title.trim().toLowerCase() && (
                <span className="mt-0.5 line-clamp-2 block text-sm text-slate-500 dark:text-slate-400">{t.prompt}</span>
              )}
            </button>
          ))}
    </div>
  );
}
