import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View, type ViewStyle } from 'react-native';
import { colors, radius, space } from '@/theme/tokens';

interface CardProps {
  children: ReactNode;
  onPress?: () => void;
  accessibilityLabel?: string;
  style?: ViewStyle;
  tone?: 'default' | 'muted' | 'brand';
}

const toneBg = { default: colors.surface, muted: colors.surfaceMuted, brand: colors.header };

export function Card({ children, onPress, accessibilityLabel, style, tone = 'default' }: CardProps) {
  const base = [styles.card, { backgroundColor: toneBg[tone] }, style];
  if (!onPress) return <View style={base}>{children}</View>;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={({ pressed }) => [...base, pressed && styles.pressed]}
    >
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.card,
    padding: space.lg,
    gap: space.sm,
  },
  pressed: { transform: [{ scale: 0.98 }] },
});
