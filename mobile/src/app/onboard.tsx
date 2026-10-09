import { useRouter } from 'expo-router';
import { useState } from 'react';
import { blankReader, readerFromProfile, type ReaderCard } from '@curiox/shared';
import { ApiError, api } from '@/api/client';
import { onboardingDone, useSession } from '@/hooks/useSession';
import { useZine } from '@/hooks/useZine';
import { Onboard, useOnboardFlow } from '@/screens/Onboard';
import { MicFab } from '@/voice/VoiceControls';
import { useVoiceScreen } from '@/voice/VoiceProvider';
import { matchOptions, sayList } from '@/voice/match';

export default function OnboardRoute() {
  const router = useRouter();
  const { session, update } = useSession();
  const { loadToday } = useZine();
  // Redoing the questions starts from the current card.
  const flow = useOnboardFlow(session && onboardingDone(session) ? readerFromProfile(session.profile) : undefined);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { step, q, ans } = flow;

  const done = async (reader: ReaderCard) => {
    setSaving(true);
    setError(null);
    try {
      const res = await api.completeOnboarding(reader);
      update(res.profile, res.onboarding);
      void loadToday({ fresh: true });
      router.replace('/home');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save your card. Try again.');
      setSaving(false);
    }
  };

  const intro =
    step === 0
      ? "Hi, I'm CurioX! I make little decks of cards about the stuff you're into. Six quick questions first. Say start when you're ready."
      : q
        ? `${q.q} ${q.options.length ? `For example: ${sayList(q.options.slice(0, 6))}.` : ''} ${q.multi ? 'Pick as many as you like, then say next.' : ''}`
        : `Here's your reader card. You're into ${sayList(ans.interests) || 'lots of things'}. Say "make my deck" to start, or "start over".`;

  const voice = useVoiceScreen({
    screen: step === 0 ? 'welcome' : q ? 'questions' : 'ready',
    intro,
    onCommand: (cmd) => {
      switch (cmd.type) {
        case 'start':
          flow.start();
          return;
        case 'skipAll':
          void done(blankReader());
          return;
        case 'next':
          if (!flow.canNext) {
            void voice.say('Pick at least one first, or say skip.');
            return;
          }
          flow.next();
          return;
        case 'skipQuestion':
          flow.skip();
          return;
        case 'finish':
          flow.go(7);
          return;
        case 'back':
          flow.back();
          return;
        case 'startLearning':
          void done(ans);
          return;
        case 'startOver':
          flow.go(1);
          return;
      }
      return false;
    },
    onDictation: (text) => {
      if (!q) {
        if (/deck|start|go/i.test(text)) void done(ans);
        return;
      }
      const hits = matchOptions(text, [...q.options, ...ans[q.key]]);
      if (!hits.length) {
        if (q.free) {
          flow.set(q.multi ? [...ans[q.key], text.trim()] : [text.trim()]);
          void voice.say(`Got it: ${text.trim()}. Say next when you're done.`);
        } else void voice.say(`Hmm, I didn't catch an option there. You can say ${sayList(q.options.slice(0, 4))}.`);
        return;
      }
      if (!q.multi) {
        flow.set([hits[0]!]);
        void voice.say(`${hits[0]}. Nice.`, { listenAfter: false }).then(() => flow.next());
        return;
      }
      const merged = [...new Set([...ans[q.key], ...hits])];
      flow.set(merged);
      void voice.say(`Got it: ${sayList(hits)}. Anything else? Or say next.`);
    },
  });

  return (
    <>
      <Onboard flow={flow} saving={saving} error={error} onDone={done} />
      <MicFab bottom={step === 0 ? 90 : step > 6 ? 150 : 84} />
    </>
  );
}
