import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { blankReader, readerFromProfile, type ReaderCard } from '@curiox/shared';
import { api } from '@/api/client';
import { useSession } from '@/hooks/useSession';
import { useZine } from '@/hooks/useZine';
import { pickPhoto } from '@/lib/photo';
import { KEYS, getJson, storage } from '@/lib/storage';
import { Waking } from '@/screens/Status';
import { YouScreen } from '@/screens/YouScreen';

export default function YouRoute() {
  const router = useRouter();
  const { session, update, replace, signOut } = useSession();
  const { loadToday, pins, today } = useZine();
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [reader, setReader] = useState<ReaderCard>(() => (session ? readerFromProfile(session.profile) : blankReader()));
  const [saving, setSaving] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const startInterests = useRef(reader.interests.join('|'));
  const latest = useRef(reader);
  latest.current = reader;

  // Opened straight from a link: fill the card in once the session arrives.
  const loaded = useRef(!!session);
  useEffect(() => {
    if (loaded.current || !session) return;
    loaded.current = true;
    const r = readerFromProfile(session.profile);
    startInterests.current = r.interests.join('|');
    setReader(r);
  }, [session]);

  // Changing what you follow re-prints today's issue when you leave.
  useEffect(
    () => () => {
      clearTimeout(saveTimer.current);
      if (latest.current.interests.join('|') !== startInterests.current) void loadToday({ fresh: true });
    },
    [loadToday],
  );

  const change = (r: ReaderCard) => {
    setReader(r);
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      setSaving(true);
      try {
        const res = await api.updateProfile({ reader: r });
        update(res.profile, res.onboarding);
      } catch {
        // Kept on screen; the next change tries again.
      } finally {
        setSaving(false);
      }
    }, 600);
  };

  const clear = async () => {
    setConfirming(false);
    try {
      const res = await api.clearProfile(true);
      update(res.profile, res.onboarding);
    } catch {
      // Fall through: the local card is cleared either way.
    }
    for (const k of [KEYS.pins, KEYS.read, KEYS.lastIssue, KEYS.conversationId]) storage.remove(k);
    router.replace('/onboard');
  };

  const saveAccount = async (patch: { name?: string; avatar?: string | null }) => {
    setSaving(true);
    try {
      replace(await api.updateAccount(patch));
    } catch (err) {
      setPhotoError(err instanceof Error ? err.message : 'Could not save that.');
    } finally {
      setSaving(false);
    }
  };

  const choosePhoto = async () => {
    setPhotoError(null);
    setPhotoBusy(true);
    try {
      const pick = await pickPhoto();
      if (pick.status === 'ok') await saveAccount({ avatar: pick.dataUrl });
      else if (pick.status === 'denied') setPhotoError('CurioX needs permission to open your photos. You can allow it in Settings.');
      else if (pick.status === 'error') setPhotoError(pick.message);
    } finally {
      setPhotoBusy(false);
    }
  };

  if (!session) return <Waking title="Opening your card" body="One moment." status="Loading" />;
  return (
    <YouScreen
      reader={reader}
      saving={saving}
      onChange={change}
      onRedo={() => router.push('/onboard')}
      onClear={() => void clear()}
      onBack={() => (router.canGoBack() ? router.back() : router.replace('/home'))}
      confirming={confirming}
      setConfirming={setConfirming}
      account={session.account}
      onSignIn={() => router.push('/auth')}
      onSignOut={() => {
        signOut();
        router.replace('/');
      }}
      avatar={session.avatar}
      name={session.name}
      photoBusy={photoBusy}
      photoError={photoError}
      onPickPhoto={() => void choosePhoto()}
      onRemovePhoto={() => void saveAccount({ avatar: null })}
      onName={(name) => void saveAccount({ name })}
      stats={{ read: getJson<string[]>(KEYS.read, []).length, pinned: pins.length, issues: today?.issue.no ?? 0 }}
    />
  );
}
