/**
 * Real engine in the browser (web build; Metro picks this file over localEngine.ts,
 * so llama.rn and ML Kit never enter the web bundle). Same model, prompts, parsing,
 * evidence gate and calculations as the phone:
 *   LLM  → wllama (llama.cpp WebAssembly) running the pinned Qwen3 GGUF
 *   OCR  → Tesseract.js (WebAssembly), self-hosted
 *   PDFs → pdf.js text layer (sources/pdfTextLayer.web.ts), scans → pdf.js render + OCR
 * Document text never leaves the browser. The ~400 MB model is downloaded only when
 * the user taps the button on the AI check screen (`prepare`).
 */
import { classifierSelfCheck, getTriageClassifier, prepareClassifier } from './classifier/onnxNative.web';
import { LAYA_SPEC } from './classifier/layaSpec';
import { classifierReadinessCheck } from './classifier/readiness';
import { isClassifierEnabled } from './classifier/setting';
import { guessDocumentType } from './documentType';
import { COMPREHENSION_PROMPT_VERSION } from './llm/comprehension';
import { createLocalLlmEngine } from './llm/localLlmEngine';
import { getModelSpec, isClassifierPinned, type ModelSpec } from './llm/models';
import { PROMPT_VERSION } from './llm/prompt';
import { reportStats } from './llm/stats';
import type { InferenceEngine } from './engines';
import { registerClassifierBench } from './web/classifierBench';
import { checkWebReadiness } from './web/readiness';
import { createTesseractOcr, tesseractSelfTest } from './web/tesseractOcr';
import { cachedModelSha256, createWllamaRunner, downloadModel, findCachedModel, webRuntimeInfo, webSmokeTest } from './web/wllamaRuntime';

export { guessDocumentType };

async function freeStorageBytes(): Promise<number | undefined> {
  const est = await globalThis.navigator?.storage?.estimate?.();
  if (!est || est.quota === undefined) return undefined;
  return Math.max(0, est.quota - (est.usage ?? 0));
}

export function createLocalEngine(spec: ModelSpec): InferenceEngine {
  // Dev builds: `await __skimcareClassifierBench()` in the console (counts and times only).
  if (typeof __DEV__ !== 'undefined' && __DEV__) registerClassifierBench();
  return {
    info: {
      kind: 'local',
      name: `${spec.name} in this browser`,
      runtime: 'wllama (llama.cpp WebAssembly) in this browser',
      ocrModel: 'Tesseract.js (LSTM, English + Filipino), in this browser',
      llmModel: `${spec.name} ${spec.quantization}`,
      quantization: spec.quantization,
      checksum: spec.sha256,
      license: spec.license,
      promptVersion: `${PROMPT_VERSION}+${COMPREHENSION_PROMPT_VERSION}`,
    },
    checkReadiness: async () => {
      const report = await checkWebReadiness(spec, {
        cachedModel: async () => {
          const m = await findCachedModel(spec);
          return m ? { sizeBytes: m.size } : undefined;
        },
        sha256: () => cachedModelSha256(spec),
        freeStorageBytes,
        ocrSelfTest: tesseractSelfTest,
        smokeTest: () => webSmokeTest(spec),
        runtime: webRuntimeInfo,
      });
      // Optional: never changes offlineReady (the language model can sort clauses itself).
      const sorter = classifierReadinessCheck(await classifierSelfCheck(isClassifierEnabled()), 'browser');
      return { ...report, checks: [...report.checks, sorter] };
    },
    prepareClassifier: isClassifierPinned() ? (onProgress, signal) => prepareClassifier(onProgress, signal) : undefined,
    prepare: (onProgress, signal) => downloadModel(spec, onProgress, signal),
    isModelInstalled: async () => Boolean(await findCachedModel(spec)),
    classify: async (pages) => guessDocumentType(pages),
    ocr: createTesseractOcr(),
    llm: createLocalLlmEngine(createWllamaRunner(spec), {
      onStats: reportStats,
      classifier: getTriageClassifier(),
      classifierThreshold: LAYA_SPEC.threshold,
      classifierEnabled: isClassifierEnabled,
    }),
  };
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
