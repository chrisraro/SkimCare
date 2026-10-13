/**
 * Real on-device engine: llama.rn + a pinned Qwen3 GGUF.
 *
 * Honesty rules: info.kind is 'local' only because the output really comes from
 * the local model; readiness reports offline-ready only when every check passes.
 * Photos and scanned PDFs use bundled ML Kit (modules/local-ocr); in a build
 * without it they are refused with a clear message, never given sample text.
 * Digital PDFs use their text layer (src/ai/recognize.ts).
 */
import { getLocalOcr, type LocalOcrModule } from '../../modules/local-ocr';
import { classifierSelfCheck, getTriageClassifier } from './classifier/onnxNative';
import { classifierReadinessCheck } from './classifier/readiness';
import { LAYA_SPEC } from './classifier/layaSpec';
import { isClassifierEnabled } from './classifier/setting';
import { guessDocumentType } from './documentType';
import { COMPREHENSION_PROMPT_VERSION } from './llm/comprehension';
import { createLlamaProbe, createLlamaRunner, modelFile } from './llm/llamaRuntime';
import { createLocalLlmEngine } from './llm/localLlmEngine';
import { getModelSpec, isClassifierPinned, LAYA_CLASSIFIER, type ModelSpec } from './llm/models';
import { PROMPT_VERSION } from './llm/prompt';
import { checkLocalReadiness } from './llm/readiness';
import { logStatsInDev } from './llm/stats';
import { AbortedError, type InferenceEngine, type OcrEngine } from './engines';
import { createMlKitOcr } from './ocr/mlKitOcr';
import { RecognizeError } from './recognize';

export { guessDocumentType };

const NO_OCR: OcrEngine = {
  async recognize() {
    throw new RecognizeError('On-device text recognition is not in this build. Import a digital PDF instead.');
  },
};

export function createLocalEngine(spec: ModelSpec, nativeOcr: LocalOcrModule | null = getLocalOcr()): InferenceEngine {
  // Readiness needs ML Kit to actually read a test image on this phone, not just be linked.
  const probe = createLlamaProbe(spec, async () => (nativeOcr ? nativeOcr.selfTest() : false));
  return {
    info: {
      kind: 'local',
      name: `${spec.name} on this phone`,
      runtime: 'llama.rn 0.12.9 (llama.cpp, CPU)',
      ocrModel: nativeOcr ? 'ML Kit Text Recognition v2 (Latin, bundled)' : 'Not in this build — digital PDFs only',
      llmModel: `${spec.name} ${spec.quantization}`,
      quantization: spec.quantization,
      checksum: spec.sha256,
      license: spec.license,
      promptVersion: `${PROMPT_VERSION}+${COMPREHENSION_PROMPT_VERSION}`,
    },
    checkReadiness: async () => {
      const report = await checkLocalReadiness(spec, probe);
      // Optional: never changes offlineReady (the language model can sort clauses itself).
      const sorter = classifierReadinessCheck(await classifierSelfCheck(isClassifierEnabled()), 'phone');
      return { ...report, checks: [...report.checks, sorter] };
    },
    prepareClassifier: isClassifierPinned() ? prepareClassifierOnPhone : undefined,
    isModelInstalled: async () => modelFile(spec).exists,
    classify: async (pages) => guessDocumentType(pages),
    ocr: nativeOcr ? createMlKitOcr(nativeOcr) : NO_OCR,
    llm: createLocalLlmEngine(createLlamaRunner(spec), {
      onStats: logStatsInDev,
      classifier: getTriageClassifier(),
      classifierThreshold: LAYA_SPEC.threshold,
      classifierEnabled: isClassifierEnabled,
    }),
  };
}

/** Phone: the classifier files through the same downloader as the GGUF (DownloadManager, MD5). */
async function prepareClassifierOnPhone(onProgress: (loaded: number, total: number) => void, signal?: AbortSignal): Promise<void> {
  // Lazy: the download module imports this engine's runtime modules.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { downloadClassifierFiles } = require('@/features/model/downloadModel') as typeof import('@/features/model/downloadModel');
  const outcome = await downloadClassifierFiles(
    LAYA_CLASSIFIER,
    { onProgress: (bytes, total) => onProgress(bytes, total), onVerifying: () => undefined },
    signal ?? new AbortController().signal,
    { title: 'SkimCare clause sorter' },
  );
  if (outcome.status === 'canceled') throw new AbortedError();
  if (outcome.status === 'failed') throw new Error(`The clause sorter could not be downloaded (${outcome.reason}).`);
}

let instance: InferenceEngine | null = null;

export function getLocalEngine(): InferenceEngine {
  if (!instance) {
    const spec = getModelSpec();
    if (!spec) throw new Error('Default model spec missing');
    instance = createLocalEngine(spec);
  }
  return instance;
}
