// "Guess the number": drag, lock it in, then the real answer is flagged on the scale.
import { useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, PanResponder, Text, View } from 'react-native';
import { Btn, Note } from '../ui/kit';
import { Cross, Tick } from '../ui/Marks';
import { fonts, paper, type, useGround } from '../ui/tokens';
import { useCardHandlers } from './bus';

const THUMB = 34;

export function niceNumber(n: number): string {
  const abs = Math.abs(n);
  const dp = abs >= 100 || Number.isInteger(n) ? 0 : abs >= 10 ? 1 : 2;
  return n.toLocaleString('en-GB', { maximumFractionDigits: dp });
}

export function GuessSlider({ min, max, answer, unit, explain }: { min: number; max: number; answer: number; unit: string; explain: string }) {
  const g = useGround();
  // About 500 steps across the range, rounded to a whole number when the range is wide.
  const step = useMemo(() => {
    const raw = (max - min) / 500;
    return raw >= 1 ? Math.round(raw) : raw >= 0.1 ? 0.1 : 0.01;
  }, [min, max]);
  const snap = (v: number) => Math.min(max, Math.max(min, Math.round((v - min) / step) * step + min));
  const [value, setValue] = useState(() => snap((min + max) / 2));
  const [locked, setLocked] = useState(false);
  const width = useRef(0);
  const startValue = useRef(value);
  const lockedRef = useRef(false);
  lockedRef.current = locked;

  const frac = (v: number) => (v - min) / (max - min || 1);
  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => !lockedRef.current,
        onMoveShouldSetPanResponder: (_e, gs) => !lockedRef.current && Math.abs(gs.dx) > Math.abs(gs.dy),
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: (e) => {
          // A tap on the track jumps there; a drag starts from wherever the thumb is.
          const x = e.nativeEvent.locationX;
          const v = snap(min + ((x - THUMB / 2) / Math.max(1, width.current - THUMB)) * (max - min));
          setValue(v);
          startValue.current = v;
        },
        onPanResponderMove: (_e, gs) => {
          setValue(snap(startValue.current + (gs.dx / Math.max(1, width.current - THUMB)) * (max - min)));
        },
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [min, max, step],
  );

  const shown = locked ? answer : value;
  const off = Math.abs(value - answer);
  const close = off <= (max - min) * 0.05;
  const way = value > answer ? 'over' : 'under';
  const u = unit ? ` ${unit}` : '';

  useCardHandlers({ guess: (v) => !locked && setValue(snap(v)), lockIn: () => !locked && lock() });

  const lock = () => {
    setLocked(true);
    AccessibilityInfo.announceForAccessibility?.(`The answer is ${niceNumber(answer)}${u}. You said ${niceNumber(value)}.`);
  };

  return (
    <View>
      <Text style={{ fontFamily: fonts.disp900, fontSize: 54, lineHeight: 54, letterSpacing: -1.6, color: paper.ink, marginTop: 14, fontVariant: ['tabular-nums'] }} accessibilityLiveRegion="polite">
        {niceNumber(shown)}
        {u}
      </Text>
      {locked && (
        <Note onPaper style={{ marginTop: 2 }}>
          you said {niceNumber(value)}
          {u}
        </Note>
      )}
      <View style={{ paddingBottom: 34, marginTop: 6 }}>
        <View
          {...pan.panHandlers}
          onLayout={(e) => (width.current = e.nativeEvent.layout.width)}
          accessible
          accessibilityRole="adjustable"
          accessibilityLabel={`Your guess${u ? `, in${u}` : ''}`}
          accessibilityValue={{ min, max, now: value, text: `${niceNumber(value)}${u}` }}
          accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
          onAccessibilityAction={(e) => !locked && setValue((v) => snap(v + (e.nativeEvent.actionName === 'increment' ? 1 : -1) * (max - min) * 0.05))}
          style={{ height: 44, justifyContent: 'center' }}
        >
          <View style={{ height: 5, borderRadius: 3, backgroundColor: paper.ink, marginHorizontal: THUMB / 2 }} />
          <View
            pointerEvents="none"
            style={{ position: 'absolute', top: (44 - THUMB) / 2, left: `${frac(value) * 100}%`, marginLeft: -frac(value) * THUMB, width: THUMB, height: THUMB, borderRadius: THUMB / 2, backgroundColor: g.strip, borderWidth: 4, borderColor: paper.ink, boxShadow: g.sh }}
          />
        </View>
        <View style={{ position: 'absolute', left: 0, right: 0, top: 40, flexDirection: 'row', justifyContent: 'space-between' }}>
          <Text style={[type.typed, { color: paper.onYellow2 }]}>
            {niceNumber(min)}
            {u}
          </Text>
          <Text style={[type.typed, { color: paper.onYellow2 }]}>
            {niceNumber(max)}
            {u}
          </Text>
        </View>
        {locked && (
          <View style={{ position: 'absolute', top: 27, left: `${frac(answer) * 100}%`, marginLeft: THUMB / 2 - frac(answer) * THUMB, transform: [{ translateX: -20 }], width: 40, alignItems: 'center' }}>
            <View style={{ width: 3, height: 13, borderRadius: 2, backgroundColor: paper.ink, marginBottom: 3 }} />
            <Text style={{ fontFamily: fonts.disp900, fontSize: 14.5, color: paper.ink }}>{niceNumber(answer)}</Text>
          </View>
        )}
      </View>
      {!locked ? (
        <Btn label="Lock it in" onYellow wide onPress={lock} />
      ) : (
        <View style={{ gap: 10, marginTop: 6 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            {close ? <Tick color={paper.good} /> : <Cross color={paper.bad} />}
            <Text style={{ fontFamily: fonts.disp800, fontSize: 17, lineHeight: 20, color: paper.ink, flexShrink: 1 }}>
              {off === 0 ? 'Spot on.' : close ? `Close. Only ${niceNumber(off)}${u} ${way}.` : `${niceNumber(off)}${u} ${way}.`}
            </Text>
          </View>
          <Text style={[type.panelBody, { color: paper.ink }]}>{explain}</Text>
        </View>
      )}
    </View>
  );
}
