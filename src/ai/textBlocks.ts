/**
 * Turns plain page text (e.g. a PDF text layer) into evidence blocks with
 * stable ids, so findings can cite `p{page}_b{n}` exactly like OCR output.
 */
import type { OcrBlock } from '@/domain/schema';

const MONTHS = 'jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?';

const CRITICAL_PATTERNS = [
  /(?:PHP|₱|\bP)\s?\d/i, // money
  /\b\d{1,2}(?:st|nd|rd|th)\b/i, // "15th day"
  new RegExp(`\\b(?:${MONTHS})\\.?\\s+\\d{1,2}`, 'i'), // "March 3"
  /\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/, // 03/15/2026
  /\bbetween\b[\s\S]*\(\s*["“]?[A-Z]/, // parties: between X ("Client") and Y
];

/** Amounts, dates and party names — details the user must check before calculations rely on them. */
export function isCriticalText(text: string): boolean {
  return CRITICAL_PATTERNS.some((re) => re.test(text));
}

const ENDS_SENTENCE = /[.;:!?]["'”’)]*$/;
export const endsSentence = (line: string) => ENDS_SENTENCE.test(line);
export const isHeading = (line: string) => line.length <= 80 && /[A-Z]/.test(line) && line === line.toUpperCase() && !ENDS_SENTENCE.test(line);

export function pageTextToBlocks(page: number, raw: string): OcrBlock[] {
  const texts: string[] = [];
  let current = '';
  const flush = () => {
    const t = current.replace(/\s+/g, ' ').trim();
    if (t) texts.push(t);
    current = '';
  };

  for (const line of raw.replace(/\r/g, '').split('\n').map((l) => l.trim())) {
    if (!line) {
      flush();
      continue;
    }
    if (isHeading(line)) {
      flush();
      current = line;
      flush();
      continue;
    }
    current = current ? `${current} ${line}` : line;
    if (ENDS_SENTENCE.test(line)) flush();
  }
  flush();

  return texts.map((text, i) => ({
    id: `p${page}_b${i + 1}`,
    page,
    text,
    originalText: text,
    confidence: 1,
    // Text layers carry no geometry here; full-width placeholder keeps the schema valid.
    bbox: { x: 0, y: 0, w: 1, h: 0 },
    critical: isCriticalText(text),
    origin: 'pdf_text' as const,
  }));
}
