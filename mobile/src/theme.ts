// Design tokens. Placeholder brand until the design lane's screens land: swap values here.
import { useColorScheme } from 'react-native';

const brand = {
  50: '#eef2ff',
  100: '#e0e7ff',
  200: '#c7d2fe',
  300: '#a5b4fc',
  500: '#6366f1',
  600: '#4f46e5',
  700: '#4338ca',
  800: '#3730a3',
  900: '#312e81',
  950: '#1e1b4b',
};

const light = {
  bg: '#f8fafc',
  card: '#ffffff',
  border: '#e2e8f0',
  text: '#0f172a',
  muted: '#64748b',
  subtle: '#94a3b8',
  primary: brand[600],
  primaryPressed: brand[700],
  onPrimary: '#ffffff',
  chip: '#ffffff',
  accentBg: brand[50],
  accentText: brand[700],
  citeBg: brand[100],
  citeText: brand[700],
  codeBg: '#f1f5f9',
  danger: '#dc2626',
  dangerBg: '#fef2f2',
  dangerText: '#b91c1c',
  success: '#059669',
  successBg: '#ecfdf5',
  successBorder: '#34d399',
  warnBg: '#fef3c7',
  warnText: '#92400e',
  skeleton: '#e2e8f0',
  listening: '#ef4444',
  overlay: 'rgba(15,23,42,0.9)',
  onOverlay: '#ffffff',
};

const dark: typeof light = {
  bg: '#020617',
  card: '#0f172a',
  border: '#1e293b',
  text: '#f1f5f9',
  muted: '#94a3b8',
  subtle: '#64748b',
  primary: brand[600],
  primaryPressed: brand[500],
  onPrimary: '#ffffff',
  chip: '#0f172a',
  accentBg: brand[950],
  accentText: brand[200],
  citeBg: brand[900],
  citeText: brand[200],
  codeBg: '#1e293b',
  danger: '#ef4444',
  dangerBg: '#450a0a',
  dangerText: '#fca5a5',
  success: '#34d399',
  successBg: '#022c22',
  successBorder: '#059669',
  warnBg: '#451a03',
  warnText: '#fde68a',
  skeleton: '#1e293b',
  listening: '#ef4444',
  overlay: 'rgba(241,245,249,0.95)',
  onOverlay: '#0f172a',
};

export type Colors = typeof light;

export function useColors(): Colors {
  return useColorScheme() === 'dark' ? dark : light;
}

export const radius = { sm: 8, md: 12, lg: 16, xl: 20, full: 999 };
export const space = (n: number) => n * 4;
