// Home: today's lead on yellow paper, the rest of the issue grouped by what the reader follows,
// back issues on a rack, and the "Ask CurioX anything" bar.
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { topicName, type Deck, type DeckSummary, type TodayResponse } from '@curiox/shared';
import { Cut, Sticker } from '../ui/Art';
import { Icon } from '../ui/Icon';
import { AppIcon } from './Opening';
import { CopierSkeleton } from './Status';
import { Btn, EmptyCard, Ground, IconBtn, Mini, Note, Panel, Stamp, Staple, Strip, T, Tape, Tickbox, useReduceMotion } from '../ui/kit';
import { curves, fonts, paper, type, useGround } from '../ui/tokens';

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
  onRetry: () => void;
  onOnboard: () => void;
}

const cardsLabel = (d: Deck | DeckSummary) => `${'cardCount' in d ? d.cardCount : d.cards.length + 1} cards`;

function Banner({ show, title, body, onOpen, onClose }: { show: boolean; title: string; body: string; onOpen: () => void; onClose: () => void }) {
  const g = useGround();
  const insets = useSafeAreaInsets();
  const reduce = useReduceMotion();
  const y = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(y, { toValue: show ? 1 : 0, duration: reduce ? 0 : 400, easing: Easing.bezier(...curves.slap), useNativeDriver: true }).start();
  }, [show, reduce, y]);
  return (
    <Animated.View
      pointerEvents={show ? 'auto' : 'none'}
      accessibilityElementsHidden={!show}
      accessibilityLiveRegion="polite"
      style={{
        position: 'absolute',
        left: 12,
        right: 12,
        top: insets.top + 8,
        zIndex: 45,
        flexDirection: 'row',
        gap: 10,
        alignItems: 'center',
        paddingVertical: 10,
        paddingLeft: 12,
        paddingRight: 4,
        backgroundColor: g.strip,
        borderRadius: 6,
        boxShadow: g.shUp,
        transform: [{ translateY: y.interpolate({ inputRange: [0, 1], outputRange: [-160, 0] }) }, { rotate: '-1deg' }],
      }}
    >
      <Tape style={{ left: undefined, right: 64, top: -11, transform: [{ rotate: '4deg' }] }} />
      <AppIcon />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontFamily: fonts.disp800, fontSize: 16, lineHeight: 19, color: paper.ink }}>{title}</Text>
        <Text numberOfLines={2} style={{ fontFamily: fonts.body, fontSize: 14.5, lineHeight: 19, color: paper.ink }}>
          {body}
        </Text>
      </View>
      <Mini label="Open" fill onPress={onOpen} />
      <IconBtn name="x" label="Dismiss" color={paper.ink} onPress={onClose} />
    </Animated.View>
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

export function Home(p: HomeProps) {
  const g = useGround();
  const insets = useSafeAreaInsets();
  const [banner, setBanner] = useState(false);
  const shown = useRef(false);
  const reduce = useReduceMotion();
  // While the banner is down, the page slides down out of its way.
  const push = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(push, { toValue: banner ? 72 : 0, duration: reduce ? 0 : 400, easing: Easing.bezier(...curves.slap), useNativeDriver: true }).start();
  }, [banner, reduce, push]);
  const lead = p.today?.issue.lead;
  const leadRead = lead ? p.isRead(lead.id) : false;

  // The in-app banner, once, if today's lead is still unread.
  useEffect(() => {
    if (!lead || leadRead || shown.current) return;
    shown.current = true;
    const a = setTimeout(() => setBanner(true), 1600);
    const b = setTimeout(() => setBanner(false), 1600 + 7000);
    return () => {
      clearTimeout(a);
      clearTimeout(b);
    };
  }, [lead, leadRead]);

  const issue = p.today?.issue;
  const stories = issue?.stories ?? [];
  const byTopic = p.interests.map((t) => ({ t, list: stories.filter((s) => s.topic === t) })).filter((x) => x.list.length);
  const others = stories.filter((s) => !p.interests.includes(s.topic));
  const quiet = issue?.quiet ?? [];
  const loading = !issue && (p.status === 'loading' || p.status === 'slow' || p.status === 'idle');

  return (
    <Ground>
      <Animated.View style={{ flex: 1, overflow: 'hidden', transform: [{ translateY: push }] }}>
        <ScrollView
          contentContainerStyle={{ paddingTop: insets.top + 8, paddingHorizontal: 20, paddingBottom: 24 }}
          refreshControl={<RefreshControl refreshing={false} onRefresh={p.onRetry} tintColor={g.onGround} />}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <T v="logo">CurioX</T>
            <Strip onPress={p.onYou} rotate={1.2} accessibilityLabel="You, your reader card" style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44, paddingVertical: 0, paddingLeft: 11, paddingRight: 14 }}>
              <Icon name="you" size={20} color={paper.ink} />
              <Text style={[type.strip, { color: paper.ink }]}>You</Text>
            </Strip>
          </View>
          <T v="xl" accessibilityRole="header" style={{ marginBottom: 18 }}>
            Today for you
          </T>

          {loading && (
            <View>
              <CopierSkeleton />
              <Note>{p.status === 'slow' ? 'printing your issue… this takes a few seconds' : 'fetching your issue…'}</Note>
            </View>
          )}

          {!issue && p.status === 'error' && (
            <EmptyCard note="the press jammed" body={p.error ?? 'Could not load today’s issue.'} action="Try again" onAction={p.onRetry} />
          )}

          {lead && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Open issue ${issue!.no}: ${lead.title}`}
              onPress={() => p.onOpenDeck(lead.id)}
              style={({ pressed }) => ({ marginBottom: 28, transform: pressed ? [{ scale: 0.985 }] : undefined })}
            >
              <Panel style={{ minHeight: 236, justifyContent: 'flex-end', gap: 12, paddingTop: 24, paddingHorizontal: 22, paddingBottom: 20 }}>
                <Cut art={lead.art} size={152} rotate={8} style={{ position: 'absolute', right: -4, top: -26 }} />
                {leadRead ? (
                  <View style={{ position: 'absolute', left: 22, top: 24 }}>
                    <Tickbox done fresh={p.fresh === lead.id} scale={1.25} />
                  </View>
                ) : (
                  <View style={{ position: 'absolute', left: 16, top: -14, width: 56, height: 56, borderRadius: 28, backgroundColor: paper.ink, alignItems: 'center', justifyContent: 'center', transform: [{ rotate: '-12deg' }], boxShadow: g.sh }}>
                    <Text style={{ fontFamily: fonts.disp900, fontSize: 13, letterSpacing: 0.9, color: paper.white }}>NEW</Text>
                  </View>
                )}
                <Text style={[type.todayH, { color: paper.ink, maxWidth: '62%' }]}>{lead.title}</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                  <Text style={[type.typed, { color: paper.onYellow2, flex: 1 }]}>
                    No. {issue!.no} · {lead.tag} · {cardsLabel(lead)}
                  </Text>
                  <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: paper.ink, alignItems: 'center', justifyContent: 'center' }}>
                    <Icon name="next" color={paper.white} />
                  </View>
                </View>
              </Panel>
            </Pressable>
          )}

          {issue && (
            <View style={{ marginBottom: 30 }}>
              <T v="secH" style={{ marginBottom: 14 }}>
                Also in this issue
              </T>
              {!p.interests.length ? (
                <EmptyCard note="nothing to sort yet" body="Answer the six questions and CurioX sorts today's cards by what you follow." action="Start the six questions" onAction={p.onOnboard} />
              ) : (
                <>
                  {byTopic.map(({ t, list }) => (
                    <View key={t} style={{ gap: 10, marginBottom: 18 }}>
                      <T style={{ fontFamily: fonts.disp800, fontSize: 17, lineHeight: 20 }}>{topicName(t)}</T>
                      {list.map((d, i) => (
                        <StoryStrip key={d.id} d={d} index={i} read={p.isRead(d.id)} fresh={p.fresh === d.id} onPress={() => p.onOpenDeck(d.id)} />
                      ))}
                    </View>
                  ))}
                  {others.map((d, i) => (
                    <View key={d.id} style={{ marginBottom: 10 }}>
                      <StoryStrip d={d} index={i} read={p.isRead(d.id)} fresh={p.fresh === d.id} onPress={() => p.onOpenDeck(d.id)} />
                    </View>
                  ))}
                  {quiet.length > 0 && (
                    <View style={{ marginBottom: 14, paddingVertical: 14, paddingHorizontal: 16, borderWidth: 2, borderStyle: 'dashed', borderColor: g.rule, borderRadius: 14 }}>
                      <T v="hint" muted>
                        Nothing new today in {listOr(quiet.map(topicName))}.
                      </T>
                    </View>
                  )}
                  {byTopic.length > 0 && <Note arrow>sorted by what you follow</Note>}
                </>
              )}
            </View>
          )}

          {!!p.today?.backIssues.length && (
            <View>
              <T v="secH" style={{ marginBottom: 12 }}>
                Back issues
              </T>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -20 }} contentContainerStyle={{ gap: 14, paddingTop: 6, paddingHorizontal: 20, paddingBottom: 20 }}>
                {p.today.backIssues.map((d, i) => (
                  <Cover key={d.id} d={d} index={i} read={p.isRead(d.id)} fresh={p.fresh === d.id} onPress={() => p.onOpenDeck(d.id)} />
                ))}
              </ScrollView>
            </View>
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
      </Animated.View>

      <View style={{ paddingTop: 8, paddingHorizontal: 16, paddingBottom: 6 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Ask CurioX anything"
          onPress={p.onAsk}
          style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, minHeight: 52, paddingLeft: 16, paddingRight: 5, borderRadius: 14, backgroundColor: g.strip, boxShadow: g.sh }}
        >
          <Text style={{ fontFamily: fonts.body, fontSize: 16, color: paper.ink2 }}>Ask CurioX anything</Text>
          <View style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: paper.ink, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="up" size={22} color={paper.white} />
          </View>
        </Pressable>
      </View>

      {lead && (
        <Banner
          show={banner}
          title={`Issue No. ${issue!.no} is out`}
          body={lead.title}
          onOpen={() => {
            setBanner(false);
            p.onOpenDeck(lead.id);
          }}
          onClose={() => setBanner(false)}
        />
      )}
    </Ground>
  );
}

function listOr(items: string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} or ${items[items.length - 1]}`;
}

