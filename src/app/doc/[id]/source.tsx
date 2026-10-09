import Ionicons from '@expo/vector-icons/Ionicons';
import { Stack, useLocalSearchParams } from 'expo-router';
import { GlassHeader, HEADER_GAP, HEADER_HEIGHT } from '@/components/glass/GlassHeader';
import { useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { DemoBanner } from '@/components/DemoBanner';
import { AppText, Banner, Button, Chip } from '@/components/ui';
import { useDocument, useDocuments } from '@/features/documents/store';
import { useT } from '@/i18n/useT';
import { colors, palette, radius, space, touch } from '@/theme/tokens';

/**
 * S14 Original viewer — the page's recognized text with the cited block
 * highlighted. Tap a block to correct it; corrections invalidate the analysis.
 * TODO(native): overlay bbox highlights on the original page image once OCR returns real bounds.
 */
export default function SourceViewer() {
  const t = useT();
  const params = useLocalSearchParams<{ id: string; page?: string; block?: string }>();
  const doc = useDocument(params.id);
  const correctBlock = useDocuments((s) => s.correctBlock);
  const [pageNo, setPageNo] = useState(Number(params.page ?? 1));
  const [editing, setEditing] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [fontScale, setFontScale] = useState(1);
  const scroller = useRef<ScrollView>(null);
  const insets = useSafeAreaInsets();

  if (!doc) return null;
  const page = doc.pages.find((p) => p.number === pageNo) ?? doc.pages[0];
  if (!page) return null;

  return (
    <SafeAreaView style={[styles.root, { paddingTop: insets.top + HEADER_GAP + HEADER_HEIGHT + space.sm }]} edges={['bottom']}>
      <Stack.Screen options={{ title: `${t('source_title')} · ${t('page')} ${page.number}` }} />
      <View style={styles.toolbar}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm }}>
          {doc.pages.map((p) => (
            <Chip key={p.number} label={`${t('page')} ${p.number}`} selected={p.number === page.number} onPress={() => setPageNo(p.number)} />
          ))}
        </ScrollView>
        <View style={styles.zoom}>
          <Pressable accessibilityRole="button" accessibilityLabel="Smaller text" style={styles.zoomBtn} onPress={() => setFontScale((s) => Math.max(0.85, s - 0.15))}>
            <Ionicons name="remove" size={20} color={colors.text} />
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Larger text" style={styles.zoomBtn} onPress={() => setFontScale((s) => Math.min(1.9, s + 0.15))}>
            <Ionicons name="add" size={20} color={colors.text} />
          </Pressable>
        </View>
      </View>

      <ScrollView ref={scroller} contentContainerStyle={styles.content}>
        <DemoBanner />
        {doc.analysisStale ? <Banner tone="warning">{t('overview_stale')}</Banner> : null}
        <View style={styles.paper} accessibilityLabel={`Recognized text of page ${page.number}`}>
          {page.blocks.map((b) => {
            const cited = b.id === params.block && page.number === Number(params.page);
            const isEditing = editing === b.id;
            return (
              <View key={b.id} style={[styles.block, cited && styles.cited]}>
                {cited ? (
                  <AppText variant="label" style={{ color: palette.amber700 }}>
                    CITED PASSAGE
                  </AppText>
                ) : null}
                {isEditing ? (
                  <>
                    <TextInput value={text} onChangeText={setText} multiline autoFocus style={styles.input} accessibilityLabel="Correct this text" />
                    <View style={styles.row}>
                      <View style={{ flex: 1 }}>
                        <Button label={t('cancel')} variant="secondary" onPress={() => setEditing(null)} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Button
                          label={t('source_save')}
                          onPress={() => {
                            if (text.trim() && text.trim() !== b.text) correctBlock(doc.id, page.number, b.id, text.trim());
                            setEditing(null);
                          }}
                        />
                      </View>
                    </View>
                  </>
                ) : (
                  <View style={styles.passage}>
                    <AppText variant="quote" selectable style={{ fontSize: 16 * fontScale, lineHeight: 25 * fontScale }}>
                      {b.text}
                    </AppText>
                    {b.correctedAt ? (
                      <AppText variant="small" tone="muted">{`Corrected by you · was: “${b.originalText}”`}</AppText>
                    ) : null}
                    {/* A visible button, not a long press: selectable text eats long presses on Android, and screen readers can't find them. */}
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`${t('source_correct')}: ${b.text.slice(0, 60)}`}
                      onPress={() => {
                        setText(b.text);
                        setEditing(b.id);
                      }}
                      hitSlop={6}
                      style={styles.correct}
                    >
                      <Ionicons name="create-outline" size={16} color={colors.primary} />
                      <AppText variant="small" tone="primary" style={{ fontWeight: '700' }}>
                        {t('source_correct')}
                      </AppText>
                    </Pressable>
                  </View>
                )}
              </View>
            );
          })}
        </View>
        <AppText variant="small" tone="muted" center>
          {`Tap "${t('source_correct')}" under a passage to fix misread text. Edits mark this review as out of date.`}
        </AppText>
      </ScrollView>
      <GlassHeader title={`${t('source_title')} · ${t('page')} ${page.number}`} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  passage: { gap: space.xs },
  correct: { flexDirection: 'row', alignItems: 'center', gap: space.xs, alignSelf: 'flex-start', minHeight: touch.min },
  root: { flex: 1, backgroundColor: colors.bg },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
    backgroundColor: colors.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  zoom: { flexDirection: 'row' },
  zoomBtn: { width: touch.min, height: touch.min, alignItems: 'center', justifyContent: 'center' },
  content: { padding: space.lg, gap: space.lg },
  paper: {
    backgroundColor: palette.white,
    borderRadius: radius.sm,
    padding: space.xl,
    gap: space.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  block: { padding: space.sm, borderRadius: radius.sm, gap: space.xs },
  cited: { backgroundColor: colors.quoteBg, borderWidth: 2, borderColor: colors.quoteRule },
  input: {
    minHeight: touch.min * 2,
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: radius.sm,
    padding: space.md,
    fontSize: 16,
    color: colors.text,
    textAlignVertical: 'top',
  },
  row: { flexDirection: 'row', gap: space.sm },
});
