import Ionicons from '@expo/vector-icons/Ionicons';
import { router, Stack } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { STAGES } from '@/ai/pipeline';
import { DemoBanner } from '@/components/DemoBanner';
import { AppText, Banner, Button, Card, Screen } from '@/components/ui';
import { useDraft } from '@/features/review/draftStore';
import { useReviewJob } from '@/features/review/jobStore';
import { useT } from '@/i18n/useT';
import { colors, palette, space } from '@/theme/tokens';

/**
 * S10 Processing — stage status, minimize, cancel, safe recovery. The review runs in
 * the job store, so minimizing keeps it going behind the tab bar accessory.
 * Never implies the AI certified anything.
 */
export default function Processing() {
  const t = useT();
  const stage = useReviewJob((s) => s.stage);
  const status = useReviewJob((s) => s.status);
  const error = useReviewJob((s) => s.error ?? null);
  const docId = useReviewJob((s) => s.docId);
  const hasPages = useDraft((s) => s.recognized.length > 0);
  const { start, cancel, discard, setMinimized, clear } = useReviewJob.getState();

  // Opening this screen (first run, or reopened from the accessory) brings the review to the front.
  useEffect(() => {
    setMinimized(false);
    if (useReviewJob.getState().status === 'idle') start();
  }, [setMinimized, start]);

  // Finished while on screen: pop the capture flow back to Home, then open the review on top so Back returns Home.
  useEffect(() => {
    if (status !== 'done' || !docId || useReviewJob.getState().minimized) return;
    clear();
    router.dismissTo('/(tabs)');
    router.push({ pathname: '/doc/[id]', params: { id: docId } });
  }, [status, docId, clear]);

  const minimize = () => {
    setMinimized(true);
    router.dismissTo('/(tabs)');
  };

  const currentIndex = STAGES.findIndex((s) => s.id === stage);

  return (
    <Screen
      footer={
        error ? (
          <>
            {hasPages ? <Button label="Try again" icon="refresh" onPress={start} /> : null}
            <Button
              label="Discard this review"
              variant={hasPages ? 'ghost' : 'primary'}
              onPress={() => {
                discard();
                router.dismissTo('/(tabs)');
              }}
            />
          </>
        ) : (
          <>
            <Button label="Keep using the app" icon="chevron-down" onPress={minimize} />
            <Button
              label={t('processing_cancel')}
              variant="ghost"
              onPress={() => {
                cancel();
                router.back();
              }}
            />
          </>
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
