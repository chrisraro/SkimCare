/**
 * Deterministic scenario engine — PRD §06 A. Financial math never runs in the LLM.
 * Rules compute only from facts the user has confirmed against the source, and
 * return "insufficient information" instead of inventing a missing term.
 */
import type { ExtractedFact, ScenarioResult } from '@/domain/schema';

const PHP_RE = /(?:PHP|₱|\bP)\s?([\d,]+(?:\.\d+)?)/i;

export function parsePhpAmount(text: string): number | null {
  const match = PHP_RE.exec(text);
  if (!match?.[1]) return null;
  const n = Number(match[1].replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}

const phpFormatter = new Intl.NumberFormat('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function formatPhp(amount: number): string {
  return `₱${phpFormatter.format(amount)}`;
}

/** Work in centavos to avoid floating point drift. */
const toCentavos = (n: number) => Math.round(n * 100);
const fromCentavos = (c: number) => c / 100;

function confirmedNumber(facts: ExtractedFact[], key: ExtractedFact['key']): ExtractedFact | undefined {
  const fact = facts.find((f) => f.key === key);
  return fact && fact.confirmedByUser && typeof fact.value === 'number' ? fact : undefined;
}

export const LATE_INSTALLMENT_RULE = 'late_installment_fixed_fee';

export function lateInstallmentScenario(facts: ExtractedFact[]): ScenarioResult {
  const installment = confirmedNumber(facts, 'installment_amount');
  const lateFee = confirmedNumber(facts, 'late_fee_fixed');

  if (!installment || !lateFee) {
    return {
      id: `${LATE_INSTALLMENT_RULE}_insufficient`,
      ruleId: LATE_INSTALLMENT_RULE,
      status: 'insufficient_information',
      inputs: [],
      outputs: [],
      assumptions: [
        !installment
          ? 'No confirmed installment amount was found in the agreement.'
          : 'No confirmed fixed late charge was found in the agreement.',
        'SkimCare will not guess a fee the document does not state.',
      ],
      evidence: [installment?.evidence, lateFee?.evidence].filter((e) => e !== undefined),
    };
  }

  const base = installment.value as number;
  const fee = lateFee.value as number;
  const late = fromCentavos(toCentavos(base) + toCentavos(fee));

  return {
    id: `${LATE_INSTALLMENT_RULE}_computed`,
    ruleId: LATE_INSTALLMENT_RULE,
    status: 'computed',
    inputs: [
      { label: 'Installment amount', value: formatPhp(base), factId: installment.id },
      { label: 'Fixed late charge', value: formatPhp(fee), factId: lateFee.id },
    ],
    outputs: [
      { label: 'On-time payment', value: formatPhp(base) },
      { label: 'Paid after the due date', value: formatPhp(late) },
    ],
    assumptions: [
      'Applies to a single installment paid after its due date.',
      'Uses only the fixed late charge stated in the agreement — no interest or other fees.',
      'Does not decide whether this charge is legally allowed.',
    ],
    evidence: [installment.evidence, lateFee.evidence],
  };
}
