import Ionicons from '@expo/vector-icons/Ionicons';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { DemoBanner } from '@/components/DemoBanner';
import { EmptyState } from '@/components/EmptyState';
import { AiNote, AppText, Banner, Button, Card, Screen, SourceQuote, StatusBadge } from '@/components/ui';
import { useDocument, useDocuments } from '@/features/documents/store';
import { useT } from '@/i18n/useT';
import { colors, space } from '@/theme/tokens';

/** S13 Finding detail — evidence, plain meaning, uncertainty, questions (F11, F12). */
export default function FindingDetail() {
  const t = useT();
  const { id, findingId } = useLocalSearchParams<{ id: string; findingId: string }>();
  const doc = useDocument(id);
  const upsertQuestion = useDocuments((s) => s.upsertQuestion);
  const finding = doc?.analysis?.findings.find((f) => f.id === findingId);

  if (!doc || !finding) return <EmptyState icon="alert-circle-outline" message="Finding not found." />;
  const saved = new Set(doc.analysis?.questions.map((q) => q.text));

  return (
    <Screen
      footer={
        finding.evidence ? (
          <Button
            label={t('viewSource')}
            icon="document-text-outline"
            onPress={() =>
              router.push({
                pathname: '/doc/[id]/source',
                params: { id: doc.id, page: String(finding.evidence!.page), block: finding.evidence!.blockId },
              })
            }
          />
        ) : undefined
      }
    >
      <Stack.Screen options={{ title: 'Finding' }} />
      <DemoBanner />
      {doc.analysisStale ? <Banner tone="warning">{t('overview_stale')}</Banner> : null}

      <StatusBadge status={finding.reviewStatus} />
      {/* Model-written title: sans, never the serif reserved for contract wording (PRD §06 D). */}
      <AppText variant="heading" accessibilityRole="header" style={{ fontSize: 24, lineHeight: 30 }}>
        {finding.title}
      </AppText>

      <View style={styles.section}>
        <AppText variant="label" tone="muted">
          {t('finding_source').toUpperCase()}
        </AppText>
        {finding.evidence ? (
          <SourceQuote evidence={finding.evidence} />
        ) : (
          <Banner tone="info">No matching passage was found in the document, so this cannot be verified.</Banner>
        )}
      </View>

      <Card>
        <AiNote label={t('finding_ai_label')}>
          <AppText variant="label" tone="muted" style={{ marginTop: space.xs }}>
            {t('finding_meaning').toUpperCase()}
          </AppText>
          <AppText>{finding.explanation}</AppText>
        </AiNote>
        {finding.uncertainty ? (
          <View style={styles.unknown}>
            <Ionicons name="help-circle-outline" size={18} color={colors.textSubtle} />
            <View style={{ flex: 1, gap: 2 }}>
              <AppText variant="label" tone="muted">
                {t('finding_unknown').toUpperCase()}
              </AppText>
              <AppText tone="subtle">{finding.uncertainty}</AppText>
            </View>
          </View>
        ) : null}
      </Card>

      {finding.questions.length > 0 ? (
        <View style={styles.section}>
          <AppText variant="label" tone="muted">
            {t('finding_questions').toUpperCase()}
          </AppText>
          {finding.questions.map((q, i) => {
            const isSaved = saved.has(q);
            return (
              <Card key={q} style={styles.qRow}>
                <AppText style={{ flex: 1 }}>{q}</AppText>
                <Button
                  label={isSaved ? 'Saved' : 'Save'}
                  variant={isSaved ? 'ghost' : 'secondary'}
                  icon={isSaved ? 'checkmark' : 'bookmark-outline'}
                  disabled={isSaved}
                  onPress={() =>
                    upsertQuestion(doc.id, {
                      id: `${finding.id}_q${i}`,
                      text: q,
                      findingId: finding.id,
                      evidence: finding.evidence,
                      edited: false,
                    })
                  }
                />
              </Card>
            );
          })}
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  section: { gap: space.sm },
  unknown: { flexDirection: 'row', gap: space.sm, marginTop: space.md, alignItems: 'flex-start' },
  qRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
});
