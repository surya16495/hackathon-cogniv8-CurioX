// Design tokens from the zine design: paper ground, yellow paper, black ink, state marked by hand.
// Paper pieces (panels, strips, sheets, chips) keep paper inks in both themes; only the ground changes.
import type { TextStyle } from 'react-native';

export const paper = {
  yellow: '#FFB81C',
  ink: '#141310',
  ink2: '#514E46',
  white: '#FBFAF6',
  onYellow2: '#4D3B00',
  pen: '#1D3FBF',
  good: '#0B7A4B',
  bad: '#C62828',
  rule: 'rgba(20,19,16,0.32)',
  tape: 'rgba(255,240,190,0.82)',
  staple: '#8B8982',
  lock: '#12110F',
  lock2: '#2B2924',
  lockInk: '#F6F4EE',
  lockInk2: '#B9B5A9',
} as const;

const light = {
  scheme: 'light' as 'light' | 'dark',
  ground: '#F4F4F1',
  onGround: '#141310',
  onGround2: '#45423B',
  rule: 'rgba(20,19,16,0.24)',
  strip: '#FFFFFF',
  pen: '#1D3FBF',
  good: '#0B7A4B',
  bad: '#C62828',
  scrim: 'rgba(20,19,16,0.5)',
  sh: '0px 1px 1px rgba(20,19,16,0.1), 0px 9px 16px -9px rgba(20,19,16,0.42)',
  shUp: '0px 2px 2px rgba(20,19,16,0.1), 0px 18px 28px -14px rgba(20,19,16,0.5)',
};

export type Ground = typeof light;

/** Always the light paper ground: the design is a daily zine on paper, in any system theme. */
export function useGround(): Ground {
  return light;
}

// ---------- type ----------
export const fonts = {
  disp500: 'Gabarito_500Medium',
  disp700: 'Gabarito_700Bold',
  disp800: 'Gabarito_800ExtraBold',
  disp900: 'Gabarito_900Black',
  body: 'AtkinsonHyperlegible_400Regular',
  bodyBold: 'AtkinsonHyperlegible_700Bold',
  bodyItalic: 'AtkinsonHyperlegible_400Regular_Italic',
  type: 'CourierPrime_400Regular',
  typeBold: 'CourierPrime_700Bold',
  hand: 'ReenieBeanie_400Regular',
} as const;

/** CSS `font: <size>/<line-height>` with em letter-spacing, as a React Native style. */
const t = (fontFamily: string, size: number, lh: number, em = 0): TextStyle => ({
  fontFamily,
  fontSize: size,
  lineHeight: Math.round(size * lh),
  letterSpacing: em * size,
});

export const type = {
  xl: t(fonts.disp900, 40, 0.98, -0.02), // .h-xl
  l: t(fonts.disp800, 30, 1.05, -0.015), // .h-l
  m: t(fonts.disp800, 21, 1.15, -0.01), // .h-m
  barH: t(fonts.disp800, 21, 1.0),
  secH: t(fonts.disp800, 21, 1.1, -0.01),
  cardH: t(fonts.disp900, 40, 0.98, -0.02),
  claim: t(fonts.disp900, 30, 1.06, -0.015),
  quizQ: t(fonts.disp900, 30, 1.08, -0.015),
  todayH: t(fonts.disp900, 30, 0.98, -0.02),
  word: t(fonts.disp900, 76, 0.9, -0.04), // .ob-word
  lockTime: t(fonts.disp800, 76, 1.0, -0.03),
  score: t(fonts.disp900, 76, 0.9, -0.04),
  guessNum: t(fonts.disp900, 54, 1.0, -0.03),
  panelLead: t(fonts.disp700, 21, 1.3),
  panelBody: t(fonts.body, 16, 1.5),
  strip: t(fonts.disp700, 17, 1.3),
  btn: t(fonts.disp800, 17, 1.1),
  chip: t(fonts.disp700, 16, 1.15),
  mini: t(fonts.disp700, 14.5, 1.0),
  act: t(fonts.disp700, 14.5, 1.0),
  tab: t(fonts.disp700, 13, 1.0),
  pill: t(fonts.typeBold, 13, 1.0),
  typed: t(fonts.type, 13, 1.4),
  note: t(fonts.hand, 25, 1.14),
  hint: t(fonts.body, 14.5, 1.4),
  body: t(fonts.body, 16, 1.5),
  logo: t(fonts.disp900, 21, 1.0, -0.02),
  stamp: { ...t(fonts.disp900, 14.5, 1.0, 0.09), textTransform: 'uppercase' } as TextStyle,
} as const;

// ---------- motion ----------
/** The design's cubic-bezier curves, as Easing.bezier arguments. */
export const curves = {
  slap: [0.16, 1, 0.3, 1] as const, // .4s, things pasted down
  out: [0.16, 1, 0.3, 1] as const, // .22s
  turn: [0.2, 0.8, 0.2, 1] as const, // .55s, card flips
  thump: [0.55, 0, 1, 0.45] as const, // .2s, a stamp hitting the page
};

/** "3px 6px 4px 7px" hand-cut corners, as React Native radii. */
export const cutCorners = { borderTopLeftRadius: 3, borderTopRightRadius: 6, borderBottomRightRadius: 4, borderBottomLeftRadius: 7 };
export const stripCorners = { borderTopLeftRadius: 2, borderTopRightRadius: 5, borderBottomRightRadius: 3, borderBottomLeftRadius: 6 };
