import { ActivityIndicator, Text, View } from 'react-native';
import type { ChatStatus } from '../hooks/useChatStream';
import { useColors } from '../theme';

const ICON: Record<ChatStatus['stage'], string> = { thinking: '💭', searching: '🔎', writing: '✍️', retrying: '🔁' };

export default function StatusLine({ status }: { status: ChatStatus }) {
  const c = useColors();
  return (
    <View accessibilityLiveRegion="polite" style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <Text>{ICON[status.stage]}</Text>
      <Text numberOfLines={1} style={{ color: c.muted, fontSize: 14, flexShrink: 1 }}>
        {status.message}
      </Text>
      <ActivityIndicator size="small" color={c.muted} />
    </View>
  );
}
