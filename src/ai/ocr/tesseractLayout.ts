/**
 * Maps Tesseract.js output (web OCR) into the ML Kit-shaped `OcrPageResult` that
 * layout.ts turns into evidence blocks, so ids, reading order, digit repair,
 * `critical` flags and bboxes behave the same on web as on Android.
 *
 * A Tesseract paragraph plays the role of an ML Kit text block. Confidence is
 * 0–100 in Tesseract and 0–1 in ML Kit. Pure, so it is unit-tested without wasm.
 */
import type { OcrBlock } from '@/domain/schema';
import type { OcrLine, OcrPageResult, OcrRect, OcrRegion } from '../../../modules/local-ocr';
import { ocrPageToBlocks } from './layout';

/** The subset of Tesseract.js `Page` this mapping reads. */
export interface TesseractBbox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}
export interface TesseractLine {
  text: string;
  confidence: number;
  bbox: TesseractBbox;
}
export interface TesseractParagraph {
  lines: TesseractLine[];
  bbox: TesseractBbox;
}
export interface TesseractBlock {
  paragraphs: TesseractParagraph[];
  bbox: TesseractBbox;
}

const rect = (b: TesseractBbox): OcrRect => ({ left: b.x0, top: b.y0, right: b.x1, bottom: b.y1 });

const unit = (confidence: number) => (Number.isFinite(confidence) ? Math.min(1, Math.max(0, confidence / 100)) : 0);

export function tesseractToOcrPage(blocks: TesseractBlock[] | null | undefined, width: number, height: number): OcrPageResult {
  const regions: OcrRegion[] = [];
  for (const block of blocks ?? []) {
    for (const paragraph of block.paragraphs ?? []) {
      const lines: OcrLine[] = (paragraph.lines ?? [])
        .map((l) => ({ text: l.text.replace(/\s+/g, ' ').trim(), confidence: unit(l.confidence), frame: rect(l.bbox) }))
        .filter((l) => l.text.length > 0);
      if (lines.length) regions.push({ frame: rect(paragraph.bbox), lines });
    }
  }
  return { width: Math.max(1, width), height: Math.max(1, height), blocks: regions };
}

export function tesseractPageToBlocks(page: number, blocks: TesseractBlock[] | null | undefined, width: number, height: number): OcrBlock[] {
  return ocrPageToBlocks(page, tesseractToOcrPage(blocks, width, height));
}
