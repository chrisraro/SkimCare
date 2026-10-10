import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, View } from 'react-native';
import { getEngine } from '@/ai/demoEngine';
import { getModelSpec } from '@/ai/llm/models';
import { confirmAction } from '@/components/confirm';
import { ModelImportCard, modelImportAvailable } from '@/components/ModelImportCard';
import { AppText, Banner, Button, Card } from '@/components/ui';
import type { DownloadFailureInfo } from '@/features/model/downloadStore';
import { isDownloadActive, useModelDownload } from '@/features/model/downloadStore';
import { fmt, type StringKey } from '@/i18n/strings';
import { useT } from '@/i18n/useT';
import { colors, palette, radius, space } from '@/theme/tokens';

const MB = 1024 * 1024;

/** True where the in-app download applies: the real local engine on a phone (not the web build). */
export function modelDownloadAvailable(): boolean {
  return Platform.OS !== 'web' && getEngine().info.kind === 'local';
}

export function downloadPercent(bytes: number, total: number): number {
  return total > 0 ? Math.max(0, Math.min(100, Math.floor((bytes / total) * 100))) : 0;
}

const failureKey: Record<DownloadFailureInfo['reason'], StringKey> = {
  no_space: 'md_fail_no_space',
  network: 'md_fail_network',
  server: 'md_fail_server',
  storage: 'md_fail_storage',
  removed: 'md_fail_removed',
  size: 'md_fail_size',
  checksum: 'md_fail_checksum',
  check: 'md_fail_check',
  install: 'md_fail_install',
  unknown: 'md_fail_unknown',
};

/**
 * Readiness / Settings: download the model once (primary), with live progress that
 * survives leaving the screen (global store), or import a file (secondary).
 * Status is always icon + words.
 */
export function ModelDownloadCard({ onInstalled }: { onInstalled?: () => void }) {
  const t = useT();
  const phase = useModelDownload((s) => s.phase);
  const bytes = useModelDownload((s) => s.bytes);
  const total = useModelDownload((s) => s.total);
  const speedBps = useModelDownload((s) => s.speedBps);
  const waiting = useModelDownload((s) => s.waiting);
  const via = useModelDownload((s) => s.via);
  const failure = useModelDownload((s) => s.failure);
  const [showImport, setShowImport] = useState(false);

  // Re-run readiness once, when a download finishes installing.
  const prevPhase = useRef(phase);
  useEffect(() => {
    if (phase === 'done' && prevPhase.current !== 'done') onInstalled?.();
    prevPhase.current = phase;
  }, [phase, onInstalled]);

  const spec = getModelSpec();
  if (!modelDownloadAvailable() || !spec) return null;

  const sizeMb = Math.round(spec.sizeBytes / MB / 10) * 10;
  const active = isDownloadActive(phase);
  const pct = downloadPercent(bytes, total);

  const askAndStart = () =>
    confirmAction({
      title: t('md_confirm_title'),
      message: fmt(t('md_confirm_body'), { size: sizeMb }),
      confirmLabel: t('md_confirm_ok'),
      cancelLabel: t('cancel'),
      onConfirm: () => {
        void useModelDownload.getState().start(spec, { title: 'SkimCare', description: `${spec.name} ${spec.quantization}` });
      },
    });

  return (
    <>
      <Card>
        <AppText variant="label" tone="muted">
          {t('md_label')}
        </AppText>
        <AppText>{fmt(t('md_body'), { model: `${spec.name} ${spec.quantization}`, size: sizeMb })}</AppText>

        {phase === 'starting' ? (
          <View style={styles.statusRow} accessibilityLiveRegion="polite">
            <ActivityIndicator color={colors.primary} />
            <AppText variant="small" tone="muted">
              {t('md_starting')}
            </AppText>
          </View>
        ) : null}

        {phase === 'downloading' ? (
          <View
            accessible
            accessibilityRole="progressbar"
            accessibilityLabel={t('md_label')}
            accessibilityValue={{ min: 0, max: 100, now: pct }}
            style={{ gap: space.xs }}
          >
            <View style={styles.track}>
              <View style={[styles.fill, { width: `${pct}%` }]} />
            </View>
            <View style={styles.statusRow}>
              <Ionicons name={waiting ? 'pause-circle-outline' : 'cloud-download-outline'} size={18} color={palette.slate700} />
              <AppText variant="small" style={{ color: palette.slate700, flex: 1 }}>
                {waiting
                  ? t('md_waiting')
                  : [
                      fmt(t('md_progress'), { pct, done: Math.round(bytes / MB), total: Math.round(total / MB) }),
                      speedBps ? fmt(t('md_speed'), { speed: (speedBps / MB).toFixed(1) }) : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
              </AppText>
            </View>
            <AppText variant="small" tone="muted">
              {t(via === 'system' ? 'md_background_system' : 'md_background_app')}
            </AppText>
          </View>
        ) : null}

        {phase === 'verifying' ? (
          <View style={styles.statusRow} accessibilityLiveRegion="polite">
            <ActivityIndicator color={colors.primary} />
            <AppText variant="small" style={{ color: palette.slate700 }}>
              {t('md_verifying')}
            </AppText>
          </View>
        ) : null}

        {phase === 'done' ? <Banner tone="success">{t('md_done')}</Banner> : null}
        {phase === 'canceled' ? <Banner tone="info">{t('md_canceled')}</Banner> : null}
        {phase === 'failed' && failure ? (
          <Banner tone="warning">
            {`${t('md_failed')} · ${fmt(t(failureKey[failure.reason]), {
              need: Math.round((failure.needBytes ?? 0) / MB),
              free: Math.round((failure.freeBytes ?? 0) / MB),
            })}`}
          </Banner>
        ) : null}

        <View style={styles.actions}>
          {active ? (
            phase !== 'verifying' ? (
              <Button label={t('md_cancel')} variant="ghost" icon="close" onPress={() => useModelDownload.getState().cancel()} />
            ) : null
          ) : phase !== 'done' ? (
            <Button
              label={phase === 'failed' ? t('md_retry') : fmt(t('md_download'), { size: sizeMb })}
              icon="download-outline"
              onPress={askAndStart}
            />
          ) : null}
          {!active && modelImportAvailable() ? (
            <Button
              label={t(showImport ? 'md_import_hide' : 'md_import_instead')}
              variant="ghost"
              icon="folder-open-outline"
              onPress={() => setShowImport((v) => !v)}
            />
          ) : null}
        </View>
      </Card>
      {showImport && !active ? <ModelImportCard onImported={onInstalled} /> : null}
    </>
  );
}

/** Small status pill (Home) while a model download runs or after it stopped. Opens Readiness. */
export function ModelDownloadPill() {
  const t = useT();
  const phase = useModelDownload((s) => s.phase);
  const bytes = useModelDownload((s) => s.bytes);
  const total = useModelDownload((s) => s.total);
  if (!(isDownloadActive(phase) || phase === 'failed')) return null;

  const label =
    phase === 'failed'
      ? t('md_pill_failed')
      : phase === 'verifying'
        ? t('md_pill_verifying')
        : fmt(t('md_pill_downloading'), { pct: downloadPercent(bytes, total) });
  const icon = phase === 'failed' ? 'alert-circle-outline' : phase === 'verifying' ? 'hourglass-outline' : 'cloud-download-outline';
  const color = phase === 'failed' ? palette.amber700 : palette.slate700;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={() => router.push('/readiness')}
      hitSlop={8}
      style={[styles.pill, { backgroundColor: phase === 'failed' ? palette.amber100 : palette.slate100 }]}
    >
      <Ionicons name={icon} size={13} color={color} />
      <AppText variant="label" style={{ color, letterSpacing: 0 }}>
        {label}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  track: { height: 8, borderRadius: radius.pill, backgroundColor: colors.surfaceMuted, overflow: 'hidden' },
  fill: { height: 8, backgroundColor: colors.primary },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  actions: { marginTop: space.sm, gap: space.xs },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    paddingHorizontal: space.sm + 2,
    paddingVertical: space.xs,
    borderRadius: radius.pill,
  },
});
