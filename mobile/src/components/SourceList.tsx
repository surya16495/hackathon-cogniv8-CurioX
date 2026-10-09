import { Linking, Pressable, ScrollView, Text, View } from 'react-native';
import type { Source } from '@curiox/shared';
import { useColors } from '../theme';
import { Badge } from './ui';

function hostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

export function SourceList({ sources }: { sources: Source[] }) {
  const c = useColors();
  if (!sources.length) return null;
  return (
    <View style={{ marginTop: 12 }}>
      <Text style={{ color: c.muted, fontSize: 12, fontWeight: '600', letterSpacing: 0.5, marginBottom: 6 }}>SOURCES</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        {sources.map((s) => (
          <Pressable
            key={`${s.id}-${s.url}`}
            accessibilityRole="link"
            accessibilityLabel={`Source ${s.id}: ${s.title}`}
            onPress={() => Linking.openURL(s.url)}
            style={({ pressed }) => ({
              width: 210,
              padding: 12,
              gap: 4,
              borderRadius: 14,
              borderWidth: 1,
              borderColor: c.border,
              backgroundColor: c.card,
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <View style={{ minWidth: 20, height: 20, borderRadius: 10, backgroundColor: c.citeBg, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color: c.citeText, fontSize: 11, fontWeight: '700' }}>{s.id}</Text>
              </View>
              <Text numberOfLines={1} style={{ color: c.muted, fontSize: 12, flex: 1 }}>
                {hostname(s.url)}
              </Text>
              {s.title.startsWith('Demo source') && <Badge label="demo" />}
            </View>
            <Text numberOfLines={2} style={{ color: c.text, fontSize: 14, fontWeight: '600' }}>
              {s.title}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}
