/**
 * Splits a document into extraction units: one source block each, with the
 * previous block on the same page as read-only context. A 0.6B model reliably
 * handles "does this one sentence state a term?" but misses most terms when asked
 * to list everything on a page (eval: extract-v1 recall 12%), so extraction runs
 * per block (PRD §10: "perform extraction by page or clause").
 */
import type { DocumentPage, OcrBlock } from '@/domain/schema';
import { looksLikeInstruction } from '../injection';
import { isCriticalText } from '../textBlocks';

export interface ExtractionUnit {
  index: number;
  page: number;
  block: OcrBlock;
  /** Previous block on the same page, for context only — never cited. */
  context?: string;
}

/** Headings and fragments that cannot state a term on their own. */
export function isTrivialBlock(text: string): boolean {
  const t = text.trim();
  if (t.length < 12) return true;
  // A section number ("2.", "3.1") doesn't make a heading a term; other digits (amounts, lot numbers) might.
  const words = t.replace(/^\(?\d{1,2}(?:\.\d{1,2})*[.)]?\s+/, '');
  const isHeading = t.length <= 80 && /[A-Z]/.test(words) && words === words.toUpperCase() && !/\d/.test(words);
  return isHeading;
}

/**
 * Signing and notarial boilerplate: never a term, and often holds ID numbers the
 * model has no reason to see. Each model call costs seconds on a phone, so these
 * are skipped in code. Patterns are narrow; the eval set checks no term is skipped.
 */
const NOT_A_TERM = [
  /\bnotary public\b/i,
  /\bsubscribed and sworn\b/i,
  /^(doc(ument)?|page|book)\.?\s*no\b/i, // notarial register: "Doc. No. 12; Page No. 3; Book No. II"
  /^series of\s+\d{4}\b/i,
  /^in witness whereof\b/i,
  /^(signed )?in the presence of\b/i,
  /\b(ctc|community tax cert(ificate)?|tin|passport|driver'?s licen[cs]e)\b[^.]{0,20}\bno\b/i,
  /^republic of the philippines\b/i,
];

export function isBoilerplate(text: string): boolean {
  return NOT_A_TERM.some((re) => re.test(text.trim()));
}

/** Short lines that repeat on two or more pages (letterhead, footer, "Page 3 of 10") are not terms. */
const REPEATED_MAX_CHARS = 100;
const repeatKey = (text: string) => text.toLowerCase().replace(/\d+/g, '#').replace(/\s+/g, ' ').trim();

function repeatedAcrossPages(pages: DocumentPage[]): Set<string> {
  const pagesByKey = new Map<string, Set<number>>();
  for (const page of pages) {
    for (const block of page.blocks) {
      if (block.text.length > REPEATED_MAX_CHARS) continue;
      const key = repeatKey(block.text);
      const seen = pagesByKey.get(key) ?? new Set<number>();
      seen.add(page.number);
      pagesByKey.set(key, seen);
    }
  }
  // Letterheads and footers repeat on many pages (or on every page of a short document);
  // a term restated once in a summary is still a term. Money/date lines are never
  // treated as page furniture (see extractionUnits).
  const everyPage = pages.length >= 2 ? pages.length : Infinity;
  return new Set(
    [...pagesByKey].filter(([, seen]) => seen.size >= Math.min(REPEATED_MIN_PAGES, everyPage)).map(([key]) => key),
  );
}

const REPEATED_MIN_PAGES = 3;

export function extractionUnits(pages: DocumentPage[]): ExtractionUnit[] {
  const repeated = repeatedAcrossPages(pages);
  const units: ExtractionUnit[] = [];
  for (const page of pages) {
    let previous: string | undefined;
    for (const block of page.blocks) {
      const skip =
        isTrivialBlock(block.text) ||
        // Text addressed to AI tools is never a term: skip it rather than ask the model about it.
        looksLikeInstruction(block.text) ||
        isBoilerplate(block.text) ||
        (block.text.length <= REPEATED_MAX_CHARS && !isCriticalText(block.text) && repeated.has(repeatKey(block.text)));
      if (!skip) units.push({ index: units.length, page: page.number, block, context: previous });
      // Text kept away from the model must not reach it as the next block's context either.
      previous = looksLikeInstruction(block.text) || isBoilerplate(block.text) ? undefined : block.text;
    }
  }
  return units;
}
