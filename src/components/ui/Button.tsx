import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { colors, palette, radius, space, touch } from '@/theme/tokens';
import { AppText } from './AppText';

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

const variants: Record<Variant, { bg: string; pressed: string; fg: string; border?: string }> = {
  primary: { bg: colors.primary, pressed: colors.primaryPressed, fg: colors.textInverse },
  secondary: { bg: colors.surface, pressed: colors.surfaceMuted, fg: colors.text, border: colors.borderStrong },
  ghost: { bg: 'transparent', pressed: colors.surfaceMuted, fg: colors.primary },
  danger: { bg: colors.surface, pressed: palette.coral100, fg: palette.coral700, border: palette.coral700 },
};

export function Button({ label, onPress, variant = 'primary', icon, disabled, loading, accessibilityHint }: ButtonProps) {
  const v = variants[variant];
  const inactive = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: inactive, busy: loading }}
      disabled={inactive}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        { backgroundColor: pressed ? v.pressed : v.bg },
        v.border ? { borderWidth: 1, borderColor: v.border } : null,
        inactive && styles.disabled,
      ]}
    >
      <View style={styles.row}>
        {loading ? (
          <ActivityIndicator color={v.fg} />
        ) : icon ? (
          <Ionicons name={icon} size={20} color={v.fg} />
        ) : null}
        <AppText variant="bodyStrong" style={{ color: v.fg }}>
          {label}
        </AppText>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: touch.min + 4,
    borderRadius: radius.md,
    paddingHorizontal: space.lg,
    justifyContent: 'center',
  },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.sm },
  disabled: { opacity: 0.5 },
});
