import type { ChatStatus } from '../hooks/useChatStream';

const ICON: Record<ChatStatus['stage'], string> = {
  thinking: '💭',
  searching: '🔎',
  writing: '✍️',
  retrying: '🔁',
};

export default function StatusLine({ status }: { status: ChatStatus | null }) {
  if (!status) return null;
  return (
    <div role="status" aria-live="polite" className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
      <span aria-hidden="true">{ICON[status.stage]}</span>
      <span className="truncate">{status.message}</span>
      <span className="flex gap-0.5" aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <span key={i} className="typing-dot h-1 w-1 rounded-full bg-current" style={{ animationDelay: `${i * 0.15}s` }} />
        ))}
      </span>
    </div>
  );
}
