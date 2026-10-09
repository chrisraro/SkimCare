/**
 * Digital-PDF text layer via expo-pdf-text-extract (PDFBox on Android).
 * Exact text, no OCR errors — but returns nothing for scanned/image-only PDFs,
 * which must go through OCR instead. Requires a development build.
 */
import type { DocumentPage } from '@/domain/schema';
import { pageTextToBlocks } from '../textBlocks';

type PdfModule = typeof import('expo-pdf-text-extract');

function loadModule(): PdfModule | null {
  try {
    // Lazy so Jest/web never touch the native module unless asked.
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- intentional lazy native load
    const mod: PdfModule = require('expo-pdf-text-extract');
    return mod.isAvailable() ? mod : null;
  } catch {
    return null;
  }
}

export function pdfTextAvailable(): boolean {
  return loadModule() !== null;
}

export type PdfTextResult =
  | { status: 'ok'; pages: DocumentPage[] }
  | { status: 'no_text_layer'; pageCount: number }
  | { status: 'password_required' }
  | { status: 'unavailable' }
  | { status: 'error'; message: string };

export async function extractPdfTextLayer(uri: string): Promise<PdfTextResult> {
  const pdf = loadModule();
  if (!pdf) return { status: 'unavailable' };
  try {
    const pageCount = await pdf.getPageCount(uri);
    const pages: DocumentPage[] = [];
    for (let n = 1; n <= pageCount; n++) {
      const text = await pdf.extractTextFromPage(uri, n);
      pages.push({ number: n, blocks: pageTextToBlocks(n, text) });
    }
    if (pages.every((p) => p.blocks.length === 0)) return { status: 'no_text_layer', pageCount };
    return { status: 'ok', pages };
  } catch (e) {
    const code = (e as { code?: string }).code;
    if (code === 'PASSWORD_REQUIRED' || code === 'INCORRECT_PASSWORD') return { status: 'password_required' };
    // Never include document content in errors.
    return { status: 'error', message: code ?? 'PDF could not be read' };
  }
}
