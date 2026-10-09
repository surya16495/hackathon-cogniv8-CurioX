import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { READER_KEYS, READER_LABELS, blankReader, readerFromProfile, type ReaderCard, type ReaderKey } from '@curiox/shared';
import { api } from '@/api/client';
import { useSession } from '@/hooks/useSession';
import { useZine } from '@/hooks/useZine';
import { KEYS, storage } from '@/lib/storage';
import { Waking } from '@/screens/Status';
import { YouScreen } from '@/screens/YouScreen';
import { MicFab } from '@/voice/VoiceControls';
import { useVoiceScreen } from '@/voice/VoiceProvider';
import { sayList } from '@/voice/match';

const FIELD: Record<string, ReaderKey> = { interests: 'interests', goals: 'goals', curiosities: 'curious', tone: 'tone', explanationStyle: 'style' };
const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export default function YouRoute() {
  const router = useRouter();
  const { session, update } = useSession();
  const { loadToday } = useZine();
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

  const voice = useVoiceScreen({
    screen: 'profile',
    confirming,
    intro: confirming ? 'Clear everything CurioX knows about you? Say yes or no.' : null,
    onCommand: (cmd) => {
      switch (cmd.type) {
        case 'readProfile': {
          const lines = READER_KEYS.filter((k) => reader[k].length).map((k) => `${READER_LABELS[k]}: ${sayList(reader[k])}.`);
          void voice.say(lines.length ? lines.join(' ') : 'Your card is empty. Say redo onboarding to fill it in.');
          return;
        }
        case 'profileAdd': {
          const k = FIELD[cmd.field]!;
          const v = capital(cmd.value.trim());
          if (!reader[k].some((x) => x.toLowerCase() === v.toLowerCase())) change({ ...reader, [k]: [...reader[k], v] });
          void voice.say(`Added ${v}.`);
          return;
        }
        case 'profileRemove': {
          const k = FIELD[cmd.field]!;
          const left = reader[k].filter((x) => !x.toLowerCase().includes(cmd.value.toLowerCase()));
          if (left.length === reader[k].length) return void voice.say(`I couldn't find ${cmd.value} on your card.`);
          change({ ...reader, [k]: left });
          void voice.say(`Removed ${cmd.value}.`);
          return;
        }
        case 'profileSet': {
          const k = FIELD[cmd.field]!;
          change({ ...reader, [k]: k === 'tone' ? [capital(cmd.value)] : cmd.value.split(/,| and /).map((x) => capital(x.trim())).filter(Boolean) });
          void voice.say(`Done. ${READER_LABELS[k]}: ${cmd.value}.`);
          return;
        }
        case 'redoOnboarding':
          router.push('/onboard');
          return;
        case 'clearAll':
          setConfirming(true);
          return;
        case 'confirm':
          if (confirming) void clear();
          return;
        case 'cancel':
          setConfirming(false);
          void voice.say('Kept it.');
          return;
        case 'back':
        case 'goHome':
          router.canGoBack() ? router.back() : router.replace('/home');
          return;
      }
      return false;
    },
  });

  if (!session) return <Waking title="Opening your card" body="One moment." status="Loading" />;
  return (
    <>
      <YouScreen
        reader={reader}
        saving={saving}
        onChange={change}
        onRedo={() => router.push('/onboard')}
        onClear={() => void clear()}
        onBack={() => (router.canGoBack() ? router.back() : router.replace('/home'))}
        confirming={confirming}
        setConfirming={setConfirming}
        voiceOn={voice.enabled}
        onVoice={voice.toggle}
      />
      <MicFab />
    </>
  );
}
