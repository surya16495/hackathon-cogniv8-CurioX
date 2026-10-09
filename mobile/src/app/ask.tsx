import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Linking } from 'react-native';
import { toSpeech, topicName } from '@curiox/shared';
import { ApiError, api } from '@/api/client';
import { useChatStream, type UiMessage } from '@/hooks/useChatStream';
import { useSession } from '@/hooks/useSession';
import { useZine } from '@/hooks/useZine';
import { AskScreen } from '@/screens/AskScreen';
import { MicButton } from '@/voice/VoiceControls';
import { useVoiceScreen } from '@/voice/VoiceProvider';
import { sayList } from '@/voice/match';

export default function AskRoute() {
  const router = useRouter();
  const params = useLocalSearchParams<{ q?: string; reQ?: string; reA?: string }>();
  const { session } = useSession();
  const { addDeck } = useZine();
  const chat = useChatStream();
  const [cardsBusy, setCardsBusy] = useState(false);
  const pending = useRef<string | null>(params.q?.trim() || null);
  const started = useRef(false);

  // Arriving with a question (said on another screen) starts a fresh chat with it.
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    if (params.reQ && params.reA) {
      chat.newChat();
      chat.addCanned(params.reQ, params.reA);
    } else if (pending.current) chat.newChat();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (pending.current && !chat.conversationId && !chat.items.length) {
      const q = pending.current;
      pending.current = null;
      void chat.send({ message: q });
    }
  }, [chat.conversationId, chat.items.length, chat]);

  const suggestions = useMemo(() => {
    const p = session?.profile;
    const own = p?.curiosities.slice(0, 3) ?? [];
    const news = (p?.interests ?? []).slice(0, 2).map((t) => `What's new in ${topicName(t)}?`);
    const out = [...own, ...news];
    return out.length ? out.slice(0, 5) : ['Why do chatbots make things up?', 'How do rockets land themselves?', 'What is the rule of 72?'];
  }, [session]);

  const messages = chat.items.filter((i): i is UiMessage => i.kind === 'message');
  const last = [...messages].reverse().find((m) => m.role === 'assistant');
  const finished = last && !last.streaming && !last.error && last.content ? last : null;

  const makeCards = async () => {
    if (!chat.conversationId || cardsBusy) return;
    setCardsBusy(true);
    try {
      const deck = await api.createDeck({ from: 'chat', conversationId: chat.conversationId });
      addDeck(deck);
      router.push({ pathname: '/deck/[id]', params: { id: deck.id } });
    } catch (err) {
      void voice.say(err instanceof ApiError ? err.message : "I couldn't make cards from that just now.");
    } finally {
      setCardsBusy(false);
    }
  };

  const voice = useVoiceScreen({
    screen: 'chat',
    intro: finished ? `${toSpeech(finished.content, 900)}${finished.sources.length ? ` I found ${finished.sources.length} sources.` : ''}` : messages.length ? null : 'What do you want to know? Just ask.',
    onCommand: (cmd) => {
      switch (cmd.type) {
        case 'action':
          if (!chat.hasAnswer) return false;
          if (cmd.action === 'challenge_me') {
            if (chat.conversationId) router.push({ pathname: '/quiz', params: { conversation: chat.conversationId } });
            return;
          }
          void chat.send({ action: cmd.action });
          return;
        case 'quiz':
          if (!chat.conversationId) return void voice.say('Ask me something first, then I can quiz you on it.');
          router.push({ pathname: '/quiz', params: { conversation: chat.conversationId } });
          return;
        case 'makeDeck':
          void makeCards();
          return;
        case 'newChat':
          chat.newChat();
          void voice.say('Fresh page. What do you want to know?');
          return;
        case 'stop':
          chat.stop();
          return;
        case 'retry':
          chat.retryLast();
          return;
        case 'readSources':
          if (!last?.sources.length) return void voice.say('That answer had no web sources.');
          void voice.say(`${sayList(last.sources.map((s) => `${s.id}: ${s.title}`))}. Say open source one.`);
          return;
        case 'openSource': {
          const s = last?.sources.find((x) => x.id === cmd.n);
          if (s) void Linking.openURL(s.url);
          return;
        }
        case 'pickTopic': {
          const s = suggestions[cmd.n - 1];
          if (s) void chat.send({ message: s });
          return;
        }
        case 'listTopics':
          void voice.say(`You could ask: ${sayList(suggestions)}.`);
          return;
        case 'back':
        case 'goHome':
          router.canGoBack() ? router.back() : router.replace('/home');
          return;
        case 'openProfile':
          router.push('/you');
          return;
      }
      return false;
    },
    onDictation: (text) => void chat.send({ message: text }),
  });

  useEffect(() => {
    voice.setThinking(chat.busy);
  }, [chat.busy, voice]);

  return (
    <AskScreen
      items={chat.items}
      status={chat.status}
      busy={chat.busy}
      // Learn actions and cards need a real conversation (not the quiz's ready-made re-explain).
      hasAnswer={chat.hasAnswer && !!chat.conversationId}
      canCards={!!chat.conversationId}
      suggestions={suggestions}
      cardsBusy={cardsBusy}
      onSend={(t) => void chat.send({ message: t })}
      onAction={(a) => {
        if (a === 'challenge_me') {
          if (chat.conversationId) router.push({ pathname: '/quiz', params: { conversation: chat.conversationId } });
          return;
        }
        void chat.send({ action: a });
      }}
      onStop={chat.stop}
      onRetry={chat.retryLast}
      onCards={() => void makeCards()}
      onBack={() => (router.canGoBack() ? router.back() : router.replace('/home'))}
      onNewChat={chat.newChat}
      mic={<MicButton size={42} />}
    />
  );
}
