import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps } from 'react';
import { StyleSheet, View } from 'react-native';
import type { ReviewStatus } from '@/domain/schema';
import { useT } from '@/i18n/useT';
import { radius, space, statusColors } from '@/theme/tokens';
import { AppText } from './AppText';

const icons: Record<ReviewStatus, ComponentProps<typeof Ionicons>['name']> = {
  needs_attention: 'alert-circle',
  needs_clarification: 'help-circle',
  explained: 'checkmark-circle',
  unable_to_verify: 'remove-circle',
};

/** Status is always icon + words, never color alone (PRD §08, §15). */
export function StatusBadge({ status }: { status: ReviewStatus }) {
  const t = useT();
  const c = statusColors[status];
  return (
    <View style={[styles.badge, { backgroundColor: c.bg }]} accessibilityRole="text">
      <Ionicons name={icons[status]} size={16} color={c.fg} />
      <AppText variant="small" style={{ color: c.fg, fontWeight: '700' }}>
        {t(`status_${status}`)}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: space.xs,
    paddingHorizontal: space.sm,
    paddingVertical: space.xxs + 1,
    borderRadius: radius.pill,
  },
});
