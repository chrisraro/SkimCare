/**
 * Laya classifier in the browser (web build; Metro picks this file over onnxNative.ts):
 * onnxruntime-web, WebAssembly CPU backend, self-hosted from `/vendor/ort` (copied by
 * scripts/copy-web-assets.mjs; never a CDN). Same tokenizer, spec and decoding as the phone.
 *
 * Threads: the site is cross-origin isolated (COOP/COEP in vercel.json), so the
 * multi-threaded SIMD build can use SharedArrayBuffer; without isolation it runs on one
 * thread. Files come from this browser's Cache Storage (classifierStore.ts) and are
 * SHA-256-checked again before the first load in each page session. Nothing here logs text.
 */
import { isClassifierPinned, LAYA_CLASSIFIER, type ClassifierSpec, type ModelSpec } from '../llm/models';
import { sha256OfBlob } from '../web/sha256';
import { downloadClassifierToBrowser, storedClassifierFile } from '../web/classifierStore';
import { absoluteUrl, importVendor, VENDOR } from '../web/vendor';
import { createLayaTokenizer } from './hfTokenizer';
import { checkClassifier, ClassifierLoadError, createLayaClassifier, type ClassifierCheck, type LayaClassifier, type LoadedClassifier } from './laya';
import { LAYA_SPEC, type LayaInferenceSpec } from './layaSpec';
import { wrapOrtSession, type OrtLikeSession, type OrtTensorCtor } from './ortSession';

/** At most this many wasm threads: the encoder gains little beyond 4, and the page stays responsive. */
export const MAX_WEB_THREADS = 4;

export function webClassifierThreads(isolated = globalThis.crossOriginIsolated === true, cores = globalThis.navigator?.hardwareConcurrency ?? 1): number {
  if (!isolated) return 1;
  return Math.max(1, Math.min(MAX_WEB_THREADS, cores - 1));
}

interface OrtWeb {
  env: { wasm: { wasmPaths?: string; numThreads?: number; proxy?: boolean }; logLevel?: string };
  InferenceSession: { create(model: Uint8Array, options: Record<string, unknown>): Promise<OrtLikeSession> };
  Tensor: OrtTensorCtor;
}

async function ortWeb(): Promise<OrtWeb> {
  let ort: OrtWeb;
  try {
    ort = await importVendor<OrtWeb>('ort/ort.wasm.min.mjs');
  } catch {
    throw new ClassifierLoadError('load_failed', 'ONNX Runtime is not on this site');
  }
  ort.env.wasm.wasmPaths = absoluteUrl(`${VENDOR}/ort/`);
  ort.env.wasm.numThreads = webClassifierThreads();
  ort.env.logLevel = 'error';
  return ort;
}

async function verified(spec: ClassifierSpec, f: ModelSpec): Promise<Blob> {
  const blob = await storedClassifierFile(spec, f).catch(() => undefined);
  if (!blob) throw new ClassifierLoadError('missing', `${f.fileName} is not in this browser`);
  if (blob.size !== f.sizeBytes) throw new ClassifierLoadError('size_mismatch', `${f.fileName} has the wrong size`);
  if ((await sha256OfBlob(blob)) !== f.sha256) throw new ClassifierLoadError('checksum_mismatch', `${f.fileName} does not match its checksum`);
  return blob;
}

async function load(spec: ClassifierSpec, inference: LayaInferenceSpec): Promise<LoadedClassifier> {
  if (!isClassifierPinned(spec)) throw new ClassifierLoadError('not_configured', 'the classifier files are not pinned yet');
  const model = await verified(spec, spec.model);
  const tokenizer = await verified(spec, spec.tokenizer);
  const config = spec.tokenizerConfig ? await verified(spec, spec.tokenizerConfig) : undefined;
  const encoder = createLayaTokenizer(JSON.parse(await tokenizer.text()) as object, config ? (JSON.parse(await config.text()) as object) : {});
  const ort = await ortWeb();
  const session = await ort.InferenceSession.create(new Uint8Array(await model.arrayBuffer()), {
    executionProviders: ['wasm'],
    graphOptimizationLevel: 'all',
    executionMode: 'sequential',
  });
  try {
    return { tokenizer: encoder, session: wrapOrtSession(session, ort.Tensor, inference) };
  } catch (e) {
    await session.release().catch(() => undefined);
    throw e;
  }
}

let instance: LayaClassifier | null = null;

export function getTriageClassifier(spec: ClassifierSpec = LAYA_CLASSIFIER, inference: LayaInferenceSpec = LAYA_SPEC): LayaClassifier {
  instance ??= createLayaClassifier({ name: `${spec.name} (ONNX Runtime Web, WebAssembly)`, spec: inference, load: () => load(spec, inference) });
  return instance;
}

export function releaseClassifier(): Promise<void> {
  return instance?.release() ?? Promise.resolve();
}

export async function classifierSelfCheck(enabled: boolean, spec: ClassifierSpec = LAYA_CLASSIFIER, inference: LayaInferenceSpec = LAYA_SPEC): Promise<ClassifierCheck> {
  if (!isClassifierPinned(spec)) return { ok: false, problem: 'not_configured' };
  if (!enabled) return { ok: false, problem: 'disabled' };
  const c = getTriageClassifier(spec, inference);
  await c.release();
  return checkClassifier(c, inference);
}

export async function prepareClassifier(onProgress: (loaded: number, total: number) => void, signal?: AbortSignal, spec: ClassifierSpec = LAYA_CLASSIFIER): Promise<void> {
  await releaseClassifier();
  await downloadClassifierToBrowser(spec, onProgress, signal);
}
