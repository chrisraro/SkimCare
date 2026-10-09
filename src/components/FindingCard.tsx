import Ionicons from '@expo/vector-icons/Ionicons';
import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import type { Finding } from '@/domain/schema';
import { useT } from '@/i18n/useT';
import { colors, space } from '@/theme/tokens';
import { AppText, Card, StatusBadge } from './ui';

interface Props {
  finding: Finding;
  /** Omit for a read-only preview (e.g. "Found so far" while a review runs): no button, no link. */
  onPress?: (id: string) => void;
}

export const FindingCard = memo(function FindingCard({ finding, onPress }: Props) {
  const t = useT();
  // An explicit label replaces the children's text for screen readers, so it must carry the status too.
  const summary = `${t(`status_${finding.reviewStatus}`)}: ${finding.title}${finding.evidence ? `, page ${finding.evidence.page}` : ''}.`;
  const card = (
    <Card onPress={onPress ? () => onPress(finding.id) : undefined} accessibilityLabel={`${summary} Opens evidence and explanation.`}>
      <View style={styles.top}>
        <StatusBadge status={finding.reviewStatus} />
        {finding.evidence ? (
          <AppText variant="small" tone="muted">
            p. {finding.evidence.page}
          </AppText>
        ) : null}
      </View>
      <AppText variant="heading">{finding.title}</AppText>
      <AppText tone="subtle" numberOfLines={2}>
        {finding.explanation}
      </AppText>
      {onPress ? (
        <View style={styles.foot}>
          <AppText variant="small" tone="primary" style={styles.cta}>
            {finding.evidence ? 'Evidence & meaning' : 'Why it cannot be verified'}
          </AppText>
          <Ionicons name="chevron-forward" size={16} color={colors.primary} />
        </View>
      ) : null}
    </Card>
  );
  if (onPress) return card;
  return (
    <View accessible accessibilityLabel={summary}>
      {card}
    </View>
  );
});

const styles = StyleSheet.create({
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  foot: { flexDirection: 'row', alignItems: 'center', gap: space.xxs, marginTop: space.xs },
  cta: { fontWeight: '700' },
});
