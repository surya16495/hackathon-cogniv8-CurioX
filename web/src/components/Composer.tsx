import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { LIMITS } from '@curiox/shared';

interface Props {
  busy: boolean;
  disabled?: boolean;
  placeholder?: string;
  maxLength?: number;
  autoFocus?: boolean;
  onSend: (text: string) => void;
  onStop?: () => void;
}

export default function Composer({ busy, disabled, placeholder = 'Ask anything…', maxLength = LIMITS.messageMaxChars, autoFocus, onSend, onStop }: Props) {
  const [text, setText] = useState('');
  const ref = useRef<HTMLTextAreaElement>(null);

  // Grow with the content up to about 6 lines.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [text]);

  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    const value = text.trim();
    if (!value || busy || disabled) return;
    onSend(value);
    setText('');
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter sends, Shift+Enter adds a line. Ignore Enter while an IME is composing.
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit();
    }
  };

  const nearLimit = text.length > maxLength * 0.9;

  return (
    <form onSubmit={submit} className="flex items-end gap-2 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm focus-within:border-brand-400 dark:border-slate-700 dark:bg-slate-900">
      <label className="sr-only" htmlFor="composer">
        Message
      </label>
      <textarea
        id="composer"
        ref={ref}
        rows={1}
        value={text}
        maxLength={maxLength}
        autoFocus={autoFocus}
        disabled={disabled}
        placeholder={placeholder}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={onKeyDown}
        enterKeyHint="send"
        className="max-h-40 min-h-[40px] flex-1 resize-none bg-transparent px-2 py-2 text-[16px] outline-none placeholder:text-slate-400 disabled:opacity-60"
      />
      {nearLimit && <span className="self-center text-xs text-slate-400">{maxLength - text.length}</span>}
      {busy && onStop ? (
        <button type="button" onClick={onStop} aria-label="Stop answering" className="h-10 w-10 shrink-0 rounded-xl bg-slate-800 text-white hover:bg-slate-700 dark:bg-slate-200 dark:text-slate-900">
          <span className="mx-auto block h-3 w-3 rounded-sm bg-current" />
        </button>
      ) : (
        <button
          type="submit"
          aria-label="Send"
          disabled={!text.trim() || busy || disabled}
          className="h-10 w-10 shrink-0 rounded-xl bg-brand-600 text-white transition hover:bg-brand-700 disabled:bg-slate-300 dark:disabled:bg-slate-700"
        >
          <svg viewBox="0 0 24 24" className="mx-auto h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
        </button>
      )}
    </form>
  );
}
