import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { STAGES } from '@/ai/pipeline';
import { useReviewJob } from '@/features/review/jobStore';
import { colors, palette, radius, space } from '@/theme/tokens';
import { AppText } from './ui';

/**
 * Review progress shown above the tab bar while a minimized review runs, and
 * "Review ready" once it finishes. Holds no state of its own: on iOS 26 the system
 * renders two copies (regular and inline), so everything comes from the job store.
 */
export function ReviewAccessory({ compact }: { compact?: boolean }) {
  const status = useReviewJob((s) => s.status);
  const stage = useReviewJob((s) => s.stage);
  const title = useReviewJob((s) => s.title);
  const docId = useReviewJob((s) => s.docId);
  const clear = useReviewJob((s) => s.clear);

  if (status === 'idle') return null;

  const index = Math.max(0, STAGES.findIndex((s) => s.id === stage));
  const done = status === 'done';
  const failed = status === 'error';
  const progress = done ? 1 : (index + 0.5) / STAGES.length;
  const line = done ? 'Review ready — tap to open' : failed ? 'Review stopped — tap to retry' : STAGES[index]!.label;

  const open = () => {
    if (done && docId) {
      clear();
      router.push({ pathname: '/doc/[id]', params: { id: docId } });
    } else {
      router.push('/review/processing');
    }
  };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${line}`}
      accessibilityLiveRegion="polite"
      onPress={open}
      style={({ pressed }) => [styles.row, compact && styles.compact, pressed && { opacity: 0.7 }]}
    >
      <View style={[styles.badge, done && { backgroundColor: palette.teal100 }, failed && { backgroundColor: palette.amber100 }]}>
        {done ? (
          <Ionicons name="checkmark" size={18} color={palette.teal700} />
        ) : failed ? (
          <Ionicons name="alert" size={18} color={palette.amber700} />
        ) : (
          <ActivityIndicator size="small" color={colors.primary} />
        )}
      </View>
      <View style={styles.text}>
        {compact ? (
          <AppText variant="small" numberOfLines={1} style={{ fontWeight: '700' }}>
            {done ? 'Review ready' : failed ? 'Review stopped' : `Reviewing · ${index + 1}/${STAGES.length}`}
          </AppText>
        ) : (
          <>
            <AppText variant="small" numberOfLines={1} style={{ fontWeight: '700' }}>
              {title}
            </AppText>
            <AppText variant="small" tone="muted" numberOfLines={1} style={{ fontSize: 12, lineHeight: 16 }}>
              {line}
            </AppText>
            <View style={styles.track}>
              <View style={[styles.fill, { width: `${progress * 100}%` }, failed && { backgroundColor: palette.amber700 }]} />
            </View>
          </>
        )}
      </View>
      {compact ? null : <Ionicons name={done ? 'arrow-forward' : 'chevron-up'} size={18} color={colors.textMuted} />}
    </Pressable>
  );
}

/**
 * Bottom spacer for tab screens: keeps the last item clear of the floating
 * progress capsule while a review is running or waiting to be opened.
 */
export function AccessorySpacer() {
  const visible = useReviewJob((s) => s.status !== 'idle');
  return visible ? <View style={{ height: 72 }} accessibilityElementsHidden importantForAccessibility="no" /> : null;
}

const styles = StyleSheet.create({
  row: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.lg,
    minHeight: 52,
  },
  compact: { paddingHorizontal: space.md, gap: space.sm },
  badge: {
    width: 32,
    height: 32,
    borderRadius: radius.pill,
    backgroundColor: palette.slate100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: { flex: 1, gap: 1 },
  track: { height: 3, borderRadius: 2, backgroundColor: palette.slate200, marginTop: 4, overflow: 'hidden' },
  fill: { height: 3, borderRadius: 2, backgroundColor: colors.primary },
});
