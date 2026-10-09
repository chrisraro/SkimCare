/**
 * Real LlmEngine, independent of the runtime. It prompts the model once per
 * source block (see chunking.ts), parses the JSON and aggregates raw candidates;
 * then writes Understand-It-Back items from the findings that passed the gate.
 * The llama.rn adapter only has to implement `CompletionRunner`.
 *
 * Never logs prompts or model output (PRD §14: no contract text in logs).
 */
import { throwIfAborted, type ComprehensionRequest, type ExtractionRequest, type LlmEngine, type RawExtraction } from '../engines';
import { findBlock } from '../evidenceGate';
import { extractionUnits } from './chunking';
import { buildComprehensionMessages, COMPREHENSION_JSON_SCHEMA, parseComprehensionOutput, selectQuizFindings } from './comprehension';
import { parseModelOutput } from './parse';
import { buildExtractionMessages, EXTRACTION_JSON_SCHEMA, type ChatMessage } from './prompt';

export interface CompletionRequest {
  messages: ChatMessage[];
  /** JSON Schema for grammar-constrained decoding. */
  jsonSchema: object;
  maxTokens: number;
  signal?: AbortSignal;
}

/** One chat completion on the local model; resolves to the generated text. */
export type CompletionRunner = (req: CompletionRequest) => Promise<string>;

export interface LocalLlmOptions {
  /** Output budget per block; an extract-v4 finding is ~60–90 tokens. */
  maxTokens?: number;
  /** Called after each block, for progress UI. Counts only — never text. */
  onProgress?: (done: number, total: number) => void;
}

export function createLocalLlmEngine(run: CompletionRunner, opts: LocalLlmOptions = {}): LlmEngine {
  const maxTokens = opts.maxTokens ?? 200;

  return {
    async extract(req: ExtractionRequest, signal?: AbortSignal): Promise<RawExtraction> {
      const units = extractionUnits(req.pages);
      const findings: unknown[] = [];
      const incompletePages = new Set<number>();

      for (const unit of units) {
        throwIfAborted(signal);
        const messages = buildExtractionMessages(unit, req.documentType, req.language);
        const ask = async () =>
          parseModelOutput(await run({ messages, jsonSchema: EXTRACTION_JSON_SCHEMA, maxTokens, signal }), unit, req.language);

        // PRD §12: invalid output → retry once, then fall back to explicit uncertainty.
        let result = await ask();
        if (!result.ok) {
          throwIfAborted(signal);
          result = await ask();
        }
        if (result.ok) findings.push(...result.candidates);
        else incompletePages.add(unit.page);
        opts.onProgress?.(unit.index + 1, units.length);
      }

      return { findings, comprehension: [], incompletePages: [...incompletePages] };
    },

    async comprehend(req: ComprehensionRequest, signal?: AbortSignal): Promise<unknown[]> {
      const items: unknown[] = [];
      for (const finding of selectQuizFindings(req.findings)) {
        throwIfAborted(signal);
        const source = findBlock(req.pages, finding.evidence!.page, finding.evidence!.blockId);
        if (!source) continue;
        const messages = buildComprehensionMessages(source.text, req.language);
        const output = await run({ messages, jsonSchema: COMPREHENSION_JSON_SCHEMA, maxTokens: 256, signal });
        const item = parseComprehensionOutput(output, finding, req.pages, req.language);
        if (item) items.push(item);
      }
      return items;
    },
  };
}
