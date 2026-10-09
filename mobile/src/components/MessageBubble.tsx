import { Text, View } from 'react-native';
import { learnActionLabel } from '@curiox/shared';
import type { UiMessage } from '../hooks/useChatStream';
import { useColors } from '../theme';
import { Markdown } from './Markdown';
import { SourceList } from './SourceList';
import { Badge, Button, Skeleton } from './ui';

// The whole first line, including an action suffix like "(Simplify)".
const DEMO_PREFIX = /^_Demo answer:[^\n]*\n*/;

export default function MessageBubble({ message, onRetry }: { message: UiMessage; onRetry?: () => void }) {
  const c = useColors();

  if (message.role === 'user') {
    return (
      <View style={{ alignSelf: 'flex-end', maxWidth: '85%', backgroundColor: c.primary, borderRadius: 18, borderBottomRightRadius: 6, paddingHorizontal: 14, paddingVertical: 10, gap: 4 }}>
        {message.action && (
          <Text style={{ color: c.onPrimary, fontSize: 12, fontWeight: '600', opacity: 0.85 }}>✨ {learnActionLabel(message.action)}</Text>
        )}
        {!!message.content && <Text style={{ color: c.onPrimary, fontSize: 16, lineHeight: 22 }}>{message.content}</Text>}
      </View>
    );
  }

  const demo = message.provider === 'demo' || DEMO_PREFIX.test(message.content);
  const text = message.content.replace(DEMO_PREFIX, '');
  const waiting = message.streaming && !text;

  return (
    <View
      style={{ alignSelf: 'stretch', backgroundColor: c.card, borderColor: c.border, borderWidth: 1, borderRadius: 18, borderBottomLeftRadius: 6, padding: 14 }}
      accessibilityLiveRegion={message.streaming ? 'polite' : 'none'}
    >
      {demo && (
        <View style={{ marginBottom: 8 }}>
          <Badge label="Demo answer: AI models are offline" />
        </View>
      )}
      {waiting ? <Skeleton width={120} height={18} /> : <Markdown text={text} sources={message.sources} cursor={message.streaming} />}
      <SourceList sources={message.sources} />
      {message.stopped && <Text style={{ color: c.muted, fontSize: 12, marginTop: 8 }}>Stopped.</Text>}
      {!!message.error && (
        <View style={{ marginTop: 10, backgroundColor: c.dangerBg, borderRadius: 12, padding: 10, gap: 8 }}>
          <Text style={{ color: c.dangerText, fontSize: 14 }}>{message.error}</Text>
          {onRetry && <Button label="Try again" variant="danger" onPress={onRetry} style={{ paddingVertical: 8, alignSelf: 'flex-start' }} />}
        </View>
      )}
    </View>
  );
}
