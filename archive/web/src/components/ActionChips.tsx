import { LEARN_ACTIONS, type LearnActionId } from '@curiox/shared';

const ICON: Record<LearnActionId, string> = {
  simplify: '🪶',
  go_deeper: '🔬',
  real_world_example: '🌍',
  challenge_me: '🎯',
  compare_perspectives: '⚖️',
};

interface Props {
  disabled?: boolean;
  onAction: (id: LearnActionId) => void;
  onQuiz: () => void;
}

export default function ActionChips({ disabled, onAction, onQuiz }: Props) {
  const chip =
    'shrink-0 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm transition hover:border-brand-300 hover:text-brand-700 disabled:opacity-50 disabled:hover:border-slate-200 disabled:hover:text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-brand-600 dark:hover:text-brand-300';
  return (
    <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 py-1" role="toolbar" aria-label="Learn actions">
      {LEARN_ACTIONS.map((a) => (
        <button key={a.id} className={chip} disabled={disabled} onClick={() => onAction(a.id)}>
          <span aria-hidden="true">{ICON[a.id]}</span> {a.label}
        </button>
      ))}
      <button className={`${chip} border-brand-200 bg-brand-50 text-brand-700 dark:border-brand-800 dark:bg-brand-950 dark:text-brand-200`} disabled={disabled} onClick={onQuiz}>
        <span aria-hidden="true">🧠</span> Quiz me
      </button>
    </div>
  );
}
