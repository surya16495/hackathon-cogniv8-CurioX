import { useGuard } from '@/screens/Gate';
import ChatScreen from '@/screens/ChatScreen';

export default function Chat() {
  return useGuard('ready') ?? <ChatScreen />;
}
