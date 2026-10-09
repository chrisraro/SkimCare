import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { getEngine } from '@/ai/demoEngine';
import { EmptyState } from '@/components/EmptyState';
import { AppText, Card, ListRow, Screen, SectionLabel } from '@/components/ui';
import { useDocuments } from '@/features/documents/store';
import { useT } from '@/i18n/useT';
import { colors, palette, radius, space } from '@/theme/tokens';

/** S04 Home — new review, recent documents, offline status. */
export default function Home() {
  const t = useT();
  const order = useDocuments((s) => s.order);
  const byId = useDocuments((s) => s.byId);
  const recent = order.slice(0, 3).map((id) => byId[id]!).filter(Boolean);
  const isDemo = getEngine().info.kind === 'demo';

  return (
    <Screen>
      <View style={styles.statusRow}>
        <View style={styles.pill} accessible accessibilityLabel={t('home_offline')}>
          <Ionicons name="airplane-outline" size={14} color={palette.teal700} />
          <AppText variant="small" style={{ color: palette.teal700, fontWeight: '700' }}>
            {t('home_offline')}
          </AppText>
        </View>
        {isDemo ? (
          <View style={[styles.pill, { backgroundColor: palette.amber100 }]}>
            <Ionicons name="flask-outline" size={14} color={palette.amber700} />
            <AppText variant="small" style={{ color: palette.amber700, fontWeight: '700' }}>
              Demo engine
            </AppText>
          </View>
        ) : null}
      </View>

      <View style={{ gap: space.xs }}>
        <AppText tone="muted">{t('home_greeting')}</AppText>
        <AppText variant="title" accessibilityRole="header">
          {t('home_title')}
        </AppText>
      </View>

      <Card tone="brand" onPress={() => router.push('/review/new')} accessibilityLabel={t('home_start')}>
        <View style={styles.startRow}>
          <View style={styles.startIcon}>
            <Ionicons name="scan-outline" size={28} color={colors.textInverse} />
          </View>
          <View style={{ flex: 1 }}>
            <AppText variant="heading" tone="inverse">
              {t('home_start')}
            </AppText>
            <AppText variant="small" style={{ color: palette.navy300 }}>
              {t('home_start_body')}
            </AppText>
          </View>
          <Ionicons name="arrow-forward-circle" size={32} color={palette.teal500} />
        </View>
      </Card>

      <AppText variant="small" tone="muted">
        {t('home_supported')}
      </AppText>

      <SectionLabel>{t('home_recent')}</SectionLabel>
      {recent.length === 0 ? (
        <EmptyState icon="lock-closed-outline" message={t('home_empty')} />
      ) : (
        <View style={styles.list}>
          {recent.map((d) => (
            <ListRow
              key={d.id}
              icon="document-text-outline"
              title={d.title}
              subtitle={`${d.analysis?.findings.length ?? 0} findings · ${new Date(d.updatedAt).toLocaleDateString()}`}
              onPress={() => router.push({ pathname: '/doc/[id]', params: { id: d.id } })}
            />
          ))}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  statusRow: { flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    backgroundColor: palette.teal100,
    paddingHorizontal: space.sm,
    paddingVertical: space.xxs + 2,
    borderRadius: radius.pill,
  },
  startRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.sm },
  startIcon: {
    width: 52,
    height: 52,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  list: { gap: space.sm },
});
