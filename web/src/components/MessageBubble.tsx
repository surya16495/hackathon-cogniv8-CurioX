import { learnActionLabel } from '@curiox/shared';
import type { UiMessage } from '../hooks/useChatStream';
import { Markdown } from './Markdown';
import { SourceList } from './SourceCard';

const DEMO_PREFIX = /^_Demo answer:[^\n]*_\s*/;

interface Props {
  message: UiMessage;
  onRetry?: () => void;
}

export default function MessageBubble({ message, onRetry }: Props) {
  if (message.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-br-md bg-brand-600 px-4 py-2.5 text-[15px] text-white shadow-sm">
          {message.action && (
            <span className="mb-1 inline-block rounded-full bg-white/20 px-2 py-0.5 text-xs font-medium">✨ {learnActionLabel(message.action)}</span>
          )}
          {message.content && <p className="whitespace-pre-wrap break-words">{message.content}</p>}
        </div>
      </div>
    );
  }

  const demo = message.provider === 'demo' || DEMO_PREFIX.test(message.content);
  const text = message.content.replace(DEMO_PREFIX, '');
  const waiting = message.streaming && !text;

  return (
    <div className="flex justify-start">
      <div className="w-full max-w-[92%] rounded-2xl rounded-bl-md border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        {demo && (
          <span className="mb-2 inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">
            Demo answer: AI models are offline right now
          </span>
        )}
        {waiting ? (
          <div className="h-5 w-24 animate-pulse rounded bg-slate-100 dark:bg-slate-800" aria-label="Waiting for the answer" />
        ) : (
          <div className={`prose-answer ${message.streaming ? 'cursor-blink' : ''}`}>
            <Markdown text={text} sources={message.sources} />
          </div>
        )}
        <SourceList sources={message.sources} />
        {message.stopped && <p className="mt-2 text-xs text-slate-500">Stopped.</p>}
        {message.error && (
          <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/50 dark:text-red-300">
            <span>{message.error}</span>
            {onRetry && (
              <button onClick={onRetry} className="ml-auto rounded-md bg-red-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-red-700">
                Try again
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
