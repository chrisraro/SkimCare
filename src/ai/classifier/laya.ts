/**
 * The Laya clause classifier, independent of the runtime: tokenize → one ONNX run →
 * softmax → label. The phone (onnxNative.ts, onnxruntime-react-native) and the browser
 * (onnxNative.web.ts, onnxruntime-web) only provide `load()`: verified files → a session
 * and a tokenizer.
 *
 * - Lazy: nothing loads until the first `ready()`/`classify()`; one session at a time,
 *   one run at a time (`serial`), freed by `release()` (low memory).
 * - A failed load is remembered until `release()`, so a missing or damaged file costs one
 *   check per session, not one per block.
 * - Never logs text, tokens or probabilities.
 */
import { AbortedError } from '../engines';
import { isTriageLabel, type ClassifierContext, type TriageClassification, type TriageClassifier, type TriageLabel } from '../llm/triageClassifier';
import type { LayaInferenceSpec } from './layaSpec';

export interface EncodedInput {
  ids: number[];
  mask: number[];
  typeIds: number[];
}

export interface TextEncoderLike {
  /** Token ids for `text` (and an optional second segment), at most `maxTokens` long including special tokens. */
  encode(text: string, pair: string | null, maxTokens: number): EncodedInput;
}

export interface ClassifierSession {
  /** One forward pass for one input; returns the logits for that input. */
  run(input: EncodedInput): Promise<ArrayLike<number>>;
  release(): Promise<void>;
}

export interface LoadedClassifier {
  session: ClassifierSession;
  tokenizer: TextEncoderLike;
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

export function softmax(logits: ArrayLike<number>): number[] {
  let max = -Infinity;
  for (let i = 0; i < logits.length; i++) max = Math.max(max, logits[i]!);
  const exps = Array.from(logits, (v) => Math.exp(v - max));
  const sum = exps.reduce((a, b) => a + b, 0);
  return exps.map((e) => e / sum);
}

/** Logits → label. Throws on output that does not match the spec (wrong size, NaN). */
export function decodeLogits(logits: ArrayLike<number>, labels: readonly TriageLabel[]): TriageClassification {
  if (logits.length !== labels.length) throw new Error(`classifier returned ${logits.length} scores, expected ${labels.length}`);
  for (let i = 0; i < logits.length; i++) if (!Number.isFinite(logits[i])) throw new Error('classifier returned a non-finite score');
  const p = softmax(logits);
  let best = 0;
  for (let i = 1; i < p.length; i++) if (p[i]! > p[best]!) best = i;
  const probs: Partial<Record<TriageLabel, number>> = {};
  labels.forEach((l, i) => (probs[l] = p[i]!));
  return { label: labels[best]!, confidence: p[best]!, probs };
}

/** The context segment the spec asks for: the end of the previous block, or nothing. */
export function contextSegment(spec: LayaInferenceSpec, ctx?: ClassifierContext): string | null {
  if (spec.context !== 'pair' || !ctx?.context?.trim()) return null;
  const c = ctx.context.trim();
  return c.length > spec.contextChars ? c.slice(c.length - spec.contextChars) : c;
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
        const input = tokenizer.encode(text, contextSegment(spec, ctx), spec.maxTokens);
        const logits = await session.run(input);
        if (signal?.aborted) throw new AbortedError();
        return decodeLogits(logits, spec.labels);
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
 * fixed sentence (no user data) whose output must be well-formed — and, once the spec
 * names it, the expected label.
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
