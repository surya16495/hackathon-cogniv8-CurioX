import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import ActionChips from '../components/ActionChips';
import Composer from '../components/Composer';
import { Logo } from '../components/Logo';
import MessageBubble from '../components/MessageBubble';
import StatusLine from '../components/StatusLine';
import TopicChips from '../components/TopicChips';
import QuizCard from '../features/learn/QuizCard';
import { useChatStream, type UiMessage } from '../hooks/useChatStream';
import { useSession } from '../hooks/useSession';

export default function Chat() {
  const { session, health } = useSession();
  const chat = useChatStream();
  const scroller = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);

  // Follow the answer as it streams, unless the reader scrolled up to read something.
  useEffect(() => {
    const el = scroller.current;
    if (el && stickToBottom.current) el.scrollTop = el.scrollHeight;
  }, [chat.items, chat.status]);

  const onScroll = () => {
    const el = scroller.current;
    if (el) stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
  };

  const send = (message: string) => {
    stickToBottom.current = true;
    void chat.send({ message });
  };

  const lastIndex = chat.items.length - 1;
  // Actions follow the latest answer, so they stay available under a finished quiz too.
  const lastMessage = [...chat.items].reverse().find((i): i is UiMessage => i.kind === 'message');
  const quizLoading = chat.items.some((i) => i.kind === 'quiz' && i.status === 'loading');
  const showActions =
    !chat.busy && !quizLoading && lastMessage?.role === 'assistant' && !lastMessage.error && !lastMessage.streaming && lastMessage.content.length > 0;
  const lastUserTopic = [...chat.items].reverse().find((i): i is UiMessage => i.kind === 'message' && i.role === 'user' && !!i.content)?.content;
  const personalized = Boolean(session?.profile.interests.length);

  return (
    <div className="mx-auto flex h-dvh max-w-3xl flex-col">
      <header className="flex items-center gap-2 border-b border-slate-200 bg-slate-50/90 px-4 py-2.5 backdrop-blur dark:border-slate-800 dark:bg-slate-950/90">
        <Logo size={28} />
        <span className="text-lg font-bold tracking-tight">CurioX</span>
        {health?.demoMode && (
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">demo mode</span>
        )}
        <div className="ml-auto flex items-center gap-1">
          <button
            onClick={() => chat.newChat()}
            disabled={chat.busy || !chat.items.length}
            className="rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-200/60 disabled:opacity-40 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            New chat
          </button>
          <Link to="/profile" aria-label="Your profile" className="rounded-lg p-1.5 text-slate-600 hover:bg-slate-200/60 dark:text-slate-300 dark:hover:bg-slate-800">
            <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
              <circle cx="12" cy="8" r="4" />
              <path d="M4 21c0-4 4-6 8-6s8 2 8 6" strokeLinecap="round" />
            </svg>
          </Link>
        </div>
      </header>

      <main ref={scroller} onScroll={onScroll} className="flex-1 overflow-y-auto px-4 py-4">
        {chat.loadingHistory ? (
          <div className="space-y-3" aria-label="Loading conversation">
            {[0, 1, 2].map((i) => (
              <div key={i} className={`h-14 animate-pulse rounded-2xl bg-slate-200/70 dark:bg-slate-800 ${i % 2 ? 'ml-auto w-2/3' : 'w-5/6'}`} />
            ))}
          </div>
        ) : chat.items.length === 0 ? (
          <div className="mx-auto max-w-xl pt-6 sm:pt-12">
            <h1 className="text-2xl font-bold tracking-tight">What are you curious about today?</h1>
            <p className="mt-1 text-slate-600 dark:text-slate-400">
              {personalized ? 'Here are some topics picked for you, or ask anything.' : 'Pick a topic or ask anything.'}
            </p>
            <div className="mt-5">
              <TopicChips onPick={send} />
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {chat.items.map((item, i) =>
              item.kind === 'quiz' ? (
                <QuizCard key={item.id} item={item} onRetry={() => void chat.startQuiz(lastUserTopic)} />
              ) : (
                <MessageBubble key={item.id} message={item} onRetry={i === lastIndex ? chat.retryLast : undefined} />
              ),
            )}
          </div>
        )}
      </main>

      <footer className="space-y-2 border-t border-slate-200 bg-slate-50 px-4 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] dark:border-slate-800 dark:bg-slate-950">
        {chat.busy && <StatusLine status={chat.status ?? { stage: 'writing', message: 'Writing…' }} />}
        {showActions && (
          <ActionChips
            disabled={chat.busy}
            onAction={(action) => {
              stickToBottom.current = true;
              void chat.send({ action });
            }}
            onQuiz={() => {
              stickToBottom.current = true;
              void chat.startQuiz(lastUserTopic);
            }}
          />
        )}
        <Composer busy={chat.busy} onSend={send} onStop={chat.stop} placeholder={chat.items.length ? 'Ask a follow-up…' : 'Ask anything…'} />
      </footer>
    </div>
  );
}
