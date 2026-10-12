/**
 * Laya classifier on the phone: onnxruntime-react-native (CPU) + the model's own
 * tokenizer.json. The web build uses onnxNative.web.ts (Metro picks it there).
 *
 * Files live next to the GGUF in app-private storage (`<documents>/models/<fileName>`),
 * downloaded and MD5-checked by src/features/model/downloadModel.ts. They are checked
 * again (size + native MD5, never read into JS) before the first load in each app session,
 * so a damaged or swapped file is never loaded.
 *
 * onnxruntime-react-native is required lazily: importing it calls its native install(),
 * which must not run (or crash startup) in a build without the module or when the
 * classifier is not set up. Nothing here logs text.
 */
import { File, Paths } from 'expo-file-system';
import { AppState, type NativeEventSubscription } from 'react-native';
import { classifierFiles, isClassifierPinned, LAYA_CLASSIFIER, type ClassifierSpec, type ModelSpec } from '../llm/models';
import { createLayaTokenizer } from './hfTokenizer';
import { checkClassifier, ClassifierLoadError, createLayaClassifier, type ClassifierCheck, type LayaClassifier, type LoadedClassifier } from './laya';
import { LAYA_SPEC, type LayaInferenceSpec } from './layaSpec';
import { wrapOrtSession, type OrtLikeSession, type OrtTensorCtor } from './ortSession';

/**
 * Intra-op threads for the encoder. Phones here are big.LITTLE (2–4 fast cores); more
 * threads than fast cores makes ONNX Runtime wait on slow cores. TODO(bench): compare 2 vs 4
 * on the test phone, like llamaRuntime's CPU_SETTINGS.
 */
export const CLASSIFIER_THREADS = 4;

export const classifierFile = (f: ModelSpec) => new File(Paths.document, 'models', f.fileName);

/** Present, right size, pinned MD5 (computed natively). Throws `ClassifierLoadError`. */
export function verifyClassifierFile(f: ModelSpec, file: File = classifierFile(f)): File {
  if (!file.exists) throw new ClassifierLoadError('missing', `${f.fileName} is not installed`);
  const info = file.info({ md5: true });
  if (info.size !== f.sizeBytes) throw new ClassifierLoadError('size_mismatch', `${f.fileName} has the wrong size`);
  if (!info.md5 || info.md5.toLowerCase() !== f.md5) throw new ClassifierLoadError('checksum_mismatch', `${f.fileName} does not match its checksum`);
  return file;
}

interface OrtModule {
  InferenceSession: { create(path: string, options: Record<string, unknown>): Promise<OrtLikeSession> };
  Tensor: OrtTensorCtor;
}

function onnxRuntime(): OrtModule {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- lazy native module (see header)
    return require('onnxruntime-react-native') as OrtModule;
  } catch {
    throw new ClassifierLoadError('load_failed', 'ONNX Runtime is not in this build');
  }
}

async function load(spec: ClassifierSpec, inference: LayaInferenceSpec): Promise<LoadedClassifier> {
  if (!isClassifierPinned(spec)) throw new ClassifierLoadError('not_configured', 'the classifier files are not pinned yet');
  // The native MD5 is synchronous; yield so a progress UI can render first.
  await new Promise((r) => setTimeout(r, 0));
  const [model, tokenizer, config] = [spec.model, spec.tokenizer, spec.tokenizerConfig].map((f) => (f ? verifyClassifierFile(f) : undefined));
  const encoder = createLayaTokenizer(JSON.parse(await tokenizer!.text()) as object, config ? (JSON.parse(await config.text()) as object) : {});
  const ort = onnxRuntime();
  const session = await ort.InferenceSession.create(decodeURI(model!.uri), {
    executionProviders: ['cpu'],
    graphOptimizationLevel: 'all',
    executionMode: 'sequential',
    intraOpNumThreads: CLASSIFIER_THREADS,
    interOpNumThreads: 1,
  });
  try {
    return { tokenizer: encoder, session: wrapOrtSession(session, ort.Tensor, inference) };
  } catch (e) {
    await session.release().catch(() => undefined);
    throw e;
  }
}

let instance: LayaClassifier | null = null;
let memoryWarning: NativeEventSubscription | null = null;

/** The phone's classifier (one per app). Nothing loads until it is first used. */
export function getTriageClassifier(spec: ClassifierSpec = LAYA_CLASSIFIER, inference: LayaInferenceSpec = LAYA_SPEC): LayaClassifier {
  if (!instance) {
    instance = createLayaClassifier({ name: `${spec.name} (ONNX Runtime, CPU)`, spec: inference, load: () => load(spec, inference) });
    // PRD §12 low-memory row: free the session, keep the document. Reloads on next use.
    memoryWarning ??= AppState.addEventListener('memoryWarning', () => void releaseClassifier());
  }
  return instance;
}

export function releaseClassifier(): Promise<void> {
  return instance?.release() ?? Promise.resolve();
}

/** Readiness probe. `enabled` false → reported as turned off, nothing loads. */
export async function classifierSelfCheck(enabled: boolean, spec: ClassifierSpec = LAYA_CLASSIFIER, inference: LayaInferenceSpec = LAYA_SPEC): Promise<ClassifierCheck> {
  if (!isClassifierPinned(spec)) return { ok: false, problem: 'not_configured' };
  if (!enabled) return { ok: false, problem: 'disabled' };
  const c = getTriageClassifier(spec, inference);
  // A fresh check each time: a file downloaded or removed since the last check is seen.
  await c.release();
  return checkClassifier(c, inference);
}

/** All pinned files are present (size only; the MD5 is checked when loading). */
export function classifierInstalled(spec: ClassifierSpec = LAYA_CLASSIFIER): boolean {
  return classifierFiles(spec).every((f) => {
    const file = classifierFile(f);
    return file.exists && file.info().size === f.sizeBytes;
  });
}
