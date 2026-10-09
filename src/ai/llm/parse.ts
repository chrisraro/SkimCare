/**
 * Turns raw model text into a finding candidate. This is only a shape mapping
 * (snake_case → domain fields, citation from the unit's own block); it does NOT
 * decide what is true. Every candidate still goes through `validateCandidates`.
 */
import type { FindingType } from '@/domain/schema';
import { moneyAmountsIn } from '../evidenceGate';
import type { ExtractionUnit } from './chunking';

export type ParseResult = { ok: true; candidates: unknown[] } | { ok: false; error: 'no_json' | 'invalid_json' | 'wrong_shape' };

/** Readable fallback when the model leaves the title empty or echoes the type name. */
export const TYPE_TITLES: Record<'en' | 'fil', Record<FindingType, string>> = {
  en: {
    payment_condition: 'Payment condition',
    payment_amount: 'Payment amount',
    due_date: 'Due date',
    late_fee: 'Late fee or penalty',
    deliverables: 'What must be delivered',
    revisions: 'Revisions',
    ownership: 'Ownership',
    termination: 'Ending the agreement',
    notice_period: 'Notice period',
    party: 'Who the parties are',
    other: 'Other term',
  },
  fil: {
    payment_condition: 'Kondisyon ng bayad',
    payment_amount: 'Halaga ng bayad',
    due_date: 'Petsa ng bayad',
    late_fee: 'Multa sa pagkaantala',
    deliverables: 'Mga dapat ihatid',
    revisions: 'Mga rebisyon',
    ownership: 'Pagmamay-ari',
    termination: 'Pagtatapos ng kasunduan',
    notice_period: 'Paunawa',
    party: 'Mga partido',
    other: 'Iba pang termino',
  },
};

/** Strips Qwen3 reasoning blocks and Markdown fences, then returns the outermost JSON object text. */
export function extractJsonText(output: string): string | null {
  const cleaned = output
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/<think>[\s\S]*$/i, '') // unterminated reasoning: nothing usable after it
    .replace(/```(?:json)?/gi, '');
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  return start >= 0 && end > start ? cleaned.slice(start, end + 1) : null;
}

const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);

function readableTitle(title: unknown, type: unknown, language: 'en' | 'fil'): unknown {
  const t = str(title);
  const known = typeof type === 'string' && type in TYPE_TITLES[language] ? (type as FindingType) : undefined;
  if (known && (!t || /^[a-z]+(_[a-z]+)*$/.test(t))) return TYPE_TITLES[language][known];
  return title;
}

export function parseModelOutput(output: string, unit: ExtractionUnit, language: 'en' | 'fil' = 'en'): ParseResult {
  const json = extractJsonText(output);
  if (!json) return { ok: false, error: 'no_json' };
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    return { ok: false, error: 'invalid_json' };
  }
  const d = data as { relevant?: unknown; finding?: unknown } | null;
  if (!d || typeof d.relevant !== 'boolean') return { ok: false, error: 'wrong_shape' };
  if (!d.relevant || !d.finding || typeof d.finding !== 'object') return { ok: true, candidates: [] };

  const r = d.finding as Record<string, unknown>;
  const { block } = unit;
  return {
    ok: true,
    candidates: [
      {
        id: `${block.id}_f`,
        type: r.type,
        title: readableTitle(r.title, r.type, language),
        // A money value only means something if the block has an amount; otherwise the model copied it from elsewhere.
        normalizedValue: moneyAmountsIn(block.text).length ? str(r.normalized_value) : undefined,
        // The citation is the block the model was asked about — never model-written.
        evidence: { page: block.page, blockId: block.id, quote: block.text },
        explanation: r.explanation,
        uncertainty: str(r.uncertainty),
        reviewStatus: r.review_status,
        questions: Array.isArray(r.questions) ? r.questions.filter((q) => typeof q === 'string' && q.trim()) : [],
      },
    ],
  };
}
