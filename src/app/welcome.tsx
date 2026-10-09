import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import type { ComponentProps } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppText, Button } from '@/components/ui';
import { useSettings } from '@/features/settings/store';
import type { StringKey } from '@/i18n/strings';
import { useT } from '@/i18n/useT';
import { colors, palette, radius, space } from '@/theme/tokens';

const POINTS: { icon: ComponentProps<typeof Ionicons>['name']; tint: string; title: StringKey; body: StringKey }[] = [
  { icon: 'lock-closed-outline', tint: palette.teal500, title: 'welcome_point_local', body: 'welcome_point_local_body' },
  { icon: 'document-text-outline', tint: palette.quoteRule, title: 'welcome_point_source', body: 'welcome_point_source_body' },
  { icon: 'information-circle-outline', tint: palette.navy300, title: 'welcome_point_limits', body: 'welcome_point_limits_body' },
];

const LOCALES = [
  { id: 'en', label: 'EN', name: 'English' },
  { id: 'fil', label: 'FIL', name: 'Filipino' },
] as const;

/** S02 Welcome & privacy (F01). */
export default function Welcome() {
  const t = useT();
  const locale = useSettings((s) => s.locale);
  const setLocale = useSettings((s) => s.setLocale);

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.topRow}>
          <AppText variant="title" tone="inverse" style={{ fontSize: 24, lineHeight: 28 }}>
            {t('appName')}
          </AppText>
          <View style={styles.segment} accessibilityRole="radiogroup" accessibilityLabel="Language">
            {LOCALES.map((l) => {
              const on = locale === l.id;
              return (
                <Pressable
                  key={l.id}
                  accessibilityRole="radio"
                  accessibilityLabel={l.name}
                  accessibilityState={{ checked: on }}
                  onPress={() => setLocale(l.id)}
                  hitSlop={6}
                  style={[styles.segmentItem, on && styles.segmentOn]}
                >
                  <AppText variant="small" style={{ color: on ? colors.text : colors.textInverse, fontWeight: '700' }}>
                    {l.label}
                  </AppText>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* Illustrates the core promise: every finding points at a highlighted source sentence. */}
        <View style={styles.paper} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <AppText variant="label" style={{ color: palette.slate500 }}>
            SAMPLE · PAGE 3
          </AppText>
          <AppText variant="quote" style={{ fontSize: 15, lineHeight: 23 }}>
            <AppText variant="quote" style={styles.highlight}>
              The final payment shall be released upon the Client’s acceptance of all deliverables.
            </AppText>
          </AppText>
        </View>

        <View style={styles.hero}>
          <AppText variant="display" tone="inverse" accessibilityRole="header">
            {t('welcome_title')}
          </AppText>
          <AppText style={{ color: palette.navy200 }}>{t('welcome_body')}</AppText>
        </View>

        <View style={styles.panel}>
          {POINTS.map((p) => (
            <View key={p.title} style={styles.point}>
              <Ionicons name={p.icon} size={22} color={p.tint} style={{ marginTop: 1 }} />
              <View style={{ flex: 1, gap: 2 }}>
                <AppText variant="bodyStrong" tone="inverse">
                  {t(p.title)}
                </AppText>
                <AppText variant="small" style={{ color: palette.navy200 }}>
                  {t(p.body)}
                </AppText>
              </View>
            </View>
          ))}
        </View>
        <AppText variant="small" style={{ color: palette.navy300 }}>
          {t('privacy_mlkit')}
        </AppText>
      </ScrollView>
      <View style={styles.footer}>
        <Button label={t('welcome_cta')} icon="arrow-forward" onPress={() => router.push('/readiness')} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.navy900 },
  content: { padding: space.xl, gap: space.xl },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  segment: { flexDirection: 'row', padding: 3, borderRadius: radius.pill, backgroundColor: palette.navy700 },
  segmentItem: { minWidth: 48, height: 36, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  segmentOn: { backgroundColor: colors.surface },
  paper: {
    backgroundColor: colors.quoteBg,
    borderRadius: radius.lg + 2,
    padding: space.lg,
    gap: space.sm,
    transform: [{ rotate: '-2deg' }],
    marginHorizontal: space.xs,
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 16 },
    elevation: 10,
  },
  highlight: { backgroundColor: palette.highlight, color: colors.text, fontSize: 15, lineHeight: 23 },
  hero: { gap: space.md },
  panel: { backgroundColor: palette.navy800, borderRadius: radius.sheet - 6, padding: space.lg, gap: space.lg },
  point: { flexDirection: 'row', gap: space.md, alignItems: 'flex-start' },
  footer: { paddingHorizontal: space.lg, paddingBottom: space.sm, paddingTop: space.sm },
});
