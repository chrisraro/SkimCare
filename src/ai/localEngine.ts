/**
 * Real on-device engine: llama.rn + a pinned Qwen3 GGUF.
 *
 * Honesty rules: info.kind is 'local' only because the output really comes from
 * the local model; readiness reports offline-ready only when every check passes.
 * OCR is not bundled yet (modules/local-ocr), so photos are refused with a clear
 * message instead of falling back to sample text. Digital PDFs work via their
 * text layer (src/ai/recognize.ts).
 */
import type { DocumentPage, DocumentType } from '@/domain/schema';
import { COMPREHENSION_PROMPT_VERSION } from './llm/comprehension';
import { createLlamaProbe, createLlamaRunner } from './llm/llamaRuntime';
import { createLocalLlmEngine } from './llm/localLlmEngine';
import { getModelSpec, type ModelSpec } from './llm/models';
import { PROMPT_VERSION } from './llm/prompt';
import { checkLocalReadiness } from './llm/readiness';
import type { InferenceEngine } from './engines';
import { RecognizeError } from './recognize';

/** Keyword guess only; the user confirms or changes the type on S09. */
const TYPE_HINTS: [DocumentType, RegExp][] = [
  ['installment_agreement', /\b(installment|instal(l)?ments?|hulugan|hulog|amorti[sz]ation|down ?payment)\b/i],
  ['lease', /\b(lease|lessor|lessee|rent|upa|paupahan|umuupa)\b/i],
  ['employment', /\b(employ(er|ee|ment)|salary|sahod|probation(ary)?)\b/i],
  ['service_agreement', /\b(services?|deliverables?|provider|consultant|designer|developer|serbisyo)\b/i],
];

export function guessDocumentType(pages: DocumentPage[]): { type: DocumentType; confidence: number } {
  const text = pages.flatMap((p) => p.blocks.map((b) => b.text)).join(' ');
  const hit = TYPE_HINTS.find(([, re]) => re.test(text));
  return hit ? { type: hit[0], confidence: 0.6 } : { type: 'other', confidence: 0.3 };
}

export function createLocalEngine(spec: ModelSpec): InferenceEngine {
  const ocrAvailable = () => false; // TODO(local-ocr): report the bundled ML Kit module
  const probe = createLlamaProbe(spec, ocrAvailable);
  return {
    info: {
      kind: 'local',
      name: `${spec.name} on this phone`,
      runtime: 'llama.rn 0.12.9 (llama.cpp, CPU)',
      ocrModel: 'Not installed yet — digital PDFs only',
      llmModel: `${spec.name} ${spec.quantization}`,
      quantization: spec.quantization,
      checksum: spec.sha256,
      license: spec.license,
      promptVersion: `${PROMPT_VERSION}+${COMPREHENSION_PROMPT_VERSION}`,
    },
    checkReadiness: () => checkLocalReadiness(spec, probe),
    classify: async (pages) => guessDocumentType(pages),
    ocr: {
      async recognize() {
        throw new RecognizeError('On-device text recognition for photos is not installed yet. Import a digital PDF instead.');
      },
    },
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
