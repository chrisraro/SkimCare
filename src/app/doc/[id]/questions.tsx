import Ionicons from '@expo/vector-icons/Ionicons';
import * as Clipboard from 'expo-clipboard';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { DemoBanner } from '@/components/DemoBanner';
import { EmptyState } from '@/components/EmptyState';
import { AppText, Banner, Button, Card, Screen } from '@/components/ui';
import { useDocument, useDocuments } from '@/features/documents/store';
import { useT } from '@/i18n/useT';
import { colors, radius, space, touch } from '@/theme/tokens';

/** S17 Questions to ask (F15) — editable list with source links; copy is explicit and user-initiated. */
export default function Questions() {
  const t = useT();
  const { id } = useLocalSearchParams<{ id: string }>();
  const doc = useDocument(id);
  const upsert = useDocuments((s) => s.upsertQuestion);
  const remove = useDocuments((s) => s.removeQuestion);
  const [draft, setDraft] = useState('');
  const [copied, setCopied] = useState(false);

  if (!doc) return null;
  const questions = doc.analysis?.questions ?? [];

  const copyAll = async () => {
    await Clipboard.setStringAsync(questions.map((q, i) => `${i + 1}. ${q.text}`).join('\n'));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Screen title={t('questions_title')}
      footer={
        <Button
          label={copied ? t('questions_copied') : t('questions_copy')}
          icon={copied ? 'checkmark' : 'copy-outline'}
          disabled={questions.length === 0}
          onPress={copyAll}
        />
      }
    >
      <DemoBanner />
      {doc.analysisStale ? <Banner tone="warning">{t('overview_stale')}</Banner> : null}
      <AppText tone="subtle">{t('questions_body')}</AppText>

      {questions.length === 0 ? <EmptyState icon="chatbubbles-outline" message="No questions yet." /> : null}

      {questions.map((q, i) => (
        <Card key={q.id}>
          <View style={styles.qHead}>
            <AppText variant="label" tone="muted">{`Q${i + 1}${q.edited ? ' · edited' : ''}`}</AppText>
            <Pressable accessibilityRole="button" accessibilityLabel={`Remove question ${i + 1}`} style={styles.iconBtn} onPress={() => remove(doc.id, q.id)}>
              <Ionicons name="close" size={20} color={colors.textMuted} />
            </Pressable>
          </View>
          <TextInput
            value={q.text}
            multiline
            onChangeText={(text) => upsert(doc.id, { ...q, text, edited: true })}
            style={styles.input}
            accessibilityLabel={`Question ${i + 1}`}
          />
          {q.evidence ? (
            <Pressable
              accessibilityRole="link"
              onPress={() =>
                router.push({ pathname: '/doc/[id]/source', params: { id: doc.id, page: String(q.evidence!.page), block: q.evidence!.blockId } })
              }
              style={styles.link}
            >
              <Ionicons name="document-text-outline" size={16} color={colors.primary} />
              <AppText variant="small" tone="primary" style={{ fontWeight: '700' }}>
                {`${t('viewSource')} · ${t('page')} ${q.evidence.page}`}
              </AppText>
            </Pressable>
          ) : null}
        </Card>
      ))}

      <Card tone="muted">
        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder={t('questions_add')}
          placeholderTextColor={colors.textMuted}
          multiline
          style={[styles.input, styles.newInput]}
          accessibilityLabel={t('questions_add')}
        />
        <Button
          label={t('questions_add')}
          variant="secondary"
          icon="add"
          disabled={!draft.trim()}
          onPress={() => {
            upsert(doc.id, { id: `user_${Date.now().toString(36)}`, text: draft.trim(), edited: true });
            setDraft('');
          }}
        />
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  qHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  iconBtn: { width: touch.min, height: touch.min, alignItems: 'center', justifyContent: 'center', marginRight: -space.md },
  input: { fontSize: 16, lineHeight: 24, color: colors.text, minHeight: touch.min, textAlignVertical: 'top' },
  newInput: { backgroundColor: colors.surface, borderRadius: radius.sm, padding: space.md },
  link: { flexDirection: 'row', alignItems: 'center', gap: space.xs, minHeight: 36 },
});
