import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { colors, palette, radius, space } from '@/theme/tokens';
import { AppText } from './AppText';
import { GlassSurface } from './GlassSurface';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

interface ButtonProps {
  label: string;
  onPress?: () => void;
  variant?: Variant;
  icon?: ComponentProps<typeof Ionicons>['name'];
  disabled?: boolean;
  loading?: boolean;
  accessibilityHint?: string;
}

const fg: Record<Variant, string> = {
  primary: colors.textInverse,
  secondary: colors.text,
  ghost: colors.primary,
  danger: palette.coral700,
};

/**
 * Primary is tinted glass; secondary and ghost are clear glass (footers float over
 * scrolling content, so every button needs a surface of its own); danger stays solid.
 */
export function Button({ label, onPress, variant = 'primary', icon, disabled, loading, accessibilityHint }: ButtonProps) {
  const color = fg[variant];
  const inactive = disabled || loading;
  const content = (
    <View style={styles.row}>
      {loading ? <ActivityIndicator color={color} /> : icon ? <Ionicons name={icon} size={20} color={color} /> : null}
      <AppText variant="bodyStrong" numberOfLines={2} style={{ color, fontWeight: '700', flexShrink: 1, textAlign: 'center' }}>
        {label}
      </AppText>
    </View>
  );
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: inactive, busy: loading }}
      disabled={inactive}
      onPress={onPress}
      style={({ pressed }) => [pressed && styles.pressed, inactive && styles.disabled]}
    >
      {variant !== 'danger' ? (
        <GlassSurface variant={variant === 'primary' ? 'prominent' : 'regular'} style={styles.base}>
          {content}
        </GlassSurface>
      ) : (
        <View style={[styles.base, variant === 'danger' && styles.danger]}>{content}</View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 56,
    borderRadius: radius.pill,
    paddingHorizontal: space.lg,
    justifyContent: 'center',
  },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.sm },
  danger: { backgroundColor: palette.coral100 },
  pressed: { transform: [{ scale: 0.97 }] },
  disabled: { opacity: 0.5 },
});
