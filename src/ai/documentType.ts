/** Keyword guess of the document type, shared by the phone and browser engines; the user confirms or changes it on S09. */
import type { DocumentPage, DocumentType } from '@/domain/schema';

const TYPE_HINTS: [DocumentType, RegExp][] = [
  ['installment_agreement', /\b(installment|instal(l)?ments?|hulugan|hulog|amorti[sz]ation|down ?payment)\b/i],
  ['lease', /\b(lease|lessor|lessee|rent|upa|paupahan|umuupa)\b/i],
  ['employment', /\b(employ(er|ee|ment)|salary|sahod|probation(ary)?)\b/i],
  ['service_agreement', /\b(services?|deliverables?|provider|consultant|designer|developer|serbisyo)\b/i],
];

export function guessDocumentType(pages: DocumentPage[]): { type: DocumentType; confidence: number } {
  const text = pages.flatMap((p) => p.blocks.map((b) => b.text)).join(' ');
  const hit = TYPE_HINTS.find(([, re]) => re.test(text));
  return hit ? { type: hit[0], confidence: 0.6 } : { type: 'other', confidence: 0.3 };
}
