import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { installmentAgreement, serviceAgreement } from '@/ai/demo/fixtures';
import { demoEngine } from '@/ai/demoEngine';
import type { InferenceEngine } from '@/ai/engines';
import { extractionUnits, prioritizeUnits } from '@/ai/llm/chunking';
import { createLocalLlmEngine, type CompletionRequest } from '@/ai/llm/localLlmEngine';
import { runAnalysis } from '@/ai/pipeline';
import { isCriticalText } from '@/ai/textBlocks';
import type { AnalysisRun, Finding } from '@/domain/schema';
import { useDocuments } from '@/features/documents/store';
import { useDraft } from '@/features/review/draftStore';
import { useReviewJob } from '@/features/review/jobStore';
import { EVAL_CONTRACTS } from './fixtures/contracts';

jest.setTimeout(15_000);

const pages = serviceAgreement.pages;
const blocks = pages.flatMap((p) => p.blocks);

/** Fake model: every block is a relevant "other" term, except one injection-like verdict the gate must drop. */
function fakeModel() {
  const order: string[] = [];
  const run = async (req: CompletionRequest) => {
    const text = /<block>\n([\s\S]*?)\n<\/block>/.exec(req.messages[1]!.content)?.[1];
    const block = blocks.find((b) => b.text === text);
    if (!block) return '{}';
    order.push(block.id);
    const verdict = block.id === 'p3_b14';
    return JSON.stringify({
      relevant: true,
      finding: {
        type: 'other',
        title: 'A term',
        explanation: verdict ? 'This clause is fair to both sides.' : 'What this sentence says.',
        review_status: 'explained',
        questions: [],
      },
    });
  };
  return { run, order };
}

const engineWith = (run: (req: CompletionRequest) => Promise<string>): InferenceEngine => ({ ...demoEngine, llm: createLocalLlmEngine(run) });

/** Run fields that legitimately differ between two runs. */
const stable = (r: AnalysisRun) => ({ ...r, id: '', startedAt: '', finishedAt: '' });

describe('critical-first extraction order', () => {
  it('puts money/date/party blocks first and keeps ids and document indexes unchanged', () => {
    for (const c of [...EVAL_CONTRACTS.slice(0, 5), { pages }]) {
      const units = extractionUnits(c.pages);
      const ordered = prioritizeUnits(units);
      expect([...ordered].sort((a, b) => a.index - b.index)).toEqual(units);
      const critical = ordered.map((u) => isCriticalText(u.block.text));
      const firstNonCritical = critical.indexOf(false);
      if (firstNonCritical >= 0) expect(critical.slice(firstNonCritical).includes(true)).toBe(false);
    }
  });

  it('asks the model about critical blocks first, but returns candidates in document order', async () => {
    const { run, order } = fakeModel();
    const raw = await engineWith(run).llm.extract({ pages, documentType: 'service_agreement', language: 'en' });
    const units = extractionUnits(pages);
    expect(order).toEqual(prioritizeUnits(units).map((u) => u.block.id));
    const cited = (raw.findings as { evidence: { blockId: string } }[]).map((f) => f.evidence.blockId);
    expect(cited).toEqual(units.map((u) => u.block.id));
  });

  it('keeps progress counts monotonic, one step per block', async () => {
    const seen: [number, number][] = [];
    await engineWith(fakeModel().run).llm.extract({ pages, documentType: 'service_agreement', language: 'en', onProgress: (d, t) => seen.push([d, t]) });
    const total = extractionUnits(pages).length;
    expect(seen.map(([d]) => d)).toEqual(Array.from({ length: total }, (_, i) => i + 1));
    expect(seen.every(([, t]) => t === total)).toBe(true);
  });
});

describe('progressive findings', () => {
  it('emits raw candidates after each block', async () => {
    const batches: unknown[][] = [];
    await engineWith(fakeModel().run).llm.extract({ pages, documentType: 'service_agreement', language: 'en', onCandidates: (c) => batches.push(c) });
    expect(batches).toHaveLength(extractionUnits(pages).length);
  });

  it('shows only gated findings, and the final run is identical with or without callbacks', async () => {
    const opts = { pages, ocrRevision: 0, documentType: 'service_agreement' as const, language: 'en' as const };
    const plain = await runAnalysis({ ...opts, engine: engineWith(fakeModel().run) });

    const snapshots: Finding[][] = [];
    const progressive = await runAnalysis({
      ...opts,
      engine: engineWith(fakeModel().run),
      onFindings: (f) => snapshots.push(f),
      onProgress: () => undefined,
    });

    expect(stable(progressive)).toEqual(stable(plain));
    expect(snapshots.length).toBeGreaterThan(0);
    // Accumulating, never shrinking; the verdict the gate rejects is never shown.
    snapshots.reduce((prev, cur) => (expect(cur.length).toBeGreaterThanOrEqual(prev), cur.length), 0);
    const last = snapshots.at(-1)!;
    expect(last.some((f) => f.evidence?.blockId === 'p3_b14')).toBe(false);
    const finalIds = new Set(plain.findings.map((f) => f.id));
    expect(last.every((f) => finalIds.has(f.id))).toBe(true);
    expect(last).toHaveLength(plain.findings.length);
  });
});

describe('review job partial findings', () => {
  beforeEach(() => {
    useReviewJob.getState().cancel();
    useDocuments.getState().eraseAll();
    useDraft.getState().reset();
  });

  it('keeps gated partial findings while the review runs and clears them on a new start', async () => {
    useDraft.getState().start('sample', 'Partial');
    useDraft.getState().setRecognized(structuredClone(installmentAgreement.pages), 'ocr');
    useDraft.getState().setType('installment_agreement');
    expect(useReviewJob.getState().partialFindings).toEqual([]);
    useReviewJob.getState().start();
    for (let i = 0; i < 100 && useReviewJob.getState().status === 'running'; i++) await new Promise((r) => setTimeout(r, 50));
    expect(useReviewJob.getState().status).toBe('done');
    const partial = useReviewJob.getState().partialFindings;
    const saved = Object.values(useDocuments.getState().byId)[0]!.analysis!.findings;
    expect(partial.map((f) => f.id).sort()).toEqual(saved.map((f) => f.id).sort());
    useReviewJob.getState().cancel();
    expect(useReviewJob.getState().partialFindings).toEqual([]);
  });
});
