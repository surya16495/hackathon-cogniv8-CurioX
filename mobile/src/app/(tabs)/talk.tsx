import { useIsFocused, useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo } from 'react';
import { VOICE_TONE_LABEL, voiceToneOf, type VoiceTone } from '@curiox/shared';
import { api } from '@/api/client';
import { useSession } from '@/hooks/useSession';
import { useZine } from '@/hooks/useZine';
import { TalkScreen } from '@/screens/TalkScreen';

export default function TalkRoute() {
  const router = useRouter();
  const focused = useIsFocused();
  const { session, update } = useSession();
  const { addDeck, loadToday } = useZine();
  const tone = voiceToneOf(session?.profile.tone);
  // From a deck's mic button: talk about that topic straight away.
  const params = useLocalSearchParams<{ topic?: string; title?: string; t?: string }>();
  const openWith = useMemo(() => (params.topic && params.t ? { key: params.t, topic: params.topic, title: params.title ?? params.topic } : null), [params.topic, params.title, params.t]);

  const setTone = (t: VoiceTone) => {
    if (!session) return;
    // Shown at once; the reader card's tone follows on the server.
    update({ ...session.profile, tone: VOICE_TONE_LABEL[t] }, session.onboarding);
    api.updateProfile({ tone: VOICE_TONE_LABEL[t] }).then((res) => update(res.profile, res.onboarding)).catch(() => undefined);
  };

  return (
    <TalkScreen
      active={focused}
      tone={tone}
      onTone={setTone}
      onClose={() => router.navigate('/home')}
      onStaple={async (points) => {
        const deck = await api.createDeck({ from: 'talk', points });
        addDeck(deck);
        router.push({ pathname: '/deck/[id]', params: { id: deck.id } });
      }}
      onFinished={(res) => {
        if (session) update(res.profile, session.onboarding);
        // A new interest, a new story or the summary deck: Home has something new to show.
        void loadToday();
      }}
      onOpenDeck={(id) => router.push({ pathname: '/deck/[id]', params: { id } })}
      openWith={openWith}
    />
  );
}
