import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps, ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { colors, radius, space, touch } from '@/theme/tokens';
import { AppText } from './AppText';

interface ListRowProps {
  title: string;
  subtitle?: string;
  icon?: ComponentProps<typeof Ionicons>['name'];
  iconTone?: 'primary' | 'muted';
  right?: ReactNode;
  onPress?: () => void;
  accessibilityHint?: string;
}

export function ListRow({ title, subtitle, icon, iconTone = 'primary', right, onPress, accessibilityHint }: ListRowProps) {
  const main = (
    <>
      {icon ? (
        <View style={[styles.icon, iconTone === 'muted' && styles.iconMuted]}>
          <Ionicons name={icon} size={22} color={iconTone === 'primary' ? colors.primary : colors.textMuted} />
        </View>
      ) : null}
      <View style={styles.text}>
        <AppText variant="bodyStrong">{title}</AppText>
        {subtitle ? (
          <AppText variant="small" tone="muted">
            {subtitle}
          </AppText>
        ) : null}
      </View>
    </>
  );

  if (!onPress) {
    return (
      <View style={styles.row}>
        {main}
        {right}
      </View>
    );
  }

  const pressable = (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={subtitle ? `${title}. ${subtitle}` : title}
      accessibilityHint={accessibilityHint}
      onPress={onPress}
      style={({ pressed }) => [styles.row, right ? styles.flexMain : null, pressed && { backgroundColor: colors.surfaceMuted }]}
    >
      {main}
      {right ? null : <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />}
    </Pressable>
  );

  // Trailing actions sit beside the pressable area — never nested inside it.
  if (!right) return pressable;
  return (
    <View style={[styles.row, styles.outer]}>
      {pressable}
      {right}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: touch.min + 16,
    paddingVertical: space.md,
    paddingHorizontal: space.md,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  icon: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconMuted: { backgroundColor: colors.surfaceMuted },
  text: { flex: 1, gap: 2 },
  flexMain: { flex: 1, paddingHorizontal: 0, paddingVertical: 0, minHeight: touch.min },
  outer: { gap: space.xs },
});
