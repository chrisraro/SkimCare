/**
 * Inference engine contracts. The UI depends only on these interfaces so the
 * Demo engine can be swapped for the real on-device stack without screen changes:
 *   OcrEngine  → modules/local-ocr (bundled ML Kit Text Recognition v2)
 *   LlmEngine  → llama.rn + quantized GGUF (Qwen3 0.6B / 1.7B candidate)
 */
import type { DocumentPage, DocumentType, Finding } from '@/domain/schema';

export interface EngineInfo {
  kind: 'demo' | 'local';
  /** Human-readable name shown on readiness/diagnostics screens. */
  name: string;
  runtime: string;
  ocrModel: string;
  llmModel: string;
  quantization?: string;
  checksum?: string;
  license?: string;
  promptVersion: string;
}

export type CheckStatus = 'pass' | 'warn' | 'fail';

export interface ReadinessCheck {
  id: 'model_present' | 'checksum' | 'storage' | 'ocr' | 'inference' | 'network_independent';
  label: string;
  status: CheckStatus;
  detail: string;
}

export interface ReadinessReport {
  checks: ReadinessCheck[];
  /** True only when real local inference is verified. Never true for the Demo engine. */
  offlineReady: boolean;
}

export interface CapturedPage {
  id: string;
  uri?: string;
  rotation: 0 | 90 | 180 | 270;
}

export interface OcrEngine {
  recognize(pages: CapturedPage[], signal?: AbortSignal): Promise<DocumentPage[]>;
  /**
   * Scanned PDFs: render pages on the device and recognize them. `pages` are
   * 1-based page numbers (all pages when omitted). Absent on engines without real OCR.
   */
  recognizePdf?(uri: string, opts?: { pages?: number[]; signal?: AbortSignal }): Promise<DocumentPage[]>;
}

export interface ExtractionRequest {
  pages: DocumentPage[];
  documentType: DocumentType;
  language: 'en' | 'fil';
}

/** Raw model output — always untrusted until it passes the evidence gate. */
export interface RawExtraction {
  findings: unknown[];
  comprehension: unknown[];
  /** Pages the model could not analyze (output unusable after retry) — reported as incomplete coverage. */
  incompletePages?: number[];
}

export interface ComprehensionRequest {
  pages: DocumentPage[];
  /** Findings that already passed the evidence gate. */
  findings: Finding[];
  language: 'en' | 'fil';
}

export interface LlmEngine {
  extract(req: ExtractionRequest, signal?: AbortSignal): Promise<RawExtraction>;
  /**
   * Optional: Understand-It-Back items generated from verified findings (still untrusted).
   * When absent, the pipeline uses `RawExtraction.comprehension`.
   */
  comprehend?(req: ComprehensionRequest, signal?: AbortSignal): Promise<unknown[]>;
}

export interface InferenceEngine {
  info: EngineInfo;
  ocr: OcrEngine;
  llm: LlmEngine;
  checkReadiness(): Promise<ReadinessReport>;
  classify(pages: DocumentPage[]): Promise<{ type: DocumentType; confidence: number }>;
}

export class AbortedError extends Error {
  constructor() {
    super('Cancelled');
    this.name = 'AbortedError';
  }
}

export function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw new AbortedError();
}
