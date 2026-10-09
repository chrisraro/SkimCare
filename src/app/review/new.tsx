import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { router, Stack } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { setDemoFixture } from '@/ai/demoEngine';
import { DEMO_FIXTURES } from '@/ai/demo/fixtures';
import { AppText, Banner, ListRow, Screen, SectionLabel } from '@/components/ui';
import { useDraft } from '@/features/review/draftStore';
import { useT } from '@/i18n/useT';
import { space } from '@/theme/tokens';

const pageId = () => `pg_${Math.random().toString(36).slice(2, 9)}`;

/** S05 Add document — camera, gallery, PDF (F03, F04) or a fictional sample. */
export default function AddDocument() {
  const t = useT();
  const start = useDraft((s) => s.start);
  const addPages = useDraft((s) => s.addPages);

  const pickImages = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      quality: 0.85,
    });
    if (res.canceled) return;
    start('gallery');
    addPages(res.assets.map((a) => ({ id: pageId(), uri: a.uri, rotation: 0 as const })));
    router.push('/review/preview');
  };

  const pickPdf = async () => {
    const res = await DocumentPicker.getDocumentAsync({ type: 'application/pdf', copyToCacheDirectory: true });
    if (res.canceled || !res.assets[0]) return;
    start('pdf', res.assets[0].name.replace(/\.pdf$/i, ''));
    // TODO(native): render each PDF page to an image via the tested native PDF renderer.
    addPages([{ id: pageId(), uri: undefined, rotation: 0 }]);
    router.push('/review/preview');
  };

  const startSample = (id: string) => {
    const fixture = DEMO_FIXTURES.find((f) => f.id === id)!;
    setDemoFixture(id);
    start('sample', fixture.title);
    addPages(fixture.pages.map(() => ({ id: pageId(), rotation: 0 as const })));
    router.push('/review/preview');
  };

  return (
    <Screen>
      <Stack.Screen options={{ title: t('add_title') }} />
      <View style={styles.list}>
        <ListRow
          icon="camera-outline"
          title={t('add_camera')}
          subtitle={t('add_camera_body')}
          onPress={() => {
            start('camera');
            router.push('/review/capture');
          }}
        />
        <ListRow icon="images-outline" title={t('add_gallery')} subtitle={t('add_gallery_body')} onPress={pickImages} />
        <ListRow icon="document-outline" title={t('add_pdf')} subtitle={t('add_pdf_body')} onPress={pickPdf} />
      </View>

      <SectionLabel>{t('add_sample')}</SectionLabel>
      <AppText variant="small" tone="muted">
        {t('add_sample_body')}
      </AppText>
      <View style={styles.list}>
        {DEMO_FIXTURES.map((f) => (
          <ListRow
            key={f.id}
            icon="flask-outline"
            iconTone="muted"
            title={f.title}
            subtitle={`${f.pages.length} pages · fictional`}
            onPress={() => startSample(f.id)}
          />
        ))}
      </View>

      <Banner tone="info">{t('add_privacy')}</Banner>
    </Screen>
  );
}

const styles = StyleSheet.create({ list: { gap: space.sm } });
