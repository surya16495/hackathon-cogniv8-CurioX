import { useGuard } from '@/screens/Gate';
import WelcomeScreen from '@/screens/WelcomeScreen';

export default function Welcome() {
  return useGuard('onboarding') ?? <WelcomeScreen />;
}
