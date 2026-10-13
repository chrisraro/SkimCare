import { router, useLocalSearchParams } from 'expo-router';
import { getEngine } from '@/ai/demoEngine';
import { useDocuments } from '@/features/documents/store';
import { useReviewJob } from '@/features/review/jobStore';
import { useT } from '@/i18n/useT';
import { Banner, Button } from './ui';

/**
 * Shown wherever engine output appears that was NOT produced by the real model:
 *  - the whole app on a Demo-engine build, or
 *  - a built-in sample reviewed before the model is installed (pre-written findings). That one
 *    says so plainly and offers the way to run it for real.
 * A saved review answers for itself (its run records the engine); a running one asks the job.
 */
export function DemoBanner() {
  const t = useT();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const docKind = useDocuments((s) => (id ? s.byId[id]?.analysis?.engine.kind : undefined));
  const jobKind = useReviewJob((s) => (s.status === 'running' || s.status === 'error' ? s.engineKind : undefined));
  const appKind = getEngine().info.kind;
  const kind = docKind ?? jobKind ?? appKind;
  if (kind !== 'demo') return null;

  // The app is built for the real engine, but this particular review ran on the Demo engine.
  if (appKind === 'local') {
    return (
      <Banner
        tone="warning"
        action={<Button variant="ghost" label={t('demo_sample_action')} onPress={() => router.push('/readiness')} />}
      >
        {t('demo_banner_sample')}
      </Banner>
    );
  }
  return <Banner tone="warning">{t('demo_banner')}</Banner>;
}
