/**
 * pdf.js, self-hosted (`/vendor/pdfjs`, legacy build for older iPhone Safari).
 * Loaded on first use; the PDF bytes are read from the picker's local URI and never sent anywhere.
 */
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { absoluteUrl, importVendor, VENDOR } from './vendor';

type PdfjsLib = typeof import('pdfjs-dist');

let configured: Promise<PdfjsLib> | null = null;

export function loadPdfjs(): Promise<PdfjsLib> {
  configured ??= importVendor<PdfjsLib>('pdfjs/pdf.min.mjs').then((lib) => {
    lib.GlobalWorkerOptions.workerSrc = absoluteUrl(`${VENDOR}/pdfjs/pdf.worker.min.mjs`);
    return lib;
  });
  configured.catch(() => (configured = null));
  return configured;
}

export interface OpenPdf {
  doc: PDFDocumentProxy;
  /** Frees the document and its worker resources. */
  close(): void;
}

export async function openPdf(uri: string): Promise<OpenPdf> {
  const pdfjs = await loadPdfjs();
  const data = new Uint8Array(await (await fetch(uri)).arrayBuffer());
  const task = pdfjs.getDocument({
    data,
    cMapUrl: absoluteUrl(`${VENDOR}/pdfjs/cmaps/`),
    cMapPacked: true,
    standardFontDataUrl: absoluteUrl(`${VENDOR}/pdfjs/standard_fonts/`),
    wasmUrl: absoluteUrl(`${VENDOR}/pdfjs/wasm/`),
  });
  try {
    const doc = await task.promise;
    return { doc, close: () => void task.destroy() };
  } catch (e) {
    void task.destroy();
    throw e;
  }
}

export const isPasswordError = (e: unknown) => e instanceof Error && e.name === 'PasswordException';
