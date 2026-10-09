import { Pressable, Text, View } from 'react-native';
import type { SuggestedTopic } from '@curiox/shared';
import { useColors } from '../theme';
import { Skeleton } from './ui';

/** `topics`: null while loading, [] if they could not be loaded. */
export default function TopicChips({ topics, onPick }: { topics: SuggestedTopic[] | null; onPick: (prompt: string) => void }) {
  const c = useColors();
  if (topics?.length === 0) return null;
  if (topics === null) {
    return (
      <View style={{ gap: 10 }}>
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} height={64} />
        ))}
      </View>
    );
  }
  return (
    <View style={{ gap: 10 }}>
      {topics.map((t, i) => (
        <Pressable
          key={t.title}
          accessibilityRole="button"
          accessibilityLabel={`Topic ${i + 1}: ${t.title}`}
          onPress={() => onPick(t.prompt)}
          style={({ pressed }) => ({ backgroundColor: c.card, borderColor: c.border, borderWidth: 1, borderRadius: 16, padding: 14, opacity: pressed ? 0.7 : 1 })}
        >
          <Text style={{ color: c.text, fontSize: 15, fontWeight: '600' }}>
            <Text style={{ color: c.primary, fontSize: 13 }}>{i + 1}  </Text>
            {t.title}
          </Text>
          {t.prompt.trim().toLowerCase() !== t.title.trim().toLowerCase() && (
            <Text numberOfLines={2} style={{ color: c.muted, fontSize: 14, marginTop: 2 }}>
              {t.prompt}
            </Text>
          )}
        </Pressable>
      ))}
    </View>
  );
}
