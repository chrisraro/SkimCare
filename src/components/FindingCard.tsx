import Ionicons from '@expo/vector-icons/Ionicons';
import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import type { Finding } from '@/domain/schema';
import { colors, space } from '@/theme/tokens';
import { AppText, Card, StatusBadge } from './ui';

interface Props {
  finding: Finding;
  onPress: (id: string) => void;
}

export const FindingCard = memo(function FindingCard({ finding, onPress }: Props) {
  return (
    <Card onPress={() => onPress(finding.id)} accessibilityLabel={`${finding.title}. Opens evidence and explanation.`}>
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
      <View style={styles.foot}>
        <AppText variant="small" tone="primary" style={styles.cta}>
          {finding.evidence ? 'Evidence & meaning' : 'Why it cannot be verified'}
        </AppText>
        <Ionicons name="chevron-forward" size={16} color={colors.primary} />
      </View>
    </Card>
  );
});

const styles = StyleSheet.create({
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  foot: { flexDirection: 'row', alignItems: 'center', gap: space.xxs, marginTop: space.xs },
  cta: { fontWeight: '700' },
});
