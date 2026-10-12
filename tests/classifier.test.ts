import { beforeAll, describe, expect, it } from '@jest/globals';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createLayaTokenizer } from '@/ai/classifier/hfTokenizer';
import { buildLayaInput, checkClassifier, ClassifierLoadError, createLayaClassifier, decodeLogits, layaContext, layaState, normalizeLayaText, softmax, type LoadedClassifier } from '@/ai/classifier/laya';
import { LAYA_SMOKE, LAYA_SPEC, specFromRelease, type LayaInferenceSpec } from '@/ai/classifier/layaSpec';
import { webClassifierThreads } from '@/ai/classifier/onnxNative.web';
import { wrapOrtSession, type OrtLikeSession } from '@/ai/classifier/ortSession';
import { classifierReadinessCheck } from '@/ai/classifier/readiness';
import { serviceAgreement } from '@/ai/demo/fixtures';
import { demoEngine } from '@/ai/demoEngine';
import type { InferenceEngine } from '@/ai/engines';
import { extractionUnits } from '@/ai/llm/chunking';
import { createLocalLlmEngine, type CompletionRequest, type LocalLlmOptions } from '@/ai/llm/localLlmEngine';
import { classifierFiles, isClassifierPinned, LAYA_CLASSIFIER, layaWebPath } from '@/ai/llm/models';
import { formatStats, type LlmRunStats } from '@/ai/llm/stats';
import { TRIAGE_LABELS } from '@/ai/llm/triageClassifier';
import { runAnalysis } from '@/ai/pipeline';
import golden from '../ml/laya/golden/laya-v1.golden.json';
import releaseManifest from '../ml/laya/release/release_manifest.json';
import releaseSpec from '../ml/laya/release/laya-v1.spec.json';
import { fakeClassifier, type FakeAnswer } from './helpers/fakeClassifier';
import { blockTextOf, replyFor } from './helpers/twoPass';

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

const spec: LayaInferenceSpec = { ...LAYA_SPEC, labels: ['none', 'payment_condition', 'late_fee'], temperature: 1, smoke: { text: 'x' } };

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
    expect([...LAYA_SPEC.labels].sort()).toEqual([...TRIAGE_LABELS].sort());
    expect(() => createLayaClassifier({ name: 'x', spec: { ...spec, labels: ['nonsense' as never] }, load: async () => ({}) as LoadedClassifier })).toThrow();
  });

  it('divides the logits by the temperature before the softmax (calibrated confidence)', () => {
    const c = golden.cases[0]!;
    const r = decodeLogits(c.logits, LAYA_SPEC.labels, LAYA_SPEC.temperature);
    expect(r.label).toBe(c.label);
    expect(r.confidence).toBeCloseTo(c.confidence, 4);
    LAYA_SPEC.labels.forEach((l, i) => expect(r.probs[l]).toBeCloseTo(c.probabilities[i]!, 4));
    // argmax does not depend on the temperature; the confidence does.
    expect(decodeLogits(c.logits, LAYA_SPEC.labels).confidence).toBeGreaterThan(r.confidence);
  });

  it('builds the state like the trainer: normalized block, then " || earlier text: " + context', () => {
    const nbsp = String.fromCharCode(0xa0);
    const ideographic = String.fromCharCode(0x3000);
    expect(normalizeLayaText(`  a\t\n b${nbsp}c<mask>d${ideographic} `)).toBe('a b c d');
    expect(layaState(LAYA_SPEC, ' The fee ', null)).toBe('The fee');
    expect(layaState(LAYA_SPEC, 'The balance', ' \n ')).toBe('The balance');
    expect(layaState(LAYA_SPEC, 'The balance', '…pay PHP 10,000')).toBe('The balance || earlier text: …pay PHP 10,000');
    expect(layaState({ ...LAYA_SPEC, useContext: false }, 'The balance', 'x')).toBe('The balance');
    for (const c of golden.cases) expect(layaState(LAYA_SPEC, c.text, c.context)).toBe(c.state);
  });

  it('gives the classifier the same context as the prompt (end of the previous block, only when the block refers back)', () => {
    const previous = `${'word '.repeat(60)}the down payment is PHP 10,000.`;
    const ctx = layaContext('The balance is due in 7 days.', { context: previous })!;
    expect(ctx.startsWith('…')).toBe(true);
    expect(ctx.endsWith('PHP 10,000.')).toBe(true);
    expect(ctx.length).toBeLessThanOrEqual(201);
    expect(layaContext('The Client pays PHP 5,000 on signing.', { context: previous })).toBeUndefined();
    expect(layaContext('The balance is due.', {})).toBeUndefined();
  });

  it('puts the head first, keeps the START of the state (at most room tokens), and ends with sep', () => {
    const tok = { encode: (t: string) => Array.from(t, (_, i) => 100 + i) };
    const short = buildLayaInput(LAYA_SPEC, tok, 'abc');
    expect(short.ids).toEqual([...LAYA_SPEC.headIds, 100, 101, 102, LAYA_SPEC.sepId]);
    expect(short.mask).toEqual(short.ids.map(() => 1));
    const long = buildLayaInput(LAYA_SPEC, tok, 'x'.repeat(500));
    expect(long.ids).toHaveLength(LAYA_SPEC.maxLen);
    expect(long.ids[LAYA_SPEC.headIds.length]).toBe(100);
    expect(long.ids.at(-2)).toBe(100 + LAYA_SPEC.room - 1);
    expect(long.ids.at(-1)).toBe(LAYA_SPEC.sepId);
  });

  const loaded = (logits: number[]) => {
    const runs: number[][] = [];
    let released = 0;
    const value: LoadedClassifier = {
      tokenizer: { encode: (text) => [text.length] },
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

  it('readiness check: passes only after a well-formed test classification with the expected label', async () => {
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
    // The real smoke test is golden case 1 (payment_amount, 0.9936).
    expect(LAYA_SPEC.smoke).toEqual({ text: golden.cases[0]!.text, expect: golden.cases[0]!.label });
  });
});

describe('ONNX Runtime session adapter', () => {
  class FakeTensor {
    constructor(
      readonly type: string,
      readonly data: BigInt64Array,
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

  it('feeds int64 input_ids and attention_mask of shape [1, n] (nothing else) and reads the logits', async () => {
    const { s, feeds } = session(['input_ids', 'attention_mask'], { logits: { data: Float32Array.from([1, 2, 3]) } });
    const run = wrapOrtSession(s, FakeTensor, spec);
    const out = await run.run({ ids: [2, 7, 1], mask: [1, 1, 1] });
    expect(Array.from(out)).toEqual([1, 2, 3]);
    const ids = feeds[0]!.input_ids as FakeTensor;
    expect(ids.type).toBe('int64');
    expect(ids.dims).toEqual([1, 3]);
    expect(Array.from(ids.data)).toEqual([2n, 7n, 1n]);
    expect(Object.keys(feeds[0]!)).toEqual(['input_ids', 'attention_mask']);
  });

  it('refuses a model whose inputs or outputs differ from the spec', () => {
    expect(() => wrapOrtSession(session(['ids'], { logits: { data: null } }).s, FakeTensor, spec)).toThrow(/input "input_ids"/);
    expect(() => wrapOrtSession(session(['input_ids', 'attention_mask', 'token_type_ids'], { logits: { data: null } }).s, FakeTensor, spec)).toThrow(/token_type_ids/);
    expect(() => wrapOrtSession(session(['input_ids', 'attention_mask'], { scores: { data: null } }).s, FakeTensor, spec)).toThrow(/output "logits"/);
  });
});

// ---- laya-v1 against its golden vectors (ml/laya/golden/laya-v1.golden.json) ----

const root = join(__dirname, '..');
// Tokenizer: Laya (Apache-2.0, Convai Innovations), pruned from mmBERT (MIT); see tests/fixtures/laya/NOTICE.
const tokenizerJson = JSON.parse(readFileSync(join(__dirname, 'fixtures/laya/laya-v1.tokenizer.json'), 'utf8')) as object;
const tokenizerConfig = JSON.parse(readFileSync(join(root, 'ml/laya/release/laya-v1.tokenizer_config.json'), 'utf8')) as object;

describe('laya-v1 spec and golden token ids', () => {
  it('uses the release spec.json exactly', () => {
    expect(LAYA_SPEC).toMatchObject({
      version: releaseSpec.release,
      labels: releaseSpec.labels,
      noneLabel: releaseSpec.none_label,
      headIds: releaseSpec.head_ids,
      sepId: releaseSpec.sep_id,
      maxLen: releaseSpec.max_len,
      room: releaseSpec.room,
      useContext: releaseSpec.use_context,
      contextSep: releaseSpec.context_sep,
      temperature: releaseSpec.temperature,
      threshold: releaseSpec.threshold,
      inputs: { ids: 'input_ids', mask: 'attention_mask' },
      output: 'logits',
    });
    expect(LAYA_SPEC.headIds).toHaveLength(44);
    expect(LAYA_SPEC.labels.at(-1)).toBe('none');
    // The golden file was made with the same values.
    expect(golden.labels).toEqual(releaseSpec.labels);
    expect(golden.head_ids).toEqual(releaseSpec.head_ids);
    expect([golden.temperature, golden.threshold]).toEqual([releaseSpec.temperature, releaseSpec.threshold]);
  });

  it('refuses a spec the runtime cannot follow', () => {
    expect(() => specFromRelease({ ...releaseSpec, labels: [...releaseSpec.labels.slice(0, -1), 'fee'] }, LAYA_SMOKE)).toThrow(/unknown label/);
    expect(() => specFromRelease({ ...releaseSpec, room: 300 }, LAYA_SMOKE)).toThrow(/max_len/);
    expect(() => specFromRelease({ ...releaseSpec, onnx: { ...releaseSpec.onnx, inputs: { ...releaseSpec.onnx.inputs, token_type_ids: 'int64 [batch, seq]' } } }, LAYA_SMOKE)).toThrow(/inputs/);
  });

  const tokenizer = createLayaTokenizer(tokenizerJson, tokenizerConfig);

  it.each(golden.cases.map((c) => [c.note, c] as const))('token ids match the Python tokenizer: %s', (_note, c) => {
    expect(tokenizer.encode(c.state)).toEqual(c.state_ids);
    expect(buildLayaInput(LAYA_SPEC, tokenizer, c.text, c.context).ids).toEqual(c.input_ids);
  });

  it('never needs <unk>: unseen characters become byte-fallback tokens (golden case 5)', () => {
    const ids = tokenizer.encode(golden.cases[4]!.text);
    expect(ids.length).toBeGreaterThan(0);
    expect(ids).not.toContain(3);
  });
});

/**
 * Full parity: the app's own input building (tokenizer → buildLayaInput) and decoding
 * (decodeLogits with the temperature and threshold) around the real q4g model, run by
 * onnxruntime-web on WASM (the browser runtime) with the same feeds as ortSession.ts.
 * ONNX Runtime runs in a child Node process (tests/helpers/ortWebLogits.mjs): its WASM glue
 * needs a dynamic import that Jest's VM does not allow.
 * Runs only where the release file is present locally (it is not in git):
 *   LAYA_RELEASE_DIR=<dir with laya-v1.q4g.onnx>, else ml/laya/exports/release-laya-v1/.
 */
const releaseDir = process.env.LAYA_RELEASE_DIR ?? join(root, 'ml/laya/exports/release-laya-v1');
const modelPath = join(releaseDir, releaseSpec.model_file);
const haveModel = existsSync(modelPath) && statSync(modelPath).size === LAYA_CLASSIFIER.model.sizeBytes;
if (!haveModel) {
  console.info(`[classifier.test] SKIPPING laya-v1 logits parity: ${modelPath} not found or wrong size (set LAYA_RELEASE_DIR to a folder with the release files).`);
}

(haveModel ? describe : describe.skip)('laya-v1 golden logits through ONNX Runtime Web (local model file)', () => {
  const tokenizer = createLayaTokenizer(tokenizerJson, tokenizerConfig);
  const inputs = golden.cases.map((c) => buildLayaInput(LAYA_SPEC, tokenizer, c.text, c.context).ids);
  let out: { inputNames: string[]; outputNames: string[]; logits: number[][]; ms: number[] };

  beforeAll(() => {
    const stdout = execFileSync(process.execPath, [join(__dirname, 'helpers/ortWebLogits.mjs'), modelPath, '1'], { input: JSON.stringify(inputs), maxBuffer: 1 << 24 });
    out = JSON.parse(stdout.toString('utf8')) as typeof out;
  }, 180_000);

  it('has exactly the inputs and output the spec names', () => {
    expect(out.inputNames).toEqual([LAYA_SPEC.inputs.ids, LAYA_SPEC.inputs.mask]);
    expect(out.outputNames).toEqual([LAYA_SPEC.output]);
  });

  it.each(golden.cases.map((c, i) => [c.note, c, i] as const))('logits within 1e-3 and the same label: %s', (_note, c, i) => {
    const logits = out.logits[i]!;
    const maxDiff = Math.max(...logits.map((v, k) => Math.abs(v - c.logits[k]!)));
    expect(maxDiff).toBeLessThan(1e-3);
    const r = decodeLogits(logits, LAYA_SPEC.labels, LAYA_SPEC.temperature);
    expect(r.label).toBe(c.label);
    expect(r.confidence).toBeCloseTo(c.confidence, 3);
    expect(r.confidence >= LAYA_SPEC.threshold).toBe(c.accepted);
    console.info(`[classifier.test] golden "${c.note}": max|dlogit| ${maxDiff.toExponential(2)}, ${r.label} ${r.confidence.toFixed(4)}, ${out.ms[i]!.toFixed(0)} ms (1 thread)`);
  });
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

  it('pins the laya-v1 release files (names, sizes, SHA-256, MD5 from release_manifest.json)', () => {
    expect(isClassifierPinned()).toBe(true);
    const pinned = { model: LAYA_CLASSIFIER.model, tokenizer: LAYA_CLASSIFIER.tokenizer, tokenizerConfig: LAYA_CLASSIFIER.tokenizerConfig! };
    for (const [key, f] of Object.entries(pinned)) {
      expect({ fileName: f.fileName, sizeBytes: f.sizeBytes, sha256: f.sha256, md5: f.md5 }).toEqual(releaseManifest[key as keyof typeof pinned]);
      expect(f.sourceUrl).toBe(`https://github.com/chrisraro/SkimCare/releases/download/laya-v1/${f.fileName}`);
    }
    expect(LAYA_CLASSIFIER.model.fileName).toBe(releaseSpec.model_file);
    expect(classifierFiles(LAYA_CLASSIFIER)).toHaveLength(3);
    expect(isClassifierPinned({ ...LAYA_CLASSIFIER, model: { ...LAYA_CLASSIFIER.model, sizeBytes: 0 } })).toBe(false);
  });

  it('serves the web files from this site unless EXPO_PUBLIC_LAYA_URL moves them', () => {
    expect(LAYA_CLASSIFIER.webPath).toBe('/vendor/laya');
    expect(layaWebPath(undefined)).toBe('/vendor/laya');
    expect(layaWebPath('  ')).toBe('/vendor/laya');
    expect(layaWebPath('https://models.example.org/laya-v1/')).toBe('https://models.example.org/laya-v1');
  });
});
