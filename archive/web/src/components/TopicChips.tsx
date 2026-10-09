import type { SuggestedTopic } from '@curiox/shared';

/** `topics`: null while loading, [] if they could not be loaded. */
export default function TopicChips({ topics, onPick }: { topics: SuggestedTopic[] | null; onPick: (prompt: string) => void }) {
  if (topics?.length === 0) return null;

  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {topics === null
        ? Array.from({ length: 4 }, (_, i) => <div key={i} className="h-[72px] animate-pulse rounded-xl bg-slate-200/70 dark:bg-slate-800" />)
        : topics.map((t, i) => (
            <button
              key={t.title}
              onClick={() => onPick(t.prompt)}
              className="rounded-xl border border-slate-200 bg-white p-3 text-left shadow-sm transition hover:border-brand-300 hover:shadow dark:border-slate-800 dark:bg-slate-900 dark:hover:border-brand-700"
            >
              <span className="block text-sm font-semibold text-slate-800 dark:text-slate-100">
                <span className="mr-1.5 text-xs font-medium text-brand-600 dark:text-brand-300" aria-hidden="true">
                  {i + 1}
                </span>
                {t.title}
              </span>
              {t.prompt.trim().toLowerCase() !== t.title.trim().toLowerCase() && (
                <span className="mt-0.5 line-clamp-2 block text-sm text-slate-500 dark:text-slate-400">{t.prompt}</span>
              )}
            </button>
          ))}
    </div>
  );
}
