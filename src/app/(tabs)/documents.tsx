import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { EmptyState } from '@/components/EmptyState';
import { AppText, ListRow, Screen } from '@/components/ui';
import { useDocuments } from '@/features/documents/store';
import { useT } from '@/i18n/useT';
import { colors, radius, space, touch } from '@/theme/tokens';

/** S18 My Documents (F16) — local search, reopen, rename, delete. */
export default function Documents() {
  const t = useT();
  const order = useDocuments((s) => s.order);
  const byId = useDocuments((s) => s.byId);
  const remove = useDocuments((s) => s.remove);
  const rename = useDocuments((s) => s.rename);
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState('');

  const docs = useMemo(() => {
    const q = query.trim().toLowerCase();
    return order.map((id) => byId[id]!).filter((d) => d && (!q || d.title.toLowerCase().includes(q)));
  }, [order, byId, query]);

  const confirmDelete = (id: string) =>
    Alert.alert(t('docs_delete'), t('docs_delete_confirm'), [
      { text: t('cancel'), style: 'cancel' },
      { text: t('delete'), style: 'destructive', onPress: () => remove(id) },
    ]);

  return (
    <Screen>
      <View style={styles.search}>
        <Ionicons name="search" size={18} color={colors.textMuted} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder={t('docs_search')}
          placeholderTextColor={colors.textMuted}
          style={styles.input}
          accessibilityLabel={t('docs_search')}
        />
      </View>

      {docs.length === 0 ? (
        <EmptyState icon="folder-open-outline" message={t('docs_empty')} />
      ) : (
        docs.map((d) =>
          editing === d.id ? (
            <View key={d.id} style={styles.renameRow}>
              <TextInput
                value={draftTitle}
                onChangeText={setDraftTitle}
                autoFocus
                style={[styles.input, styles.renameInput]}
                accessibilityLabel={t('docs_rename')}
                onSubmitEditing={() => {
                  rename(d.id, draftTitle.trim() || d.title);
                  setEditing(null);
                }}
              />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('save')}
                style={styles.iconBtn}
                onPress={() => {
                  rename(d.id, draftTitle.trim() || d.title);
                  setEditing(null);
                }}
              >
                <Ionicons name="checkmark" size={22} color={colors.primary} />
              </Pressable>
            </View>
          ) : (
            <ListRow
              key={d.id}
              icon="document-text-outline"
              title={d.title}
              subtitle={`${d.pages.length} pages · ${new Date(d.updatedAt).toLocaleDateString()}`}
              onPress={() => router.push({ pathname: '/doc/[id]', params: { id: d.id } })}
              right={
                <View style={styles.actions}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`${t('docs_rename')} ${d.title}`}
                    style={styles.iconBtn}
                    onPress={() => {
                      setDraftTitle(d.title);
                      setEditing(d.id);
                    }}
                  >
                    <Ionicons name="pencil" size={18} color={colors.textMuted} />
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`${t('docs_delete')} ${d.title}`}
                    style={styles.iconBtn}
                    onPress={() => confirmDelete(d.id)}
                  >
                    <Ionicons name="trash-outline" size={18} color={colors.textMuted} />
                  </Pressable>
                </View>
              }
            />
          ),
        )
      )}
      <AppText variant="small" tone="muted" center>
        Stored only on this phone. If you lose the phone, these reviews cannot be recovered.
      </AppText>
    </Screen>
  );
}

const styles = StyleSheet.create({
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: space.md,
  },
  input: { flex: 1, minHeight: touch.min, fontSize: 16, color: colors.text },
  renameRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  renameInput: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.primary,
    paddingHorizontal: space.md,
  },
  actions: { flexDirection: 'row' },
  iconBtn: { width: touch.min, height: touch.min, alignItems: 'center', justifyContent: 'center' },
});
