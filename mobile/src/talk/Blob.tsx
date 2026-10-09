// The talk-mode blob: a wobbling yellow shape with a fixed halftone screen showing through it.
// It breathes when idle, jitters while listening, spins up while thinking and pulses while speaking.
import { useEffect, useMemo, useRef } from 'react';
import { Platform, View } from 'react-native';
import Svg, { ClipPath, Defs, G, Path } from 'react-native-svg';
import { useReduceMotion } from '../ui/kit';
import { paper } from '../ui/tokens';

export type BlobPhase = 'idle' | 'listening' | 'thinking' | 'speaking';

const TAU = Math.PI * 2;

export function blobPath(cx: number, cy: number, R: number, lv: number, now: number, spin: number): string {
  const N = 10;
  const pts: [number, number][] = [];
  for (let i = 0; i < N; i++) {
    const a = (i / N) * TAU + spin;
    const r = R * (1 + 0.06 * Math.sin(a * 2 + now * 0.0011) + 0.045 * Math.sin(a * 3 - now * 0.0017) + lv * (0.1 * Math.sin(a * 4 + now * 0.0075) + 0.065 * Math.sin(a * 7 - now * 0.011)));
    pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  const f = (v: number) => v.toFixed(1);
  const last = pts[N - 1]!;
  let d = `M${f((last[0] + pts[0]![0]) / 2)} ${f((last[1] + pts[0]![1]) / 2)}`;
  for (let i = 0; i < N; i++) {
    const p = pts[i]!;
    const n = pts[(i + 1) % N]!;
    d += `Q${f(p[0])} ${f(p[1])} ${f((p[0] + n[0]) / 2)} ${f((p[1] + n[1]) / 2)}`;
  }
  return `${d}Z`;
}

/** The halftone screen: dots on a 30° grid, bigger towards the bottom right. One path, drawn once. */
export function dotsPath(cx: number, cy: number, R: number, cell = 10): string {
  const co = 0.866;
  const si = 0.5;
  const uc = cx * co + cy * si;
  const vc = cy * co - cx * si;
  const ext = R * 1.3;
  let d = '';
  for (let u = Math.floor((uc - ext) / cell) * cell; u < uc + ext; u += cell)
    for (let v = Math.floor((vc - ext) / cell) * cell; v < vc + ext; v += cell) {
      const x = u * co - v * si;
      const y = u * si + v * co;
      const k = (((x - cx) * 0.62 + (y - cy) * 0.78) / R - 0.22) / 0.78;
      if (k <= 0.03) continue;
      const r = cell * 0.56 * Math.pow(Math.min(k, 1.15), 1.25);
      d += `M${(x - r).toFixed(1)} ${y.toFixed(1)}a${r.toFixed(1)} ${r.toFixed(1)} 0 1 0 ${(2 * r).toFixed(1)} 0a${r.toFixed(1)} ${r.toFixed(1)} 0 1 0 ${(-2 * r).toFixed(1)} 0`;
    }
  return d;
}

export function Blob({ width, height, cx, cy, R, phase }: { width: number; height: number; cx: number; cy: number; R: number; phase: BlobPhase }) {
  const reduce = useReduceMotion();
  const shape = useRef<Path | null>(null);
  const clip = useRef<Path | null>(null);
  const shadow = useRef<Path | null>(null);
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  // Size and position ease towards their targets, so the blob glides when slips arrive.
  const live = useRef({ cx, cy, R, level: 0.05 });
  const target = useRef({ cx, cy, R });
  target.current = { cx, cy, R };
  const dots = useMemo(() => dotsPath(cx, cy, R), [cx, cy, R]);
  const first = blobPath(cx, cy, R, 0.04, 1200, 0);

  useEffect(() => {
    if (reduce || !width) return;
    let raf = 0;
    let jitAt = 0;
    let jit = 0.5;
    const tick = (now: number) => {
      const s = live.current;
      const ph = phaseRef.current;
      let goal = 0.04;
      if (ph === 'listening') {
        if (now - jitAt > 110) {
          jitAt = now;
          jit = 0.35 + Math.random() * 0.65;
        }
        goal = jit;
      } else if (ph === 'speaking') goal = 0.3 + 0.3 * Math.abs(Math.sin(now * 0.009));
      else if (ph === 'thinking') goal = 0.12;
      s.level += (goal - s.level) * 0.14;
      s.cx += (target.current.cx - s.cx) * 0.1;
      s.cy += (target.current.cy - s.cy) * 0.1;
      s.R += (target.current.R - s.R) * 0.1;
      const spin = now * (ph === 'thinking' ? 0.0019 : 0.00035);
      const d = blobPath(s.cx, s.cy, s.R, s.level, now, spin);
      shape.current?.setNativeProps({ d } as never);
      clip.current?.setNativeProps({ d } as never);
      shadow.current?.setNativeProps({ d } as never);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [reduce, width]);

  if (!width || !height) return null;
  return (
    <View pointerEvents="none" style={{ position: 'absolute', left: 0, top: 0, width, height }}>
      <Svg width={width} height={height}>
        <Defs>
          <ClipPath id="blobClip">
            <Path ref={clip} d={first} />
          </ClipPath>
        </Defs>
        {/* A soft offset copy stands in for the canvas drop shadow. */}
        <G opacity={Platform.OS === 'web' ? 0.16 : 0.14} transform="translate(0 8)">
          <Path ref={shadow} d={first} fill={paper.ink} />
        </G>
        <Path ref={shape} d={first} fill={paper.yellow} />
        <G clipPath="url(#blobClip)">
          <Path d={dots} fill={paper.ink} />
        </G>
      </Svg>
    </View>
  );
}
