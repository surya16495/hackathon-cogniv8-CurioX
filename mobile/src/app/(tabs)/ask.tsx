import { useIsFocused, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert } from 'react-native';
import { topicName, wonderings } from '@curiox/shared';
import { ApiError, api } from '@/api/client';
import { useChatStream } from '@/hooks/useChatStream';
import { useSession } from '@/hooks/useSession';
import { useZine } from '@/hooks/useZine';
import { AskScreen } from '@/screens/AskScreen';

export default function AskRoute() {
  const router = useRouter();
  const params = useLocalSearchParams<{ q?: string; reQ?: string; reA?: string }>();
  const { session } = useSession();
  const { addDeck, loadToday, signal } = useZine();
  const chat = useChatStream();
  const focused = useIsFocused();
  const [cardsBusy, setCardsBusy] = useState(false);
  /** Deck id per answered message, once its cards exist. */
  const [cardsFor, setCardsFor] = useState<Record<string, string>>({});
  const making = useRef(new Set<string>());
  const pending = useRef<string | null>(params.q?.trim() || null);
  const started = useRef(false);

  // Arriving with a question starts a fresh chat with it; from the quiz, with a ready-made answer.
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
    const own = p?.curiosities.slice(0, 2) ?? [];
    const news = (p?.interests ?? []).slice(0, 2).map((t) => `What's new in ${topicName(t)}?`);
    const out = [...new Set([...own, ...news, ...wonderings(p?.interests ?? [])])];
    return out.slice(0, 5);
  }, [session]);

  // Every chat with an answer is summarised into cards for Back issues: when the reader leaves
  // the screen or starts a new chat, once per conversation length (a longer chat refreshes it).
  const summarised = useRef(new Map<string, number>());
  const summarise = (conversationId: string | null, count: number) => {
    if (!conversationId || count < 2 || (summarised.current.get(conversationId) ?? 0) >= count) return;
    summarised.current.set(conversationId, count);
    api
      .createDeck({ from: 'chat', conversationId })
      .then((deck) => {
        addDeck(deck);
        signal(deck.topic, 'ask');
        void loadToday();
      })
      .catch(() => summarised.current.delete(conversationId));
  };
  // Counted once the stream has ended (busy is false); the on-screen typewriter may still be catching up.
  const answered = chat.items.filter((i) => i.kind === 'message' && i.role === 'assistant' && i.content && !i.error).length;
  const latest = useRef({ id: chat.conversationId, count: answered * 2, busy: chat.busy });
  latest.current = { id: chat.conversationId, count: answered * 2, busy: chat.busy };
  // On leaving the screen, or when an answer finishes after the reader has already left.
  useEffect(() => {
    if (!focused && !chat.busy) summarise(latest.current.id, latest.current.count);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focused, chat.busy, answered]);
  useEffect(
    () => () => {
      if (!latest.current.busy) summarise(latest.current.id, latest.current.count);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const newChat = () => {
    summarise(latest.current.id, latest.current.count);
    chat.newChat();
  };

  const makeCards = async (messageId?: string, open = true) => {
    const conversationId = chat.conversationId;
    if (!conversationId || cardsBusy) return;
    setCardsBusy(true);
    try {
      const deck = await api.createDeck({ from: 'chat', conversationId });
      addDeck(deck);
      summarised.current.set(conversationId, latest.current.count);
      signal(deck.topic, 'ask');
      if (messageId) setCardsFor((m) => ({ ...m, [messageId]: deck.id }));
      if (open) router.push({ pathname: '/deck/[id]', params: { id: deck.id } });
    } catch (err) {
      if (messageId) making.current.delete(messageId);
      if (open) Alert.alert('Not this time', err instanceof ApiError ? err.message : "Couldn't make cards from that just now.");
    } finally {
      setCardsBusy(false);
    }
  };

  // The answer is never shown as prose: as soon as it has streamed in, it is turned into cards
  // and the deck opens. Follow-ups grow the same deck.
  const lastAnswer = [...chat.items].reverse().find((i) => i.kind === 'message' && i.role === 'assistant');
  const lastDone = lastAnswer && lastAnswer.kind === 'message' && !chat.busy && !lastAnswer.streaming && !lastAnswer.error && !lastAnswer.stopped && !!lastAnswer.content ? lastAnswer : null;
  useEffect(() => {
    if (!lastDone || !chat.conversationId || !focused || making.current.has(lastDone.id) || cardsFor[lastDone.id]) return;
    making.current.add(lastDone.id);
    void makeCards(lastDone.id, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastDone?.id, chat.busy, chat.conversationId, focused]);

  const quiz = () => chat.conversationId && router.push({ pathname: '/quiz', params: { conversation: chat.conversationId } });

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
      cardsFor={cardsFor}
      onOpenCards={(id) => router.push({ pathname: '/deck/[id]', params: { id } })}
      onSend={(t) => void chat.send({ message: t })}
      onAction={(a) => (a === 'challenge_me' ? quiz() : void chat.send({ action: a }))}
      onStop={chat.stop}
      onRetry={chat.retryLast}
      onCards={() => void makeCards(lastDone?.id)}
      onBack={() => (router.canGoBack() ? router.back() : router.replace('/home'))}
      onNewChat={newChat}
    />
  );
}
