import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import type { ComponentProps } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppText, Button, Chip } from '@/components/ui';
import { useSettings } from '@/features/settings/store';
import type { StringKey } from '@/i18n/strings';
import { useT } from '@/i18n/useT';
import { colors, palette, radius, space } from '@/theme/tokens';

const POINTS: { icon: ComponentProps<typeof Ionicons>['name']; title: StringKey; body: StringKey }[] = [
  { icon: 'phone-portrait-outline', title: 'welcome_point_local', body: 'welcome_point_local_body' },
  { icon: 'document-text-outline', title: 'welcome_point_source', body: 'welcome_point_source_body' },
  { icon: 'scale-outline', title: 'welcome_point_limits', body: 'welcome_point_limits_body' },
];

/** S02 Welcome & privacy (F01). */
export default function Welcome() {
  const t = useT();
  const locale = useSettings((s) => s.locale);
  const setLocale = useSettings((s) => s.setLocale);

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.langRow}>
          <Chip label="English" selected={locale === 'en'} onPress={() => setLocale('en')} />
          <Chip label="Filipino" selected={locale === 'fil'} onPress={() => setLocale('fil')} />
        </View>

        <View style={styles.hero}>
          <View style={styles.mark} accessibilityElementsHidden>
            <Ionicons name="create-outline" size={28} color={palette.teal100} />
          </View>
          <AppText variant="label" style={{ color: palette.teal500 }}>
            {t('promise').toUpperCase()}
          </AppText>
          <AppText variant="display" tone="inverse" accessibilityRole="header">
            {t('welcome_title')}
          </AppText>
          <AppText tone="inverse" style={{ opacity: 0.85 }}>
            {t('welcome_body')}
          </AppText>
        </View>

        <View style={styles.points}>
          {POINTS.map((p) => (
            <View key={p.title} style={styles.point}>
              <View style={styles.pointIcon}>
                <Ionicons name={p.icon} size={22} color={palette.teal100} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <AppText variant="bodyStrong" tone="inverse">
                  {t(p.title)}
                </AppText>
                <AppText variant="small" style={{ color: palette.navy300 }}>
                  {t(p.body)}
                </AppText>
              </View>
            </View>
          ))}
        </View>
      </ScrollView>
      <View style={styles.footer}>
        <Button label={t('welcome_cta')} icon="arrow-forward" onPress={() => router.push('/readiness')} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.header },
  content: { padding: space.xl, gap: space.xxl },
  langRow: { flexDirection: 'row', gap: space.sm, justifyContent: 'flex-end' },
  hero: { gap: space.md },
  mark: {
    width: 56,
    height: 56,
    borderRadius: radius.lg,
    backgroundColor: palette.navy700,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space.sm,
  },
  points: { gap: space.lg },
  point: { flexDirection: 'row', gap: space.md, alignItems: 'flex-start' },
  pointIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: palette.navy700,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footer: { padding: space.lg },
});
