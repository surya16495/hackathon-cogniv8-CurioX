// One component per card kind, laid out like the design: a big headline, a yellow panel,
// and cut-outs and stickers crossing the panel's edge.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Animated, Easing, Linking, Pressable, ScrollView, Text, View, type ViewStyle } from 'react-native';
import type { Card, SourceRef } from '@curiox/shared';
import { Cut, Sticker, type CutKey } from '../ui/Art';
import { Icon } from '../ui/Icon';
import { Cross, Ring, SwipeArrow, Tick } from '../ui/Marks';
import { Btn, Chip, Highlight, Note, Panel, Stamp, Strip, T, Tape, useReduceMotion, useSize } from '../ui/kit';
import { curves, fonts, paper, type, useGround } from '../ui/tokens';
import { GuessSlider } from './GuessSlider';
import { Player } from './Player';
import { useCardHandlers } from './bus';

type CardOf<K extends Card['kind']> = Extract<Card, { kind: K }>;

export interface PinTarget {
  id: string;
  pinned: boolean;
  toggle: () => void;
}

/** A page in the deck: centred vertically (a little above the middle), scrolls if it is long. */
/** A page in the deck: centred vertically (a little above the middle), scrolls if it is long.
 *  `height` comes from the deck, because a horizontal list sizes cells to their content and a short
 *  card would otherwise get a short page that clips the art hanging under its panel. */
export function CardPage({ width, height, children, style, label }: { width: number; height?: number; children: ReactNode; style?: ViewStyle; label: string }) {
  return (
    <View style={{ width, height, flex: height ? undefined : 1 }} accessibilityLabel={label}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={[{ flexGrow: 1, paddingTop: 20, paddingHorizontal: 22, paddingBottom: 110 }, style]}>
        <View style={{ flex: 1 }} />
        <View style={{ gap: 20 }}>{children}</View>
        <View style={{ flex: 1.2 }} />
      </ScrollView>
    </View>
  );
}

export function CardH({ children, style }: { children: ReactNode; style?: object }) {
  return (
    <T v="cardH" accessibilityRole="header" style={[{ marginTop: 10, maxWidth: 270, zIndex: 2 }, style]}>
      {children}
    </T>
  );
}

/** A halftone cut-out on a yellow spot, as on cards 5 to 8. */
function SpotCut({ art, size, spot = 92, style, rotate }: { art: CutKey; size: number; spot?: number; style: ViewStyle; rotate: number }) {
  const g = useGround();
  return (
    <View pointerEvents="none" style={[{ position: 'absolute', zIndex: 3, width: size, height: size, transform: [{ rotate: `${rotate}deg` }] }, style]}>
      <View style={{ position: 'absolute', right: -8, top: -6, width: spot, height: spot, borderRadius: spot / 2, backgroundColor: paper.yellow, boxShadow: g.sh }} />
      <Cut art={art} size={size} />
    </View>
  );
}

export function PinChip({ pin }: { pin: PinTarget }) {
  return <Chip label={pin.pinned ? 'Pinned' : 'Pin'} icon="pin" selected={pin.pinned} onPress={pin.toggle} style={{ alignSelf: 'flex-start', minHeight: 44, paddingVertical: 0, paddingHorizontal: 14 }} textStyle={{ fontSize: 14.5 }} accessibilityLabel={pin.pinned ? 'Pinned. Tap to unpin' : 'Pin this for later'} />;
}

function SourceLine({ src, pin }: { src: SourceRef; pin?: PinTarget }) {
  return (
    <View style={{ marginTop: 18, gap: 12 }}>
      <Pressable accessibilityRole="link" accessibilityLabel={`Source: ${src.title}, ${src.site}. Opens in your browser`} onPress={() => void Linking.openURL(src.url)}>
        <Text style={[type.typed, { color: paper.onYellow2 }]}>
          Source: {src.site}. <Text style={{ textDecorationLine: 'underline' }}>{src.title}</Text>
        </Text>
      </Pressable>
      {pin && <PinChip pin={pin} />}
    </View>
  );
}

// ---------- 1 hook ----------
export function HookCard({ c, swiped }: { c: CardOf<'hook'>; swiped: boolean }) {
  const g = useGround();
  const [s0 = 'wow', s1 = 'mindblown', s2 = 'wow'] = c.stickers;
  return (
    <View style={{ paddingBottom: 70 }}>
      <View style={{ marginLeft: 40, marginBottom: 60 }}>
        <Sticker art={s0} rotate={-15} style={{ position: 'absolute', left: -56, top: -10 }} />
        <CardH style={{ marginTop: 0 }}>{c.title.replace(/ (?=know\?$)/, '\n')}</CardH>
      </View>
      <View>
        <SpotCut art={c.art} size={174} spot={124} rotate={7} style={{ right: -16, top: -128 }} />
        <Panel style={{ paddingTop: 66, paddingHorizontal: 26, paddingBottom: 52 }}>
          <Text style={[type.panelLead, { color: paper.ink, textAlign: 'center' }]}>{c.lead}</Text>
        </Panel>
        <Cut art="qmark" size={130} rotate={-13} style={{ position: 'absolute', left: -32, bottom: -70, zIndex: 3 }} />
        <Sticker art={s1} rotate={13} style={{ position: 'absolute', right: -20, bottom: 74, zIndex: 3 }} />
        <Sticker art={s2} rotate={-8} style={{ position: 'absolute', right: 40, bottom: -62, zIndex: 3 }} />
      </View>
      <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, bottom: -60, alignItems: 'center', opacity: swiped ? 0 : 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-end' }}>
          <Text style={[type.note, { color: g.pen }]}>swipe</Text>
          <SwipeArrow color={g.pen} />
        </View>
      </View>
    </View>
  );
}

// ---------- 2 what happened ----------
export function WhatCard({ c, pin }: { c: CardOf<'what'>; pin?: PinTarget }) {
  useCardHandlers({ pin: pin && !pin.pinned ? pin.toggle : undefined });
  const tilt: ViewStyle[] = [
    { transform: [{ rotate: '-1.2deg' }], marginRight: 20 },
    { transform: [{ rotate: '0.9deg' }], marginLeft: 16 },
    { transform: [{ rotate: '-0.5deg' }], marginRight: 8 },
    { transform: [{ rotate: '0.6deg' }], marginLeft: 10 },
  ];
  return (
    <>
      <CardH>{c.title}</CardH>
      <View>
        <Cut art={c.art} size={134} rotate={-9} style={{ position: 'absolute', right: -12, top: -98, zIndex: 3 }} />
        <Sticker art={c.sticker} rotate={-14} style={{ position: 'absolute', left: -14, bottom: -26, zIndex: 3 }} />
        <Panel style={{ paddingTop: 34, paddingHorizontal: 22, paddingBottom: 24 }}>
          <View style={{ gap: 12 }}>
            {c.strips.map((s, i) => (
              <Strip key={i} style={tilt[i % tilt.length]}>
                {i === 0 && <Tape style={{ left: undefined, right: 16, top: -9, width: 52, height: 18, transform: [{ rotate: '5deg' }] }} />}
                <Text style={[type.strip, { color: paper.ink }]}>{s}</Text>
              </Strip>
            ))}
          </View>
          {c.source && <SourceLine src={c.source} pin={pin} />}
        </Panel>
      </View>
    </>
  );
}

// ---------- 3 why it matters ----------
export function WhyCard({ c }: { c: CardOf<'why'> }) {
  return (
    <>
      <CardH style={{ maxWidth: 210 }}>{c.title}</CardH>
      <View>
        <Panel style={{ paddingVertical: 24, paddingHorizontal: 22 }}>
          <Text style={[type.panelLead, { color: paper.ink }]}>{c.body}</Text>
        </Panel>
        <Cut art={c.art} size={150} rotate={9} style={{ position: 'absolute', right: -14, bottom: -104, zIndex: 3 }} />
      </View>
      {!!c.note && (
        <Note arrow style={{ maxWidth: 215, marginTop: 6, marginHorizontal: 6 }}>
          {c.note}
        </Note>
      )}
    </>
  );
}

// ---------- 4 myth or fact ----------
export function MythCard({ c, onGuess }: { c: CardOf<'myth'>; onGuess?: (right: boolean) => void }) {
  const reduce = useReduceMotion();
  const flip = useRef(new Animated.Value(0)).current;
  const [guess, setGuess] = useState<'myth' | 'fact' | null>(null);
  const [stamped, setStamped] = useState(false);
  const right = guess === c.answer;

  const choose = (gss: 'myth' | 'fact') => {
    if (guess) return;
    setGuess(gss);
    onGuess?.(gss === c.answer);
    Animated.timing(flip, { toValue: 1, duration: reduce ? 0 : 550, easing: Easing.bezier(...curves.turn), useNativeDriver: true }).start();
    setTimeout(() => setStamped(true), reduce ? 0 : 420);
  };
  useCardHandlers({ myth: choose });
  const front = flip.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] });
  const back = flip.interpolate({ inputRange: [0, 1], outputRange: ['180deg', '360deg'] });
  const face: ViewStyle = { minHeight: 290, gap: 18, backfaceVisibility: 'hidden', paddingVertical: 24, paddingHorizontal: 22 };

  return (
    <>
      <CardH>{'Myth\nor fact?'}</CardH>
      <View>
        <Cut art="qmark" size={112} rotate={11} style={{ position: 'absolute', right: -8, top: -92, zIndex: 3 }} />
        <Sticker art={c.sticker} rotate={12} style={{ position: 'absolute', right: -10, bottom: -28, zIndex: 4 }} />
        <Animated.View pointerEvents={guess ? 'none' : 'auto'} style={{ transform: [{ perspective: 1100 }, { rotateY: front }], backfaceVisibility: 'hidden' }}>
          <Panel style={face}>
            <View style={{ flex: 1, justifyContent: 'center' }}>
              <Text style={[type.claim, { color: paper.ink }]}>{c.claim}</Text>
            </View>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Btn label="Myth" onYellow onPress={() => choose('myth')} style={{ flex: 1 }} />
              <Btn label="Fact" onYellow onPress={() => choose('fact')} style={{ flex: 1 }} />
            </View>
          </Panel>
        </Animated.View>
        <Animated.View
          pointerEvents={guess ? 'auto' : 'none'}
          accessibilityElementsHidden={!guess}
          style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, transform: [{ perspective: 1100 }, { rotateY: back }], backfaceVisibility: 'hidden' }}
        >
          <Panel style={[face, { flex: 1, alignItems: 'flex-start' }]}>
            <Stamp label={c.answer === 'myth' ? 'Myth' : 'Fact'} big thump={stamped} />
            <Text style={[type.panelBody, { color: paper.ink }]}>{c.explain}</Text>
            <View style={{ flex: 1 }} />
            {stamped && guess && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }} accessibilityLiveRegion="polite">
                {right ? <Tick color={paper.good} /> : <Cross color={paper.bad} />}
                <Text style={{ fontFamily: fonts.disp800, fontSize: 17, lineHeight: 20, color: paper.ink, flexShrink: 1 }}>
                  {right ? 'You got it.' : `Not quite. Most people guess ${guess}.`}
                </Text>
              </View>
            )}
          </Panel>
        </Animated.View>
      </View>
      <Note style={{ marginHorizontal: 6 }}>{c.note || 'guess first, then the card flips'}</Note>
    </>
  );
}

// ---------- 5 explain it three ways ----------
function SegButton({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  const g = useGround();
  const [size, onLayout] = useSize();
  const [fresh, setFresh] = useState(false);
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected: on }}
      onLayout={onLayout}
      onPress={() => {
        setFresh(true);
        onPress();
      }}
      style={({ pressed }) => ({ flex: 1, minHeight: 44, paddingVertical: 6, paddingHorizontal: 4, alignItems: 'center', justifyContent: 'center', backgroundColor: g.strip, borderTopLeftRadius: 3, borderTopRightRadius: 6, borderBottomRightRadius: 4, borderBottomLeftRadius: 7, boxShadow: g.sh, ...(pressed ? { transform: [{ scale: 0.985 }] } : {}) })}
    >
      <Highlight on={on} />
      <Text style={{ fontFamily: fonts.disp700, fontSize: 14.5, lineHeight: 16, color: paper.ink, textAlign: 'center' }}>{label}</Text>
      {on && <Ring width={size.width} height={size.height} draw={fresh} color={paper.ink} />}
    </Pressable>
  );
}

export function WaysCard({ c }: { c: CardOf<'ways'> }) {
  const [i, setI] = useState(0);
  const [heights, setHeights] = useState<number[]>([]);
  useCardHandlers({ way: (n) => setI(Math.max(0, Math.min(2, n))) });
  const tallest = Math.max(0, ...heights);
  const textStyle = { fontFamily: fonts.disp700, fontSize: 21, lineHeight: 27, color: paper.ink };
  return (
    <>
      <CardH>Explain it three ways</CardH>
      <View>
        <SpotCut art={c.ways[i]!.art} size={118} rotate={8} style={{ right: -16, top: -104 }} />
        <Sticker art={c.sticker} rotate={14} style={{ position: 'absolute', right: -8, bottom: -32, zIndex: 3 }} />
        <Panel style={{ paddingVertical: 24, paddingHorizontal: 22 }}>
          <Text style={{ fontFamily: fonts.disp800, fontSize: 21, lineHeight: 24, color: paper.ink }}>{c.question}</Text>
          <View accessibilityRole="tablist" style={{ flexDirection: 'row', gap: 6, marginVertical: 16 }}>
            {c.ways.map((w, k) => (
              <SegButton key={k} label={w.label.charAt(0).toUpperCase() + w.label.slice(1)} on={k === i} onPress={() => setI(k)} />
            ))}
          </View>
          {/* All three are measured so the panel keeps the height of the longest and never jumps. */}
          <View style={{ minHeight: tallest }}>
            {c.ways.map((w, k) => (
              <Text
                key={k}
                onLayout={(e) => {
                  const h = e.nativeEvent.layout.height;
                  setHeights((hs) => (hs[k] === h ? hs : Object.assign([...hs], { [k]: h })));
                }}
                accessibilityElementsHidden={k !== i}
                style={[textStyle, k === i ? null : { position: 'absolute', left: 0, right: 0, top: 0, opacity: 0 }]}
              >
                {w.text}
              </Text>
            ))}
          </View>
        </Panel>
      </View>
      {!!c.note && (
        <Note arrow style={{ maxWidth: 280, marginHorizontal: 6 }}>
          {c.note}
        </Note>
      )}
    </>
  );
}

// ---------- 6 this vs that ----------
export function VsCard({ c }: { c: CardOf<'vs'> }) {
  const [open, setOpen] = useState<number | null>(null);
  const cols = { k: { width: 74 }, v: { flex: 1 } } as const;
  // Long side labels shrink so the two headers never run into each other.
  const headSize = Math.max(c.left.label.length, c.right.label.length) > 7 ? 16 : 21;
  return (
    <>
      <CardH style={{ maxWidth: undefined }}>{c.title.replace(/ vs /i, '\nvs ')}</CardH>
      <View>
        <SpotCut art={c.art} size={108} rotate={-7} style={{ right: -14, top: -90 }} />
        <Sticker art={c.sticker} rotate={10} style={{ position: 'absolute', right: -6, bottom: -30, zIndex: 3 }} />
        <Panel style={{ paddingVertical: 16, paddingHorizontal: 14 }}>
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-end', marginBottom: 10, paddingHorizontal: 10 }}>
            <View style={cols.k} />
            {[c.left, c.right].map((side, k) => (
              <View key={k} style={[cols.v, { flexDirection: 'row', alignItems: 'center', gap: 7 }]}>
                <Sticker art={side.art} size={headSize === 21 ? 30 : 24} rotate={-8} />
                <Text numberOfLines={2} style={{ fontFamily: fonts.disp900, fontSize: headSize, lineHeight: headSize + 1, color: paper.ink, flexShrink: 1 }}>{side.label}</Text>
              </View>
            ))}
          </View>
          <View style={{ gap: 8 }}>
            {c.rows.map((r, k) => (
              <Strip key={k} onPress={() => setOpen(open === k ? null : k)} accessibilityLabel={`${r.k}: ${c.left.label}, ${r.l}. ${c.right.label}, ${r.r}. ${open === k ? r.more : 'Tap for the reason'}`} style={{ paddingVertical: 11, paddingHorizontal: 10 }}>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <Text style={[cols.k, { fontFamily: fonts.disp800, fontSize: 13, lineHeight: 16, color: paper.ink }]}>{r.k}</Text>
                  <Text style={[cols.v, { fontFamily: fonts.body, fontSize: 14.5, lineHeight: 19, color: paper.ink }]}>{r.l}</Text>
                  <Text style={[cols.v, { fontFamily: fonts.body, fontSize: 14.5, lineHeight: 19, color: paper.ink }]}>{r.r}</Text>
                </View>
                {open === k && (
                  <Text style={{ marginTop: 8, paddingTop: 8, borderTopWidth: 1.5, borderTopColor: paper.rule, fontFamily: fonts.body, fontSize: 14.5, lineHeight: 20, color: paper.ink2 }}>{r.more}</Text>
                )}
              </Strip>
            ))}
          </View>
        </Panel>
      </View>
      <Note style={{ marginHorizontal: 6 }}>open a row for the reason</Note>
    </>
  );
}

// ---------- 7 guess the number ----------
export function GuessCard({ c }: { c: CardOf<'guess'> }) {
  return (
    <>
      <CardH>Guess the number</CardH>
      <View>
        <SpotCut art={c.art} size={116} rotate={9} style={{ right: -14, top: -100 }} />
        <Sticker art={c.sticker} rotate={-12} style={{ position: 'absolute', left: -12, bottom: -28, zIndex: 3 }} />
        <Panel style={{ paddingVertical: 24, paddingHorizontal: 22 }}>
          <Text style={{ fontFamily: fonts.disp800, fontSize: 21, lineHeight: 24, color: paper.ink }}>{c.question}</Text>
          <GuessSlider min={c.min} max={c.max} answer={c.answer} unit={c.unit} explain={c.explain} />
        </Panel>
      </View>
    </>
  );
}

// ---------- 8 watch it ----------
export function WatchCard({ c, pin }: { c: CardOf<'watch'>; pin?: PinTarget }) {
  const g = useGround();
  const [playing, setPlaying] = useState(false);
  useCardHandlers({ play: () => setPlaying(true), pin: pin && !pin.pinned ? pin.toggle : undefined });
  const reduce = useReduceMotion();
  const drift = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduce || playing) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(drift, { toValue: 1, duration: 2400, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(drift, { toValue: 0, duration: 2400, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [reduce, playing, drift]);
  const [playerW, setPlayerW] = useState(0);
  return (
    <>
      <CardH>Watch it</CardH>
      <View>
        <SpotCut art={c.art} size={120} rotate={-8} style={{ right: -12, top: -102 }} />
        <Panel style={{ paddingTop: 16, paddingHorizontal: 16, paddingBottom: 20 }}>
          <View style={{ borderRadius: 10, overflow: 'hidden', backgroundColor: paper.ink, boxShadow: g.sh }}>
            <View style={{ aspectRatio: 16 / 9, overflow: 'hidden' }} onLayout={(e) => setPlayerW(e.nativeEvent.layout.width)}>
              {playing && playerW > 0 ? (
                <Player videoId={c.video.videoId} title={c.video.title} width={playerW} />
              ) : (
                <>
                  <Animated.View
                    style={{
                      position: 'absolute',
                      right: -26,
                      bottom: -34,
                      width: 150,
                      height: 150,
                      borderRadius: 75,
                      backgroundColor: paper.yellow,
                      transform: [{ translateX: drift.interpolate({ inputRange: [0, 1], outputRange: [0, -14] }) }, { translateY: drift.interpolate({ inputRange: [0, 1], outputRange: [0, -10] }) }, { scale: drift.interpolate({ inputRange: [0, 1], outputRange: [1, 1.08] }) }],
                    }}
                  />
                  <Cut art="zap" size={112} style={{ position: 'absolute', right: 8, bottom: 0 }} />
                  <Text numberOfLines={3} style={{ position: 'absolute', left: 14, top: 14, maxWidth: 120, fontFamily: fonts.disp900, fontSize: c.thumbTitle.length > 18 ? 17 : 21, lineHeight: c.thumbTitle.length > 18 ? 18 : 21, letterSpacing: -0.2, textTransform: 'uppercase', color: paper.white }}>{c.thumbTitle}</Text>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Play video: ${c.video.title}`}
                    onPress={() => setPlaying(true)}
                    style={({ pressed }) => ({ position: 'absolute', left: '50%', top: '50%', marginLeft: -32, marginTop: -32, width: 64, height: 64, borderRadius: 32, backgroundColor: paper.white, alignItems: 'center', justifyContent: 'center', boxShadow: g.shUp, ...(pressed ? { transform: [{ scale: 0.94 }] } : {}) })}
                  >
                    <Icon name="play" color={paper.ink} fill />
                  </Pressable>
                </>
              )}
            </View>
            <View style={{ height: 5, backgroundColor: 'rgba(251,250,246,0.25)' }}>
              <View style={{ height: 5, width: playing ? '100%' : '0%', backgroundColor: paper.yellow }} />
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingTop: 9, paddingHorizontal: 12, paddingBottom: 8 }}>
              <Text style={[type.typed, { color: paper.white }]}>{playing ? 'playing' : 'tap to play'}</Text>
              <Text style={[type.typed, { color: paper.white }]}>YouTube</Text>
            </View>
          </View>
          <Text style={{ fontFamily: fonts.disp800, fontSize: 21, lineHeight: 24, color: paper.ink, marginTop: 16 }}>{c.video.title}</Text>
          {pin && (
            <View style={{ marginTop: 12 }}>
              <PinChip pin={pin} />
            </View>
          )}
        </Panel>
      </View>
    </>
  );
}

// ---------- story cards ----------
export function SimpleCard({ c, staple, pin }: { c: CardOf<'simple'>; staple?: boolean; pin?: PinTarget }) {
  useCardHandlers({ pin: pin && !pin.pinned ? pin.toggle : undefined });
  return (
    <>
      <CardH style={{ maxWidth: undefined }}>{c.h}</CardH>
      <View>
        <Panel style={{ paddingVertical: 24, paddingHorizontal: 22 }}>
          {staple && <View style={{ position: 'absolute', left: 22, top: -3, width: 30, height: 6, borderRadius: 3, backgroundColor: paper.staple, transform: [{ rotate: '-7deg' }], zIndex: 4 }} />}
          <Text style={[type.panelLead, { color: paper.ink }]}>{c.body}</Text>
          {c.source && <SourceLine src={c.source} pin={pin} />}
        </Panel>
        <Cut art={c.art} size={138} rotate={9} style={{ position: 'absolute', right: -14, bottom: -104, zIndex: 3 }} />
      </View>
      {!!c.note && (
        <Note arrow style={{ maxWidth: 210, marginHorizontal: 6 }}>
          {c.note}
        </Note>
      )}
    </>
  );
}
