import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { LOW_CONFIDENCE } from '@/ai/evidenceGate';
import { DemoBanner } from '@/components/DemoBanner';
import { AppText, Banner, Button, Card, Screen } from '@/components/ui';
import { useDraft } from '@/features/review/draftStore';
import { useT } from '@/i18n/useT';
import { colors, palette, radius, space, touch } from '@/theme/tokens';

/** S08 OCR verification (F06) — confirm or correct money, dates and names before analysis. */
export default function Verify() {
  const t = useT();
  const recognized = useDraft((s) => s.recognized);
  const updateBlock = useDraft((s) => s.updateBlock);
  const textNote = useDraft((s) => s.textNote);
  const [editing, setEditing] = useState<string | null>(null);
  const [text, setText] = useState('');

  const critical = recognized.flatMap((p) => p.blocks.filter((b) => b.critical));
  const pending = critical.filter((b) => !b.verifiedAt && !b.correctedAt).length;

  return (
    <Screen title={t('verify_title')}
      footer={
        <>
          {pending > 0 ? (
            <AppText variant="small" tone="muted" center>
              {`${pending} detail${pending === 1 ? '' : 's'} not yet confirmed — calculations will not use them, and hard-to-read ones will be marked "Cannot verify".`}
            </AppText>
          ) : null}
          <Button label={t('verify_continue')} onPress={() => router.push('/review/preferences')} />
        </>
      }
    >
      <DemoBanner />
      <AppText tone="subtle">{t('verify_body')}</AppText>
      {textNote ? <Banner tone="success">{textNote}</Banner> : null}

      {critical.length === 0 ? <Banner tone="info">No amounts, dates or names were detected.</Banner> : null}

      {critical.map((b) => {
        const low = b.confidence < LOW_CONFIDENCE;
        const done = Boolean(b.verifiedAt || b.correctedAt);
        const isEditing = editing === b.id;
        return (
          <Card key={b.id} style={low && !done ? styles.lowCard : undefined}>
            <View style={styles.meta}>
              <AppText variant="label" tone="muted">{`${t('page').toUpperCase()} ${b.page}`}</AppText>
              {low && !done ? (
                <View style={styles.flag}>
                  <Ionicons name="eye-off-outline" size={14} color={palette.amber700} />
                  <AppText variant="small" style={{ color: palette.amber700, fontWeight: '700' }}>
                    {t('verify_low_conf')}
                  </AppText>
                </View>
              ) : done ? (
                <View style={styles.flag}>
                  <Ionicons name="checkmark-circle" size={14} color={palette.teal700} />
                  <AppText variant="small" style={{ color: palette.teal700, fontWeight: '700' }}>
                    {b.correctedAt ? 'Corrected' : 'Confirmed'}
                  </AppText>
                </View>
              ) : null}
            </View>

            {isEditing ? (
              <TextInput
                value={text}
                onChangeText={setText}
                multiline
                autoFocus
                style={styles.input}
                accessibilityLabel={`Correct text on page ${b.page}`}
              />
            ) : (
              <AppText variant="quote">{b.text}</AppText>
            )}

            <View style={styles.actions}>
              {isEditing ? (
                <>
                  <View style={{ flex: 1 }}>
                    <Button label={t('cancel')} variant="secondary" onPress={() => setEditing(null)} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Button
                      label={t('save')}
                      onPress={() => {
                        updateBlock(b.id, b.page, { text: text.trim(), verified: true });
                        setEditing(null);
                      }}
                    />
                  </View>
                </>
              ) : (
                <>
                  <View style={{ flex: 1 }}>
                    <Button
                      label={t('verify_edit')}
                      variant="secondary"
                      icon="create-outline"
                      onPress={() => {
                        setText(b.text);
                        setEditing(b.id);
                      }}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Button
                      label={t('verify_looks_right')}
                      variant={done ? 'ghost' : 'primary'}
                      icon="checkmark"
                      disabled={done}
                      onPress={() => updateBlock(b.id, b.page, { verified: true })}
                    />
                  </View>
                </>
              )}
            </View>
          </Card>
        );
      })}
    </Screen>
  );
}

const styles = StyleSheet.create({
  lowCard: { borderColor: palette.amber700, borderWidth: 1.5 },
  meta: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  flag: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  input: {
    minHeight: touch.min * 2,
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: radius.sm,
    padding: space.md,
    fontSize: 16,
    color: colors.text,
    textAlignVertical: 'top',
    backgroundColor: colors.quoteBg,
  },
  actions: { flexDirection: 'row', gap: space.sm, marginTop: space.xs },
});
