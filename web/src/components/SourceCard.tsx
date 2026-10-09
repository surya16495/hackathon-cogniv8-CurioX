import type { Source } from '@curiox/shared';

function hostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

export default function SourceCard({ source }: { source: Source }) {
  const demo = source.title.startsWith('Demo source');
  return (
    <a
      href={source.url}
      target="_blank"
      rel="noopener noreferrer"
      title={source.snippet || source.title}
      className="group flex w-56 shrink-0 flex-col gap-1 rounded-xl border border-slate-200 bg-white p-3 text-left shadow-sm transition hover:border-brand-300 hover:shadow focus-visible:outline-2 focus-visible:outline-brand-500 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-brand-700"
    >
      <span className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
        <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-brand-100 px-1 text-[11px] font-semibold text-brand-700 dark:bg-brand-900 dark:text-brand-200">
          {source.id}
        </span>
        <span className="truncate">{hostname(source.url)}</span>
        {demo && <span className="ml-auto rounded bg-amber-100 px-1.5 text-[10px] font-medium text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">demo</span>}
      </span>
      <span className="line-clamp-2 text-sm font-medium text-slate-800 group-hover:text-brand-700 dark:text-slate-100 dark:group-hover:text-brand-300">
        {source.title}
      </span>
    </a>
  );
}

export function SourceList({ sources }: { sources: Source[] }) {
  if (!sources.length) return null;
  return (
    <div className="mt-3">
      <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">Sources</p>
      <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {sources.map((s) => (
          <SourceCard key={`${s.id}-${s.url}`} source={s} />
        ))}
      </div>
    </div>
  );
}
