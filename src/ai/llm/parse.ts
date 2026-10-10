/**
 * Turns raw model text into a finding candidate. This is only a shape mapping
 * (compact keys → domain fields, citation from the unit's own block, a type the block
 * contradicts relabelled by typeCheck.ts); it does NOT
 * decide what is true. Every candidate still goes through `validateCandidates`.
 */
import { FindingType } from '@/domain/schema';
import type { ExtractionUnit } from './chunking';
import { STATUS_WORDS } from './prompt';
import { checkFindingType } from './typeCheck';

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

type JsonError = { ok: false; error: 'no_json' | 'invalid_json' | 'wrong_shape' };

function parseJson(output: string): { ok: true; data: Record<string, unknown> } | JsonError {
  const json = extractJsonText(output);
  if (!json) return { ok: false, error: 'no_json' };
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    return { ok: false, error: 'invalid_json' };
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return { ok: false, error: 'wrong_shape' };
  return { ok: true, data: data as Record<string, unknown> };
}

export type TriageResult = { ok: true; type: FindingType | null } | JsonError;

/**
 * Pass 1 reply → the block's type, or null for "not a term". A type the block
 * contradicts is relabelled in code (typeCheck.ts) before the explanation is asked,
 * so the explanation is written for the checked type.
 */
export function parseTriageOutput(output: string, blockText: string): TriageResult {
  const parsed = parseJson(output);
  if (!parsed.ok) return parsed;
  const t = parsed.data.t;
  if (t === 'none') return { ok: true, type: null };
  const known = FindingType.safeParse(t);
  if (!known.success) return { ok: false, error: 'wrong_shape' };
  return { ok: true, type: checkFindingType(known.data, blockText) };
}

/**
 * Pass 2 reply → one finding candidate for the block the model was asked about.
 * The type comes from pass 1 (already checked), never from this reply.
 */
export function parseExplainOutput(output: string, unit: ExtractionUnit, type: FindingType, language: 'en' | 'fil' = 'en'): ParseResult {
  const parsed = parseJson(output);
  if (!parsed.ok) return parsed;
  const r = parsed.data;
  if (typeof r.e !== 'string') return { ok: false, error: 'wrong_shape' };
  const { block } = unit;
  const status = typeof r.s === 'string' && r.s in STATUS_WORDS ? STATUS_WORDS[r.s as keyof typeof STATUS_WORDS] : undefined;
  const question = str(r.q);
  return {
    ok: true,
    candidates: [
      {
        id: `${block.id}_f`,
        type,
        title: readableTitle(r.title, type, language),
        // The citation is the block the model was asked about — never model-written.
        // Fields outside the schema (e.g. a model-written amount) are ignored.
        evidence: { page: block.page, blockId: block.id, quote: block.text },
        explanation: r.e,
        // An unknown status stays undefined, so the evidence gate rejects the candidate as malformed.
        reviewStatus: status,
        questions: question ? [question] : [],
      },
    ],
  };
}
