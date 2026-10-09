import Ionicons from '@expo/vector-icons/Ionicons';
import { router, Stack } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { getEngine } from '@/ai/demoEngine';
import { runAnalysis, STAGES, type StageId } from '@/ai/pipeline';
import { DemoBanner } from '@/components/DemoBanner';
import { AppText, Banner, Button, Card, Screen } from '@/components/ui';
import { useDocuments } from '@/features/documents/store';
import { useDraft } from '@/features/review/draftStore';
import { useT } from '@/i18n/useT';
import { colors, palette, space } from '@/theme/tokens';

/** S10 Processing — stage status, cancel, safe recovery. Never implies the AI certified anything. */
export default function Processing() {
  const t = useT();
  const draft = useDraft();
  const save = useDocuments((s) => s.save);
  const [stage, setStage] = useState<StageId>('organize');
  const [error, setError] = useState<string | null>(null);
  const controller = useRef<AbortController | null>(null);

  const launch = () => {
    const ac = new AbortController();
    controller.current = ac;
    const now = new Date().toISOString();
    const id = `doc_${Date.now().toString(36)}`;

    runAnalysis({
      engine: getEngine(),
      pages: draft.recognized,
      ocrRevision: 0,
      documentType: draft.documentType ?? 'other',
      language: draft.language,
      onStage: setStage,
      signal: ac.signal,
    })
      .then((run) => {
        save({
          id,
          title: draft.title || 'Untitled agreement',
          type: draft.documentType ?? 'other',
          language: draft.language,
          createdAt: now,
          updatedAt: now,
          pages: draft.recognized,
          ocrRevision: 0,
          analysis: run,
          analysisStale: false,
        });
        draft.reset();
        // Pop the capture flow back to Home, then open the review on top so Back returns Home.
        router.dismissTo('/(tabs)');
        router.push({ pathname: '/doc/[id]', params: { id } });
      })
      .catch((e: Error) => {
        if (ac.signal.aborted) return;
        setError(`${e.message}. Your pages are safe — you can try again.`);
      });
  };

  useEffect(() => {
    launch();
    return () => controller.current?.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const currentIndex = STAGES.findIndex((s) => s.id === stage);

  return (
    <Screen
      footer={
        error ? (
          <Button
            label="Try again"
            icon="refresh"
            onPress={() => {
              setError(null);
              launch();
            }}
          />
        ) : (
          <Button
            label={t('processing_cancel')}
            variant="secondary"
            onPress={() => {
              controller.current?.abort();
              router.back();
            }}
          />
        )
      }
    >
      <Stack.Screen options={{ title: t('processing_title') }} />
      <DemoBanner />
      <AppText tone="subtle">{t('processing_body')}</AppText>
      {error ? <Banner tone="danger">{error}</Banner> : null}

      <Card>
        {STAGES.map((s, i) => {
          const state = i < currentIndex ? 'done' : i === currentIndex ? (error ? 'error' : 'active') : 'todo';
          return (
            <View
              key={s.id}
              style={styles.stage}
              accessible
              accessibilityLabel={`${s.label}: ${state === 'done' ? 'done' : state === 'active' ? 'in progress' : state === 'error' ? 'stopped' : 'waiting'}`}
            >
              <View style={styles.stageIcon}>
                {state === 'active' ? (
                  <ActivityIndicator color={colors.primary} />
                ) : (
                  <Ionicons
                    name={state === 'done' ? 'checkmark-circle' : state === 'error' ? 'close-circle' : 'ellipse-outline'}
                    size={22}
                    color={state === 'done' ? palette.teal700 : state === 'error' ? palette.coral700 : colors.borderStrong}
                  />
                )}
              </View>
              <AppText variant={state === 'active' ? 'bodyStrong' : 'body'} tone={state === 'todo' ? 'muted' : 'default'}>
                {s.label}
              </AppText>
            </View>
          );
        })}
      </Card>
      <AppText variant="small" tone="muted" center>
        Findings are checked against the document text. Anything that cannot be traced to a source is marked, not hidden.
      </AppText>
    </Screen>
  );
}

const styles = StyleSheet.create({
  stage: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.sm },
  stageIcon: { width: 24, alignItems: 'center' },
});
