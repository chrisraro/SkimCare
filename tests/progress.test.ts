import { describe, expect, it } from '@jest/globals';
import { serviceAgreement } from '@/ai/demo/fixtures';
import { demoEngine } from '@/ai/demoEngine';
import type { InferenceEngine } from '@/ai/engines';
import { extractionUnits } from '@/ai/llm/chunking';
import { createLocalLlmEngine } from '@/ai/llm/localLlmEngine';
import { emptyStats, reportStats, useLastExtractStats } from '@/ai/llm/stats';
import { reviewProgress, runAnalysis } from '@/ai/pipeline';

const pages = serviceAgreement.pages;
const quietModel = async () => '{"t":"none"}';

describe('per-review progress', () => {
  it('reports progress to the request that asked for it, one step per block', async () => {
    const llm = createLocalLlmEngine(quietModel);
    const seen: [number, number][] = [];
    await llm.extract({ pages, documentType: 'service_agreement', language: 'en', onProgress: (d, t) => seen.push([d, t]) });
    const total = extractionUnits(pages).length;
    // One report before the first (slow) call, so the screen shows the total at once, then one per block.
    expect(seen).toHaveLength(total + 1);
    expect(seen[0]).toEqual([0, total]);
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

describe('reviewProgress (one bar for the whole review)', () => {
  it('starts at 0 and never runs backwards across stages', () => {
    const steps = [
      reviewProgress('organize'),
      reviewProgress('extract', { done: 0, total: 6 }),
      reviewProgress('extract', { done: 3, total: 6 }),
      reviewProgress('extract', { done: 6, total: 6 }),
      reviewProgress('validate'),
      reviewProgress('explain'),
      reviewProgress('save'),
    ];
    expect(steps[0]).toBe(0);
    for (let i = 1; i < steps.length; i++) expect(steps[i]!).toBeGreaterThanOrEqual(steps[i - 1]!);
    expect(steps.at(-1)!).toBeLessThan(1);
  });

  it('gives reading terms most of the bar, so a slow model does not look stuck at "2 of 5"', () => {
    const half = reviewProgress('extract', { done: 3, total: 6 });
    expect(half).toBeGreaterThan(0.4);
    expect(half).toBeLessThan(0.55);
  });

  it('handles a document with nothing to ask', () => {
    expect(reviewProgress('extract', { done: 0, total: 0 })).toBeCloseTo(0.05);
  });
});

describe('reportStats (Diagnostics "Speed of the last review")', () => {
  it('keeps the newest extraction for Diagnostics, but not quiz runs', () => {
    useLastExtractStats.setState({ last: null });

    const extract = emptyStats('extract');
    extract.asked = 7;
    reportStats(extract);
    expect(useLastExtractStats.getState().last?.asked).toBe(7);

    reportStats(emptyStats('quiz'));
    expect(useLastExtractStats.getState().last?.asked).toBe(7);
  });
});
