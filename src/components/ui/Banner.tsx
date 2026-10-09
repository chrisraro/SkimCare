import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps, ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { palette, radius, space } from '@/theme/tokens';
import { AppText } from './AppText';

type Tone = 'info' | 'warning' | 'danger' | 'success';

const tones: Record<Tone, { bg: string; fg: string; icon: ComponentProps<typeof Ionicons>['name'] }> = {
  info: { bg: palette.slate100, fg: palette.slate700, icon: 'information-circle' },
  warning: { bg: palette.amber100, fg: palette.amber700, icon: 'warning' },
  danger: { bg: palette.coral100, fg: palette.coral700, icon: 'alert-circle' },
  success: { bg: palette.teal100, fg: palette.teal700, icon: 'shield-checkmark' },
};

export function Banner({ tone = 'info', children, action }: { tone?: Tone; children: ReactNode; action?: ReactNode }) {
  const t = tones[tone];
  return (
    <View style={[styles.wrap, { backgroundColor: t.bg }]} accessibilityRole="alert">
      <Ionicons name={t.icon} size={20} color={t.fg} />
      <View style={styles.body}>
        {typeof children === 'string' ? (
          <AppText variant="small" style={{ color: t.fg }}>
            {children}
          </AppText>
        ) : (
          children
        )}
        {action}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    gap: space.sm,
    padding: space.md,
    borderRadius: radius.lg,
    alignItems: 'flex-start',
  },
  body: { flex: 1, gap: space.sm },
});
