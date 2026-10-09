import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { lateInstallmentScenario } from '@/ai/scenarioRules';
import { DemoBanner } from '@/components/DemoBanner';
import { AppText, Banner, Button, Card, Screen, SectionLabel, SourceQuote } from '@/components/ui';
import { useDocument, useDocuments } from '@/features/documents/store';
import { useT } from '@/i18n/useT';
import { colors, palette, space } from '@/theme/tokens';

/** S15 What-if explorer (F13) — bounded, deterministic scenarios from confirmed terms only. */
export default function WhatIf() {
  const t = useT();
  const { id } = useLocalSearchParams<{ id: string }>();
  const doc = useDocument(id);
  const confirmFact = useDocuments((s) => s.confirmFact);
  const upsertQuestion = useDocuments((s) => s.upsertQuestion);
  const [open, setOpen] = useState(false);

  const facts = useMemo(() => doc?.analysis?.facts ?? [], [doc]);
  const stale = Boolean(doc?.analysisStale);
  // After a text correction the figures may come from the old text: no math until the review is re-run.
  const result = useMemo(() => lateInstallmentScenario(stale ? [] : facts), [facts, stale]);
  const relevant = facts.filter((f) => f.key === 'installment_amount' || f.key === 'late_fee_fixed');
  const unconfirmed = relevant.filter((f) => !f.confirmedByUser);
  const applicable = relevant.length > 0;
  const savedNone = Boolean(doc?.analysis?.questions.some((q) => q.id === 'whatif_none_q'));

  if (!doc) return null;

  const viewSource = (page: number, block: string) =>
    router.push({ pathname: '/doc/[id]/source', params: { id: doc.id, page: String(page), block } });

  return (
    <Screen title={t('whatif_title')}>
      <DemoBanner />
      {stale ? <Banner tone="warning">{t('overview_stale')}</Banner> : null}
      <AppText tone="subtle">{t('whatif_body')}</AppText>

      {!applicable ? (
        <>
          <Banner tone="info">{t('whatif_none')}</Banner>
          <Button
            label={savedNone ? 'Saved to your questions' : 'Save a question about payment rules'}
            variant={savedNone ? 'ghost' : 'secondary'}
            icon={savedNone ? 'checkmark' : 'bookmark-outline'}
            disabled={savedNone}
            onPress={() =>
              upsertQuestion(doc.id, {
                id: 'whatif_none_q',
                text: 'What happens if a payment is late, and are there any fees?',
                edited: false,
              })
            }
          />
        </>
      ) : (
        <Card onPress={() => setOpen((o) => !o)} accessibilityLabel={t('whatif_late')}>
          <View style={styles.scenarioHead}>
            <Ionicons name="calendar-outline" size={22} color={colors.primary} />
            <AppText variant="heading" style={{ flex: 1 }}>
              {t('whatif_late')}
            </AppText>
            <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={20} color={colors.textMuted} />
          </View>
        </Card>
      )}

      {applicable && open ? (
        <>
          <SectionLabel>{t('whatif_inputs')}</SectionLabel>
          {relevant.map((f) => (
            <Card key={f.id}>
              <View style={styles.factHead}>
                <AppText variant="bodyStrong">
                  {f.key === 'installment_amount' ? 'Installment amount' : 'Fixed late charge'}
                </AppText>
                {f.confirmedByUser ? (
                  <View style={styles.flag}>
                    <Ionicons name="checkmark-circle" size={16} color={palette.teal700} />
                    <AppText variant="small" style={{ color: palette.teal700, fontWeight: '700' }}>
                      Confirmed
                    </AppText>
                  </View>
                ) : null}
              </View>
              <SourceQuote evidence={f.evidence} onViewSource={() => viewSource(f.evidence.page, f.evidence.blockId)} />
              {!f.confirmedByUser ? (
                <Button label={`${t('whatif_confirm')}: ₱${f.value}`} variant="secondary" icon="checkmark" onPress={() => confirmFact(doc.id, f.id)} />
              ) : null}
            </Card>
          ))}

          {result.status === 'insufficient_information' ? (
            <Banner tone="warning">
              <AppText variant="bodyStrong" style={{ color: palette.amber700 }}>
                {t('whatif_insufficient')}
              </AppText>
              <AppText variant="small" style={{ color: palette.amber700 }}>
                {unconfirmed.length > 0 ? 'Confirm each value above against the document to see the result.' : result.assumptions.join(' ')}
              </AppText>
            </Banner>
          ) : (
            <>
              <SectionLabel>{t('whatif_result')}</SectionLabel>
              <Card tone="muted">
                {result.outputs.map((o) => (
                  <View key={o.label} style={styles.outRow}>
                    <AppText>{o.label}</AppText>
                    <AppText variant="heading" style={{ fontVariant: ['tabular-nums'] }}>
                      {o.value}
                    </AppText>
                  </View>
                ))}
                <AppText variant="small" tone="muted">
                  Rule: installment + fixed late charge. Calculated exactly on this phone.
                </AppText>
              </Card>
              <SectionLabel>{t('whatif_assumptions')}</SectionLabel>
              {result.assumptions.map((a) => (
                <View key={a} style={styles.assumption}>
                  <Ionicons name="information-circle-outline" size={16} color={colors.textMuted} />
                  <AppText variant="small" tone="subtle" style={{ flex: 1 }}>
                    {a}
                  </AppText>
                </View>
              ))}
            </>
          )}
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  scenarioHead: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  factHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  flag: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  outRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: space.xs },
  assumption: { flexDirection: 'row', gap: space.sm, alignItems: 'flex-start' },
});
