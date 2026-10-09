import type { ReactNode } from 'react';
import { ActivityIndicator, Image, Pressable, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { useColors } from '../theme';

const icon = require('../../assets/logo.png');

export function Logo({ size = 32 }: { size?: number }) {
  return <Image source={icon} style={{ width: size, height: size, borderRadius: size * 0.22 }} accessibilityIgnoresInvertColors accessible={false} />;
}

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled,
  loading,
  style,
  accessibilityLabel,
}: {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}) {
  const c = useColors();
  const bg = { primary: c.primary, secondary: 'transparent', ghost: 'transparent', danger: c.danger }[variant];
  const fg = { primary: c.onPrimary, secondary: c.primary, ghost: c.muted, danger: '#fff' }[variant];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [
        {
          backgroundColor: bg,
          borderRadius: 14,
          paddingVertical: 14,
          paddingHorizontal: 20,
          alignItems: 'center',
          justifyContent: 'center',
          borderWidth: variant === 'secondary' ? 2 : 0,
          borderColor: c.primary,
          opacity: disabled ? 0.5 : pressed ? 0.85 : 1,
        },
        style,
      ]}
    >
      {loading ? <ActivityIndicator color={fg} /> : <Text style={{ color: fg, fontSize: 16, fontWeight: '600' }}>{label}</Text>}
    </Pressable>
  );
}

export function Chip({ label, onPress, disabled, highlight }: { label: string; onPress: () => void; disabled?: boolean; highlight?: boolean }) {
  const c = useColors();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => ({
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: highlight ? c.citeBg : c.border,
        backgroundColor: highlight ? c.accentBg : c.chip,
        opacity: disabled ? 0.5 : pressed ? 0.7 : 1,
      })}
    >
      <Text style={{ color: highlight ? c.accentText : c.text, fontSize: 14, fontWeight: '500' }}>{label}</Text>
    </Pressable>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const c = useColors();
  return <View style={[{ backgroundColor: c.card, borderRadius: 18, borderWidth: 1, borderColor: c.border, padding: 14 }, style]}>{children}</View>;
}

export function Skeleton({ height = 16, width = '100%' as const, style }: { height?: number; width?: number | `${number}%`; style?: StyleProp<ViewStyle> }) {
  const c = useColors();
  return <View style={[{ height, width, borderRadius: 10, backgroundColor: c.skeleton }, style]} />;
}

export function Badge({ label, tone = 'warn' }: { label: string; tone?: 'warn' | 'accent' }) {
  const c = useColors();
  return (
    <View style={{ alignSelf: 'flex-start', backgroundColor: tone === 'warn' ? c.warnBg : c.accentBg, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 }}>
      <Text style={{ color: tone === 'warn' ? c.warnText : c.accentText, fontSize: 12, fontWeight: '600' }}>{label}</Text>
    </View>
  );
}
