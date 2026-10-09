import { useGuard } from '@/screens/Gate';
import ProfileScreen from '@/screens/ProfileScreen';

export default function Profile() {
  return useGuard('ready') ?? <ProfileScreen />;
}
