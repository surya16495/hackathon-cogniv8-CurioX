import { useRouter } from 'expo-router';
import { useState } from 'react';
import { readerFromProfile, type ReaderCard } from '@curiox/shared';
import { ApiError, api } from '@/api/client';
import { onboardingDone, useSession } from '@/hooks/useSession';
import { useZine } from '@/hooks/useZine';
import { Onboard, useOnboardFlow } from '@/screens/Onboard';

export default function OnboardRoute() {
  const router = useRouter();
  const { session, update } = useSession();
  const { loadToday } = useZine();
  // Redoing the questions starts from the current card.
  const flow = useOnboardFlow(session && onboardingDone(session) ? readerFromProfile(session.profile) : undefined);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  return <Onboard flow={flow} saving={saving} error={error} onDone={done} />;
}
