/**
 * OcrEngine backed by the bundled ML Kit module (modules/local-ocr). Pages are
 * recognized one at a time, so cancelling stops between pages and only one page
 * bitmap is in memory at once. Errors shown to the user never contain document text.
 */
import type { DocumentPage } from '@/domain/schema';
import type { LocalOcrModule } from '../../../modules/local-ocr';
import { throwIfAborted, type OcrEngine } from '../engines';
import { RecognizeError } from '../recognize';
import { ocrPageToBlocks } from './layout';

/** Scanned PDFs above this are refused: about a minute of recognition on a mid-range phone. */
export const MAX_SCANNED_PDF_PAGES = 30;

const MESSAGES: Record<string, string> = {
  ERR_IMAGE_UNREADABLE: 'could not be opened. Retake or re-pick it.',
  ERR_PDF_UNREADABLE: 'could not be opened. Try exporting the PDF again.',
  ERR_PAGE_RANGE: 'is missing from the PDF.',
};

async function onPage<T>(page: number | null, call: () => Promise<T>): Promise<T> {
  try {
    return await call();
  } catch (e) {
    const code = (e as { code?: string }).code ?? '';
    if (code === 'ERR_PDF_PASSWORD') {
      throw new RecognizeError('This PDF is password-protected. Open it elsewhere and export an unlocked copy.');
    }
    const what = page === null ? 'This PDF' : `Page ${page}`;
    throw new RecognizeError(`${what} ${MESSAGES[code] ?? 'could not be read. Your pages are kept — try again.'}`);
  }
}

export function createMlKitOcr(native: LocalOcrModule): OcrEngine {
  return {
    async recognize(pages, signal) {
      const out: DocumentPage[] = [];
      for (const [i, p] of pages.entries()) {
        throwIfAborted(signal);
        const number = i + 1;
        const uri = p.uri;
        if (!uri) throw new RecognizeError(`Page ${number} has no image. Retake it and try again.`);
        const result = await onPage(number, () => native.recognizeImage(uri, p.rotation));
        out.push({ number, blocks: ocrPageToBlocks(number, result) });
      }
      return out;
    },

    async recognizePdf(uri, opts) {
      const count = await onPage(null, () => native.pdfPageCount(uri));
      const numbers = (opts?.pages ?? Array.from({ length: count }, (_, i) => i + 1)).filter((n) => n >= 1 && n <= count);
      if (numbers.length > MAX_SCANNED_PDF_PAGES) {
        throw new RecognizeError(
          `This PDF has ${numbers.length} scanned pages. SkimCare reads up to ${MAX_SCANNED_PDF_PAGES} at a time — export the pages you need as a smaller PDF.`,
        );
      }
      const out: DocumentPage[] = [];
      for (const number of numbers) {
        throwIfAborted(opts?.signal);
        const result = await onPage(number, () => native.recognizePdfPage(uri, number));
        out.push({ number, blocks: ocrPageToBlocks(number, result) });
      }
      return out;
    },
  };
}
