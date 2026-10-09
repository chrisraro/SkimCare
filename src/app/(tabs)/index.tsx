import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { getEngine } from '@/ai/demoEngine';
import { EmptyState } from '@/components/EmptyState';
import { AppText, Card, Screen, SectionLabel } from '@/components/ui';
import { TYPE_LABELS, type DocumentRecord } from '@/domain/schema';
import { useDocuments } from '@/features/documents/store';
import { useSettings } from '@/features/settings/store';
import { useT } from '@/i18n/useT';
import { colors, palette, radius, space } from '@/theme/tokens';

/** Wallet-style stack: each card behind the front one keeps a full touch target (≥48dp) and its title visible. */
const BACK_HEIGHT = 96;
const VISIBLE = 64;

/** S04 Home — new review, recent documents as a stack, offline status. */
export default function Home() {
  const t = useT();
  const order = useDocuments((s) => s.order);
  const byId = useDocuments((s) => s.byId);
  const recent = order.slice(0, 3).map((id) => byId[id]!).filter(Boolean);
  const isDemo = getEngine().info.kind === 'demo';
  const offlineReady = useSettings((s) => s.offlineReady);

  return (
    <Screen edges={['top']} tab>
      <View style={styles.topRow}>
        <AppText tone="muted">{t('home_greeting')}</AppText>
        <View style={styles.pills}>
          {isDemo ? (
            <View style={[styles.pill, { backgroundColor: palette.amber100 }]}>
              <Ionicons name="flask-outline" size={13} color={palette.amber700} />
              <AppText variant="label" style={{ color: palette.amber700, letterSpacing: 0 }}>
                Demo
              </AppText>
            </View>
          ) : null}
          {/* Claim offline only when the last readiness check passed; otherwise link to the check. */}
          {offlineReady ? (
            <View style={styles.pill} accessible accessibilityLabel={t('home_offline')}>
              <Ionicons name="lock-closed" size={12} color={palette.teal700} />
              <AppText variant="label" style={{ color: palette.teal700, letterSpacing: 0 }}>
                {t('home_offline')}
              </AppText>
            </View>
          ) : (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('home_not_ready')}
              onPress={() => router.push('/readiness')}
              hitSlop={8}
              style={[styles.pill, { backgroundColor: palette.slate100 }]}
            >
              <Ionicons name="alert-circle-outline" size={13} color={palette.slate700} />
              <AppText variant="label" style={{ color: palette.slate700, letterSpacing: 0 }}>
                {t('home_not_ready')}
              </AppText>
            </Pressable>
          )}
        </View>
      </View>

      <AppText variant="display" accessibilityRole="header">
        {t('home_title')}
      </AppText>

      <Card tone="brand" onPress={() => router.push('/review/new')} accessibilityLabel={t('home_start')}>
        <View style={styles.startRow}>
          <View style={styles.startIcon}>
            <Ionicons name="scan-outline" size={26} color={colors.textInverse} />
          </View>
          <Ionicons name="arrow-forward" size={24} color={palette.teal500} />
        </View>
        <AppText variant="heading" tone="inverse" style={{ fontSize: 20 }}>
          {t('home_start')}
        </AppText>
        <AppText variant="small" style={{ color: palette.navy300 }}>
          {t('home_start_body')}
        </AppText>
      </Card>

      <AppText variant="small" tone="muted">
        {t('home_supported')}
      </AppText>

      <SectionLabel>{t('home_recent')}</SectionLabel>
      {recent.length === 0 ? (
        <EmptyState icon="lock-closed-outline" message={t('home_empty')} />
      ) : (
        <View style={{ paddingBottom: space.lg }}>
          {/* Oldest at the back, newest in front — the one you most likely want is fully readable. */}
          {[...recent].reverse().map((d, i, all) => (
            <RecentCard key={d.id} doc={d} front={i === all.length - 1} first={i === 0} />
          ))}
        </View>
      )}
    </Screen>
  );
}

function RecentCard({ doc, front, first }: { doc: DocumentRecord; front: boolean; first: boolean }) {
  const findings = doc.analysis?.findings ?? [];
  const attention = findings.filter((f) => f.reviewStatus === 'needs_attention').length;
  const clarify = findings.filter((f) => f.reviewStatus === 'needs_clarification').length;
  const explained = findings.filter((f) => f.reviewStatus === 'explained').length;
  const ink = front ? colors.text : colors.textInverse;
  const sub = front ? palette.slate700 : palette.navy300;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${doc.title}. ${TYPE_LABELS[doc.type]}, ${new Date(doc.updatedAt).toLocaleDateString()}. ${findings.length} findings.`}
      onPress={() => router.push({ pathname: '/doc/[id]', params: { id: doc.id } })}
      style={({ pressed }) => [
        styles.recent,
        { backgroundColor: front ? colors.quoteBg : colors.header, marginTop: first ? 0 : -(BACK_HEIGHT - VISIBLE) },
        front ? styles.recentFront : { height: BACK_HEIGHT },
        pressed && { transform: [{ scale: 0.98 }] },
      ]}
    >
      {front ? (
        <View style={styles.recentMeta}>
          <AppText variant="small" style={{ color: sub }}>
            {TYPE_LABELS[doc.type]}
          </AppText>
          <AppText variant="small" style={{ color: sub }}>
            {new Date(doc.updatedAt).toLocaleDateString()}
          </AppText>
        </View>
      ) : null}
      <AppText variant="title" numberOfLines={front ? 2 : 1} style={{ color: ink, fontSize: 21, lineHeight: 26 }}>
        {doc.title}
      </AppText>
      {front ? (
        <View style={styles.counts}>
          {attention ? <Count n={attention} label="attention" bg={palette.coral100} fg={palette.coral700} /> : null}
          {clarify ? <Count n={clarify} label="to clarify" bg={palette.amber100} fg={palette.amber700} /> : null}
          {explained ? <Count n={explained} label="explained" bg={palette.teal100} fg={palette.teal700} /> : null}
          {!doc.analysis || findings.length === 0 ? (
            <AppText variant="small" tone="muted">
              {!doc.analysis ? 'Not reviewed yet' : 'No verified findings'}
            </AppText>
          ) : null}
        </View>
      ) : null}
    </Pressable>
  );
}

function Count({ n, label, bg, fg }: { n: number; label: string; bg: string; fg: string }) {
  return (
    <View style={[styles.count, { backgroundColor: bg }]}>
      <AppText variant="small" style={{ color: fg, fontWeight: '700' }}>{`${n} ${label}`}</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  pills: { flexDirection: 'row', gap: space.xs },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    backgroundColor: palette.teal100,
    paddingHorizontal: space.sm + 2,
    paddingVertical: space.xs,
    borderRadius: radius.pill,
  },
  startRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: space.md },
  startIcon: {
    width: 52,
    height: 52,
    borderRadius: radius.lg,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recent: {
    borderRadius: radius.card,
    padding: space.lg + 2,
    gap: space.xs,
    overflow: 'hidden',
  },
  recentFront: {
    minHeight: 190,
    shadowColor: palette.navy900,
    shadowOpacity: 0.18,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 8,
  },
  recentMeta: { flexDirection: 'row', justifyContent: 'space-between' },
  counts: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs, marginTop: 'auto', paddingTop: space.md },
  count: { paddingHorizontal: space.sm + 2, paddingVertical: space.xxs + 1, borderRadius: radius.pill },
});
