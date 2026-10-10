import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import type { Deck } from '@curiox/shared';
import { ApiError } from '@/api/client';
import { useZine } from '@/hooks/useZine';
import { DeckScreen } from '@/screens/DeckScreen';
import { CantReach, Waking } from '@/screens/Status';
import { voiceLang } from '@/voice/VoiceProvider';

export default function DeckRoute() {
  const { id, card } = useLocalSearchParams<{ id: string; card?: string }>();
  if (!id) return null;
  return <DeckInner key={id} id={id} card={card} />;
}

function DeckInner({ id, card }: { id: string; card?: string }) {
  const router = useRouter();
  const z = useZine();
  const [deck, setDeck] = useState<Deck | undefined>(() => z.deck(id));
  const [error, setError] = useState<string | null>(null);
  const lang = useMemo(voiceLang, []);

  useEffect(() => {
    if (deck) return;
    z.fetchDeck(id)
      .then(setDeck)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not open this deck.'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const close = () => (router.canGoBack() ? router.back() : router.replace('/home'));

  if (error) return <CantReach message={error} onRetry={() => (setError(null), void z.fetchDeck(id).then(setDeck).catch(() => setError('Could not open this deck.')))} />;
  if (!deck) return <Waking title="Fetching your cards" body="One moment." status="Loading" />;
  return (
    <DeckScreen
      deck={deck}
      next={z.nextUnread(deck.id)}
      isPinned={z.isPinned}
      togglePin={z.togglePin}
      onRead={() => {
        z.markRead(deck.id);
        z.signal(deck.topic, 'read');
      }}
      onClose={close}
      onQuiz={() => router.push({ pathname: '/quiz', params: { deck: deck.id } })}
      onNext={(nid) => router.replace({ pathname: '/deck/[id]', params: { id: nid } })}
      onTalk={() => router.navigate({ pathname: '/talk', params: { topic: deck.topic || deck.title, title: deck.title, t: String(Date.now()) } })}
      startCard={Number(card) || 0}
      lang={lang}
    />
  );
}
