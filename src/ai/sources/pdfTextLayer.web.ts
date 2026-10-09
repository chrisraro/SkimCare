/**
 * Digital-PDF text layer in the browser via pdf.js (self-hosted). Same exports and
 * result type as pdfTextLayer.ts: exact text for digital PDFs; 'no_text_layer' for
 * scans, so recognize.ts sends them to OCR. The PDF never leaves the browser.
 */
import type { DocumentPage } from '@/domain/schema';
import { pageTextToBlocks } from '../textBlocks';
import { isPasswordError, openPdf } from '../web/pdfjs';
import { pdfItemsToText, type PdfTextItem } from './pdfTextMapping';

export function pdfTextAvailable(): boolean {
  return typeof window !== 'undefined';
}

export type PdfTextResult =
  | { status: 'ok'; pages: DocumentPage[] }
  | { status: 'no_text_layer'; pageCount: number }
  | { status: 'password_required' }
  | { status: 'unavailable' }
  | { status: 'error'; message: string };

export async function extractPdfTextLayer(uri: string): Promise<PdfTextResult> {
  if (!pdfTextAvailable()) return { status: 'unavailable' };
  let pdf: Awaited<ReturnType<typeof openPdf>> | undefined;
  try {
    pdf = await openPdf(uri);
    const doc = pdf.doc;
    const pageCount = doc.numPages;
    const pages: DocumentPage[] = [];
    for (let n = 1; n <= pageCount; n++) {
      const page = await doc.getPage(n);
      const content = await page.getTextContent();
      pages.push({ number: n, blocks: pageTextToBlocks(n, pdfItemsToText(content.items as PdfTextItem[])) });
      page.cleanup();
    }
    if (pages.every((p) => p.blocks.length === 0)) return { status: 'no_text_layer', pageCount };
    return { status: 'ok', pages };
  } catch (e) {
    if (isPasswordError(e)) return { status: 'password_required' };
    // Never include document content in errors.
    return { status: 'error', message: e instanceof Error ? e.name : 'PDF could not be read' };
  } finally {
    pdf?.close();
  }
}
