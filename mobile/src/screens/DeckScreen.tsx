// A deck of cards, swiped sideways. Reaching the last card stamps it read and offers the quiz,
// teach it back, the sources, listening, and the next story.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Linking, Pressable, Text, TextInput, View, useWindowDimensions, type ViewToken } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { deckSpeech, type Card, type Deck, type DeckSummary, type TeachResponse } from '@curiox/shared';
import { api } from '../api/client';
import { CardPage, GuessCard, HookCard, MythCard, PinChip, SimpleCard, VsCard, WatchCard, WaysCard, WhatCard, WhyCard, CardH, type PinTarget } from '../deck/Cards';
import type { Pin } from '../hooks/useZine';
import { CardBusProvider, CardIndex, type CardHandlers } from '../deck/bus';
import { BottomSheet } from '../ui/BottomSheet';
import { Sticker } from '../ui/Art';
import { Icon, type IconName } from '../ui/Icon';
import { Cross, Ring, SaidUnderline, Tick } from '../ui/Marks';
import { Btn, Ground, IconBtn, Note, Panel, Pill, Stamp, Strip, useSize } from '../ui/kit';
import { fonts, paper, type, useGround } from '../ui/tokens';
import { speak, stopSpeaking } from '../voice/tts';

export interface DeckScreenProps {
  deck: Deck;
  next: Deck | DeckSummary | null;
  isPinned: (id: string) => boolean;
  togglePin: (p: Pin) => void;
  onRead: () => void;
  onClose: () => void;
  onQuiz: () => void;
  onNext: (id: string) => void;
  startCard?: number;
  lang: string;
  /** For voice: what the deck can do, kept current every render. */
  control?: React.MutableRefObject<DeckControl | null>;
  /** For voice: something said while teach it back is open. */
  teachSaid?: { text: string; n: number } | null;
  onIndex?: (i: number) => void;
}

export interface DeckControl {
  index: number;
  count: number;
  sheet: 'sources' | 'teach' | null;
  listening: boolean;
  go: (k: number) => void;
  openSheet: (s: 'sources' | 'teach' | null) => void;
  listen: () => void;
  card: (k: number) => CardHandlers | undefined;
}

function pinFor(deck: Deck, card: Card, index: number, isPinned: DeckScreenProps['isPinned'], togglePin: DeckScreenProps['togglePin']): PinTarget | undefined {
  const base = { deckId: deck.id, deckNo: deck.no, deckTitle: deck.title };
  let pin: Pin | null = null;
  if ((card.kind === 'what' || card.kind === 'simple') && card.source) {
    pin = { ...base, id: card.source.url, kind: 'article', title: card.source.title, site: card.source.site, summary: card.source.summary, url: card.source.url };
  } else if (card.kind === 'watch') {
    pin = { ...base, id: card.video.videoId, kind: 'video', title: card.video.title, site: 'YouTube', summary: '', url: card.video.url, videoId: card.video.videoId, card: index };
  }
  if (!pin) return undefined;
  const p = pin;
  return { id: p.id, pinned: isPinned(p.id), toggle: () => togglePin(p) };
}

function FinRow({ icon, label, onPress, right, on }: { icon: IconName | null; label: string; onPress: () => void; right?: React.ReactNode; on?: boolean }) {
  const [size, onLayout] = useSize();
  return (
    <View onLayout={onLayout}>
      <Strip onPress={onPress} accessibilityLabel={label} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52 }}>
        {icon && <Icon name={icon} size={22} color={paper.ink} />}
        <Text style={[type.strip, { color: paper.ink, flex: 1 }]}>{label}</Text>
        {right}
      </Strip>
      {on && <Ring width={size.width} height={size.height} color={paper.ink} />}
    </View>
  );
}

function Eq() {
  return (
    <View style={{ flexDirection: 'row', gap: 3, alignItems: 'flex-end', height: 18 }}>
      {[0.6, 1, 0.4].map((h, i) => (
        <View key={i} style={{ width: 4, height: 18 * h, borderRadius: 2, backgroundColor: paper.ink }} />
      ))}
    </View>
  );
}

function Finale({ deck, next, arrived, listening, onQuiz, onTeach, onSources, onListen, onNext }: { deck: Deck; next: Deck | DeckSummary | null; arrived: boolean; listening: boolean; onQuiz: () => void; onTeach: () => void; onSources: () => void; onListen: () => void; onNext: () => void }) {
  const lead = deck.kind === 'lead' || deck.kind === 'demo';
  const words = ['Zero', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve'];
  const count = deck.cards.length + 1;
  const opener = lead ? `${words[count] ?? count} cards in.` : deck.kind === 'story' ? 'That is this story.' : 'That is the whole issue.';
  return (
    <>
      <CardH>{'You came\nthis far.'}</CardH>
      <View>
        <Sticker art="hands" rotate={12} style={{ position: 'absolute', right: 6, top: -34, zIndex: 3 }} />
        <Panel style={{ paddingVertical: 24, paddingHorizontal: 22 }}>
          <Text style={[type.panelLead, { color: paper.ink }]}>{opener} Want to make it stick?</Text>
          <View style={{ gap: 10, marginTop: 18 }}>
            {deck.quiz.length > 0 && <Btn label="Take the quiz" icon="quiz" wide onYellow onPress={onQuiz} />}
            <FinRow icon="pen" label="Teach it back" onPress={onTeach} right={<Icon name="chev" size={22} color={paper.ink} />} />
            {deck.sources.length > 0 && <FinRow icon="link" label="Read the sources" onPress={onSources} right={<Icon name="chev" size={22} color={paper.ink} />} />}
            <FinRow icon="ear" label={listening ? 'Reading aloud. Press to stop.' : 'Listen'} on={listening} onPress={onListen} right={listening ? <Eq /> : undefined} />
            {next && <FinRow icon={null} label={`Next: ${next.title}`} onPress={onNext} right={<Icon name="next" size={22} color={paper.ink} />} />}
          </View>
        </Panel>
      </View>
      <Stamp label={`Read · No. ${deck.no}`} thump={arrived} style={{ alignSelf: 'flex-end', marginTop: 2, marginRight: 10 }} />
    </>
  );
}

function SourcesSheet({ deck, open, onClose, pinFor: pin }: { deck: Deck; open: boolean; onClose: () => void; pinFor: (url: string, s: Deck['sources'][number]) => PinTarget }) {
  return (
    <BottomSheet open={open} title="Sources" onClose={onClose}>
      <Note onPaper style={{ marginTop: -4, marginBottom: 2 }}>
        pin one and it waits on your pinboard
      </Note>
      {deck.sources.map((s, i) => (
        <View key={s.url} style={{ flexDirection: 'row', gap: 10, paddingVertical: 14, borderBottomWidth: 1.5, borderBottomColor: paper.rule }}>
          <View style={{ width: 30, height: 30, borderRadius: 15, borderWidth: 2, borderColor: paper.ink, alignItems: 'center', justifyContent: 'center', paddingTop: 2 }}>
            <Text style={{ fontFamily: fonts.typeBold, fontSize: 14.5, color: paper.ink }}>{i + 1}</Text>
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Pressable accessibilityRole="link" onPress={() => void Linking.openURL(s.url)}>
              <Text style={{ fontFamily: fonts.disp800, fontSize: 17, lineHeight: 20, color: paper.ink }}>{s.title}</Text>
              <Text style={[type.typed, { color: paper.ink2 }]}>{hostOf(s.url)} · opens in your browser</Text>
              {!!s.snippet && <Text numberOfLines={3} style={{ fontFamily: fonts.body, fontSize: 14.5, lineHeight: 20, color: paper.ink2, marginTop: 4 }}>{s.snippet}</Text>}
            </Pressable>
            <View style={{ marginTop: 10 }}>
              <PinChip pin={pin(s.url, s)} />
            </View>
          </View>
        </View>
      ))}
    </BottomSheet>
  );
}

const hostOf = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return 'source';
  }
};

export function TeachSheet({ open, onClose, q, sample, incoming, onResult }: { open: boolean; onClose: () => void; q: string; sample: string; incoming?: { text: string; n: number } | null; onResult?: (r: TeachResponse) => void }) {
  const [said, setSaid] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<TeachResponse | null>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    if (open) {
      setSaid('');
      setResult(null);
    }
  }, [open]);
  const mark = async (spoken?: string) => {
    const text = (spoken ?? said).trim();
    if (!text) return;
    setBusy(true);
    let r: TeachResponse;
    try {
      r = await api.teach({ q, said: text, sample });
    } catch {
      r = { verdict: 'nearly', feedback: "I couldn't mark that just now.", add: `compare it with: ${sample}`, provider: 'demo' };
    }
    setResult(r);
    setBusy(false);
    onResult?.(r);
  };
  // Voice: an answer said out loud is written in and marked.
  useEffect(() => {
    if (!open || !incoming?.text) return;
    setSaid(incoming.text);
    void mark(incoming.text);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incoming?.n]);
  return (
    <BottomSheet open={open} title="Teach it back" onClose={onClose}>
      {!result ? (
        <View style={{ gap: 12 }}>
          <Text style={{ fontFamily: fonts.disp800, fontSize: 21, lineHeight: 25, color: paper.ink }}>{q}</Text>
          <TextInput
            value={said}
            onChangeText={setSaid}
            multiline
            placeholder="say it in your own words"
            placeholderTextColor={paper.ink2}
            accessibilityLabel={q}
            style={[type.note, { minHeight: 104, borderWidth: 2, borderStyle: 'dashed', borderColor: paper.ink, borderRadius: 6, paddingVertical: 10, paddingHorizontal: 12, color: paper.pen, textAlignVertical: 'top', lineHeight: undefined }]}
          />
          <Btn label={busy ? 'Marking…' : 'Mark it'} onYellow wide disabled={busy || !said.trim()} onPress={() => void mark()} />
        </View>
      ) : (
        <View style={{ gap: 12, paddingBottom: 4 }} accessibilityLiveRegion="polite">
          <View onLayout={(e) => setW(e.nativeEvent.layout.width)} style={{ paddingBottom: 12 }}>
            <Text style={[type.note, { color: paper.pen }]}>{said}</Text>
            {w > 0 && <SaidUnderline width={w} color={paper.good} />}
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            {result.verdict === 'not_yet' ? <Cross color={paper.bad} /> : <Tick color={paper.good} />}
            <Text style={{ fontFamily: fonts.disp800, fontSize: 17, lineHeight: 20, color: paper.ink, flexShrink: 1 }}>{result.feedback}</Text>
          </View>
          <Note onPaper arrow>
            one thing to add: {result.add}
          </Note>
          <Btn label="Done" onYellow wide onPress={onClose} />
        </View>
      )}
    </BottomSheet>
  );
}

export function DeckScreen(p: DeckScreenProps) {
  const g = useGround();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const list = useRef<FlatList<number>>(null);
  const [i, setI] = useState(p.startCard ?? 0);
  const [swiped, setSwiped] = useState((p.startCard ?? 0) > 0);
  const [arrived, setArrived] = useState(false);
  const [sheet, setSheet] = useState<'sources' | 'teach' | null>(null);
  const [listening, setListening] = useState(false);
  const [listHeight, setListHeight] = useState<number | undefined>(undefined);
  const { deck } = p;
  const n = deck.cards.length + 1;
  const pages = useMemo(() => Array.from({ length: n }, (_, k) => k), [n]);
  const registry = useRef(new Map<number, { current: CardHandlers }>()).current;

  // While a programmatic turn is in flight, the old card can still count as "viewable" for a
  // moment; those reports are ignored until the card we asked for arrives.
  const pending = useRef<{ index: number; until: number } | null>(null);
  const onViewable = useRef(({ viewableItems }: { viewableItems: ViewToken<number>[] }) => {
    const v = viewableItems.find((x) => x.isViewable);
    if (v?.index == null) return;
    const want = pending.current;
    if (want && v.index !== want.index && Date.now() < want.until) return;
    pending.current = null;
    setI(v.index);
  }).current;

  useEffect(() => {
    p.onIndex?.(i);
    if (i > 0) setSwiped(true);
    if (i === n - 1 && !arrived) {
      const t = setTimeout(() => setArrived(true), 380);
      p.onRead();
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [i]);

  useEffect(() => () => stopSpeaking(), []);

  const goTo = useCallback((k: number) => {
    const to = Math.max(0, Math.min(n - 1, k));
    pending.current = { index: to, until: Date.now() + 1200 };
    list.current?.scrollToIndex({ index: to, animated: true });
    setI(to);
  }, [n]);

  const listen = () => {
    if (listening) {
      stopSpeaking();
      return setListening(false);
    }
    setListening(true);
    void speak(deckSpeech(deck), p.lang).then(() => setListening(false));
  };

  if (p.control) {
    p.control.current = {
      index: i,
      count: n,
      sheet,
      listening,
      go: goTo,
      openSheet: setSheet,
      listen,
      card: (k) => registry.get(k)?.current,
    };
  }

  const sourcePin = (url: string, s: Deck['sources'][number]): PinTarget => {
    const pin: Pin = { id: url, kind: 'article', title: s.title, site: hostOf(url), summary: s.snippet, url, deckId: deck.id, deckNo: deck.no, deckTitle: deck.title };
    return { id: url, pinned: p.isPinned(url), toggle: () => p.togglePin(pin) };
  };

  const renderCard = (k: number) => {
    const label = `Card ${k + 1} of ${n}`;
    if (k === n - 1) {
      return (
        <CardPage width={width} height={listHeight} label={label}>
          <Finale
            deck={deck}
            next={p.next}
            arrived={arrived}
            listening={listening}
            onQuiz={p.onQuiz}
            onTeach={() => setSheet('teach')}
            onSources={() => setSheet('sources')}
            onListen={listen}
            onNext={() => p.next && p.onNext(p.next.id)}
          />
        </CardPage>
      );
    }
    const c = deck.cards[k]!;
    const pin = pinFor(deck, c, k, p.isPinned, p.togglePin);
    return (
      <CardPage width={width} height={listHeight} label={label} style={c.kind === 'hook' ? { paddingBottom: 130 } : undefined}>
        {c.kind === 'hook' && <HookCard c={c} swiped={swiped} />}
        {c.kind === 'what' && <WhatCard c={c} pin={pin} />}
        {c.kind === 'why' && <WhyCard c={c} />}
        {c.kind === 'myth' && <MythCard c={c} />}
        {c.kind === 'ways' && <WaysCard c={c} />}
        {c.kind === 'vs' && <VsCard c={c} />}
        {c.kind === 'guess' && <GuessCard c={c} />}
        {c.kind === 'watch' && <WatchCard c={c} pin={pin} />}
        {c.kind === 'simple' && <SimpleCard c={c} staple={deck.kind === 'talk'} pin={pin} />}
      </CardPage>
    );
  };

  return (
    <CardBusProvider registry={registry}>
    <Ground>
      <View style={{ flex: 1, paddingTop: insets.top, paddingBottom: 4 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingTop: 4, paddingLeft: 6, paddingRight: 16, minHeight: 50 }}>
          <IconBtn name="x" label="Close deck" onPress={p.onClose} />
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8, flex: 1 }}>
            <Text style={{ fontFamily: fonts.disp900, fontSize: 17, color: g.onGround }}>No. {deck.no}</Text>
            <Text numberOfLines={1} style={[type.typed, { color: g.onGround2, flexShrink: 1 }]}>
              {deck.tag}
            </Text>
          </View>
          <Pill label={`${i + 1}/${n}`} />
        </View>

        <FlatList
          ref={list}
          data={pages}
          keyExtractor={(k) => String(k)}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          initialScrollIndex={p.startCard ?? 0}
          getItemLayout={(_d, index) => ({ length: width, offset: width * index, index })}
          onViewableItemsChanged={onViewable}
          viewabilityConfig={{ itemVisiblePercentThreshold: 60 }}
          renderItem={({ item }) => <CardIndex index={item}>{renderCard(item)}</CardIndex>}
          windowSize={3}
          style={{ flex: 1 }}
          onLayout={(e) => setListHeight(e.nativeEvent.layout.height)}
          accessibilityLabel="Cards. Swipe sideways."
        />

        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8, paddingBottom: 2 }}>
          <IconBtn name="back" label="Previous card" disabled={i === 0} onPress={() => goTo(i - 1)} />
          <View style={{ flexDirection: 'row', gap: 7, alignItems: 'center' }} accessibilityElementsHidden>
            {pages.map((k) => (
              <View key={k} style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: g.onGround, opacity: k === i ? 1 : 0.26, transform: [{ scale: k === i ? 1.4 : 1 }] }} />
            ))}
          </View>
          <IconBtn name="next" label="Next card" disabled={i === n - 1} onPress={() => goTo(i + 1)} />
        </View>
      </View>

      <SourcesSheet deck={deck} open={sheet === 'sources'} onClose={() => setSheet(null)} pinFor={sourcePin} />
      <TeachSheet open={sheet === 'teach'} onClose={() => setSheet(null)} q={deck.teach.q} sample={deck.teach.sample} incoming={p.teachSaid} />
    </Ground>
    </CardBusProvider>
  );
}
