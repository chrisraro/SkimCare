import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { DemoBanner } from '@/components/DemoBanner';
import { EmptyState } from '@/components/EmptyState';
import { AppText, Button, Card, Screen, SourceQuote } from '@/components/ui';
import type { ComprehensionItem } from '@/domain/schema';
import { useDocument, useDocuments } from '@/features/documents/store';
import { useT } from '@/i18n/useT';
import { colors, palette, radius, space, touch } from '@/theme/tokens';

type Feedback = 'supported' | 'review' | 'cannot';

function feedbackFor(item: ComprehensionItem): Feedback | null {
  if (!item.userChoiceId) return null;
  if (!item.supportedChoiceId || item.userChoiceId === 'unsure') return 'cannot';
  return item.userChoiceId === item.supportedChoiceId ? 'supported' : 'review';
}

const FEEDBACK = {
  supported: { key: 'check_supported', icon: 'checkmark-circle', fg: palette.teal700, bg: palette.teal100 },
  review: { key: 'check_review', icon: 'refresh-circle', fg: palette.amber700, bg: palette.amber100 },
  cannot: { key: 'check_cannot', icon: 'help-circle', fg: palette.slate700, bg: palette.slate100 },
} as const;

/** S16 Understand-It-Back (F14) — a comprehension aid, not an exam. */
export default function Check() {
  const t = useT();
  const { id } = useLocalSearchParams<{ id: string }>();
  const doc = useDocument(id);
  const answer = useDocuments((s) => s.answerComprehension);
  const [index, setIndex] = useState(0);

  const items = doc?.analysis?.comprehension ?? [];
  if (!doc || items.length === 0) return <EmptyState icon="school-outline" message="No questions could be prepared from verified text." />;

  const done = index >= items.length;
  if (done) {
    const matched = items.filter((i) => feedbackFor(i) === 'supported').length;
    return (
      <Screen title={t('check_title')} footer={<Button label={t('done')} onPress={() => router.back()} />}>
        <Card>
          <AppText variant="title">{`${t('check_summary')} ${matched} of ${items.length}.`}</AppText>
          <AppText tone="subtle">
            Points marked “worth another look” are good ones to re-read or ask about. This does not measure your ability to decide.
          </AppText>
        </Card>
        <Button label="Go through again" variant="secondary" icon="refresh" onPress={() => setIndex(0)} />
      </Screen>
    );
  }

  const item = items[index]!;
  const fb = feedbackFor(item);
  const f = fb ? FEEDBACK[fb] : null;

  return (
    <Screen title={t('check_title')}
      footer={
        <Button
          label={index === items.length - 1 ? t('done') : t('check_next')}
          disabled={!fb}
          onPress={() => setIndex((i) => i + 1)}
        />
      }
    >
      <DemoBanner />
      <AppText variant="small" tone="muted">{`${index + 1} / ${items.length} · ${t('check_body')}`}</AppText>
      <AppText variant="title" accessibilityRole="header">
        {item.prompt}
      </AppText>

      <View style={{ gap: space.sm }} accessibilityRole="radiogroup">
        {item.choices.map((c) => {
          const selected = item.userChoiceId === c.id;
          return (
            <Pressable
              key={c.id}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              onPress={() => answer(doc.id, item.id, c.id)}
              style={[styles.choice, selected && styles.choiceSelected]}
            >
              <Ionicons name={selected ? 'radio-button-on' : 'radio-button-off'} size={22} color={selected ? colors.primary : colors.textMuted} />
              <AppText style={{ flex: 1 }}>{c.label}</AppText>
            </Pressable>
          );
        })}
      </View>

      {f ? (
        <View style={[styles.feedback, { backgroundColor: f.bg }]} accessibilityLiveRegion="polite">
          <View style={styles.fbHead}>
            <Ionicons name={f.icon} size={20} color={f.fg} />
            <AppText variant="bodyStrong" style={{ color: f.fg }}>
              {t(f.key)}
            </AppText>
          </View>
          <SourceQuote
            evidence={item.evidence}
            onViewSource={() =>
              router.push({
                pathname: '/doc/[id]/source',
                params: { id: doc.id, page: String(item.evidence.page), block: item.evidence.blockId },
              })
            }
          />
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  choice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: touch.min + 8,
    paddingHorizontal: space.md,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  choiceSelected: { borderColor: colors.primary, backgroundColor: palette.teal50 },
  feedback: { borderRadius: radius.md, padding: space.md, gap: space.md },
  fbHead: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
});
