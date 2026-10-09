import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { getEngine } from '@/ai/demoEngine';
import { recognizeDocument, RecognizeError } from '@/ai/recognize';
import { DemoBanner } from '@/components/DemoBanner';
import { AppText, Banner, Button, Card, Screen } from '@/components/ui';
import { useDraft } from '@/features/review/draftStore';
import { useT } from '@/i18n/useT';
import { colors, radius, space, touch } from '@/theme/tokens';

/** S07 Preview — page thumbnails, order and confirm; then on-device OCR (F05). */
export default function Preview() {
  const t = useT();
  const pages = useDraft((s) => s.captured);
  const source = useDraft((s) => s.source);
  const pdfUri = useDraft((s) => s.pdfUri);
  const movePage = useDraft((s) => s.movePage);
  const setRecognized = useDraft((s) => s.setRecognized);
  const setType = useDraft((s) => s.setType);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const recognize = async () => {
    setBusy(true);
    setError(null);
    try {
      const engine = getEngine();
      const result = await recognizeDocument({ engine, captured: pages, pdfUri });
      setRecognized(result.pages, result.source, result.note);
      const { type } = await engine.classify(result.pages);
      setType(type, true);
      router.push('/review/verify');
    } catch (e) {
      setError(
        e instanceof RecognizeError
          ? e.message
          : 'Could not read the text. Your pages are kept — try again or retake blurry pages.',
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen footer={<Button label={busy ? t('preview_reading') : t('preview_confirm')} loading={busy} onPress={recognize} disabled={pages.length === 0} icon="scan-outline" />}>
      <Stack.Screen options={{ title: t('preview_title') }} />
      <DemoBanner />
      <AppText tone="subtle">{t('preview_body')}</AppText>
      {source === 'pdf' ? (
        <Banner tone="info">Digital PDFs are read from their built-in text. Page previews for PDFs are coming.</Banner>
      ) : null}
      {error ? <Banner tone="danger">{error}</Banner> : null}

      {pages.map((p, i) => (
        <Card key={p.id} style={styles.row}>
          <View style={styles.thumb}>
            {p.uri ? (
              <Image
                source={{ uri: p.uri }}
                style={[styles.img, { transform: [{ rotate: `${p.rotation}deg` }] }]}
                contentFit="cover"
              />
            ) : (
              <Ionicons name="document-text-outline" size={28} color={colors.textMuted} />
            )}
          </View>
          <View style={{ flex: 1 }}>
            <AppText variant="bodyStrong">{`${t('page')} ${i + 1}`}</AppText>
            <AppText variant="small" tone="muted">
              {p.uri ? 'Image ready' : source === 'sample' ? 'Sample page' : 'PDF page'}
            </AppText>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Move page ${i + 1} up`}
            disabled={i === 0}
            onPress={() => movePage(p.id, -1)}
            style={[styles.iconBtn, i === 0 && styles.dim]}
          >
            <Ionicons name="arrow-up" size={20} color={colors.textSubtle} />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Move page ${i + 1} down`}
            disabled={i === pages.length - 1}
            onPress={() => movePage(p.id, 1)}
            style={[styles.iconBtn, i === pages.length - 1 && styles.dim]}
          >
            <Ionicons name="arrow-down" size={20} color={colors.textSubtle} />
          </Pressable>
        </Card>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md },
  thumb: {
    width: 56,
    height: 72,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  img: { width: '100%', height: '100%' },
  iconBtn: { width: touch.min, height: touch.min, alignItems: 'center', justifyContent: 'center' },
  dim: { opacity: 0.3 },
});
