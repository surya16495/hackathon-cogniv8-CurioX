import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { learnActionLabel, type SuggestedTopic } from '@curiox/shared';
import { api } from '../api/client';
import ActionChips from '../components/ActionChips';
import Composer from '../components/Composer';
import { Logo } from '../components/Logo';
import MessageBubble from '../components/MessageBubble';
import StatusLine from '../components/StatusLine';
import TopicChips from '../components/TopicChips';
import QuizCard from '../features/learn/QuizCard';
import { useChatStream, type ChatItem, type QuizItem, type UiMessage } from '../hooks/useChatStream';
import { useSession } from '../hooks/useSession';
import type { Command } from '../voice/commands';
import { speakOptions, toSpeech } from '../voice/speakable';
import { MicButton, VoiceToggle } from '../voice/VoiceControls';
import { useVoiceScreen } from '../voice/VoiceProvider';

function hostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return 'a website';
  }
}

/** The quiz waiting for answers, and its next unanswered question. */
function activeQuiz(items: ChatItem[]): { item: QuizItem; question: number } | null {
  const last = [...items].reverse().find((i): i is QuizItem => i.kind === 'quiz');
  if (!last || last.status !== 'ready' || !last.quiz || last.ended) return null;
  const question = last.quiz.questions.findIndex((_, qi) => last.answers[qi] === undefined);
  return question === -1 ? null : { item: last, question };
}

export default function Chat() {
  const { session, health } = useSession();
  const chat = useChatStream();
  const navigate = useNavigate();
  const scroller = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);
  const [topics, setTopics] = useState<SuggestedTopic[] | null>(null);
  const hintGiven = useRef(false);

  useEffect(() => {
    let cancelled = false;
    api
      .topics()
      .then((r) => !cancelled && setTopics(r.topics))
      .catch(() => !cancelled && setTopics([]));
    return () => {
      cancelled = true;
    };
  }, []);

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
  const quiz = activeQuiz(chat.items);

  // ---------------- Voice ----------------
  const emptyIntro =
    !chat.loadingHistory && chat.items.length === 0 && topics !== null
      ? topics.length
        ? `What are you curious about today? You could say topic one, ${topics[0]!.title}${topics[1] ? `; topic two, ${topics[1].title}` : ''}${topics[2] ? `; or topic three, ${topics[2].title}` : ''}. Or just ask me anything.`
        : 'What are you curious about today? Ask me anything.'
      : null;

  const answerQuiz = (item: QuizItem, question: number, option: number) => {
    if (!item.quiz || item.answers[question] !== undefined || item.ended) return;
    chat.answerQuiz(item.id, question, option);
    if (!voice.enabled) return;
    const q = item.quiz.questions[question]!;
    const right = option === q.answerIndex;
    const feedback = right
      ? `Correct! ${q.explanation}`
      : `Not quite. The answer is ${String.fromCharCode(65 + q.answerIndex)}: ${q.options[q.answerIndex]}. ${q.explanation}`;
    const nextIndex = item.quiz.questions.findIndex((_, qi) => qi !== question && item.answers[qi] === undefined);
    if (nextIndex === -1) {
      const score = item.quiz.questions.reduce((n, qq, qi) => n + ((qi === question ? option : item.answers[qi]) === qq.answerIndex ? 1 : 0), 0);
      void voice.say(`${feedback} That's the end of the quiz. You scored ${score} out of ${item.quiz.questions.length}. Say quiz me for another one, or ask me anything.`);
    } else {
      const next = item.quiz.questions[nextIndex]!;
      void voice.say(`${feedback} Question ${nextIndex + 1}: ${next.question} ${speakOptions(next.options)}`);
    }
  };

  const onCommand = (cmd: Command): boolean | void => {
    switch (cmd.type) {
      case 'quizAnswer':
        if (!quiz) return false;
        answerQuiz(quiz.item, quiz.question, cmd.index);
        return;
      case 'endQuiz':
        if (!quiz) return false;
        chat.endQuiz(quiz.item.id);
        void voice.say('Okay, quiz ended. What would you like to learn next?');
        return;
      case 'action':
        if (!lastMessage || lastMessage.role !== 'assistant' || chat.busy) {
          void voice.say(`Ask me something first, then I can ${learnActionLabel(cmd.action).toLowerCase()} it.`);
          return;
        }
        stickToBottom.current = true;
        void chat.send({ action: cmd.action });
        return;
      case 'quiz':
        if (!chat.conversationId && !lastUserTopic) {
          void voice.say('Ask me about a topic first, then I can quiz you on it.');
          return;
        }
        stickToBottom.current = true;
        void chat.startQuiz(lastUserTopic);
        return;
      case 'newChat':
        chat.newChat();
        return;
      case 'openProfile':
        navigate('/profile');
        return;
      case 'back':
        void voice.say("You're on the chat. Say open profile to see your profile.");
        return;
      case 'stop':
        if (chat.busy) chat.stop();
        return;
      case 'retry':
        if (lastMessage?.error) chat.retryLast();
        else void voice.say('There is nothing to retry.');
        return;
      case 'readSources': {
        const sources = lastMessage?.sources ?? [];
        if (!sources.length) void voice.say("That answer didn't use any web sources.");
        else
          void voice.say(
            `I used ${sources.length} source${sources.length > 1 ? 's' : ''}. ${sources.map((s) => `${s.id}: ${s.title}, from ${hostname(s.url)}.`).join(' ')} Say open source and a number to open one.`,
          );
        return;
      }
      case 'openSource': {
        const src = lastMessage?.sources.find((s) => s.id === cmd.n);
        if (!src) {
          void voice.say(`There's no source ${cmd.n}.`);
          return;
        }
        const win = window.open(src.url, '_blank', 'noopener');
        void voice.say(win ? `Opening source ${cmd.n}.` : `Your browser blocked opening it. Tap source ${cmd.n} on the screen.`);
        return;
      }
      case 'listTopics':
        if (!topics?.length) void voice.say('Just ask me anything you are curious about.');
        else void voice.say(`Here are some ideas. ${topics.map((t, i) => `Topic ${i + 1}: ${t.title}.`).join(' ')} Say a topic number to pick one.`);
        return;
      case 'pickTopic': {
        const t = cmd.n === -1 ? topics?.[topics.length - 1] : topics?.[cmd.n - 1];
        if (!t) return false;
        send(t.prompt);
        return;
      }
      default:
        return false;
    }
  };

  const voice = useVoiceScreen({
    screen: 'chat',
    intro: emptyIntro,
    quizOptions: quiz ? quiz.item.quiz!.questions[quiz.question]!.options : undefined,
    onCommand,
    onDictation: (text) => {
      if (chat.busy) {
        void voice.say("One moment, I'm still answering. Say stop to interrupt.");
        return;
      }
      send(text);
    },
  });

  // Not listening while an answer streams or a quiz is being written.
  const answering = chat.busy || Boolean(lastMessage?.streaming) || quizLoading;
  useEffect(() => voice.setThinking(answering), [answering, voice.setThinking]);

  // Read each finished answer aloud.
  const prevStreaming = useRef(false);
  useEffect(() => {
    const wasStreaming = prevStreaming.current;
    prevStreaming.current = Boolean(lastMessage?.streaming);
    if (!voice.enabled || !lastMessage || lastMessage.role !== 'assistant' || !wasStreaming || lastMessage.streaming) return;
    if (lastMessage.error) {
      void voice.say(`${lastMessage.error} Say try again.`);
      return;
    }
    if (lastMessage.stopped || !lastMessage.content) return;
    let text = toSpeech(lastMessage.content);
    if (!hintGiven.current) {
      hintGiven.current = true;
      text += ' You can say simplify, go deeper, give me an example, or quiz me.';
    }
    void voice.say(text);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastMessage?.streaming, lastMessage?.error, voice.enabled]);

  // Read a new quiz aloud when it arrives.
  const spokenQuiz = useRef<string | null>(null);
  useEffect(() => {
    const last = [...chat.items].reverse().find((i): i is QuizItem => i.kind === 'quiz');
    if (!voice.enabled || !last || spokenQuiz.current === last.id) return;
    if (last.status === 'error') {
      spokenQuiz.current = last.id;
      void voice.say(`${last.error ?? "I couldn't make a quiz."} Say quiz me to try again.`);
    } else if (last.status === 'ready' && last.quiz) {
      spokenQuiz.current = last.id;
      const q = last.quiz.questions[0]!;
      void voice.say(`Quiz time! ${last.quiz.questions.length} questions. Say the letter of your answer. Question 1: ${q.question} ${speakOptions(q.options)}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chat.items, voice.enabled]);

  return (
    <div className="mx-auto flex h-dvh max-w-3xl flex-col">
      <header className="flex items-center gap-2 border-b border-slate-200 bg-slate-50/90 px-4 py-2.5 backdrop-blur dark:border-slate-800 dark:bg-slate-950/90">
        <Logo size={28} />
        <span className="text-lg font-bold tracking-tight">CurioX</span>
        {health?.demoMode && (
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">demo</span>
        )}
        <div className="ml-auto flex items-center gap-1">
          <VoiceToggle />
          <button
            onClick={() => chat.newChat()}
            disabled={chat.busy || !chat.items.length}
            className="rounded-lg px-2.5 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-200/60 disabled:opacity-40 dark:text-slate-300 dark:hover:bg-slate-800"
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
              {voice.enabled && ' Say a topic number, or just ask out loud.'}
            </p>
            <div className="mt-5">
              <TopicChips topics={topics} onPick={send} />
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {chat.items.map((item, i) =>
              item.kind === 'quiz' ? (
                <QuizCard key={item.id} item={item} onAnswer={(q, o) => answerQuiz(item, q, o)} onRetry={() => void chat.startQuiz(lastUserTopic)} />
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
        <Composer
          busy={chat.busy}
          onSend={send}
          onStop={chat.stop}
          placeholder={voice.enabled ? 'Speak or type…' : chat.items.length ? 'Ask a follow-up…' : 'Ask anything…'}
          voiceButton={<MicButton />}
        />
      </footer>
    </div>
  );
}
