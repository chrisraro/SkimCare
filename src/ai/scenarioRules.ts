/**
 * Deterministic scenario engine — PRD §06 A. Financial math never runs in the LLM.
 * Rules compute only from facts the user has confirmed against the source, and
 * return "insufficient information" instead of inventing a missing term.
 */
import type { ExtractedFact, ScenarioResult } from '@/domain/schema';

// The amount must start with a digit: "Ana P, Reyes" is a name, not ₱0.
const PHP_RE = /(?:PHP|₱|\bP)\s?(\d[\d,]*(?:\.\d+)?)/i;

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

interface Pick {
  fact?: ExtractedFact;
  /** The document states more than one value for this term. */
  conflict: boolean;
}

/**
 * A term can be extracted more than once (e.g. a clause and a payment schedule).
 * Any confirmed copy counts, but if the copies disagree on the value the scenario
 * must not pick one: that is insufficient information.
 */
function confirmedNumber(facts: ExtractedFact[], key: ExtractedFact['key']): Pick {
  const all = facts.filter((f) => f.key === key && typeof f.value === 'number');
  const values = new Set(all.map((f) => toCentavos(f.value as number)));
  if (values.size > 1) return { conflict: true };
  return { fact: all.find((f) => f.confirmedByUser), conflict: false };
}

export const LATE_INSTALLMENT_RULE = 'late_installment_fixed_fee';

export function lateInstallmentScenario(facts: ExtractedFact[]): ScenarioResult {
  const installmentPick = confirmedNumber(facts, 'installment_amount');
  const lateFeePick = confirmedNumber(facts, 'late_fee_fixed');
  const installment = installmentPick.fact;
  const lateFee = lateFeePick.fact;

  if (!installment || !lateFee) {
    const reason = installmentPick.conflict
      ? 'The agreement states more than one installment amount, so there is no single figure to use.'
      : lateFeePick.conflict
        ? 'The agreement states more than one late charge, so there is no single figure to use.'
        : !installment
          ? 'No confirmed installment amount was found in the agreement.'
          : 'No confirmed fixed late charge was found in the agreement.';
    return {
      id: `${LATE_INSTALLMENT_RULE}_insufficient`,
      ruleId: LATE_INSTALLMENT_RULE,
      status: 'insufficient_information',
      inputs: [],
      outputs: [],
      assumptions: [reason, 'SkimCare will not guess a fee the document does not state.'],
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
