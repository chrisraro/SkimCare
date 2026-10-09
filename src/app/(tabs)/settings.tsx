import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { confirmDestructive } from '@/components/confirm';
import { getEngine } from '@/ai/demoEngine';
import { AppText, Button, Card, Chip, ListRow, Screen, SectionLabel } from '@/components/ui';
import { useDocuments } from '@/features/documents/store';
import { useSettings } from '@/features/settings/store';
import { useT } from '@/i18n/useT';
import { space } from '@/theme/tokens';

/** S19 Settings — language, model, storage, privacy, erase. */
export default function Settings() {
  const t = useT();
  const locale = useSettings((s) => s.locale);
  const setLocale = useSettings((s) => s.setLocale);
  const count = useDocuments((s) => s.order.length);
  const eraseAll = useDocuments((s) => s.eraseAll);
  const info = getEngine().info;

  const confirmErase = () =>
    confirmDestructive({
      title: t('settings_erase'),
      message: t('settings_erase_confirm'),
      confirmLabel: t('delete'),
      cancelLabel: t('cancel'),
      onConfirm: eraseAll,
    });

  return (
    <Screen edges={['top']} tab>
      <AppText variant="display" accessibilityRole="header">
        {t('settings_title')}
      </AppText>
      <SectionLabel>{t('settings_language')}</SectionLabel>
      <View style={styles.row}>
        <Chip label="English" selected={locale === 'en'} onPress={() => setLocale('en')} />
        <Chip label="Filipino" selected={locale === 'fil'} onPress={() => setLocale('fil')} />
      </View>

      <SectionLabel>{t('settings_model')}</SectionLabel>
      <View style={styles.list}>
        <ListRow
          icon="hardware-chip-outline"
          title={info.name}
          subtitle={info.llmModel}
          onPress={() => router.push('/readiness')}
        />
        <ListRow icon="pulse-outline" title={t('settings_diagnostics')} onPress={() => router.push('/diagnostics')} />
      </View>

      <SectionLabel>{t('settings_storage')}</SectionLabel>
      <Card>
        <AppText>{`${count} saved review${count === 1 ? '' : 's'} on this phone.`}</AppText>
        <AppText variant="small" tone="muted">
          No account, no cloud sync, no analytics on document content. Reviews stay until you delete them.
        </AppText>
        <AppText variant="small" tone="muted">
          {t('privacy_mlkit')}
        </AppText>
      </Card>
      <Button label={t('settings_erase')} variant="danger" icon="trash-outline" onPress={confirmErase} disabled={count === 0} />

      <SectionLabel>About</SectionLabel>
      <Card tone="muted">
        <AppText variant="small" tone="subtle">
          {t('settings_disclaimer')}
        </AppText>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: space.sm },
  list: { gap: space.sm },
});
