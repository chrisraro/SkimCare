import { useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';
import { StyleSheet, Switch, View } from 'react-native';
import { CLASSIFIER_BUILD_OFF } from '@/ai/classifier/setting';
import { LAYA_SPEC } from '@/ai/classifier/layaSpec';
import { getEngine } from '@/ai/demoEngine';
import { AppText, Card, Screen, SectionLabel } from '@/components/ui';
import { useDocuments } from '@/features/documents/store';
import { useSettings } from '@/features/settings/store';
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
  const { bench } = useLocalSearchParams<{ bench?: string }>();

  // Dev-only speed test (src/ai/llm/devBench.ts): `pirmabago://diagnostics?bench=1`. Lazy, so llama.rn never loads otherwise.
  useEffect(() => {
    if (!__DEV__ || bench !== '1' || info.kind !== 'local') return;
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- intentional lazy dev-only load
    const { runDevBench } = require('@/ai/llm/devBench') as typeof import('@/ai/llm/devBench');
    runDevBench().catch((e: unknown) => console.log(`[bench] failed: ${e instanceof Error ? e.message : 'unknown error'}`));
  }, [bench, info.kind]);
  const clauseSorter = useSettings((s) => s.clauseSorter);
  const setClauseSorter = useSettings((s) => s.setClauseSorter);
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

      {info.kind === 'local' ? (
        <>
          <SectionLabel>Clause sorter</SectionLabel>
          <Card>
            <View style={styles.row}>
              <AppText variant="small" style={{ flex: 1 }}>
                {CLASSIFIER_BUILD_OFF
                  ? 'Turned off in this build.'
                  : `Use the clause sorter (${LAYA_SPEC.version}) for the first step when it is installed. Off: the language model sorts every block.`}
              </AppText>
              <Switch
                value={clauseSorter && !CLASSIFIER_BUILD_OFF}
                onValueChange={setClauseSorter}
                disabled={CLASSIFIER_BUILD_OFF}
                accessibilityLabel={`Clause sorter: ${clauseSorter && !CLASSIFIER_BUILD_OFF ? 'on' : 'off'}`}
              />
            </View>
          </Card>
        </>
      ) : null}

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
