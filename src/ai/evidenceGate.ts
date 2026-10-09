/**
 * Evidence gate — the code-enforced guardrails from PRD §05 and §12.
 * All model output is untrusted. A candidate finding is accepted only when it
 * parses against the schema and its evidence points to a real OCR block whose
 * current (possibly user-corrected) text contains the quoted excerpt.
 */
import { Finding, type DocumentPage, type OcrBlock } from '@/domain/schema';
import { parsePhpAmount } from './scenarioRules';

/** Below this OCR confidence a critical block is treated as unreadable. */
export const LOW_CONFIDENCE = 0.7;

export type RejectionReason = 'malformed' | 'unknown_source' | 'quote_mismatch' | 'value_not_in_source';

export interface GateResult {
  accepted: Finding[];
  rejected: { id: string; reason: RejectionReason }[];
}

export function normalizeText(s: string): string {
  return s
    .normalize('NFKC')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export function findBlock(pages: DocumentPage[], pageNo: number, blockId: string): OcrBlock | undefined {
  return pages.find((p) => p.number === pageNo)?.blocks.find((b) => b.id === blockId);
}

function candidateId(raw: unknown, index: number): string {
  if (raw && typeof raw === 'object' && 'id' in raw && typeof raw.id === 'string') return raw.id;
  return `candidate_${index}`;
}

export function validateCandidates(candidates: unknown[], pages: DocumentPage[]): GateResult {
  const accepted: Finding[] = [];
  const rejected: GateResult['rejected'] = [];

  candidates.forEach((raw, index) => {
    const parsed = Finding.safeParse(raw);
    if (!parsed.success) {
      rejected.push({ id: candidateId(raw, index), reason: 'malformed' });
      return;
    }
    const finding = parsed.data;

    // No evidence → the app may show it only as an explicit abstention.
    if (!finding.evidence) {
      accepted.push({ ...finding, reviewStatus: 'unable_to_verify' });
      return;
    }

    const { page, blockId, quote } = finding.evidence;
    const source = findBlock(pages, page, blockId);
    if (!source) {
      rejected.push({ id: finding.id, reason: 'unknown_source' });
      return;
    }
    if (!normalizeText(source.text).includes(normalizeText(quote))) {
      rejected.push({ id: finding.id, reason: 'quote_mismatch' });
      return;
    }

    // Monetary values must agree with readable source characters.
    if (finding.normalizedValue) {
      const claimed = parsePhpAmount(finding.normalizedValue);
      if (claimed !== null && !amountsIn(source.text).includes(claimed)) {
        rejected.push({ id: finding.id, reason: 'value_not_in_source' });
        return;
      }
    }

    if (source.critical && source.confidence < LOW_CONFIDENCE && !source.correctedAt) {
      accepted.push({
        ...finding,
        reviewStatus: 'unable_to_verify',
        uncertainty: 'The source text for this item may have been misread. Check the scan before relying on it.',
      });
      return;
    }

    accepted.push(finding);
  });

  return { accepted, rejected };
}

function amountsIn(text: string): number[] {
  const out: number[] = [];
  const re = /(?:PHP|₱|\bP)\s?[\d,]+(?:\.\d+)?/gi;
  for (const m of text.matchAll(re)) {
    const n = parsePhpAmount(m[0]);
    if (n !== null) out.push(n);
  }
  return out;
}
