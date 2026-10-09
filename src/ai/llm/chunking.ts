/**
 * Splits a document into extraction units: one source block each, with the
 * previous block on the same page as read-only context. A 0.6B model reliably
 * handles "does this one sentence state a term?" but misses most terms when asked
 * to list everything on a page (eval: extract-v1 recall 12%), so extraction runs
 * per block (PRD §10: "perform extraction by page or clause").
 */
import type { DocumentPage, OcrBlock } from '@/domain/schema';
import { looksLikeInstruction } from '../injection';

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

export function extractionUnits(pages: DocumentPage[]): ExtractionUnit[] {
  const units: ExtractionUnit[] = [];
  for (const page of pages) {
    let previous: string | undefined;
    for (const block of page.blocks) {
      // Text addressed to AI tools is never a term: skip it rather than ask the model about it.
      if (!isTrivialBlock(block.text) && !looksLikeInstruction(block.text)) {
        units.push({ index: units.length, page: page.number, block, context: previous });
      }
      previous = block.text;
    }
  }
  return units;
}
