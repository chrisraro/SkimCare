/**
 * Analysis pipeline — PRD §11 stages: Organize → Validate → Explain → Persist.
 * (Acquire + Recognize happen earlier in the capture flow so the user can
 * verify OCR before any extraction depends on it.)
 */
import {
  ComprehensionItem,
  type AnalysisRun,
  type ClarificationQuestion,
  type DocumentPage,
  type DocumentType,
  type ExtractedFact,
  type Finding,
} from '@/domain/schema';
import { containsVerdict, findBlock, moneyMatchesIn, normalizeText, validateCandidates } from './evidenceGate';
import { throwIfAborted, type InferenceEngine } from './engines';
import { parsePhpAmount } from './scenarioRules';

export type StageId = 'organize' | 'extract' | 'validate' | 'explain' | 'save';

export const STAGES: { id: StageId; label: string }[] = [
  { id: 'organize', label: 'Organizing sections' },
  { id: 'extract', label: 'Reading terms with the local model' },
  { id: 'validate', label: 'Checking every finding against the source' },
  { id: 'explain', label: 'Preparing plain-language explanations' },
  { id: 'save', label: 'Saving privately on this phone' },
];

/**
 * Share of the whole review each stage takes, for one honest progress bar. Reading
 * terms with the model is nearly all of the time on a phone; the other stages are code.
 */
const STAGE_WEIGHT: Record<StageId, number> = { organize: 0.05, extract: 0.85, validate: 0.04, explain: 0.03, save: 0.03 };

/** Whole-review progress 0–1: finished stages plus the read share of the current one. */
export function reviewProgress(stage: StageId, reading?: { done: number; total: number }): number {
  let before = 0;
  for (const s of STAGES) {
    if (s.id === stage) break;
    before += STAGE_WEIGHT[s.id];
  }
  const within = stage === 'extract' && reading ? Math.min(reading.done / Math.max(reading.total, 1), 1) : 0;
  return Math.min(before + STAGE_WEIGHT[stage] * within, 1);
}

export interface RunOptions {
  engine: InferenceEngine;
  pages: DocumentPage[];
  ocrRevision: number;
  documentType: DocumentType;
  language: 'en' | 'fil';
  onStage?: (stage: StageId) => void;
  /** Extraction progress (parts asked / parts to ask, page of the last part) for engines that report it. */
  onProgress?: (done: number, total: number, page?: number) => void;
  /**
   * Findings found so far, while extraction runs (engines that report per block).
   * Each batch passes the evidence gate first; called with the full accumulated list.
   * Display only: the finished AnalysisRun is computed exactly as without it.
   */
  onFindings?: (accepted: Finding[]) => void;
  signal?: AbortSignal;
}

/** Cheap, stable content hash (FNV-1a) for provenance keys — not for security. */
export function hashPages(pages: DocumentPage[]): string {
  let h = 0x811c9dc5;
  const text = pages.flatMap((p) => p.blocks.map((b) => `${b.id}:${b.text}`)).join('\n');
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

function blockConfirmed(pages: DocumentPage[], f: Finding): boolean {
  if (!f.evidence) return false;
  const b = findBlock(pages, f.evidence.page, f.evidence.blockId);
  return Boolean(b && (b.verifiedAt || b.correctedAt || !b.critical));
}

const LATE_FEE_WORDS = /\b(?:late\s+(?:fee|charge|payment\s+charge)s?|penalt(?:y|ies)|surcharge|multa)\b/gi;
const INSTALLMENT_WORDS = /\b(?:monthly|installments?|amortizations?|hulog)\b/gi;

/**
 * The amount a finding is about. A block can state several ("installment of P2,000 …
 * late fee of P500"), so: the gate-checked normalizedValue if it is in the text; the
 * only amount if there is one; else the first amount after the term's keyword.
 * Ambiguous → null, so the scenario reports insufficient information.
 */
function amountFor(text: string, f: Finding, keyword: RegExp): number | null {
  const amounts = moneyMatchesIn(text);
  if (!amounts.length) return null;
  const claimed = f.normalizedValue ? parsePhpAmount(f.normalizedValue) : null;
  if (claimed !== null && amounts.some((a) => a.value === claimed)) return claimed;
  if (new Set(amounts.map((a) => a.value)).size === 1) return amounts[0]!.value;
  for (const m of text.matchAll(keyword)) {
    const after = amounts.find((a) => a.index > (m.index ?? 0));
    if (after) return after.value;
  }
  return null;
}

/** Deterministically derive numeric facts from accepted, source-linked findings. */
export function deriveFacts(pages: DocumentPage[], findings: Finding[]): ExtractedFact[] {
  const facts: ExtractedFact[] = [];
  for (const f of findings) {
    if (!f.evidence || f.reviewStatus === 'unable_to_verify') continue;
    const source = findBlock(pages, f.evidence.page, f.evidence.blockId);
    if (!source) continue;
    const confirmedByUser = blockConfirmed(pages, f);
    const text = source.text;

    if (f.type === 'late_fee') {
      const n = amountFor(text, f, LATE_FEE_WORDS);
      if (n !== null && /fixed|flat/i.test(text)) {
        facts.push({ id: `fact_${f.id}`, key: 'late_fee_fixed', value: n, evidence: f.evidence, confirmedByUser });
      }
    } else if (f.type === 'payment_amount' && /monthly|installment/i.test(text) && !/total/i.test(text)) {
      const n = amountFor(text, f, INSTALLMENT_WORDS);
      if (n !== null) facts.push({ id: `fact_${f.id}`, key: 'installment_amount', value: n, evidence: f.evidence, confirmedByUser });
    } else if (f.type === 'due_date') {
      const m = /(\d{1,2})(?:st|nd|rd|th)/i.exec(text);
      if (m?.[1]) facts.push({ id: `fact_${f.id}`, key: 'due_day', value: Number(m[1]), evidence: f.evidence, confirmedByUser });
    }
  }
  return facts;
}

export function deriveQuestions(findings: Finding[]): ClarificationQuestion[] {
  return findings.flatMap((f) =>
    f.questions.map((text, i) => ({ id: `${f.id}_q${i}`, text, findingId: f.id, evidence: f.evidence, edited: false })),
  );
}

function validateComprehension(raw: unknown[], pages: DocumentPage[]): ComprehensionItem[] {
  return raw.flatMap((r) => {
    const parsed = ComprehensionItem.safeParse(r);
    if (!parsed.success) return [];
    if ([parsed.data.prompt, ...parsed.data.choices.map((c) => c.label)].some(containsVerdict)) return [];
    const { evidence } = parsed.data;
    const b = findBlock(pages, evidence.page, evidence.blockId);
    return b && normalizeText(b.text).includes(normalizeText(evidence.quote)) ? [parsed.data] : [];
  });
}

export async function runAnalysis(opts: RunOptions): Promise<AnalysisRun> {
  const { engine, pages, signal, onStage } = opts;
  const startedAt = new Date().toISOString();

  onStage?.('organize');
  throwIfAborted(signal);

  onStage?.('extract');
  const { onFindings } = opts;
  let found: Finding[] = [];
  const onCandidates = onFindings
    ? (batch: unknown[]) => {
        // Never show ungated output: each partial batch goes through the evidence gate.
        const { accepted } = validateCandidates(batch, pages);
        if (!accepted.length || signal?.aborted) return;
        found = [...found, ...accepted];
        onFindings(found);
      }
    : undefined;
  const raw = await engine.llm.extract(
    { pages, documentType: opts.documentType, language: opts.language, onProgress: opts.onProgress, onCandidates },
    signal,
  );

  onStage?.('validate');
  throwIfAborted(signal);
  const { accepted, rejected } = validateCandidates(raw.findings, pages);

  onStage?.('explain');
  const rawComprehension = engine.llm.comprehend
    ? await engine.llm.comprehend({ pages, findings: accepted, language: opts.language }, signal)
    : raw.comprehension;
  throwIfAborted(signal);
  const comprehension = validateComprehension(rawComprehension, pages);
  const facts = deriveFacts(pages, accepted);
  const questions = deriveQuestions(accepted);

  onStage?.('save');
  throwIfAborted(signal);

  const failed = new Set(raw.incompletePages ?? []);
  const pagesRead = pages.filter((p) => p.blocks.length > 0 && !failed.has(p.number)).length;
  return {
    id: `run_${Date.now().toString(36)}`,
    startedAt,
    finishedAt: new Date().toISOString(),
    engine: {
      kind: engine.info.kind,
      modelName: engine.info.llmModel,
      modelChecksum: engine.info.checksum,
      promptVersion: engine.info.promptVersion,
    },
    sourceHash: hashPages(pages),
    ocrRevision: opts.ocrRevision,
    findings: accepted,
    facts,
    comprehension,
    questions,
    rejectedCount: rejected.length,
    coverage: {
      pagesRead,
      pagesTotal: pages.length,
      incomplete: pagesRead < pages.length,
    },
  };
}
