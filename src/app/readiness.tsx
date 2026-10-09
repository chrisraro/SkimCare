import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { getEngine } from '@/ai/demoEngine';
import type { CheckStatus, ReadinessReport } from '@/ai/engines';
import { pdfTextAvailable } from '@/ai/sources/pdfTextLayer';
import { scannerAvailable } from '@/features/capture/scanner';
import { AppText, Banner, Button, Card, Screen } from '@/components/ui';
import { ModelImportCard } from '@/components/ModelImportCard';
import { useSettings } from '@/features/settings/store';
import { withStorageStatus } from '@/features/storage/readiness';
import { useStorageStatus } from '@/features/storage/store';
import { useT } from '@/i18n/useT';
import { colors, palette, radius, space } from '@/theme/tokens';

const statusIcon: Record<CheckStatus, { name: 'checkmark-circle' | 'warning' | 'close-circle'; color: string; word: string }> = {
  pass: { name: 'checkmark-circle', color: palette.teal700, word: 'Passed' },
  warn: { name: 'warning', color: palette.amber700, word: 'Limited' },
  fail: { name: 'close-circle', color: palette.coral700, word: 'Not ready' },
};

/** S03 Model readiness (F02) — reports truthfully; never claims offline readiness for the Demo engine. */
export default function Readiness() {
  const t = useT();
  const engine = getEngine();
  const onboarded = useSettings((s) => s.onboarded);
  const completeOnboarding = useSettings((s) => s.completeOnboarding);
  const [report, setReport] = useState<ReadinessReport | null>(null);

  const setOfflineReady = useSettings((s) => s.setOfflineReady);
  useEffect(() => {
    if (report) setOfflineReady(report.offlineReady);
  }, [report, setOfflineReady]);

  useEffect(() => {
    engine.checkReadiness().then((r) => setReport(withStorageStatus(r, useStorageStatus.getState().status)));
  }, [engine]);

  const recheck = () => {
    setReport(null);
    engine.checkReadiness().then((r) => setReport(withStorageStatus(r, useStorageStatus.getState().status)));
  };

  // Web: the model is downloaded only when the user asks, once, into this browser.
  const [download, setDownload] = useState<{ loaded: number; total: number } | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  useEffect(() => () => abortRef.current?.abort(), []);
  const modelMissing = report?.checks.some((c) => c.id === 'model_present' && c.status === 'fail') ?? false;

  const startDownload = async () => {
    if (!engine.prepare) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setDownloadError(null);
    setDownload({ loaded: 0, total: 0 });
    try {
      await engine.prepare((loaded, total) => setDownload({ loaded, total }), controller.signal);
      setDownload(null);
      recheck();
    } catch (e) {
      setDownload(null);
      if (!controller.signal.aborted) setDownloadError(e instanceof Error ? e.message : 'The download failed.');
    }
  };
  const downloadPct = download && download.total > 0 ? Math.min(100, Math.round((download.loaded / download.total) * 100)) : 0;

  const proceed = () => {
    if (onboarded) return router.back();
    completeOnboarding();
    // Make Home the stack root so Back never returns to onboarding.
    if (router.canDismiss()) router.dismissAll();
    router.replace('/(tabs)');
  };

  return (
    <Screen title={t('readiness_title')}
      footer={
        <>
          <Button label={t('readiness_continue')} onPress={proceed} disabled={!report} />
          <Button label={t('readiness_recheck')} variant="ghost" icon="refresh" onPress={recheck} disabled={!report} loading={!report} />
        </>
      }
    >
      <AppText tone="subtle">{t('readiness_body')}</AppText>

      {report ? (
        <Banner tone={report.offlineReady ? 'success' : 'warning'}>
          <AppText variant="bodyStrong" style={{ color: report.offlineReady ? palette.teal700 : palette.amber700 }}>
            {t(report.offlineReady ? 'readiness_ready' : 'readiness_not_ready')}
          </AppText>
        </Banner>
      ) : null}

      <Card>
        <AppText variant="label" tone="muted">
          ENGINE
        </AppText>
        <AppText variant="heading">{engine.info.name}</AppText>
        <AppText variant="small" tone="muted">
          {engine.info.runtime}
        </AppText>
      </Card>

      {engine.prepare && (modelMissing || download) ? (
        <Card>
          <AppText variant="label" tone="muted">
            LANGUAGE MODEL
          </AppText>
          <AppText>
            The AI runs inside this browser. It needs a one-time download of the {engine.info.llmModel} model. It is stored in this
            browser only, and works offline afterwards. Your documents are never uploaded.
          </AppText>
          {download ? (
            <View
              accessible
              accessibilityRole="progressbar"
              accessibilityLabel="Model download"
              accessibilityValue={{ min: 0, max: 100, now: downloadPct }}
              style={{ gap: space.xs }}
            >
              <View style={styles.track}>
                <View style={[styles.fill, { width: `${downloadPct}%` }]} />
              </View>
              <AppText variant="small" tone="muted">
                {download.total > 0 && download.loaded >= download.total
                  ? 'Downloaded · checking the file…'
                  : `Downloading · ${downloadPct}% (${Math.round(download.loaded / 1048576)} of ${Math.round(download.total / 1048576) || '≈400'} MB)`}
              </AppText>
              <Button label="Cancel download" variant="ghost" icon="close" onPress={() => abortRef.current?.abort()} />
            </View>
          ) : (
            <Button label="Download the model (≈400 MB, once)" icon="download-outline" onPress={startDownload} disabled={!report} />
          )}
          {downloadError ? <Banner tone="warning">{`Download not finished · ${downloadError}`}</Banner> : null}
        </Card>
      ) : null}

      {!report ? (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.primary} />
          <AppText tone="muted">Checking…</AppText>
        </View>
      ) : (
        <Card>
          {report.checks.map((c) => {
            const s = statusIcon[c.status];
            return (
              <View
                key={c.id}
                style={styles.check}
                accessible
                accessibilityLabel={`${c.label}: ${s.word}. ${c.detail}`}
              >
                <Ionicons name={s.name} size={22} color={s.color} />
                <View style={{ flex: 1 }}>
                  <AppText variant="bodyStrong">{c.label}</AppText>
                  <AppText variant="small" tone="muted">
                    {`${s.word} · ${c.detail}`}
                  </AppText>
                </View>
              </View>
            );
          })}
        </Card>
      )}

      {report?.checks.some((c) => (c.id === 'model_present' || c.id === 'checksum') && c.status === 'fail') ? (
        <ModelImportCard onImported={recheck} />
      ) : null}

      <Card>
        <AppText variant="label" tone="muted">
          CAPTURE TOOLS
        </AppText>
        {[
          {
            id: 'scanner',
            label: 'Document scanner',
            status: scannerAvailable() ? ('pass' as const) : ('warn' as const),
            detail: scannerAvailable()
              ? 'Available. On Android, open it once while online so Google Play services can finish setup.'
              : 'Not in this build — using the basic camera instead.',
          },
          {
            id: 'pdf',
            label: 'PDF text reader',
            status: pdfTextAvailable() ? ('pass' as const) : ('warn' as const),
            detail: pdfTextAvailable()
              ? 'Digital PDFs are read exactly from their built-in text.'
              : 'Not in this build — PDFs need a development build.',
          },
        ].map((c) => {
          const s = statusIcon[c.status];
          return (
            <View key={c.id} style={styles.check} accessible accessibilityLabel={`${c.label}: ${s.word}. ${c.detail}`}>
              <Ionicons name={s.name} size={22} color={s.color} />
              <View style={{ flex: 1 }}>
                <AppText variant="bodyStrong">{c.label}</AppText>
                <AppText variant="small" tone="muted">{`${s.word} · ${c.detail}`}</AppText>
              </View>
            </View>
          );
        })}
      </Card>

      {engine.info.kind === 'demo' ? <Banner tone="info">{t('readiness_demo_note')}</Banner> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  loading: { flexDirection: 'row', gap: space.sm, alignItems: 'center', justifyContent: 'center', padding: space.xl },
  track: { height: 8, borderRadius: radius.pill, backgroundColor: colors.surfaceMuted, overflow: 'hidden' },
  fill: { height: 8, backgroundColor: colors.primary },
  check: { flexDirection: 'row', gap: space.md, paddingVertical: space.sm, alignItems: 'flex-start' },
});
