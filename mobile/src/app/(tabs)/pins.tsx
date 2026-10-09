import { useIsFocused, useRouter } from 'expo-router';
import { Linking, View } from 'react-native';
import { useZine, type Pin } from '@/hooks/useZine';
import { PinsScreen } from '@/screens/PinsScreen';
import { MicFab } from '@/voice/VoiceControls';
import { useVoiceScreen } from '@/voice/VoiceProvider';

export default function PinsRoute() {
  const router = useRouter();
  const focused = useIsFocused();
  const z = useZine();

  const watch = (p: Pin) => router.push({ pathname: '/deck/[id]', params: { id: p.deckId, card: String(p.card ?? 0) } });
  const openPin = (p: Pin) => (p.kind === 'video' ? watch(p) : void Linking.openURL(p.url));
  const lead = z.today?.issue.lead;

  const voice = useVoiceScreen({
    screen: 'pins',
    active: focused,
    intro: null,
    onCommand: (cmd) => {
      switch (cmd.type) {
        case 'readPins':
          void voice.say(z.pins.length ? `You have ${z.pins.length} pinned. ${z.pins.slice(0, 5).map((p, i) => `${i + 1}: ${p.title}.`).join(' ')} Say open pin one.` : 'Nothing pinned yet. Pin a source or a video from any deck.');
          return;
        case 'openPin': {
          const p = z.pins[cmd.n - 1];
          if (p) openPin(p);
          else void voice.say("There's no pin with that number.");
          return;
        }
        case 'goHome':
          router.navigate('/home');
          return;
        case 'openTalk':
          router.navigate('/talk');
          return;
        case 'openAsk':
          router.push('/ask');
          return;
        case 'openProfile':
          router.push('/you');
          return;
      }
      return false;
    },
    onDictation: (text) => router.push({ pathname: '/ask', params: { q: text } }),
  });

  return (
    <View style={{ flex: 1 }}>
      <PinsScreen pins={z.pins} onToggle={z.togglePin} onWatch={watch} onOpenToday={() => lead && router.push({ pathname: '/deck/[id]', params: { id: lead.id } })} />
      <MicFab />
    </View>
  );
}
