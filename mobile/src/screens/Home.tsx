// Home: the ask bar under the masthead, today's featured decks as a swipeable carousel of yellow
// panels, the rest of the issue grouped by what the reader follows (and what is related to it),
// and back issues on a rack.
import { useEffect, useRef, useState } from 'react';
import { FlatList, Image, Pressable, RefreshControl, ScrollView, Text, View, useWindowDimensions, type ViewToken } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { topicName, type Deck, type DeckSummary, type TodayResponse } from '@curiox/shared';
import { Cut, Sticker } from '../ui/Art';
import { Icon } from '../ui/Icon';
import { CopierSkeleton } from './Status';
import { EmptyCard, Ground, Mini, Note, Panel, PasteIn, Stamp, Staple, Strip, T, Tickbox } from '../ui/kit';
import { fonts, paper, type, useGround } from '../ui/tokens';

export interface HomeProps {
  today: TodayResponse | null;
  status: 'idle' | 'loading' | 'slow' | 'ready' | 'error';
  error: string | null;
  interests: string[];
  isRead: (id: string) => boolean;
  fresh: string | null;
  onOpenDeck: (id: string) => void;
  onAsk: () => void;
  onYou: () => void;
  /** The reader's photo for the masthead, if they set one. */
  avatar?: string | null;
  onRetry: () => void;
  onOnboard: () => void;
}

const cardsLabel = (d: Deck | DeckSummary) => `${'cardCount' in d ? d.cardCount : d.cards.length + 1} cards`;

/** Pastes its children down: a short drop, a slight twist, settling flat. */


/** One featured deck in the carousel: the design's "today" panel. */
function Featured({ d, no, read, fresh, width, index, onPress }: { d: Deck; no: number; read: boolean; fresh: boolean; width: number; index: number; onPress: () => void }) {
  const g = useGround();
  const meta = d.relatedTo && d.relatedTo !== 'your talks' ? `because you follow ${topicName(d.relatedTo)}` : d.tag;
  return (
    <View style={{ width, paddingRight: 14 }}>
      <Pressable accessibilityRole="button" accessibilityLabel={`Open ${index === 0 ? `issue ${no}` : 'story'}: ${d.title}`} onPress={onPress} style={({ pressed }) => (pressed ? { transform: [{ scale: 0.985 }] } : {})}>
        <Panel style={{ minHeight: 236, justifyContent: 'flex-end', gap: 12, paddingTop: 24, paddingHorizontal: 22, paddingBottom: 20 }}>
          <Cut art={d.art} size={152} rotate={index % 2 ? -8 : 8} style={{ position: 'absolute', right: -4, top: -26 }} />
          {read ? (
            <View style={{ position: 'absolute', left: 22, top: 24 }}>
              <Tickbox done fresh={fresh} scale={1.25} />
            </View>
          ) : (
            <View style={{ position: 'absolute', left: 16, top: -14, width: 56, height: 56, borderRadius: 28, backgroundColor: paper.ink, alignItems: 'center', justifyContent: 'center', transform: [{ rotate: '-12deg' }], boxShadow: g.sh }}>
              <Text style={{ fontFamily: fonts.disp900, fontSize: 13, letterSpacing: 0.9, color: paper.white }}>NEW</Text>
            </View>
          )}
          <Text style={[type.todayH, { color: paper.ink, maxWidth: '62%' }]}>{d.title}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
            <Text numberOfLines={2} style={[type.typed, { color: paper.onYellow2, flex: 1 }]}>
              No. {no} · {meta} · {cardsLabel(d)}
            </Text>
            <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: paper.ink, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="next" color={paper.white} />
            </View>
          </View>
        </Panel>
      </Pressable>
    </View>
  );
}

function StoryStrip({ d, index, read, fresh, onPress }: { d: Deck; index: number; read: boolean; fresh: boolean; onPress: () => void }) {
  return (
    <Strip
      onPress={onPress}
      rotate={index % 2 ? 0.4 : -0.5}
      accessibilityLabel={`${d.title}. ${cardsLabel(d)}. ${read ? 'Read' : 'Not read yet'}`}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 64, paddingVertical: 10, paddingHorizontal: 12 }}
    >
      <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: paper.yellow, alignItems: 'center', justifyContent: 'center' }}>
        <Sticker art={d.art} size={30} rotate={-8} />
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
        <Text style={[type.strip, { color: paper.ink }]}>{d.title}</Text>
        <Text numberOfLines={1} style={[type.typed, { color: paper.ink2 }]}>
          {cardsLabel(d)}
        </Text>
      </View>
      <Tickbox done={read} fresh={fresh} />
    </Strip>
  );
}

function Cover({ d, index, read, fresh, onPress }: { d: DeckSummary; index: number; read: boolean; fresh: boolean; onPress: () => void }) {
  const g = useGround();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`No. ${d.no}: ${d.title}. ${read ? 'Read' : 'Not read yet'}`}
      onPress={onPress}
      style={({ pressed }) => ({
        width: 142,
        minHeight: 180,
        justifyContent: 'flex-end',
        gap: 6,
        padding: 12,
        borderRadius: 14,
        backgroundColor: g.strip,
        boxShadow: g.sh,
        overflow: 'hidden',
        transform: [{ rotate: `${index % 2 ? 1 : -1.2}deg` }, ...(pressed ? [{ scale: 0.985 }] : [])],
      })}
    >
      <View style={{ position: 'absolute', right: -24, top: -24, width: 100, height: 100, borderRadius: 50, backgroundColor: paper.yellow }} />
      <Sticker art={d.art} size={40} rotate={9} style={{ position: 'absolute', right: 12, top: 12 }} />
      {d.kind === 'talk' && <Staple style={{ left: 56, top: 7 }} />}
      <View style={{ position: 'absolute', left: 12, top: 14 }}>
        <Tickbox done={read} fresh={fresh} />
      </View>
      <Text style={{ fontFamily: fonts.disp800, fontSize: 16, lineHeight: 18, color: paper.ink }}>{d.title}</Text>
      <Text style={[type.typed, { color: paper.ink2 }]}>
        No. {d.no} · {d.tag}
      </Text>
    </Pressable>
  );
}

function Group({ title, children, delay }: { title: string; children: React.ReactNode; delay: number }) {
  return (
    <PasteIn delay={delay} style={{ gap: 10, marginBottom: 18 }}>
      <T style={{ fontFamily: fonts.disp800, fontSize: 17, lineHeight: 20 }}>{title}</T>
      {children}
    </PasteIn>
  );
}

export function Home(p: HomeProps) {
  const g = useGround();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [slide, setSlide] = useState(0);
  const issue = p.today?.issue;
  const lead = issue?.lead;

  const byId = new Map<string, Deck>((issue ? [issue.lead, ...issue.stories] : []).map((d) => [d.id, d]));
  const featured = (issue?.featured ?? []).map((id) => byId.get(id)).filter((d): d is Deck => !!d);
  const rest = (issue?.stories ?? []).filter((d) => !issue!.featured.includes(d.id));
  const own = rest.filter((d) => !d.relatedTo);
  const byTopic = [...new Set(own.map((d) => d.topic))].map((t) => ({ t, list: own.filter((d) => d.topic === t) }));
  const fromTalks = rest.filter((d) => d.relatedTo === 'your talks');
  const picked = rest.filter((d) => d.relatedTo === 'your answers');
  const related = rest.filter((d) => d.relatedTo && d.relatedTo !== 'your talks' && d.relatedTo !== 'your answers');
  const quiet = issue?.quiet ?? [];
  const loading = !issue && (p.status === 'loading' || p.status === 'slow' || p.status === 'idle');
  const cardW = width - 40;

  const onViewable = useRef(({ viewableItems }: { viewableItems: ViewToken<Deck>[] }) => {
    const v = viewableItems.find((x) => x.isViewable);
    if (v?.index != null) setSlide(v.index);
  }).current;

  return (
    <Ground>
      <View style={{ flex: 1, overflow: 'hidden' }}>
        <ScrollView
          contentContainerStyle={{ paddingTop: insets.top + 8, paddingHorizontal: 20, paddingBottom: 24 }}
          refreshControl={<RefreshControl refreshing={false} onRefresh={p.onRetry} tintColor={g.onGround} />}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <T v="logo">CurioX</T>
            <Strip onPress={p.onYou} rotate={1.2} accessibilityLabel="You, your profile" style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44, paddingVertical: 0, paddingLeft: p.avatar ? 7 : 11, paddingRight: 14 }}>
              {p.avatar ? <Image source={{ uri: p.avatar }} style={{ width: 28, height: 28, borderRadius: 14 }} accessibilityIgnoresInvertColors /> : <Icon name="you" size={20} color={paper.ink} />}
              <Text style={[type.strip, { color: paper.ink }]}>You</Text>
            </Strip>
          </View>

          {/* The ask bar sits under the masthead, as the first thing to reach for. */}
          <PasteIn delay={40} style={{ marginBottom: 22 }}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Ask CurioX anything"
              onPress={p.onAsk}
              style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, minHeight: 52, paddingLeft: 16, paddingRight: 5, borderRadius: 14, backgroundColor: g.strip, boxShadow: g.sh, ...(pressed ? { transform: [{ scale: 0.99 }] } : {}) })}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                <Icon name="search" size={20} color={paper.ink2} />
                <Text style={{ fontFamily: fonts.body, fontSize: 16, color: paper.ink2 }}>Ask CurioX anything</Text>
              </View>
              <View style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: paper.ink, alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="up" size={22} color={paper.white} />
              </View>
            </Pressable>
          </PasteIn>

          <T v="xl" accessibilityRole="header" style={{ marginBottom: 6 }}>
            {issue?.discover ? "Today's top stories" : 'Today for you'}
          </T>
          {issue?.discover ? (
            <Note style={{ marginBottom: 14 }}>read whatever catches your eye: CurioX learns what you follow</Note>
          ) : (
            <View style={{ marginBottom: 14 }} />
          )}

          {loading && (
            <View>
              <CopierSkeleton />
              <Note>{p.status === 'slow' ? 'printing your issue… this takes a few seconds' : 'fetching your issue…'}</Note>
            </View>
          )}

          {!issue && p.status === 'error' && (
            <EmptyCard note="the press jammed" body={p.error ?? 'Could not load today’s issue.'} action="Try again" onAction={p.onRetry} />
          )}

          {featured.length > 0 && (
            <PasteIn delay={120} style={{ marginHorizontal: -20, marginBottom: 10 }}>
              <FlatList
                data={featured}
                keyExtractor={(d) => d.id}
                horizontal
                pagingEnabled={false}
                snapToInterval={cardW}
                snapToAlignment="start"
                decelerationRate="fast"
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ paddingLeft: 20, paddingRight: 20 + 14, paddingTop: 16 }}
                onViewableItemsChanged={onViewable}
                viewabilityConfig={{ itemVisiblePercentThreshold: 60 }}
                renderItem={({ item, index }) => (
                  <Featured d={item} no={issue!.no} read={p.isRead(item.id)} fresh={p.fresh === item.id} width={cardW} index={index} onPress={() => p.onOpenDeck(item.id)} />
                )}
                accessibilityLabel="Today's featured decks. Swipe sideways."
              />
              <View style={{ flexDirection: 'row', gap: 7, alignItems: 'center', justifyContent: 'center', marginTop: 12 }} accessibilityElementsHidden>
                {featured.map((d, k) => (
                  <View key={d.id} style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: g.onGround, opacity: k === slide ? 1 : 0.26, transform: [{ scale: k === slide ? 1.4 : 1 }] }} />
                ))}
              </View>
            </PasteIn>
          )}

          {issue && (
            <View style={{ marginTop: 18, marginBottom: 30 }}>
              <T v="secH" style={{ marginBottom: 14 }}>
                Also in this issue
              </T>
              {!p.interests.length && !issue.discover ? (
                <EmptyCard note="nothing to sort yet" body="Answer the six questions and CurioX sorts today's cards by what you follow." action="Start the six questions" onAction={p.onOnboard} />
              ) : (
                <>
                  {byTopic.map(({ t, list }, gi) => (
                    <Group key={t || 'top'} title={t ? topicName(t) : 'More of today'} delay={200 + gi * 60}>
                      {list.map((d, i) => (
                        <StoryStrip key={d.id} d={d} index={i} read={p.isRead(d.id)} fresh={p.fresh === d.id} onPress={() => p.onOpenDeck(d.id)} />
                      ))}
                    </Group>
                  ))}
                  {fromTalks.length > 0 && (
                    <Group title="From your talks" delay={260}>
                      {fromTalks.map((d, i) => (
                        <StoryStrip key={d.id} d={d} index={i} read={p.isRead(d.id)} fresh={p.fresh === d.id} onPress={() => p.onOpenDeck(d.id)} />
                      ))}
                    </Group>
                  )}
                  {picked.length > 0 && (
                    <Group title="Picked from your answers" delay={290}>
                      {picked.map((d, i) => (
                        <StoryStrip key={d.id} d={d} index={i} read={p.isRead(d.id)} fresh={p.fresh === d.id} onPress={() => p.onOpenDeck(d.id)} />
                      ))}
                    </Group>
                  )}
                  {related.length > 0 && (
                    <Group title="Related to what you follow" delay={320}>
                      {related.map((d, i) => (
                        <View key={d.id} style={{ gap: 4 }}>
                          <StoryStrip d={d} index={i} read={p.isRead(d.id)} fresh={p.fresh === d.id} onPress={() => p.onOpenDeck(d.id)} />
                          <Text style={[type.typed, { color: g.onGround2, marginLeft: 12 }]}>because you follow {topicName(d.relatedTo)}</Text>
                        </View>
                      ))}
                    </Group>
                  )}
                  {quiet.length > 0 && (
                    <View style={{ marginBottom: 14, paddingVertical: 14, paddingHorizontal: 16, borderWidth: 2, borderStyle: 'dashed', borderColor: g.rule, borderRadius: 14 }}>
                      <T v="hint" muted>
                        Nothing new today in {listOr(quiet.map(topicName))}.
                      </T>
                    </View>
                  )}
                  {rest.length === 0 && featured.length > 0 && <Note>everything new today is in the cards above</Note>}
                  {issue.discover && picked.length > 0 && <Note arrow>picked from your five answers: open what you like and CurioX learns</Note>}
                  {!issue.discover && byTopic.length + related.length > 0 && <Note arrow>sorted by what you follow</Note>}
                </>
              )}
            </View>
          )}

          {!!p.today?.backIssues.length && (
            <PasteIn delay={380}>
              <T v="secH" style={{ marginBottom: 12 }}>
                Back issues
              </T>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -20 }} contentContainerStyle={{ gap: 14, paddingTop: 6, paddingHorizontal: 20, paddingBottom: 20 }}>
                {p.today.backIssues.map((d, i) => (
                  <Cover key={d.id} d={d} index={i} read={p.isRead(d.id)} fresh={p.fresh === d.id} onPress={() => p.onOpenDeck(d.id)} />
                ))}
              </ScrollView>
            </PasteIn>
          )}
          {issue?.lead.kind === 'demo' && (
            <View style={{ marginTop: 8, gap: 8 }}>
              <Stamp label="Demo issue" />
              <T v="typed" muted>
                CurioX couldn't reach its AI models, so this is a ready-made issue. Pull down to try again.
              </T>
            </View>
          )}
        </ScrollView>
      </View>
    </Ground>
  );
}

function listOr(items: string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} or ${items[items.length - 1]}`;
}
