// The pinboard: sources and videos kept for a deeper read, each pinned to the board.
import { Linking, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PinChip } from '../deck/Cards';
import type { Pin } from '../hooks/useZine';
import { EmptyCard, Ground, Mini, Sheet, T } from '../ui/kit';
import { fonts, paper, type } from '../ui/tokens';

export function PinsScreen({ pins, onToggle, onWatch, onOpenToday }: { pins: Pin[]; onToggle: (p: Pin) => void; onWatch: (p: Pin) => void; onOpenToday: () => void }) {
  const insets = useSafeAreaInsets();
  return (
    <Ground>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 14, paddingHorizontal: 20, paddingBottom: 22 }}>
        <T v="xl" accessibilityRole="header">
          Your pinboard
        </T>
        <T v="hint" muted style={{ marginTop: 6, marginBottom: 28, maxWidth: 280 }}>
          Sources and videos you pinned, kept for a deeper read.
        </T>
        {pins.length ? (
          <View style={{ gap: 28, marginBottom: 24 }}>
            {pins.map((p, i) => (
              <Sheet key={p.id} style={{ gap: 6, paddingTop: 24, paddingHorizontal: 18, paddingBottom: 14, transform: [{ rotate: i % 2 ? '0.5deg' : '-0.6deg' }] }}>
                <View style={{ position: 'absolute', left: '50%', top: -9, marginLeft: -9, width: 18, height: 18, borderRadius: 9, backgroundColor: paper.yellow, boxShadow: '0px 3px 3px rgba(20,19,16,0.4)' }} />
                <Text style={[type.typed, { color: paper.ink2 }]}>
                  {p.kind === 'video' ? 'Video' : 'Article'} · {p.site}
                </Text>
                <Text style={{ fontFamily: fonts.disp800, fontSize: 17, lineHeight: 20, color: paper.ink }}>{p.title}</Text>
                {!!p.summary && <Text style={{ fontFamily: fonts.body, fontSize: 14.5, lineHeight: 20, color: paper.ink2 }}>{p.summary}</Text>}
                <Text style={[type.typed, { color: paper.ink2 }]}>
                  from No. {p.deckNo} · {p.deckTitle}
                </Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10, marginTop: 8 }}>
                  <PinChip pin={{ id: p.id, pinned: true, toggle: () => onToggle(p) }} />
                  {p.kind === 'video' ? (
                    <Mini label="Watch" icon="play" onPress={() => onWatch(p)} style={{ minHeight: 44 }} />
                  ) : (
                    <Mini label="Open" icon="link" onPress={() => void Linking.openURL(p.url)} style={{ minHeight: 44 }} accessibilityLabel={`Open ${p.title} in your browser`} />
                  )}
                </View>
              </Sheet>
            ))}
          </View>
        ) : (
          <EmptyCard note="nothing pinned yet" body="Pin a source or a video and it waits here for a deeper read." action="Open today's issue" onAction={onOpenToday} />
        )}
      </ScrollView>
    </Ground>
  );
}
