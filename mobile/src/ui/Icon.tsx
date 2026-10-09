// The design's icon sprite: 24px, 2.25 stroke, round caps and joins.
import Svg, { Circle, Path, Rect } from 'react-native-svg';

const PATHS = {
  x: ['M6 6l12 12M18 6 6 18'],
  back: ['M19 12H5M11 6l-6 6 6 6'],
  next: ['M5 12h14M13 6l6 6-6 6'],
  up: ['M12 19V5M6 11l6-6 6 6'],
  chev: ['M9 6l6 6-6 6'],
  home: ['M4 11l8-7 8 7v8a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1z'],
  you: ['M4 20c1.5-4 5-5.5 8-5.5s6.5 1.5 8 5.5'],
  play: ['M8.5 5.5 18.5 12l-10 6.5z'],
  pause: ['M8.5 5.5v13M15.5 5.5v13'],
  search: ['M20 20l-4.5-4.5'],
  cards: ['M8 4.5h10a2 2 0 0 1 2 2V16'],
  link: ['M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1'],
  pen: ['M4 20l4.5-1L19.5 8l-3.5-3.5L5 15.5zM13.5 7l3.5 3.5'],
  ear: ['M4 14v-2a8 8 0 0 1 16 0v2M4 14h3v6H5a1 1 0 0 1-1-1zM20 14h-3v6h2a1 1 0 0 0 1-1z'],
  quiz: ['M10 6h10M10 12h10M10 18h10M3.5 6l1.2 1.2L7 5M3.5 12l1.2 1.2L7 11M3.5 18l1.2 1.2L7 17'],
  clip: ['M8 12.5l6.5-6.5a3 3 0 0 1 4.2 4.2l-8.5 8.5a5 5 0 0 1-7-7L11 4'],
  refresh: ['M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7'],
  ask: ['M5 5.5h14a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-8l-4.5 3.5V16.5H5a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1z'],
  pin: ['M9 4h6M10 4v5.5L7 13.5h10L14 9.5V4M12 13.5V21'],
  list: ['M5 7h14M5 12h14M5 17h14'],
  mic: ['M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3zM5 11a7 7 0 0 0 14 0M12 18v3'],
  speaker: ['M4 9.5h3.5L12 5.5v13l-4.5-4H4zM16 9a4 4 0 0 1 0 6M18.5 6.5a7.5 7.5 0 0 1 0 11'],
  mute: ['M4 9.5h3.5L12 5.5v13l-4.5-4H4zM16 9.5l5 5M21 9.5l-5 5'],
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 24, color, fill = false, rotate = 0 }: { name: IconName; size?: number; color: string; fill?: boolean; rotate?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill={fill ? color : 'none'} stroke={color} strokeWidth={2.25} strokeLinecap="round" strokeLinejoin="round" style={rotate ? { transform: [{ rotate: `${rotate}deg` }] } : undefined}>
      {name === 'you' && <Circle cx={12} cy={8} r={4} />}
      {name === 'search' && <Circle cx={11} cy={11} r={6} />}
      {name === 'cards' && <Rect x={4} y={8} width={13} height={12} rx={2} />}
      {PATHS[name].map((d) => (
        <Path key={d} d={d} />
      ))}
    </Svg>
  );
}
