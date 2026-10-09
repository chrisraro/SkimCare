import { StyleSheet, View } from 'react-native';
import { getEngine } from '@/ai/demoEngine';
import { AppText, Card, Screen, SectionLabel } from '@/components/ui';
import { useDocuments } from '@/features/documents/store';
import { useT } from '@/i18n/useT';
import { space } from '@/theme/tokens';

function Row({ k, v }: { k: string; v: string }) {
  return (
    <View style={styles.row} accessible accessibilityLabel={`${k}: ${v}`}>
      <AppText variant="small" tone="muted" style={styles.key}>
        {k}
      </AppText>
      <AppText variant="small" style={styles.val}>
        {v}
      </AppText>
    </View>
  );
}

/** F17 Inference diagnostics — model, runtime and last-run provenance (no document content). */
export default function Diagnostics() {
  const t = useT();
  const info = getEngine().info;
  const lastRun = useDocuments((s) => {
    const id = s.order[0];
    return id ? s.byId[id]?.analysis : undefined;
  });

  return (
    <Screen title={t('settings_diagnostics')}>
      <SectionLabel>Engine</SectionLabel>
      <Card>
        <Row k="Engine" v={info.name} />
        <Row k="Runtime" v={info.runtime} />
        <Row k="OCR" v={info.ocrModel} />
        <Row k="Language model" v={info.llmModel} />
        <Row k="Quantization" v={info.quantization ?? '—'} />
        <Row k="Checksum" v={info.checksum ?? '—'} />
        <Row k="License" v={info.license ?? '—'} />
        <Row k="Prompt version" v={info.promptVersion} />
      </Card>

      <SectionLabel>Last analysis run</SectionLabel>
      {lastRun ? (
        <Card>
          <Row k="Run" v={lastRun.id} />
          <Row k="Duration" v={`${Date.parse(lastRun.finishedAt ?? lastRun.startedAt) - Date.parse(lastRun.startedAt)} ms`} />
          <Row k="Source hash" v={lastRun.sourceHash} />
          <Row k="OCR revision" v={String(lastRun.ocrRevision)} />
          <Row k="Accepted findings" v={String(lastRun.findings.length)} />
          <Row k="Rejected by evidence gate" v={String(lastRun.rejectedCount)} />
          <Row k="Pages read" v={`${lastRun.coverage.pagesRead}/${lastRun.coverage.pagesTotal}`} />
        </Card>
      ) : (
        <AppText tone="muted">No analysis has run yet.</AppText>
      )}
      <AppText variant="small" tone="muted">
        Diagnostics never include contract text, prompts or personal data.
      </AppText>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: space.md, paddingVertical: space.xs },
  key: { width: 140 },
  val: { flex: 1, fontVariant: ['tabular-nums'] },
});
