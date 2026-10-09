import type { DocumentPage, DocumentType } from '@/domain/schema';

/**
 * Keyword guess of the document type, shared by the phone and browser engines; the user
 * confirms or changes it on S09.
 * Every hit counts (weight 2 for words specific to the type, 1 for weaker ones) and
 * the highest total wins; a tie is "other". Taking the first match misread a services
 * contract as "employment" because it said there was no employer-employee relationship.
 */
const TYPE_HINTS: [DocumentType, number, RegExp][] = [
  ['installment_agreement', 2, /\b(?:installments?|instal(?:l)?ments?|hulugan|hulog|amorti[sz]ations?|down ?payment|contract to sell|conditional sale)\b/gi],
  ['lease', 2, /\b(?:lease[ds]?|lessor|lessee|sublease|tenant|landlord|upa|paupahan|umuupa)\b/gi],
  ['lease', 1, /\b(?:rent(?:al)?|premises)\b/gi],
  ['employment', 2, /\b(?:employ(?:er|ee|ment)s?|salary|sahod|probationary|payroll)\b/gi],
  ['employment', 1, /\b(?:probation|wages?|overtime)\b/gi],
  ['service_agreement', 2, /\b(?:services?|deliverables?|consultan(?:t|cy)|independent contractor|serbisyo|scope of work)\b/gi],
  ['service_agreement', 1, /\b(?:provider|designer|developer|freelance|client|kliyente|engage(?:s|ment)?)\b/gi],
];

/** Statements that the agreement is NOT employment; removed before counting. */
const NOT_EMPLOYMENT = [
  /\bno\s+employer[\s–—-]+employee\s+relationship\b/gi,
  /\b(?:does|do|shall|will)\s+not\s+(?:create|establish|constitute)\s+(?:an?\s+)?(?:employer[\s–—-]+employee|employment)\s+relationship\b/gi,
  /\bnothing\b[^.;]{0,80}\b(?:employer[\s–—-]+employee|employment)\s+relationship\b/gi,
  /\b(?:is|are|be)\s+not\s+(?:(?:considered|deemed|construed)\s+(?:as\s+)?)?(?:an?\s+)?(?:employees?|employers?)\b/gi,
  /\bnot\s+entitled\s+to\s+employee\s+benefits\b/gi,
  /\bhindi\s+(?:empleyado|employee)\b/gi,
];

export function guessDocumentType(pages: DocumentPage[]): { type: DocumentType; confidence: number } {
  let text = pages.flatMap((p) => p.blocks.map((b) => b.text)).join(' ');
  for (const re of NOT_EMPLOYMENT) text = text.replace(re, ' ');

  const scores = new Map<DocumentType, number>();
  for (const [type, weight, re] of TYPE_HINTS) {
    const hits = text.match(re)?.length ?? 0;
    if (hits) scores.set(type, (scores.get(type) ?? 0) + hits * weight);
  }
  const ranked = [...scores].sort((a, b) => b[1] - a[1]);
  const [best, second] = ranked;
  if (!best || (second && second[1] === best[1])) return { type: 'other', confidence: 0.3 };
  return { type: best[0], confidence: 0.6 };
}
