import { useRouter } from 'expo-router';
import { useZine, type Pin } from '@/hooks/useZine';
import { PinsScreen } from '@/screens/PinsScreen';

export default function PinsRoute() {
  const router = useRouter();
  const z = useZine();
  const lead = z.today?.issue.lead;
  const watch = (p: Pin) => router.push({ pathname: '/deck/[id]', params: { id: p.deckId, card: String(p.card ?? 0) } });
  return <PinsScreen pins={z.pins} onToggle={z.togglePin} onWatch={watch} onOpenToday={() => lead && router.push({ pathname: '/deck/[id]', params: { id: lead.id } })} />;
}
