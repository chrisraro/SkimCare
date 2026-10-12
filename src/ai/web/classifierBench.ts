/**
 * DEV BUILDS ONLY (registered by localEngine.web.ts behind `__DEV__`): measures the clause
 * classifier in this browser on the two fictional sample agreements, through the real
 * extraction engine's pass 1 (createLocalLlmEngine + the real Laya classifier). The
 * language model is replaced by a stub that answers "not relevant", so this needs no Qwen
 * download and is NOT a review: it only shows that the engine asks the classifier and how
 * long each block takes. Returns counts and times only — never text or labels per block.
 *
 *   await globalThis.__skimcareClassifierBench()   // in the browser console
 */
import { DEMO_FIXTURES } from '../demo/fixtures';
import { LAYA_SPEC } from '../classifier/layaSpec';
import { getTriageClassifier, webClassifierThreads } from '../classifier/onnxNative.web';
import { createLocalLlmEngine } from '../llm/localLlmEngine';
import type { ClassifierStats } from '../llm/stats';

export interface ClassifierBenchResult {
  fixture: string;
  blocks: number;
  classifier: ClassifierStats;
  msPerBlock: number;
  threads: number;
}

export async function classifierBench(): Promise<ClassifierBenchResult[]> {
  const out: ClassifierBenchResult[] = [];
  for (const fixture of DEMO_FIXTURES) {
    let stats: ClassifierStats | undefined;
    const engine = createLocalLlmEngine(async () => '{"relevant": false}', {
      classifier: getTriageClassifier(),
      classifierThreshold: LAYA_SPEC.threshold,
      onStats: (s) => (stats = s.classifier),
    });
    await engine.extract({ pages: fixture.pages, documentType: fixture.type, language: 'en' });
    if (!stats) throw new Error('no stats');
    out.push({ fixture: fixture.id, blocks: stats.asked, classifier: stats, msPerBlock: stats.asked ? Math.round(stats.ms / stats.asked) : 0, threads: webClassifierThreads() });
  }
  return out;
}

export function registerClassifierBench(): void {
  (globalThis as { __skimcareClassifierBench?: typeof classifierBench }).__skimcareClassifierBench = classifierBench;
}
