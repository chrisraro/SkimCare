/**
 * Recognize stage (PRD §11): choose the most reliable local text source.
 *   digital PDF  → embedded text layer (exact)
 *   scanned PDF / photos → on-device OCR engine
 */
import type { DocumentPage } from '@/domain/schema';
import type { CapturedPage, InferenceEngine } from './engines';
import { extractPdfTextLayer } from './sources/pdfTextLayer';

export type TextSource = 'pdf_text' | 'ocr';

export interface RecognizeResult {
  pages: DocumentPage[];
  source: TextSource;
  /** Plain-language note for the user about how the text was obtained. */
  note?: string;
}

export class RecognizeError extends Error {}

export async function recognizeDocument(opts: {
  engine: InferenceEngine;
  captured: CapturedPage[];
  pdfUri?: string;
  signal?: AbortSignal;
}): Promise<RecognizeResult> {
  if (opts.pdfUri) {
    const pdf = await extractPdfTextLayer(opts.pdfUri);
    switch (pdf.status) {
      case 'ok':
        return { pages: pdf.pages, source: 'pdf_text', note: 'Text was read directly from the PDF — no scanning errors.' };
      case 'password_required':
        throw new RecognizeError('This PDF is password-protected. Open it elsewhere and export an unlocked copy.');
      case 'no_text_layer':
        // TODO(native): render scanned PDF pages to images, then OCR them.
        throw new RecognizeError(
          'This PDF is a scan with no text inside. Photograph or scan the paper pages instead — scanned-PDF support is coming.',
        );
      case 'unavailable':
      case 'error':
        // Fall through to the OCR engine (Demo engine in Expo Go / web).
        break;
    }
  }
  const pages = await opts.engine.ocr.recognize(opts.captured, opts.signal);
  return { pages, source: 'ocr' };
}
