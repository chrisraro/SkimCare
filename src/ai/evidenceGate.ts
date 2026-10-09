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

export type RejectionReason = 'malformed' | 'verdict_language' | 'unknown_source' | 'quote_mismatch' | 'value_not_in_source';

/*
 * Verdict language (PRD §05, §14): the app explains what the text says; it never
 * calls a clause legal/illegal, fair/unfair or safe, and never says whether to sign.
 * Patterns run on normalizeText() output (lowercase, straight quotes). They target
 * verdicts about the agreement itself, so factual paraphrase ("the Client must sign
 * the acceptance form", "at fair market value", "not legally yours until paid") passes.
 */
const SUBJECT = '(?:clause|contract|agreement|term|provision|condition|deal|document|fee|penalty|charge|interest|rate)s?';
const VERDICT =
  '(?:illegal|unlawful|lawful|legal|enforceable|unenforceable|fair|unfair|safe|unsafe|predatory|abusive|exploitative|legit(?:imate)?|a scam|null and void|void|legally (?:valid|invalid|void)|reasonable|unreasonable|excessive|acceptable|unacceptable)';
const FIL_SUBJECT = '(?:kontrata|kasunduan|sugnay|probisyon|termino|kondisyon|multa|singil)(?:ng)?';
const FIL_VERDICT =
  '(?:ligtas|legal|ilegal|labag sa batas|patas|hindi patas|makatarungan|hindi makatarungan|walang bisa|labis|sobra|makatwiran|hindi makatwiran)';
const SIGN = '(?:pumirma|pirmahan|lumagda|lagdaan)';

const VERDICT_PATTERNS: RegExp[] = [
  // "this clause is completely legal", "the late fee seems unfair"
  new RegExp(
    `\\b(?:this|the|that|these|those|your)\\s+(?:\\S+\\s+){0,2}${SUBJECT}\\s+(?:is|are|seems?|looks?|appears?|sounds?|may be|might be|could be|is not|isn't|are not|aren't)\\s+(?:to be\\s+)?(?:(?:very|completely|totally|perfectly|clearly|probably|likely|generally|quite|legally|not)\\s+)?${VERDICT}\\b`,
  ),
  /\b(?:against the law|violates? (?:the )?law|breaks? the law|is a scam)\b/,
  // Pronoun subjects: "this is illegal under Philippine law", "it seems unfair"
  new RegExp(`\\b(?:this|it|that)\\s+(?:is|seems|looks|appears|sounds)\\s+(?:(?:very|completely|totally|clearly|probably|likely|quite|legally)\\s+)?${VERDICT}\\b`),
  // Reassurance: "a standard clause", "nothing to worry about"
  /\b(?:this|it|that)\s+is\s+(?:a\s+|an\s+)?(?:standard|normal|typical|common)\s+(?:clause|term|provision|contract|agreement|fee|penalty|charge)\b/,
  /\bnothing to worry about\b/,
  // Sign advice
  /\byou\s+(?:can|may|could)\s+(?:safely\s+|now\s+)?sign\b/,
  /\bsigning\s+(?:this|the|it)\b(?:\s+\S+){0,3}?\s+(?:is|seems|looks)\s+(?:\w+\s+)?(?:fine|ok|okay|safe|good|wise|risky|a good idea)\b/,
  /\b(?:safe|okay|ok|fine|good|wise|risky|dangerous|unsafe)\s+to\s+sign\b/,
  /\b(?:should(?:n't| not)?|don't|do not|never|can safely)\s+sign\s+(?:this|the|it)\b(?:\s+(?:contract|agreement|document))?(?!\s+(?:\S+\s+)?(?:form|receipt|certificate|report|slip|acknowledg))/,
  /\b(?:recommend|advise|suggest)\w*\s+(?:that\s+)?(?:you\s+)?(?:not\s+)?(?:to\s+)?sign(?:ing)?\b/,
  /\bgo ahead and sign\b/,
  // Filipino: "ligtas ang kontratang ito", "ang sugnay na ito ay hindi patas", "huwag pirmahan"
  new RegExp(`\\b${FIL_VERDICT}\\s+(?:ang|itong)\\s+(?:\\S+\\s+)?${FIL_SUBJECT}\\b`),
  new RegExp(`\\b${FIL_SUBJECT}\\s+(?:\\S+\\s+){0,3}ay\\s+(?:\\S+\\s+)?${FIL_VERDICT}\\b`),
  /\blabag sa batas\b/,
  new RegExp(`\\b(?:ligtas|okay|ok|mabuting|delikadong|mapanganib)\\s+(?:na\\s+|nang\\s+)?${SIGN}\\b`),
  new RegExp(`\\b(?:huwag|wag)\\s+(?:mo(?:ng)?\\s+)?(?:munang\\s+)?${SIGN}\\b`),
  new RegExp(`\\b(?:dapat|puwede|pwede|maaari)\\s+mo(?:ng)?\\s+(?:nang\\s+)?${SIGN}\\s+(?:ang|itong)\\s+(?:${FIL_SUBJECT})`),
];

/** True when model-written text passes judgement on the agreement or advises on signing. */
export function containsVerdict(text: string): boolean {
  const t = normalizeText(text);
  return VERDICT_PATTERNS.some((re) => re.test(t));
}

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

    const modelText = [finding.title, finding.explanation, finding.uncertainty ?? '', ...finding.questions];
    if (modelText.some(containsVerdict)) {
      rejected.push({ id: finding.id, reason: 'verdict_language' });
      return;
    }

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
    const sourceAmounts = moneyAmountsIn(source.text);
    if (finding.normalizedValue) {
      const claimed = parsePhpAmount(finding.normalizedValue);
      if (claimed !== null && !sourceAmounts.includes(claimed)) {
        rejected.push({ id: finding.id, reason: 'value_not_in_source' });
        return;
      }
    }
    // Amounts written in the model's own words must be in the cited text too:
    // no arithmetic in the model and no numbers borrowed from other clauses.
    // Questions are shown and can be copied to the other party, so they are held to the same rule.
    const written = [finding.title, finding.explanation, finding.uncertainty ?? '', ...finding.questions].flatMap(moneyAmountsIn);
    if (written.some((n) => !sourceAmounts.includes(n))) {
      rejected.push({ id: finding.id, reason: 'value_not_in_source' });
      return;
    }

    // Hard-to-read details count once the user has fixed them or confirmed they match the paper (S08).
    if (source.critical && source.confidence < LOW_CONFIDENCE && !source.correctedAt && !source.verifiedAt) {
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

/** Peso amounts in a text with their position: "PHP 500", "₱500", "P500", and "500 pesos" / "500 piso". */
export function moneyMatchesIn(text: string): { value: number; index: number }[] {
  const out: { value: number; index: number }[] = [];
  const prefixed = /(?:PHP|₱|\bP)\s?\d[\d,]*(?:\.\d+)?/gi;
  for (const m of text.matchAll(prefixed)) {
    const n = parsePhpAmount(m[0]);
    if (n !== null) out.push({ value: n, index: m.index ?? 0 });
  }
  const suffixed = /\b(\d[\d,]*(?:\.\d+)?)\s*(?:pesos?|piso)\b/gi;
  for (const m of text.matchAll(suffixed)) {
    const n = Number(m[1]!.replace(/,/g, ''));
    if (Number.isFinite(n)) out.push({ value: n, index: m.index ?? 0 });
  }
  return out.sort((a, b) => a.index - b.index);
}

/** Peso amounts written in a text, in reading order. */
export function moneyAmountsIn(text: string): number[] {
  return moneyMatchesIn(text).map((m) => m.value);
}
