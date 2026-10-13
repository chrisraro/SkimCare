import { useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';
import { StyleSheet, Switch, View } from 'react-native';
import { CLASSIFIER_BUILD_OFF } from '@/ai/classifier/setting';
import { LAYA_SPEC } from '@/ai/classifier/layaSpec';
import { getEngine } from '@/ai/demoEngine';
import { useLastExtractStats, totalCalls, type LlmRunStats } from '@/ai/llm/stats';
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

const secs = (ms: number) => `${(ms / 1000).toFixed(1)} s`;

/** Plain-language rows for one extraction: counts and times only. */
function speedRows(s: LlmRunStats): [string, string][] {
  const c = s.classifier;
  const rows: [string, string][] = [
    ['Parts in the document', `${s.blocks} (${s.blocks - s.asked} skipped, no amounts, dates or duties)`],
    ['Parts sent to the AI', String(s.asked)],
    ['Terms found', String(s.relevant)],
    ['AI calls', `${totalCalls(s)} (type ${s.calls.triage}, explain ${s.calls.explain}, retries ${s.retries})`],
  ];
  if (c.asked) {
    rows.push(['Clause sorter', `${c.used} of ${c.asked} sorted by it (${c.none} not terms), ${c.belowThreshold} passed on to the AI, ${c.errors} errors`]);
    rows.push(['Clause sorter time', secs(c.ms)]);
  } else {
    rows.push(['Clause sorter', 'not used in this review']);
  }
  if (s.timed) {
    rows.push(['AI reading speed', `${s.promptTokens} tokens in ${secs(s.promptMs)}${s.cachedTokens ? ` (+${s.cachedTokens} reused)` : ''}`]);
    rows.push(['AI writing speed', `${s.generatedTokens} tokens in ${secs(s.generationMs)}${s.generationMs > 0 ? ` (${((s.generatedTokens * 1000) / s.generationMs).toFixed(1)} tok/s)` : ''}`]);
  }
  rows.push(['AI time', secs(s.callMs)], ['Whole review', secs(s.wallMs)]);
  return rows;
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
  const lastStats = useLastExtractStats((s) => s.last);
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

      <SectionLabel>Speed of the last review</SectionLabel>
      {lastStats ? (
        <Card>
          {speedRows(lastStats).map(([k, v]) => (
            <Row key={k} k={k} v={v} />
          ))}
        </Card>
      ) : (
        <AppText tone="muted">Run a review with the on-device model to see where the time goes. Numbers stay on this device and never include document text.</AppText>
      )}

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
