import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { DemoBanner } from '@/components/DemoBanner';
import { EmptyState } from '@/components/EmptyState';
import { FindingCard } from '@/components/FindingCard';
import { Chip, Screen } from '@/components/ui';
import type { ReviewStatus } from '@/domain/schema';
import { useDocument } from '@/features/documents/store';
import { useT } from '@/i18n/useT';
import { space } from '@/theme/tokens';

const FILTERS: ReviewStatus[] = ['needs_attention', 'needs_clarification', 'explained', 'unable_to_verify'];

/** S12 Terms & obligations — filterable extracted clauses. */
export default function Terms() {
  const t = useT();
  const { id } = useLocalSearchParams<{ id: string }>();
  const doc = useDocument(id);
  const [filter, setFilter] = useState<ReviewStatus | null>(null);
  const open = useCallback(
    (findingId: string) => router.push({ pathname: '/doc/[id]/finding/[findingId]', params: { id: id!, findingId } }),
    [id],
  );

  const findings = (doc?.analysis?.findings ?? []).filter((f) => !filter || f.reviewStatus === filter);

  return (
    <Screen>
      <Stack.Screen options={{ title: t('terms_title') }} />
      <DemoBanner />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
        <Chip label={t('terms_all')} selected={!filter} onPress={() => setFilter(null)} />
        {FILTERS.map((f) => (
          <Chip key={f} label={t(`status_${f}`)} selected={filter === f} onPress={() => setFilter(f)} />
        ))}
      </ScrollView>
      {findings.length === 0 ? <EmptyState icon="filter-outline" message="No findings in this group." /> : null}
      {findings.map((f) => (
        <FindingCard key={f.id} finding={f} onPress={open} />
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({ filters: { gap: space.sm, paddingRight: space.lg } });
