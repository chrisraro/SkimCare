import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { getEngine } from '@/ai/demoEngine';
import { runAnalysis } from '@/ai/pipeline';
import { DemoBanner } from '@/components/DemoBanner';
import { GlassActionGroup, GlassGroupAction } from '@/components/glass/GlassHeader';
import { EmptyState } from '@/components/EmptyState';
import { FindingCard } from '@/components/FindingCard';
import { AppText, Banner, Button, Card, ListRow, Screen, SectionLabel } from '@/components/ui';
import { TYPE_LABELS, type ReviewStatus } from '@/domain/schema';
import { useDocument, useDocuments } from '@/features/documents/store';
import { useT } from '@/i18n/useT';
import { colors, palette, space } from '@/theme/tokens';

const PRIORITY: Record<ReviewStatus, number> = {
  needs_attention: 0,
  needs_clarification: 1,
  unable_to_verify: 2,
  explained: 3,
};

/** S11 Overview — facts, findings, coverage, next actions (F10). */
export default function Overview() {
  const t = useT();
  const { id } = useLocalSearchParams<{ id: string }>();
  const doc = useDocument(id);
  const setAnalysis = useDocuments((s) => s.setAnalysis);
  const [rerunning, setRerunning] = useState(false);

  const openFinding = useCallback(
    (findingId: string) => router.push({ pathname: '/doc/[id]/finding/[findingId]', params: { id: id!, findingId } }),
    [id],
  );

  if (!doc) return <EmptyState icon="alert-circle-outline" message="This review no longer exists." />;
  const run = doc.analysis;

  const rerun = async () => {
    setRerunning(true);
    try {
      const next = await runAnalysis({
        engine: getEngine(),
        pages: doc.pages,
        ocrRevision: doc.ocrRevision,
        documentType: doc.type,
        language: doc.language === 'fil' ? 'fil' : 'en',
      });
      setAnalysis(doc.id, next);
    } finally {
      setRerunning(false);
    }
  };

  const findings = [...(run?.findings ?? [])].sort((a, b) => PRIORITY[a.reviewStatus] - PRIORITY[b.reviewStatus]);
  const count = (s: ReviewStatus[]) => findings.filter((f) => s.includes(f.reviewStatus)).length;

  return (
    <Screen
      title="Overview"
      headerRight={
        <GlassActionGroup>
          <GlassGroupAction icon="document-text-outline" label={t('terms_title')} onPress={() => router.push({ pathname: '/doc/[id]/terms', params: { id: doc.id } })} />
          <GlassGroupAction icon="chatbubble-outline" label={t('questionsToAsk')} onPress={() => router.push({ pathname: '/doc/[id]/questions', params: { id: doc.id } })} />
          <GlassGroupAction icon="calculator-outline" label={t('whatIf')} onPress={() => router.push({ pathname: '/doc/[id]/what-if', params: { id: doc.id } })} />
        </GlassActionGroup>
      }
    >
      <DemoBanner />

      <View style={{ gap: space.xs }}>
        <AppText variant="label" tone="muted">
          {TYPE_LABELS[doc.type].toUpperCase()}
        </AppText>
        <AppText variant="title" accessibilityRole="header">
          {doc.title}
        </AppText>
        <AppText variant="small" tone="muted">
          {`${doc.pages.length} pages · reviewed on this phone · ${run?.engine.modelName ?? '—'}`}
        </AppText>
      </View>

      {doc.analysisStale ? (
        <Banner tone="warning" action={<Button label={t('overview_rerun')} variant="secondary" icon="refresh" loading={rerunning} onPress={rerun} />}>
          {t('overview_stale')}
        </Banner>
      ) : null}
      {run?.coverage.incomplete ? <Banner tone="warning">{t('overview_incomplete')}</Banner> : null}

      <View style={styles.stats}>
        <Stat value={count(['explained', 'needs_attention', 'needs_clarification'])} label={t('overview_terms')} icon="document-text-outline" color={palette.teal700} />
        <Stat value={count(['needs_clarification', 'needs_attention'])} label={t('overview_clarify')} icon="help-circle-outline" color={palette.amber700} />
        <Stat value={count(['unable_to_verify'])} label={t('overview_unverified')} icon="remove-circle-outline" color={palette.slate700} />
      </View>

      {run && run.rejectedCount > 0 ? (
        <Banner tone="info">{`${run.rejectedCount} ${t(run.rejectedCount === 1 ? 'overview_rejected_one' : 'overview_rejected_other')}`}</Banner>
      ) : null}

      <SectionLabel>{t('overview_next')}</SectionLabel>
      <View style={styles.list}>
        <ListRow icon="help-buoy-outline" title={t('whatIf')} subtitle="Try a scenario using rules from the document" onPress={() => router.push({ pathname: '/doc/[id]/what-if', params: { id: doc.id } })} />
        <ListRow icon="school-outline" title={t('checkUnderstanding')} subtitle={`${run?.comprehension.length ?? 0} quick questions`} onPress={() => router.push({ pathname: '/doc/[id]/check', params: { id: doc.id } })} />
        <ListRow icon="chatbubbles-outline" title={t('questionsToAsk')} subtitle={`${run?.questions.length ?? 0} questions ready to copy`} onPress={() => router.push({ pathname: '/doc/[id]/questions', params: { id: doc.id } })} />
      </View>

      <SectionLabel
        right={
          <Button label="All terms" variant="ghost" onPress={() => router.push({ pathname: '/doc/[id]/terms', params: { id: doc.id } })} />
        }
      >
        {t('overview_findings')}
      </SectionLabel>
      {findings.slice(0, 4).map((f) => (
        <FindingCard key={f.id} finding={f} onPress={openFinding} />
      ))}

      <Card tone="muted">
        <AppText variant="small" tone="subtle">
          {t('settings_disclaimer')}
        </AppText>
      </Card>
    </Screen>
  );
}

function Stat({ value, label, icon, color }: { value: number; label: string; icon: keyof typeof Ionicons.glyphMap; color: string }) {
  return (
    <View style={styles.stat} accessible accessibilityLabel={`${value} ${label}`}>
      <Ionicons name={icon} size={18} color={color} />
      <AppText variant="title" style={{ color }}>
        {value}
      </AppText>
      <AppText variant="small" tone="muted">
        {label}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  stats: { flexDirection: 'row', gap: space.sm },
  stat: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: space.md,
    gap: 2,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  list: { gap: space.sm },
});
