import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useEffect, useRef } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { AppText, Banner, Button, Screen } from '@/components/ui';
import { scanPages, scannerAvailable } from '@/features/capture/scanner';
import { useDraft } from '@/features/review/draftStore';
import { useT } from '@/i18n/useT';
import { colors, radius, space, touch } from '@/theme/tokens';

const pageId = () => `pg_${Math.random().toString(36).slice(2, 9)}`;

/** Fallback when the document scanner is not in this build (Expo Go / web). */
async function shootWithCamera(): Promise<string | null> {
  const perm = await ImagePicker.requestCameraPermissionsAsync();
  if (!perm.granted) return null;
  const res = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], allowsEditing: true, quality: 0.85 });
  return res.canceled ? null : (res.assets[0]?.uri ?? null);
}

/** Capture one or more pages: document scanner first, system camera as fallback. */
async function capture(maxPages: number): Promise<string[]> {
  if (scannerAvailable()) {
    const out = await scanPages(maxPages);
    return out.status === 'ok' ? out.uris : [];
  }
  const uri = await shootWithCamera();
  return uri ? [uri] : [];
}

/** S06 Capture — scan (edge detection, perspective fix, cleanup), rotate, retake, add pages. */
export default function Capture() {
  const t = useT();
  const pages = useDraft((s) => s.captured);
  const addPages = useDraft((s) => s.addPages);
  const replacePage = useDraft((s) => s.replacePage);
  const removePage = useDraft((s) => s.removePage);
  const rotatePage = useDraft((s) => s.rotatePage);
  const opened = useRef(false);
  const hasScanner = scannerAvailable();

  const addMore = async () => {
    const uris = await capture(20);
    if (uris.length) addPages(uris.map((uri) => ({ id: pageId(), uri, rotation: 0 as const })));
  };

  useEffect(() => {
    if (!opened.current && pages.length === 0) {
      opened.current = true;
      addMore();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Screen title={t('capture_title')}
      footer={
        <>
          <Button label={hasScanner ? 'Scan more pages' : 'Add another page'} variant="secondary" icon="add" onPress={addMore} />
          <Button
            label={`Continue with ${pages.length} page${pages.length === 1 ? '' : 's'}`}
            disabled={pages.length === 0}
            onPress={() => router.push('/review/preview')}
          />
        </>
      }
    >
      {hasScanner ? (
        <Banner tone="info">
          The scanner finds page edges and straightens each page automatically. It runs on this phone; the first use may
          need internet once to finish setting up.
        </Banner>
      ) : (
        <Banner tone="warning">
          Using the basic camera — the document scanner needs a development build. Lay the page flat in good light.
        </Banner>
      )}

      {pages.length === 0 ? (
        <AppText tone="muted" center>
          No pages yet. Camera access is only used while you capture.
        </AppText>
      ) : null}

      <View style={styles.grid}>
        {pages.map((p, i) => (
          <View key={p.id} style={styles.tile}>
            <View style={styles.thumbWrap}>
              {p.uri ? (
                <Image
                  source={{ uri: p.uri }}
                  style={[styles.thumb, { transform: [{ rotate: `${p.rotation}deg` }] }]}
                  contentFit="contain"
                  accessibilityLabel={`Page ${i + 1}`}
                />
              ) : null}
            </View>
            <AppText variant="small" tone="muted" center>{`Page ${i + 1}`}</AppText>
            <View style={styles.actions}>
              <IconBtn icon="refresh" label={`Rotate page ${i + 1}`} onPress={() => rotatePage(p.id)} />
              <IconBtn
                icon="camera-reverse-outline"
                label={`Retake page ${i + 1}`}
                onPress={async () => {
                  const [uri] = await capture(1);
                  if (uri) replacePage(p.id, uri);
                }}
              />
              <IconBtn icon="trash-outline" label={`Remove page ${i + 1}`} onPress={() => removePage(p.id)} />
            </View>
          </View>
        ))}
      </View>
    </Screen>
  );
}

function IconBtn({ icon, label, onPress }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={styles.iconBtn}>
      <Ionicons name={icon} size={20} color={colors.textSubtle} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md },
  tile: { width: '47%', gap: space.xs },
  thumbWrap: {
    aspectRatio: 0.75,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceMuted,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
  },
  thumb: { width: '100%', height: '100%' },
  actions: { flexDirection: 'row', justifyContent: 'space-around' },
  iconBtn: { width: touch.min, height: touch.min, alignItems: 'center', justifyContent: 'center' },
});
