import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Linking } from 'react-native';
import { cardSpeech, type Deck } from '@curiox/shared';
import { ApiError } from '@/api/client';
import { useZine } from '@/hooks/useZine';
import { DeckScreen, type DeckControl } from '@/screens/DeckScreen';
import { CantReach, Waking } from '@/screens/Status';
import { MicFab } from '@/voice/VoiceControls';
import { useVoiceScreen, voiceLang } from '@/voice/VoiceProvider';
import { sayList } from '@/voice/match';

export default function DeckRoute() {
  const router = useRouter();
  const { id, card } = useLocalSearchParams<{ id: string; card?: string }>();
  const z = useZine();
  const [deck, setDeck] = useState<Deck | undefined>(() => z.deck(id));
  const [error, setError] = useState<string | null>(null);
  const [index, setIndex] = useState(Number(card) || 0);
  const [teachSaid, setTeachSaid] = useState<{ text: string; n: number } | null>(null);
  const control = useRef<DeckControl | null>(null);
  const lang = useMemo(voiceLang, []);

  useEffect(() => {
    if (deck) return;
    z.fetchDeck(id)
      .then(setDeck)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not open this deck.'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const next = deck ? z.nextUnread(deck.id) : null;
  const n = deck ? deck.cards.length + 1 : 0;
  const atEnd = index === n - 1;
  const current = deck?.cards[index];
  const intro = !deck
    ? null
    : atEnd
      ? `You came this far. ${deck.quiz.length ? 'Say quiz me, ' : 'Say '}teach it back, listen${next ? ', or next story' : ''}.`
      : `${index === 0 ? `${deck.title}. ` : ''}${current ? cardSpeech(current) : ''}`;

  const close = () => (router.canGoBack() ? router.back() : router.replace('/home'));
  const handlers = () => control.current?.card(control.current.index);

  const voice = useVoiceScreen({
    screen: 'deck',
    intro,
    onCommand: (cmd) => {
      const c = control.current;
      if (!deck || !c) return false;
      switch (cmd.type) {
        case 'next':
          if (c.index >= c.count - 1) void voice.say("That's the last card. Say quiz me, or close.");
          else c.go(c.index + 1);
          return;
        case 'prev':
        case 'back':
          if (c.sheet) c.openSheet(null);
          else if (c.index > 0) c.go(c.index - 1);
          else close();
          return;
        case 'readCard':
          void voice.say(intro ?? '');
          return;
        case 'myth': {
          const h = handlers();
          if (h?.myth) h.myth(cmd.answer);
          else return false;
          const m = deck.cards[c.index];
          if (m?.kind === 'myth') void voice.say(`${cmd.answer === m.answer ? 'You got it!' : 'Not quite.'} It's a ${m.answer}. ${m.explain}`);
          return;
        }
        case 'guess': {
          const h = handlers();
          if (!h?.guess) return false;
          h.guess(cmd.value);
          void voice.say(`${cmd.value}. Say lock it in, or try another number.`);
          return;
        }
        case 'lockIn': {
          const h = handlers();
          const g = deck.cards[c.index];
          if (!h?.lockIn || g?.kind !== 'guess') return false;
          h.lockIn();
          void voice.say(`The answer is ${g.answer}${g.unit ? ` ${g.unit}` : ''}. ${g.explain}`);
          return;
        }
        case 'way': {
          const h = handlers();
          const w = deck.cards[c.index];
          if (!h?.way || w?.kind !== 'ways') return false;
          h.way(cmd.n);
          void voice.say(`${w.ways[cmd.n]!.label}: ${w.ways[cmd.n]!.text}`);
          return;
        }
        case 'play': {
          const h = handlers();
          if (!h?.play) return void voice.say('There is no video on this card.');
          h.play();
          return;
        }
        case 'pin': {
          const h = handlers();
          if (!h?.pin) return void voice.say('Nothing to pin on this card, or it is already pinned.');
          h.pin();
          void voice.say('Pinned. It waits on your pinboard.');
          return;
        }
        case 'quiz':
          if (!deck.quiz.length) return void voice.say("This deck doesn't have a quiz. Try teach it back.");
          router.push({ pathname: '/quiz', params: { deck: deck.id } });
          return;
        case 'teachBack':
          c.openSheet('teach');
          void voice.say(`${deck.teach.q} Say it in your own words.`);
          return;
        case 'readSources':
          if (!deck.sources.length) return void voice.say('This deck has no web sources.');
          c.openSheet('sources');
          void voice.say(`${deck.sources.length} sources: ${sayList(deck.sources.map((s) => s.title))}.`);
          return;
        case 'openSource': {
          const s = deck.sources[cmd.n - 1];
          if (s) void Linking.openURL(s.url);
          return;
        }
        case 'listen':
          c.listen();
          return;
        case 'nextStory':
          if (next) router.replace({ pathname: '/deck/[id]', params: { id: next.id } });
          else void voice.say("You've read everything in today's issue.");
          return;
        case 'close':
        case 'goHome':
          close();
          return;
        case 'openAsk':
          router.push('/ask');
          return;
      }
      return false;
    },
    onDictation: (text) => {
      // While teach it back is open, what is said is the answer.
      if (control.current?.sheet === 'teach') return setTeachSaid((t) => ({ text, n: (t?.n ?? 0) + 1 }));
      router.push({ pathname: '/ask', params: { q: text } });
    },
  });

  if (error) return <CantReach message={error} onRetry={() => (setError(null), void z.fetchDeck(id).then(setDeck).catch(() => setError('Could not open this deck.')))} />;
  if (!deck) return <Waking title="Fetching your cards" body="One moment." status="Loading" />;
  return (
    <>
      <DeckScreen
        deck={deck}
        next={next}
        isPinned={z.isPinned}
        togglePin={z.togglePin}
        onRead={() => z.markRead(deck.id)}
        onClose={close}
        onQuiz={() => router.push({ pathname: '/quiz', params: { deck: deck.id } })}
        onNext={(nid) => router.replace({ pathname: '/deck/[id]', params: { id: nid } })}
        startCard={Number(card) || 0}
        lang={lang}
        control={control}
        teachSaid={teachSaid}
        onIndex={setIndex}
      />
      <MicFab bottom={58} />
    </>
  );
}
