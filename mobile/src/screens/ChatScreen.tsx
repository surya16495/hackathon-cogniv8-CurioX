import { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, Text, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { learnActionLabel, speakOptions, toSpeech, type Command, type SuggestedTopic } from '@curiox/shared';
import { api } from '@/api/client';
import ActionChips from '@/components/ActionChips';
import Composer from '@/components/Composer';
import MessageBubble from '@/components/MessageBubble';
import QuizCard from '@/components/QuizCard';
import StatusLine from '@/components/StatusLine';
import TopicChips from '@/components/TopicChips';
import { Badge, Logo, Skeleton } from '@/components/ui';
import { useChatStream, type ChatItem, type QuizItem, type UiMessage } from '@/hooks/useChatStream';
import { useSession } from '@/hooks/useSession';
import { useColors } from '@/theme';
import { MicButton, VoiceToggle } from '@/voice/VoiceControls';
import { useVoiceScreen } from '@/voice/VoiceProvider';

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

export default function ChatScreen() {
  const c = useColors();
  const router = useRouter();
  const { session, health } = useSession();
  const chat = useChatStream();
  const scroller = useRef<ScrollView>(null);
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

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
    stickToBottom.current = contentSize.height - contentOffset.y - layoutMeasurement.height < 120;
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
    const feedback =
      option === q.answerIndex
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
        router.push('/profile');
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
        void voice.say(`Opening source ${cmd.n}.`, { listenAfter: false }).then(() => Linking.openURL(src.url));
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
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }} edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {/* Header */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: c.border }}>
          <Logo size={28} />
          <Text style={{ color: c.text, fontSize: 19, fontWeight: '800' }}>CurioX</Text>
          {health?.demoMode && <Badge label="demo" />}
          <View style={{ marginLeft: 'auto', flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <VoiceToggle />
            <Pressable accessibilityRole="button" accessibilityLabel="New chat" disabled={chat.busy || !chat.items.length} onPress={chat.newChat} style={{ padding: 8, opacity: chat.busy || !chat.items.length ? 0.4 : 1 }}>
              <Text style={{ color: c.muted, fontWeight: '600' }}>New</Text>
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel="Your profile" onPress={() => router.push('/profile')} style={{ padding: 6 }}>
              <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: c.accentBg, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color: c.accentText, fontWeight: '700' }}>👤</Text>
              </View>
            </Pressable>
          </View>
        </View>

        {/* Conversation */}
        <ScrollView
          ref={scroller}
          onScroll={onScroll}
          scrollEventThrottle={64}
          onContentSizeChange={() => stickToBottom.current && scroller.current?.scrollToEnd({ animated: true })}
          contentContainerStyle={{ padding: 16, gap: 14, flexGrow: 1 }}
          keyboardShouldPersistTaps="handled"
        >
          {chat.loadingHistory ? (
            <View style={{ gap: 12 }}>
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} height={56} width={i % 2 ? '65%' : '85%'} style={{ alignSelf: i % 2 ? 'flex-end' : 'flex-start' }} />
              ))}
            </View>
          ) : chat.items.length === 0 ? (
            <View style={{ gap: 6, paddingTop: 12 }}>
              <Text style={{ color: c.text, fontSize: 24, fontWeight: '800' }}>What are you curious about today?</Text>
              <Text style={{ color: c.muted, fontSize: 15, marginBottom: 12 }}>
                {personalized ? 'Here are some topics picked for you, or ask anything.' : 'Pick a topic or ask anything.'}
                {voice.enabled ? ' Say a topic number, or just ask out loud.' : ''}
              </Text>
              <TopicChips topics={topics} onPick={send} />
            </View>
          ) : (
            chat.items.map((item, i) =>
              item.kind === 'quiz' ? (
                <QuizCard key={item.id} item={item} onAnswer={(q, o) => answerQuiz(item, q, o)} onRetry={() => void chat.startQuiz(lastUserTopic)} />
              ) : (
                <MessageBubble key={item.id} message={item} onRetry={i === lastIndex ? chat.retryLast : undefined} />
              ),
            )
          )}
        </ScrollView>

        {/* Footer */}
        <View style={{ paddingHorizontal: 12, paddingTop: 8, paddingBottom: 8, gap: 8, borderTopWidth: 1, borderTopColor: c.border, backgroundColor: c.bg }}>
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
            voiceButton={voice.canListen ? <MicButton /> : null}
          />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
