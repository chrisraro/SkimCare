import { getEngine } from '@/ai/demoEngine';
import { useT } from '@/i18n/useT';
import { Banner } from './ui';

/** Shown wherever engine output appears while the Demo engine is active. */
export function DemoBanner() {
  const t = useT();
  if (getEngine().info.kind !== 'demo') return null;
  return <Banner tone="warning">{t('demo_banner')}</Banner>;
}
