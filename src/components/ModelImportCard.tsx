import { useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { getEngine } from '@/ai/demoEngine';
import { getModelSpec } from '@/ai/llm/models';
import { importModel, type ImportPhase } from '@/features/model/importModel';
import { AppText, Banner, Button, Card } from '@/components/ui';
import { palette, space } from '@/theme/tokens';

const busyLabel: Partial<Record<ImportPhase, string>> = {
  picking: 'Choose the model file…',
  copying: 'Copying the model to app storage… this can take a minute.',
  verifying: 'Checking the file (checksum)…',
};

/** True where in-app import applies: the real local engine on Android. */
export function modelImportAvailable(): boolean {
  return Platform.OS === 'android' && getEngine().info.kind === 'local';
}

/**
 * Lets the user install the GGUF from a file already on the phone, so no adb is
 * needed. The file is copied into app-private storage and checked against the
 * pinned checksum; nothing is uploaded.
 */
export function ModelImportCard({ onImported }: { onImported?: () => void }) {
  const [phase, setPhase] = useState<ImportPhase | null>(null);
  const [result, setResult] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);
  if (!modelImportAvailable()) return null;

  const spec = getModelSpec();
  const busy = phase === 'picking' || phase === 'copying' || phase === 'verifying';

  const start = async () => {
    setResult(null);
    const r = await importModel(setPhase);
    if (r.status === 'done') {
      setResult({ tone: 'success', text: `Installed ${r.spec.name} ${r.spec.quantization}. The checksum matches.` });
      onImported?.();
    } else if (r.status === 'failed') {
      setResult({ tone: 'danger', text: r.message });
    }
  };

  return (
    <Card>
      <AppText variant="label" tone="muted">
        INSTALL THE MODEL
      </AppText>
      <AppText variant="bodyStrong">
        {spec ? `Model file: ${spec.name} (${spec.quantization}), ≈${Math.round(spec.sizeBytes / (1024 * 1024) / 10) * 10} MB` : 'Model file'}
      </AppText>
      <AppText variant="small" tone="muted">
        Copy it to this phone (USB, Files, or a download done once), then import it. It stays on this phone; nothing is uploaded.
      </AppText>
      {busy ? (
        <View accessibilityLiveRegion="polite">
          <AppText variant="small" style={{ color: palette.slate700 }}>
            {busyLabel[phase]}
          </AppText>
        </View>
      ) : null}
      {result ? <Banner tone={result.tone}>{result.text}</Banner> : null}
      <View style={styles.action}>
        <Button
          label={busy ? 'Importing…' : 'Import model file'}
          icon="download-outline"
          variant="secondary"
          onPress={start}
          disabled={busy}
          loading={busy}
          accessibilityHint="Opens the file picker. The model is copied into this app and checked."
        />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  action: { marginTop: space.sm },
});
