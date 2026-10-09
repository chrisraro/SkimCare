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
import { guessDocumentType } from './documentType';
import { COMPREHENSION_PROMPT_VERSION } from './llm/comprehension';
import { createLlamaProbe, createLlamaRunner } from './llm/llamaRuntime';
import { createLocalLlmEngine } from './llm/localLlmEngine';
import { getModelSpec, type ModelSpec } from './llm/models';
import { PROMPT_VERSION } from './llm/prompt';
import { checkLocalReadiness } from './llm/readiness';
import type { InferenceEngine, OcrEngine } from './engines';
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
    checkReadiness: () => checkLocalReadiness(spec, probe),
    classify: async (pages) => guessDocumentType(pages),
    ocr: nativeOcr ? createMlKitOcr(nativeOcr) : NO_OCR,
    llm: createLocalLlmEngine(createLlamaRunner(spec)),
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
