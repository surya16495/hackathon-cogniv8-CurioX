import { useIsFocused, useRouter } from 'expo-router';
import { api } from '@/api/client';
import { useZine } from '@/hooks/useZine';
import { TalkScreen } from '@/screens/TalkScreen';

export default function TalkRoute() {
  const router = useRouter();
  const focused = useIsFocused();
  const { addDeck } = useZine();
  return (
    <TalkScreen
      active={focused}
      onClose={() => router.navigate('/home')}
      onStaple={async (points) => {
        const deck = await api.createDeck({ from: 'talk', points });
        addDeck(deck);
        router.push({ pathname: '/deck/[id]', params: { id: deck.id } });
      }}
    />
  );
}
