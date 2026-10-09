import { useIsFocused, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { View } from 'react-native';
import { useSession } from '@/hooks/useSession';
import { useZine } from '@/hooks/useZine';
import { Home } from '@/screens/Home';
import { MicFab } from '@/voice/VoiceControls';
import { useVoiceScreen } from '@/voice/VoiceProvider';
import { sayList } from '@/voice/match';

export default function HomeRoute() {
  const router = useRouter();
  const focused = useIsFocused();
  const { session } = useSession();
  const z = useZine();
  const issue = z.today?.issue;
  const all = issue ? [issue.lead, ...issue.stories] : [];

  // Coming back to Home draws the tick on whatever was just finished, once.
  useEffect(() => {
    if (!focused || !z.fresh) return;
    const t = setTimeout(z.clearFresh, 1500);
    return () => clearTimeout(t);
  }, [focused, z.fresh, z.clearFresh]);

  const { status, loadToday } = z;
  useEffect(() => {
    if (status === 'idle' && session) void loadToday();
  }, [status, session, loadToday]);

  const open = (id: string) => router.push({ pathname: '/deck/[id]', params: { id } });
  const headlines = () =>
    issue ? `Today's issue, number ${issue.no}. The lead: ${issue.lead.title}.${issue.stories.length ? ` Also: ${sayList(issue.stories.map((s) => s.title))}.` : ''} Say open to read it, or open story two.` : "Your issue is still printing.";

  const voice = useVoiceScreen({
    screen: 'home',
    active: focused,
    intro: issue ? `${headlines()}` : null,
    onCommand: (cmd) => {
      switch (cmd.type) {
        case 'openToday':
          if (issue) open(issue.lead.id);
          return;
        case 'openStory': {
          const d = all[cmd.n - 1];
          if (d) open(d.id);
          else void voice.say(`There ${all.length === 1 ? 'is only one story' : `are ${all.length} stories`} today.`);
          return;
        }
        case 'listStories':
          void voice.say(headlines());
          return;
        case 'openTalk':
          router.navigate('/talk');
          return;
        case 'openPins':
          router.navigate('/pins');
          return;
        case 'openAsk':
          router.push('/ask');
          return;
        case 'openProfile':
          router.push('/you');
          return;
        case 'retry':
          void z.loadToday();
          return;
      }
      return false;
    },
    // Anything else said on Home is a question.
    onDictation: (text) => router.push({ pathname: '/ask', params: { q: text } }),
  });

  return (
    <View style={{ flex: 1 }}>
      <Home
        today={z.today}
        status={z.status}
        error={z.error}
        interests={session?.profile.interests ?? []}
        isRead={z.isRead}
        fresh={z.fresh}
        onOpenDeck={open}
        onAsk={() => router.push('/ask')}
        onYou={() => router.push('/you')}
        onRetry={() => void z.loadToday()}
        onOnboard={() => router.push('/onboard')}
      />
      <MicFab bottom={70} />
    </View>
  );
}
