import { describe, expect, it } from '@jest/globals';
import { createHfEncoder } from '@/ai/classifier/hfTokenizer';
import { checkClassifier, ClassifierLoadError, contextSegment, createLayaClassifier, decodeLogits, softmax, type LoadedClassifier } from '@/ai/classifier/laya';
import { LAYA_SPEC, type LayaInferenceSpec } from '@/ai/classifier/layaSpec';
import { webClassifierThreads } from '@/ai/classifier/onnxNative.web';
import { wrapOrtSession, type OrtLikeSession } from '@/ai/classifier/ortSession';
import { classifierReadinessCheck } from '@/ai/classifier/readiness';
import { serviceAgreement } from '@/ai/demo/fixtures';
import { demoEngine } from '@/ai/demoEngine';
import type { InferenceEngine } from '@/ai/engines';
import { extractionUnits } from '@/ai/llm/chunking';
import { createLocalLlmEngine, type CompletionRequest, type LocalLlmOptions } from '@/ai/llm/localLlmEngine';
import { classifierFiles, isClassifierPinned, LAYA_CLASSIFIER } from '@/ai/llm/models';
import { formatStats, type LlmRunStats } from '@/ai/llm/stats';
import { TRIAGE_LABELS } from '@/ai/llm/triageClassifier';
import { runAnalysis } from '@/ai/pipeline';
import { fakeClassifier, type FakeAnswer } from './helpers/fakeClassifier';
import { blockTextOf, replyFor } from './helpers/twoPass';
import wordpiece from './fixtures/tokenizer/wordpiece.json';

const pages = serviceAgreement.pages;
const units = extractionUnits(pages);
const blocks = pages.flatMap((p) => p.blocks);
const textOf = (id: string) => blocks.find((b) => b.id === id)!.text;
const idOf = (text: string) => blocks.find((b) => b.text === text)?.id;

const TERM = JSON.stringify({
  relevant: true,
  finding: {
    type: 'payment_condition',
    title: 'Final payment depends on acceptance',
    explanation: 'You are paid the rest only after the Client accepts everything.',
    review_status: 'needs_clarification',
    questions: ['Is there a review deadline?'],
  },
});

/** Fake language model: p3_b12 is a term, everything else is not. Records each call's kind and block. */
function fakeModel(terms: Record<string, string> = { p3_b12: TERM }) {
  const calls: { kind?: string; blockId?: string }[] = [];
  const run = async (req: CompletionRequest) => {
    const blockId = idOf(blockTextOf(req) ?? '');
    calls.push({ kind: req.kind, blockId });
    return replyFor(req, (blockId && terms[blockId]) ?? '{"relevant": false}');
  };
  return { run, calls };
}

/** Classifier answers by block id; unknown blocks → confident "none". */
const byBlock = (answers: Record<string, FakeAnswer>) => (text: string) => answers[idOf(text) ?? ''];

async function analyze(opts: LocalLlmOptions, model = fakeModel()) {
  const stats: LlmRunStats[] = [];
  const engine: InferenceEngine = { ...demoEngine, info: { ...demoEngine.info, kind: 'local' }, llm: createLocalLlmEngine(model.run, { ...opts, onStats: (s) => stats.push(s) }) };
  const analysis = await runAnalysis({ engine, pages, ocrRevision: 0, documentType: 'service_agreement', language: 'en' });
  return { analysis, calls: model.calls, stats: stats[0]! };
}

describe('extraction with the clause classifier (pass 1)', () => {
  it('uses confident labels instead of language-model type calls, and explains only the terms', async () => {
    const classifier = fakeClassifier(byBlock({ p3_b12: { label: 'payment_condition', confidence: 0.97 } }));
    const { analysis, calls, stats } = await analyze({ classifier, classifierThreshold: 0.9 });
    expect(calls.filter((c) => c.kind === 'triage')).toHaveLength(0);
    expect(calls.filter((c) => c.kind === 'explain').map((c) => c.blockId)).toEqual(['p3_b12']);
    // Same evidence gate as before: the finding cites its own block.
    expect(analysis.findings.map((f) => f.evidence?.blockId)).toEqual(['p3_b12']);
    expect(classifier.calls).toHaveLength(units.length);
    // The previous block goes along as context, like the language model's prompt.
    const asked = classifier.calls.find((c) => c.text === textOf('p3_b12'))!;
    expect(asked.ctx).toMatchObject({ documentType: 'service_agreement', language: 'en' });
    expect(stats.classifier).toMatchObject({ asked: units.length, used: units.length, none: units.length - 1, belowThreshold: 0, errors: 0 });
    expect(stats.calls).toMatchObject({ triage: 0, explain: 1 });
  });

  it('"none" means no explain call for that block', async () => {
    const classifier = fakeClassifier(() => ({ label: 'none', confidence: 0.99 }));
    const { analysis, calls } = await analyze({ classifier });
    expect(calls).toHaveLength(0);
    expect(analysis.findings).toHaveLength(0);
    expect(analysis.coverage.incomplete).toBe(false);
  });

  it('asks the language model when the classifier is not confident', async () => {
    const classifier = fakeClassifier(byBlock({ p3_b12: { label: 'payment_condition', confidence: 0.6 } }));
    const { analysis, calls, stats } = await analyze({ classifier, classifierThreshold: 0.9 });
    expect(calls.filter((c) => c.kind === 'triage').map((c) => c.blockId)).toEqual(['p3_b12']);
    expect(calls.filter((c) => c.kind === 'explain').map((c) => c.blockId)).toEqual(['p3_b12']);
    expect(analysis.findings).toHaveLength(1);
    expect(stats.classifier).toMatchObject({ belowThreshold: 1, used: units.length - 1 });
  });

  it('falls back to the language model for every block when the classifier is missing or unverified', async () => {
    const classifier = fakeClassifier(() => ({ label: 'none', confidence: 1 }), { ready: false });
    const { analysis, calls, stats } = await analyze({ classifier });
    expect(classifier.calls).toHaveLength(0);
    expect(calls.filter((c) => c.kind === 'triage')).toHaveLength(units.length);
    expect(analysis.findings.map((f) => f.evidence?.blockId)).toEqual(['p3_b12']);
    expect(stats.classifier.asked).toBe(0);
  });

  it('falls back when the classifier throws, and stops asking it after repeated errors', async () => {
    const classifier = fakeClassifier(() => new Error('session crashed'));
    const { analysis, calls, stats } = await analyze({ classifier });
    expect(classifier.calls).toHaveLength(3);
    expect(stats.classifier).toMatchObject({ asked: 3, errors: 3, used: 0 });
    expect(calls.filter((c) => c.kind === 'triage')).toHaveLength(units.length);
    expect(analysis.findings.map((f) => f.evidence?.blockId)).toEqual(['p3_b12']);
  });

  it('is not used when the setting is off', async () => {
    const classifier = fakeClassifier(() => ({ label: 'none', confidence: 1 }));
    const { calls } = await analyze({ classifier, classifierEnabled: () => false });
    expect(classifier.calls).toHaveLength(0);
    expect(calls.filter((c) => c.kind === 'triage')).toHaveLength(units.length);
  });

  it('relabels a type the block contradicts, like the language model path (typeCheck)', async () => {
    // A late-fee label on a block about acceptance and the final payment is not believed.
    const classifier = fakeClassifier(byBlock({ p3_b12: { label: 'late_fee', confidence: 0.99 } }));
    const { analysis } = await analyze({ classifier });
    expect(analysis.findings[0]?.type).not.toBe('late_fee');
  });

  it('reports classifier counts and times, never text', async () => {
    const classifier = fakeClassifier(byBlock({ p3_b12: { label: 'payment_condition', confidence: 0.97 } }));
    const { stats } = await analyze({ classifier });
    const line = formatStats(stats);
    expect(line).toContain(`sorter asked ${units.length}`);
    for (const b of blocks) expect(line).not.toContain(b.text.slice(0, 12));
    expect(JSON.stringify(stats)).not.toMatch(/[A-Za-z]{3,} [A-Za-z]{3,} [A-Za-z]{3,}/);
  });
});

// ---- runtime-independent classifier core ----

const spec: LayaInferenceSpec = { ...LAYA_SPEC, labels: ['none', 'payment_condition', 'late_fee'], maxTokens: 16 };

describe('Laya classifier core', () => {
  it('turns logits into a label with probabilities that sum to 1', () => {
    const p = softmax([1, 2, 3]);
    expect(p.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 10);
    const r = decodeLogits(Float32Array.from([0.1, 4, -2]), spec.labels);
    expect(r.label).toBe('payment_condition');
    expect(r.confidence).toBeGreaterThan(0.9);
    expect(Object.keys(r.probs)).toEqual(['none', 'payment_condition', 'late_fee']);
    expect(() => decodeLogits([1, 2], spec.labels)).toThrow(/expected 3/);
    expect(() => decodeLogits([1, NaN, 2], spec.labels)).toThrow(/non-finite/);
  });

  it('knows every label the app uses', () => {
    expect(LAYA_SPEC.labels).toEqual(TRIAGE_LABELS);
    expect(() => createLayaClassifier({ name: 'x', spec: { ...spec, labels: ['nonsense' as never] }, load: async () => ({}) as LoadedClassifier })).toThrow();
  });

  it('keeps only the end of a long context, and none when the spec says so', () => {
    const long = `${'x'.repeat(400)}END`;
    expect(contextSegment(LAYA_SPEC, { context: long })!.endsWith('END')).toBe(true);
    expect(contextSegment(LAYA_SPEC, { context: long })!.length).toBe(LAYA_SPEC.contextChars);
    expect(contextSegment({ ...LAYA_SPEC, context: 'none' }, { context: 'abc' })).toBeNull();
    expect(contextSegment(LAYA_SPEC, { context: '  ' })).toBeNull();
  });

  const loaded = (logits: number[]) => {
    const runs: number[][] = [];
    let released = 0;
    const value: LoadedClassifier = {
      tokenizer: { encode: (text) => ({ ids: [text.length], mask: [1], typeIds: [0] }) },
      session: {
        run: async (input) => {
          runs.push(input.ids);
          return Float32Array.from(logits);
        },
        release: async () => {
          released++;
        },
      },
    };
    return { value, runs, released: () => released };
  };

  it('loads lazily and once, and releases on request', async () => {
    let loads = 0;
    const l = loaded([0, 5, 0]);
    const c = createLayaClassifier({ name: 'test', spec, load: async () => (loads++, l.value) });
    expect(loads).toBe(0);
    const [a, b] = await Promise.all([c.classify('one'), c.classify('two')]);
    expect(loads).toBe(1);
    expect([a.label, b.label]).toEqual(['payment_condition', 'payment_condition']);
    await c.release();
    expect(l.released()).toBe(1);
    await c.classify('three');
    expect(loads).toBe(2);
  });

  it('remembers a failed load (one check per session, not per block) until released', async () => {
    let loads = 0;
    const c = createLayaClassifier({
      name: 'test',
      spec,
      load: async () => {
        loads++;
        throw new ClassifierLoadError('checksum_mismatch', 'damaged');
      },
    });
    expect(await c.ready()).toBe(false);
    expect(await c.ready()).toBe(false);
    await expect(c.classify('x')).rejects.toThrow('damaged');
    expect(loads).toBe(1);
    expect(c.loadError()?.problem).toBe('checksum_mismatch');
    await c.release();
    expect(c.loadError()).toBeUndefined();
    expect(await c.ready()).toBe(false);
    expect(loads).toBe(2);
  });

  it('readiness check: passes only after a well-formed test classification', async () => {
    const ok = createLayaClassifier({ name: 't', spec, load: async () => loaded([0, 3, 0]).value });
    expect(await checkClassifier(ok, spec)).toMatchObject({ ok: true, label: 'payment_condition' });
    const wrongLabel = createLayaClassifier({ name: 't', spec, load: async () => loaded([3, 0, 0]).value });
    expect(await checkClassifier(wrongLabel, { ...spec, smoke: { text: 'x', expect: 'payment_condition' } })).toMatchObject({ ok: false, problem: 'smoke_failed' });
    const badShape = createLayaClassifier({ name: 't', spec, load: async () => loaded([1, 2]).value });
    expect(await checkClassifier(badShape, spec)).toMatchObject({ ok: false, problem: 'smoke_failed' });
    const missing = createLayaClassifier({
      name: 't',
      spec,
      load: async () => {
        throw new ClassifierLoadError('missing', 'not installed');
      },
    });
    expect(await checkClassifier(missing, spec)).toMatchObject({ ok: false, problem: 'missing' });
  });
});

describe('ONNX Runtime session adapter', () => {
  class FakeTensor {
    constructor(
      readonly type: string,
      readonly data: BigInt64Array | Int32Array,
      readonly dims: readonly number[],
    ) {}
  }
  const session = (inputNames: string[], outputs: Record<string, { data: unknown }>) => {
    const feeds: Record<string, unknown>[] = [];
    const s: OrtLikeSession = {
      inputNames,
      outputNames: Object.keys(outputs),
      run: async (f) => (feeds.push(f), outputs),
      release: async () => undefined,
    };
    return { s, feeds };
  };

  it('feeds int64 ids and mask of shape [1, n] and reads the logits', async () => {
    const { s, feeds } = session(['input_ids', 'attention_mask'], { logits: { data: Float32Array.from([1, 2, 3]) } });
    const run = wrapOrtSession(s, FakeTensor, spec);
    const out = await run.run({ ids: [2, 7, 3], mask: [1, 1, 1], typeIds: [0, 0, 0] });
    expect(Array.from(out)).toEqual([1, 2, 3]);
    const ids = feeds[0]!.input_ids as FakeTensor;
    expect(ids.type).toBe('int64');
    expect(ids.dims).toEqual([1, 3]);
    expect(Array.from(ids.data as BigInt64Array)).toEqual([2n, 7n, 3n]);
    expect(feeds[0]!.token_type_ids).toBeUndefined();
  });

  it('adds token type ids only when the spec names them and the model takes them; int32 when asked', async () => {
    const { s, feeds } = session(['input_ids', 'attention_mask', 'token_type_ids'], { logits: { data: Float32Array.from([0]) } });
    await wrapOrtSession(s, FakeTensor, { ...spec, inputs: { ...spec.inputs, typeIds: 'token_type_ids', dtype: 'int32' } }).run({ ids: [1], mask: [1], typeIds: [0] });
    expect((feeds[0]!.token_type_ids as FakeTensor).type).toBe('int32');
  });

  it('refuses a model whose inputs or outputs differ from the spec', () => {
    expect(() => wrapOrtSession(session(['ids'], { logits: { data: null } }).s, FakeTensor, spec)).toThrow(/input "input_ids"/);
    expect(() => wrapOrtSession(session(['input_ids', 'attention_mask'], { scores: { data: null } }).s, FakeTensor, spec)).toThrow(/output "logits"/);
  });
});

describe('tokenizer (@huggingface/tokenizers + truncation)', () => {
  const enc = createHfEncoder(wordpiece, {});

  it('gives the WordPiece ids for this vocabulary (hand-derived; the real golden ids come with the spec)', () => {
    // [CLS] the client shall pay php 18 , 000 . [SEP]
    expect(enc.encode('The Client shall pay PHP 18,000.', null, 64)).toEqual({
      ids: [2, 4, 5, 6, 7, 8, 9, 10, 11, 15, 3],
      mask: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
      typeIds: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    });
    expect(enc.encode('payment', null, 64).ids).toEqual([2, 7, 16, 3]);
    expect(enc.encode('unknownword', null, 64).ids).toEqual([2, 1, 3]);
  });

  it('encodes the context as the second segment with its own type id', () => {
    expect(enc.encode('pay within seven days', 'the invoice', 64)).toMatchObject({
      ids: [2, 7, 12, 13, 14, 3, 4, 17, 3],
      typeIds: [0, 0, 0, 0, 0, 0, 1, 1, 1],
    });
  });

  it('truncates the context first (keeping its end), then the block (keeping its start)', () => {
    // 4 block tokens + 3 specials = 7; budget 9 leaves 2 context tokens: the last two.
    expect(enc.encode('pay within seven days', 'the client shall pay the invoice', 9).ids).toEqual([2, 7, 12, 13, 14, 3, 4, 17, 3]);
    // No room for context: it is dropped, and the block is cut to fit.
    expect(enc.encode('pay within seven days', 'the invoice', 5).ids).toEqual([2, 7, 12, 13, 3]);
  });

  it.todo('matches the golden ids and logits from ml/laya/INFERENCE_SPEC.md (when the spec and tokenizer land)');
});

describe('web threads', () => {
  it('uses up to 4 wasm threads when cross-origin isolated, else 1', () => {
    expect(webClassifierThreads(true, 8)).toBe(4);
    expect(webClassifierThreads(true, 2)).toBe(1);
    expect(webClassifierThreads(true, 4)).toBe(3);
    expect(webClassifierThreads(false, 16)).toBe(1);
  });
});

describe('classifier readiness row and pinning', () => {
  it('is optional: passes only when verified and tested, otherwise explains the fallback', () => {
    expect(classifierReadinessCheck({ ok: true, label: 'none', ms: 42 }, 'phone')).toMatchObject({ id: 'classifier', status: 'pass' });
    for (const problem of ['not_configured', 'disabled', 'missing'] as const) {
      const row = classifierReadinessCheck({ ok: false, problem }, 'browser');
      expect(row.status).toBe('warn');
      expect(row.detail).toMatch(/language model sorts the clauses/);
    }
    for (const problem of ['size_mismatch', 'checksum_mismatch', 'load_failed', 'smoke_failed'] as const) {
      expect(classifierReadinessCheck({ ok: false, problem }, 'phone').status).toBe('fail');
    }
  });

  it('downloads nothing until the lead pins real sizes and checksums', () => {
    // TODO(lead): flip this when laya-files.json is filled in for the laya-v1 release.
    expect(isClassifierPinned()).toBe(false);
    for (const f of classifierFiles(LAYA_CLASSIFIER)) {
      expect(f.sourceUrl).toBe(`https://github.com/chrisraro/SkimCare/releases/download/laya-v1/${f.fileName}`);
    }
    expect(isClassifierPinned({ ...LAYA_CLASSIFIER, tokenizerConfig: undefined, model: { ...LAYA_CLASSIFIER.model, sizeBytes: 1, sha256: 'a'.repeat(64), md5: 'b'.repeat(32) }, tokenizer: { ...LAYA_CLASSIFIER.tokenizer, sizeBytes: 1, sha256: 'c'.repeat(64), md5: 'd'.repeat(32) } })).toBe(true);
  });
});
