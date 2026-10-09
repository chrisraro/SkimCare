/**
 * Recognize stage (PRD §11): choose the most reliable local text source.
 *   digital PDF  → embedded text layer (exact)
 *   scanned PDF  → pages rendered and recognized on the device (OCR engine)
 *   mixed PDF    → text layer, plus OCR for the pages that are only images
 *   photos       → on-device OCR engine
 */
import type { DocumentPage } from '@/domain/schema';
import type { CapturedPage, InferenceEngine } from './engines';
import { extractPdfTextLayer } from './sources/pdfTextLayer';

export type TextSource = 'pdf_text' | 'ocr';

export interface RecognizeResult {
  pages: DocumentPage[];
  /** 'ocr' whenever any page was recognized from an image, since OCR can misread. */
  source: TextSource;
  /** Plain-language note for the user about how the text was obtained. */
  note?: string;
}

export class RecognizeError extends Error {}

const OCR_CHECK = 'Check the amounts, dates and names against the paper.';

const pageList = (ns: number[]) => (ns.length === 1 ? `Page ${ns[0]}` : `Pages ${ns.slice(0, -1).join(', ')} and ${ns[ns.length - 1]}`);

/** Says which pages produced no text, so a blank result is never mistaken for a read page. */
function withEmptyPagesNote(pages: DocumentPage[], note: string): string {
  const empty = pages.filter((p) => p.blocks.length === 0).map((p) => p.number);
  if (!empty.length) return note;
  return `${note} ${pageList(empty)} had no readable text — retake ${empty.length === 1 ? 'it' : 'them'} if there is writing on ${empty.length === 1 ? 'it' : 'them'}.`;
}

export async function recognizeDocument(opts: {
  engine: InferenceEngine;
  captured: CapturedPage[];
  pdfUri?: string;
  signal?: AbortSignal;
}): Promise<RecognizeResult> {
  const { ocr } = opts.engine;
  if (opts.pdfUri) {
    const uri = opts.pdfUri;
    const pdf = await extractPdfTextLayer(uri);
    switch (pdf.status) {
      case 'ok': {
        const imageOnly = pdf.pages.filter((p) => p.blocks.length === 0).map((p) => p.number);
        if (!imageOnly.length || !ocr.recognizePdf) {
          return {
            pages: pdf.pages,
            source: 'pdf_text',
            note: withEmptyPagesNote(pdf.pages, 'Text was read directly from the PDF — no scanning errors.'),
          };
        }
        const scanned = await ocr.recognizePdf(uri, { pages: imageOnly, signal: opts.signal });
        const pages = pdf.pages.map((p) => scanned.find((s) => s.number === p.number) ?? p);
        return {
          pages,
          source: 'ocr',
          note: withEmptyPagesNote(
            pages,
            `Most text was read directly from the PDF. ${pageList(imageOnly)} ${imageOnly.length === 1 ? 'is a scan and was' : 'are scans and were'} read with text recognition on this phone. ${OCR_CHECK}`,
          ),
        };
      }
      case 'password_required':
        throw new RecognizeError('This PDF is password-protected. Open it elsewhere and export an unlocked copy.');
      case 'no_text_layer':
      case 'unavailable':
      case 'error': {
        if (ocr.recognizePdf) {
          const pages = await ocr.recognizePdf(uri, { signal: opts.signal });
          return {
            pages,
            source: 'ocr',
            note: withEmptyPagesNote(pages, `This PDF is a scan, so its text was read with text recognition on this phone. ${OCR_CHECK}`),
          };
        }
        if (pdf.status === 'no_text_layer') {
          throw new RecognizeError(
            'This PDF is a scan with no text inside, and this engine cannot read scans. Photograph or scan the paper pages instead.',
          );
        }
        // The real engine has nothing else to read a PDF with: say so, rather than
        // falling through to photo OCR ("import a digital PDF" — which they just did).
        if (opts.engine.info.kind === 'local') {
          throw new RecognizeError(
            pdf.status === 'unavailable'
              ? 'This build cannot open PDFs. Photograph or scan the paper pages instead.'
              : 'This PDF could not be opened. Export or download it again, or photograph the paper pages instead.',
          );
        }
        // No PDF reader in this build (Expo Go / web): the Demo engine's sample text, clearly labelled as Demo.
        break;
      }
    }
  }
  const pages = await ocr.recognize(opts.captured, opts.signal);
  // The Demo engine returns sample text: no claim about how it was read.
  if (opts.engine.info.kind !== 'local') return { pages, source: 'ocr' };
  return { pages, source: 'ocr', note: withEmptyPagesNote(pages, `Text was read with text recognition on this phone. ${OCR_CHECK}`) };
}
