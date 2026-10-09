import { router, Stack } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { AppText, Banner, Button, Card, Chip, Screen, SectionLabel } from '@/components/ui';
import { FULLY_SUPPORTED_TYPES, TYPE_LABELS, type DocumentType } from '@/domain/schema';
import { useDraft } from '@/features/review/draftStore';
import { useT } from '@/i18n/useT';
import { space } from '@/theme/tokens';

/** S09 Analysis preferences (F07) — suggested type with manual override, explanation language. */
export default function Preferences() {
  const t = useT();
  const type = useDraft((s) => s.documentType);
  const detected = useDraft((s) => s.detectedType);
  const language = useDraft((s) => s.language);
  const setType = useDraft((s) => s.setType);
  const setLanguage = useDraft((s) => s.setLanguage);
  const limited = type !== null && !FULLY_SUPPORTED_TYPES.includes(type);

  return (
    <Screen footer={<Button label={t('prefs_start')} icon="sparkles-outline" disabled={!type} onPress={() => router.push('/review/processing')} />}>
      <Stack.Screen options={{ title: t('prefs_title') }} />
      {detected ? (
        <Card tone="muted">
          <AppText variant="label" tone="muted">
            {t('prefs_detected').toUpperCase()}
          </AppText>
          <AppText variant="bodyStrong">{TYPE_LABELS[detected]}</AppText>
          <AppText variant="small" tone="muted">
            Change it below if this is wrong.
          </AppText>
        </Card>
      ) : null}

      <View style={styles.wrap}>
        {(Object.keys(TYPE_LABELS) as DocumentType[]).map((k) => (
          <Chip key={k} label={TYPE_LABELS[k]} selected={type === k} onPress={() => setType(k)} />
        ))}
      </View>
      {limited ? <Banner tone="warning">{t('prefs_limited')}</Banner> : null}

      <SectionLabel>{t('prefs_language')}</SectionLabel>
      <View style={styles.wrap}>
        <Chip label="English" selected={language === 'en'} onPress={() => setLanguage('en')} />
        <Chip label="Filipino / Taglish" selected={language === 'fil'} onPress={() => setLanguage('fil')} />
      </View>
      {language === 'fil' ? (
        <AppText variant="small" tone="muted">
          Filipino explanations are supported on tested samples. Fluent wording does not guarantee legal accuracy.
        </AppText>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({ wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm } });
