/**
 * Real LlmEngine, independent of the runtime. It chunks the document, prompts
 * the model once per chunk, parses the JSON and aggregates raw candidates;
 * then writes Understand-It-Back items from the findings that passed the gate.
 * The llama.rn adapter only has to implement `CompletionRunner`.
 *
 * Never logs prompts or model output (PRD §14: no contract text in logs).
 */
import { throwIfAborted, type ComprehensionRequest, type ExtractionRequest, type LlmEngine, type RawExtraction } from '../engines';
import { findBlock } from '../evidenceGate';
import { chunkPages, DEFAULT_CHUNK_CHARS } from './chunking';
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
  maxChunkChars?: number;
  maxTokens?: number;
  /** Called after each chunk, for progress UI. Counts only — never text. */
  onChunk?: (done: number, total: number) => void;
}

/** Same block cited for the same kind of term twice → keep the first. */
function dedupeKey(c: unknown): string | null {
  if (!c || typeof c !== 'object') return null;
  const r = c as { type?: unknown; evidence?: { blockId?: unknown } };
  return typeof r.type === 'string' && typeof r.evidence?.blockId === 'string' ? `${r.type}:${r.evidence.blockId}` : null;
}

export function createLocalLlmEngine(run: CompletionRunner, opts: LocalLlmOptions = {}): LlmEngine {
  const maxTokens = opts.maxTokens ?? 1024;

  return {
    async extract(req: ExtractionRequest, signal?: AbortSignal): Promise<RawExtraction> {
      const chunks = chunkPages(req.pages, opts.maxChunkChars ?? DEFAULT_CHUNK_CHARS);
      const findings: unknown[] = [];
      const incompletePages = new Set<number>();
      const seen = new Set<string>();

      for (const chunk of chunks) {
        throwIfAborted(signal);
        const messages = buildExtractionMessages(chunk, req.documentType, req.language);

        // PRD §12: invalid output → retry once, then fall back to explicit uncertainty.
        let result = parseModelOutput(await run({ messages, jsonSchema: EXTRACTION_JSON_SCHEMA, maxTokens, signal }), chunk);
        if (!result.ok) {
          throwIfAborted(signal);
          result = parseModelOutput(await run({ messages, jsonSchema: EXTRACTION_JSON_SCHEMA, maxTokens, signal }), chunk);
        }

        if (result.ok) {
          for (const c of result.candidates) {
            const key = dedupeKey(c);
            if (key && seen.has(key)) continue;
            if (key) seen.add(key);
            findings.push(c);
          }
        } else {
          incompletePages.add(chunk.page);
        }
        opts.onChunk?.(chunk.index + 1, chunks.length);
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
