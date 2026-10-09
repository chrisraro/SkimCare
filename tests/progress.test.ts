import { describe, expect, it } from '@jest/globals';
import { serviceAgreement } from '@/ai/demo/fixtures';
import { demoEngine } from '@/ai/demoEngine';
import type { InferenceEngine } from '@/ai/engines';
import { extractionUnits } from '@/ai/llm/chunking';
import { createLocalLlmEngine } from '@/ai/llm/localLlmEngine';
import { runAnalysis } from '@/ai/pipeline';

const pages = serviceAgreement.pages;
const quietModel = async () => '{"relevant": false}';

describe('per-review progress', () => {
  it('reports progress to the request that asked for it, one step per block', async () => {
    const llm = createLocalLlmEngine(quietModel);
    const seen: [number, number][] = [];
    await llm.extract({ pages, documentType: 'service_agreement', language: 'en', onProgress: (d, t) => seen.push([d, t]) });
    const total = extractionUnits(pages).length;
    expect(seen).toHaveLength(total);
    expect(seen.at(-1)).toEqual([total, total]);
  });

  it('runAnalysis passes progress through to the engine', async () => {
    const engine: InferenceEngine = { ...demoEngine, llm: createLocalLlmEngine(quietModel) };
    const seen: number[] = [];
    await runAnalysis({
      engine,
      pages,
      ocrRevision: 0,
      documentType: 'service_agreement',
      language: 'en',
      onProgress: (done) => seen.push(done),
    });
    expect(seen.length).toBeGreaterThan(0);
  });
});
