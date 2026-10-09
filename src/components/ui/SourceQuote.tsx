import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, View } from 'react-native';
import type { EvidenceRef } from '@/domain/schema';
import { useT } from '@/i18n/useT';
import { colors, radius, space } from '@/theme/tokens';
import { AppText } from './AppText';

/**
 * Verbatim contract text. Visually distinct (serif, ruled, warm paper) so an AI
 * paragraph can never be mistaken for contract wording (PRD §06 D).
 */
export function SourceQuote({ evidence, onViewSource }: { evidence: EvidenceRef; onViewSource?: () => void }) {
  const t = useT();
  return (
    <View style={styles.wrap}>
      <View style={styles.meta}>
        <Ionicons name="document-text-outline" size={14} color={colors.textMuted} />
        <AppText variant="label" tone="muted">
          {`${t('page').toUpperCase()} ${evidence.page} · ${evidence.blockId}`}
        </AppText>
      </View>
      <AppText variant="quote" selectable accessibilityLabel={`Quoted from page ${evidence.page}: ${evidence.quote}`}>
        “{evidence.quote}”
      </AppText>
      {onViewSource ? (
        <Pressable
          onPress={onViewSource}
          accessibilityRole="link"
          accessibilityLabel={`${t('viewSource')}, page ${evidence.page}`}
          hitSlop={12}
          style={styles.link}
        >
          <AppText variant="small" tone="primary" style={styles.linkText}>
            {t('viewSource')}
          </AppText>
          <Ionicons name="arrow-forward" size={16} color={colors.primary} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: colors.quoteBg,
    borderRadius: radius.lg,
    padding: space.lg,
    gap: space.sm,
  },
  meta: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  link: { flexDirection: 'row', alignItems: 'center', gap: space.xs, alignSelf: 'flex-start', minHeight: 32 },
  linkText: { fontWeight: '700' },
});
