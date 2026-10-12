/**
 * Real LlmEngine, independent of the runtime. Per source block (see chunking.ts),
 * critical blocks first:
 *   1. a fast "type" call (a few output tokens): is this a term, and which type?
 *      When a clause classifier is installed, verified and confident (triageClassifier.ts),
 *      its label is used instead and this call is skipped; otherwise the language model decides.
 *   2. only for terms, an "explain" call; the finding is reported (onCandidates)
 *      as soon as it is explained, so results appear while the review runs.
 * Both calls for a block run back to back, so the runtime's KV cache already holds
 * the shared system prompt and the block when the explain call starts (prompt.ts).
 * Then writes Understand-It-Back items from the findings that passed the gate.
 * The llama.rn / wllama adapters only have to implement `CompletionRunner`.
 *
 * Never logs prompts or model output (PRD §14: no contract text in logs). The only
 * diagnostics are counts and times (`LlmRunStats`).
 */
import type { FindingType } from '@/domain/schema';
import { AbortedError, throwIfAborted, type ComprehensionRequest, type ExtractionRequest, type LlmEngine, type RawExtraction } from '../engines';
import { findBlock } from '../evidenceGate';
import { extractionUnits, prioritizeUnits, type ExtractionUnit } from './chunking';
import { buildComprehensionMessages, COMPREHENSION_JSON_SCHEMA, parseComprehensionOutput, selectQuizFindings } from './comprehension';
import { parseExplainOutput, parseTriageOutput, type ParseResult, type TriageResult } from './parse';
import { buildExplainMessages, buildTriageMessages, EXPLAIN_JSON_SCHEMA, TRIAGE_JSON_SCHEMA, type ChatMessage } from './prompt';
import { addCall, emptyStats, type CallTimings, type LlmRunStats } from './stats';
import { DEFAULT_TRIAGE_THRESHOLD, type TriageClassifier } from './triageClassifier';
import { checkFindingType } from './typeCheck';

export type CallKind = 'triage' | 'explain' | 'quiz';

export interface CompletionRequest {
  messages: ChatMessage[];
  /** JSON Schema for grammar-constrained decoding. */
  jsonSchema: object;
  maxTokens: number;
  /** What the call is for (stats and test fakes); never sent to the model. */
  kind?: CallKind;
  signal?: AbortSignal;
}

/** A runtime reply: the generated text plus, when the runtime reports them, token counts and times. */
export interface CompletionOutput {
  text: string;
  timings?: CallTimings;
}

/** One chat completion on the local model; resolves to the generated text (optionally with timings). */
export type CompletionRunner = (req: CompletionRequest) => Promise<string | CompletionOutput>;

/**
 * Output budgets. A type reply is ≈8 tokens ({"t":"payment_condition"}); an explanation
 * ≈35–60. Decoding is greedy, so an identical retry returns identical output; the usual
 * failure is a reply cut off at the cap, so the one retry gets a larger budget.
 */
export const TRIAGE_TOKENS = 16;
export const EXPLAIN_TOKENS = 100;
const RETRY_FACTOR = 2;
const QUIZ_TOKENS = 256;

export interface LocalLlmOptions {
  /** Output budget for an explain call (the type call uses TRIAGE_TOKENS). */
  maxTokens?: number;
  /** Called after each block, for progress UI. Counts only — never text. */
  onProgress?: (done: number, total: number, page?: number) => void;
  /** Counts and times for one extraction or quiz run (dev diagnostics, eval). Never text. */
  onStats?: (stats: LlmRunStats) => void;
  /** Optional clause classifier for the type pass; the language model decides whenever it cannot. */
  classifier?: TriageClassifier;
  /** Minimum confidence for using the classifier's label (default DEFAULT_TRIAGE_THRESHOLD). */
  classifierThreshold?: number;
  /** Read at the start of each extraction; false → language model only (setting / kill switch). */
  classifierEnabled?: () => boolean;
}

/** After this many classifier errors in one review, the rest of the review uses the language model. */
const MAX_CLASSIFIER_ERRORS = 3;

const now = () => Date.now();

export function createLocalLlmEngine(run: CompletionRunner, opts: LocalLlmOptions = {}): LlmEngine {
  const explainTokens = opts.maxTokens ?? EXPLAIN_TOKENS;
  const threshold = opts.classifierThreshold ?? DEFAULT_TRIAGE_THRESHOLD;

  /** Runs one call and records its counts/times. */
  async function call(stats: LlmRunStats, req: CompletionRequest): Promise<string> {
    const started = now();
    const reply = await run(req);
    const out = typeof reply === 'string' ? { text: reply } : reply;
    addCall(stats, req.kind ?? 'explain', now() - started, out.timings);
    return out.text;
  }

  /** PRD §12: invalid output → retry once (larger budget), then report it as unusable. */
  async function withRetry<T extends { ok: boolean }>(
    stats: LlmRunStats,
    signal: AbortSignal | undefined,
    budget: number,
    ask: (maxTokens: number) => Promise<T>,
  ): Promise<T> {
    const first = await ask(budget);
    if (first.ok) return first;
    throwIfAborted(signal);
    stats.retries++;
    return ask(budget * RETRY_FACTOR);
  }

  return {
    async extract(req: ExtractionRequest, signal?: AbortSignal): Promise<RawExtraction> {
      const stats = emptyStats('extract');
      const started = now();
      const units = extractionUnits(req.pages);
      stats.blocks = req.pages.reduce((n, p) => n + p.blocks.length, 0);
      stats.asked = units.length;
      // Asked critical-first (prioritizeUnits), but returned in document order, so the
      // final result does not depend on the asking order.
      const byUnit: unknown[][] = units.map(() => []);
      const incompletePages = new Set<number>();
      let done = 0;

      const askModel = (unit: ExtractionUnit): Promise<TriageResult> => {
        const messages = buildTriageMessages(unit, req.documentType, req.language);
        return withRetry(stats, signal, TRIAGE_TOKENS, async (maxTokens) =>
          parseTriageOutput(await call(stats, { messages, jsonSchema: TRIAGE_JSON_SCHEMA, maxTokens, kind: 'triage', signal }), unit.block.text),
        );
      };
      const explain = (unit: ExtractionUnit, type: FindingType): Promise<ParseResult> => {
        const messages = buildExplainMessages(unit, type, req.documentType, req.language);
        return withRetry(stats, signal, explainTokens, async (maxTokens) =>
          parseExplainOutput(await call(stats, { messages, jsonSchema: EXPLAIN_JSON_SCHEMA, maxTokens, kind: 'explain', signal }), unit, type, req.language),
        );
      };

      // Report the total before the first (slow) call, so the screen never shows a blank count.
      const order = prioritizeUnits(units);
      req.onProgress?.(0, units.length, order[0]?.page);
      opts.onProgress?.(0, units.length, order[0]?.page);

      // Pass 1 by the classifier when it is on, loaded and verified (ready() never throws).
      let sorter: TriageClassifier | null = null;
      if (opts.classifier && units.length && (opts.classifierEnabled?.() ?? true)) {
        sorter = (await opts.classifier.ready()) ? opts.classifier : null;
        throwIfAborted(signal);
      }
      let sorterErrors = 0;
      /** The classifier's answer, or null when the language model should decide this block. */
      const askClassifier = async (unit: ExtractionUnit): Promise<TriageResult | null> => {
        if (!sorter) return null;
        const c = stats.classifier;
        c.asked++;
        const started = now();
        try {
          const r = await sorter.classify(unit.block.text, { context: unit.context, documentType: req.documentType, language: req.language }, signal);
          c.ms += now() - started;
          if (!(r.confidence >= threshold)) {
            c.belowThreshold++;
            return null;
          }
          c.used++;
          if (r.label === 'none') {
            c.none++;
            return { ok: true, type: null };
          }
          // Same check as the language model's answer: a type the block contradicts is relabelled.
          return { ok: true, type: checkFindingType(r.label, unit.block.text) };
        } catch (e) {
          c.ms += now() - started;
          if (e instanceof AbortedError || signal?.aborted) throw e;
          c.errors++;
          if (++sorterErrors >= MAX_CLASSIFIER_ERRORS) sorter = null;
          return null;
        }
      };
      const triage = async (unit: ExtractionUnit): Promise<TriageResult> => (await askClassifier(unit)) ?? askModel(unit);

      for (const unit of order) {
        throwIfAborted(signal);
        const kind = await triage(unit);
        let candidates: unknown[] = [];
        let usable = kind.ok;
        if (kind.ok && kind.type) {
          stats.relevant++;
          throwIfAborted(signal);
          const result = await explain(unit, kind.type);
          // A term the model could not explain is never dropped silently: its page is reported incomplete.
          if (result.ok) candidates = result.candidates;
          else usable = false;
        }
        if (usable) byUnit[unit.index] = candidates;
        else incompletePages.add(unit.page);
        done++;
        if (candidates.length) req.onCandidates?.(candidates);
        req.onProgress?.(done, units.length, unit.page);
        opts.onProgress?.(done, units.length, unit.page);
      }

      stats.wallMs = now() - started;
      opts.onStats?.(stats);
      return { findings: byUnit.flat(), comprehension: [], incompletePages: [...incompletePages].sort((a, b) => a - b) };
    },

    async comprehend(req: ComprehensionRequest, signal?: AbortSignal): Promise<unknown[]> {
      const stats = emptyStats('quiz');
      const started = now();
      const items: unknown[] = [];
      for (const finding of selectQuizFindings(req.findings)) {
        throwIfAborted(signal);
        const source = findBlock(req.pages, finding.evidence!.page, finding.evidence!.blockId);
        if (!source) continue;
        const messages = buildComprehensionMessages(source.text, req.language);
        const output = await call(stats, { messages, jsonSchema: COMPREHENSION_JSON_SCHEMA, maxTokens: QUIZ_TOKENS, kind: 'quiz', signal });
        const item = parseComprehensionOutput(output, finding, req.pages, req.language);
        if (item) items.push(item);
      }
      stats.wallMs = now() - started;
      if (stats.calls.quiz) opts.onStats?.(stats);
      return items;
    },
  };
}
