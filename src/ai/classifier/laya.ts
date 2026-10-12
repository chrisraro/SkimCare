/**
 * The Laya clause classifier, independent of the runtime: build the input exactly as
 * ml/laya/INFERENCE_SPEC.md says → one ONNX run → softmax(logits / temperature) → label.
 * The phone (onnxNative.ts, onnxruntime-react-native) and the browser (onnxNative.web.ts,
 * onnxruntime-web) only provide `load()`: verified files → a session and a tokenizer.
 *
 * - Lazy: nothing loads until the first `ready()`/`classify()`; one session at a time,
 *   one run at a time (`serial`), freed by `release()` (low memory).
 * - A failed load is remembered until `release()`, so a missing or damaged file costs one
 *   check per session, not one per block.
 * - Never logs text, tokens or probabilities.
 */
import { AbortedError } from '../engines';
import { blockContext } from '../llm/prompt';
import { isTriageLabel, type ClassifierContext, type TriageClassification, type TriageClassifier, type TriageLabel } from '../llm/triageClassifier';
import type { LayaInferenceSpec } from './layaSpec';

/** One model input: `input_ids` and `attention_mask` (all ones), same length. */
export interface EncodedInput {
  ids: number[];
  mask: number[];
}

export interface LayaTokenizer {
  /** Token ids of `text` WITHOUT special tokens (the tokenizer adds the leading "▁" itself). */
  encode(text: string): number[];
}

export interface ClassifierSession {
  /** One forward pass for one input; returns the logits for that input. */
  run(input: EncodedInput): Promise<ArrayLike<number>>;
  release(): Promise<void>;
}

export interface LoadedClassifier {
  session: ClassifierSession;
  tokenizer: LayaTokenizer;
}

/** Why the classifier cannot be used. Shown on the readiness screen (no file content). */
export type ClassifierProblem = 'not_configured' | 'disabled' | 'missing' | 'size_mismatch' | 'checksum_mismatch' | 'load_failed' | 'smoke_failed';

export class ClassifierLoadError extends Error {
  constructor(
    readonly problem: ClassifierProblem,
    message: string,
  ) {
    super(message);
    this.name = 'ClassifierLoadError';
  }
}

// ---- INFERENCE_SPEC.md "Algorithm", steps 1-4 ----

/** Python str.split() whitespace (what the trainer's normalize_block collapses). */
const WS_CODES = [0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x20, 0x85, 0xa0, 0x1680, 0x2000, 0x2001, 0x2002, 0x2003, 0x2004, 0x2005, 0x2006, 0x2007, 0x2008, 0x2009, 0x200a, 0x2028, 0x2029, 0x202f, 0x205f, 0x3000, 0xfeff];
const WS = new RegExp(`[${String.fromCharCode(...WS_CODES)}]+`, 'g');

/** Step 1: drop "<mask>" (the head's option marker), collapse whitespace, trim spaces. */
export function normalizeLayaText(s: string): string {
  return s.split('<mask>').join(' ').replace(WS, ' ').replace(/^ +| +$/g, '');
}

/** Step 2: the block, then (when given and non-empty) the separator and the context. */
export function layaState(spec: LayaInferenceSpec, text: string, context?: string | null): string {
  let state = normalizeLayaText(text);
  const c = spec.useContext && context ? normalizeLayaText(context) : '';
  if (c) state += spec.contextSep + c;
  return state;
}

/** Steps 3-4: head ids + state ids (no special tokens, start kept, ≤ room) + sep id; mask all ones. */
export function buildLayaInput(spec: LayaInferenceSpec, tokenizer: LayaTokenizer, text: string, context?: string | null): EncodedInput {
  const state = tokenizer.encode(layaState(spec, text, context)).slice(0, spec.room);
  const ids = [...spec.headIds, ...state, spec.sepId];
  return { ids, mask: ids.map(() => 1) };
}

/** The context the app gives a block (prompt.ts `blockContext`: previous block's ≤200-char end, only when the block refers back). */
export const layaContext = (text: string, ctx?: ClassifierContext): string | undefined => blockContext(text, ctx?.context);

// ---- steps 5-7 ----

/** Softmax of logits / temperature (max subtracted first). */
export function softmax(logits: ArrayLike<number>, temperature = 1): number[] {
  const z = Array.from(logits, (v) => v / temperature);
  const max = Math.max(...z);
  const exps = z.map((v) => Math.exp(v - max));
  const sum = exps.reduce((a, b) => a + b, 0);
  return exps.map((e) => e / sum);
}

/** Logits → label and calibrated confidence. Throws on output that does not match the spec (wrong size, NaN). */
export function decodeLogits(logits: ArrayLike<number>, labels: readonly TriageLabel[], temperature = 1): TriageClassification {
  if (logits.length !== labels.length) throw new Error(`classifier returned ${logits.length} scores, expected ${labels.length}`);
  for (let i = 0; i < logits.length; i++) if (!Number.isFinite(logits[i])) throw new Error('classifier returned a non-finite score');
  const p = softmax(logits, temperature);
  let best = 0;
  for (let i = 1; i < p.length; i++) if (p[i]! > p[best]!) best = i;
  const probs: Partial<Record<TriageLabel, number>> = {};
  labels.forEach((l, i) => (probs[l] = p[i]!));
  return { label: labels[best]!, confidence: p[best]!, probs };
}

export interface LayaClassifier extends TriageClassifier {
  /** Why the last load failed, if it did (cleared by `release()`). */
  loadError(): ClassifierLoadError | undefined;
}

export interface LayaClassifierOptions {
  name: string;
  spec: LayaInferenceSpec;
  /** Verifies the files and creates the session + tokenizer. Throws `ClassifierLoadError`. */
  load: () => Promise<LoadedClassifier>;
}

export function createLayaClassifier({ name, spec, load }: LayaClassifierOptions): LayaClassifier {
  if (!spec.labels.every(isTriageLabel)) throw new Error('classifier spec has a label the app does not know');
  let loading: Promise<LoadedClassifier> | null = null;
  let failure: ClassifierLoadError | undefined;

  let queue: Promise<unknown> = Promise.resolve();
  function serial<T>(task: () => Promise<T>): Promise<T> {
    const run = queue.then(task, task);
    queue = run.catch(() => undefined);
    return run;
  }

  function loaded(): Promise<LoadedClassifier> {
    if (failure) return Promise.reject(failure);
    loading ??= load().catch((e: unknown) => {
      failure = e instanceof ClassifierLoadError ? e : new ClassifierLoadError('load_failed', e instanceof Error ? e.message : 'unknown error');
      loading = null;
      throw failure;
    });
    return loading;
  }

  return {
    name,
    loadError: () => failure,
    async ready() {
      try {
        await serial(loaded);
        return true;
      } catch {
        return false;
      }
    },
    classify(text, ctx, signal) {
      return serial(async () => {
        if (signal?.aborted) throw new AbortedError();
        const { session, tokenizer } = await loaded();
        const input = buildLayaInput(spec, tokenizer, text, layaContext(text, ctx));
        const logits = await session.run(input);
        if (signal?.aborted) throw new AbortedError();
        return decodeLogits(logits, spec.labels, spec.temperature);
      });
    },
    release() {
      return serial(async () => {
        const current = loading;
        loading = null;
        failure = undefined;
        const l = await current?.catch(() => null);
        await l?.session.release().catch(() => undefined);
      });
    },
  };
}

export type ClassifierCheck = { ok: true; label: TriageLabel; ms: number } | { ok: false; problem: ClassifierProblem; error?: string };

/**
 * Readiness: files present + checksums (inside `ready()`), then one classification of a
 * fixed sentence (no user data, golden case 1) whose output must be well-formed and give
 * the expected label.
 */
export async function checkClassifier(classifier: LayaClassifier, spec: LayaInferenceSpec): Promise<ClassifierCheck> {
  if (!(await classifier.ready())) {
    const e = classifier.loadError();
    return { ok: false, problem: e?.problem ?? 'load_failed', error: e?.message };
  }
  const started = Date.now();
  try {
    const r = await classifier.classify(spec.smoke.text);
    const sum = Object.values(r.probs).reduce((a, b) => a + (b ?? 0), 0);
    if (Math.abs(sum - 1) > 1e-3) return { ok: false, problem: 'smoke_failed', error: 'scores do not add up' };
    if (spec.smoke.expect && r.label !== spec.smoke.expect) return { ok: false, problem: 'smoke_failed', error: 'unexpected label for the test sentence' };
    return { ok: true, label: r.label, ms: Date.now() - started };
  } catch (e) {
    return { ok: false, problem: 'smoke_failed', error: e instanceof Error ? e.message : 'unknown error' };
  }
}
