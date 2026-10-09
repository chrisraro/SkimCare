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

export interface RunOptions {
  engine: InferenceEngine;
  pages: DocumentPage[];
  ocrRevision: number;
  documentType: DocumentType;
  language: 'en' | 'fil';
  onStage?: (stage: StageId) => void;
  /** Extraction progress (blocks done / total) for engines that report it. */
  onProgress?: (done: number, total: number) => void;
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
  const raw = await engine.llm.extract(
    { pages, documentType: opts.documentType, language: opts.language, onProgress: opts.onProgress },
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
