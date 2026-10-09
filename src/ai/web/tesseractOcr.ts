/**
 * OcrEngine for the browser: Tesseract.js (wasm) with self-hosted worker, core and
 * language data (`/vendor/tesseract`), so recognition runs in this tab and works
 * offline once loaded. Output goes through the same layout code as ML Kit
 * (tesseractLayout.ts → layout.ts). Pages run one at a time; cancelling stops between
 * pages. Errors never contain document text. Web only.
 */
import type Tesseract from 'tesseract.js';
import type { DocumentPage } from '@/domain/schema';
import { throwIfAborted, type CapturedPage, type OcrEngine } from '../engines';
import { MAX_SCANNED_PDF_PAGES } from '../ocr/mlKitOcr';
import { tesseractPageToBlocks, type TesseractBlock } from '../ocr/tesseractLayout';
import { RecognizeError } from '../recognize';
import { isPasswordError, openPdf } from './pdfjs';
import { absoluteUrl, importVendor, vendorManifest, VENDOR } from './vendor';

/** Longest side of the image handed to Tesseract: enough for body text, bounded memory on phones. */
const MAX_SIDE = 2400;
/** Target width of a rendered PDF page. */
const PDF_RENDER_WIDTH = 2000;

let worker: Promise<Tesseract.Worker> | null = null;

async function getWorker(): Promise<Tesseract.Worker> {
  worker ??= (async () => {
    const [mod, manifest] = await Promise.all([importVendor<{ default: typeof Tesseract }>('tesseract/tesseract.esm.min.js'), vendorManifest()]);
    const lib = mod.default;
    const langs = manifest.tesseractLangs.length ? manifest.tesseractLangs : ['eng'];
    return lib.createWorker(langs, 1 /* OEM.LSTM_ONLY */, {
      workerPath: absoluteUrl(`${VENDOR}/tesseract/worker.min.js`),
      corePath: absoluteUrl(`${VENDOR}/tesseract/core`),
      langPath: absoluteUrl(`${VENDOR}/tesseract/lang`),
      gzip: true,
      workerBlobURL: false,
      // No progress logging: messages could carry recognized text in debug builds.
      logger: () => undefined,
      errorHandler: () => undefined,
    });
  })();
  worker.catch(() => (worker = null));
  return worker;
}

function canvas(width: number, height: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(width));
  c.height = Math.max(1, Math.round(height));
  return c;
}

/** Draws the image upright (EXIF applied by the browser), turned by the user's extra rotation, and bounded in size. */
async function uprightCanvas(uri: string, rotation: CapturedPage['rotation']): Promise<HTMLCanvasElement> {
  const blob = await (await fetch(uri)).blob();
  const bitmap = await createImageBitmap(blob, { imageOrientation: 'from-image' });
  try {
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const w = bitmap.width * scale;
    const h = bitmap.height * scale;
    const turned = rotation === 90 || rotation === 270;
    const c = canvas(turned ? h : w, turned ? w : h);
    const ctx = c.getContext('2d');
    if (!ctx) throw new Error('no 2d context');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.translate(c.width / 2, c.height / 2);
    ctx.rotate((rotation * Math.PI) / 180);
    ctx.drawImage(bitmap, -w / 2, -h / 2, w, h);
    return c;
  } finally {
    bitmap.close();
  }
}

async function recognizeCanvas(page: number, c: HTMLCanvasElement) {
  const w = await getWorker();
  const { data } = await w.recognize(c, {}, { blocks: true, text: false });
  const blocks = tesseractPageToBlocks(page, data.blocks as TesseractBlock[] | null, c.width, c.height);
  // Free the bitmap memory now rather than at the next GC (matters on phones).
  c.width = 0;
  c.height = 0;
  return blocks;
}

/** Draws a known string and reads it back here (readiness). No document text involved. */
export async function tesseractSelfTest(): Promise<boolean> {
  const c = canvas(900, 140);
  const ctx = c.getContext('2d');
  if (!ctx) return false;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.fillStyle = '#000';
  ctx.font = '56px Arial, Helvetica, sans-serif';
  ctx.textBaseline = 'middle';
  ctx.fillText('Offline check 2468', 30, 70);
  const w = await getWorker();
  const { data } = await w.recognize(c, {}, { text: true });
  return /offline/i.test(data.text) && /2468/.test(data.text);
}

export function createTesseractOcr(): OcrEngine {
  return {
    async recognize(pages, signal) {
      const out: DocumentPage[] = [];
      for (const [i, p] of pages.entries()) {
        throwIfAborted(signal);
        const number = i + 1;
        if (!p.uri) throw new RecognizeError(`Page ${number} has no image. Retake it and try again.`);
        let c: HTMLCanvasElement;
        try {
          c = await uprightCanvas(p.uri, p.rotation);
        } catch {
          throw new RecognizeError(`Page ${number} could not be opened. Retake or re-pick it.`);
        }
        try {
          out.push({ number, uri: p.uri, blocks: await recognizeCanvas(number, c) });
        } catch {
          throw new RecognizeError(`Page ${number} could not be read. Your pages are kept — try again.`);
        }
      }
      return out;
    },

    async recognizePdf(uri, opts) {
      let pdf: Awaited<ReturnType<typeof openPdf>>;
      try {
        pdf = await openPdf(uri);
      } catch (e) {
        if (isPasswordError(e)) throw new RecognizeError('This PDF is password-protected. Open it elsewhere and export an unlocked copy.');
        throw new RecognizeError('This PDF could not be opened. Try exporting the PDF again.');
      }
      const doc = pdf.doc;
      try {
        const count = doc.numPages;
        const numbers = (opts?.pages ?? Array.from({ length: count }, (_, i) => i + 1)).filter((n) => n >= 1 && n <= count);
        if (numbers.length > MAX_SCANNED_PDF_PAGES) {
          throw new RecognizeError(
            `This PDF has ${numbers.length} scanned pages. SkimCare reads up to ${MAX_SCANNED_PDF_PAGES} at a time — export the pages you need as a smaller PDF.`,
          );
        }
        const out: DocumentPage[] = [];
        for (const number of numbers) {
          throwIfAborted(opts?.signal);
          try {
            const page = await doc.getPage(number);
            const base = page.getViewport({ scale: 1 });
            const viewport = page.getViewport({ scale: Math.min(3, PDF_RENDER_WIDTH / base.width) });
            const c = canvas(viewport.width, viewport.height);
            const ctx = c.getContext('2d');
            if (!ctx) throw new Error('no 2d context');
            ctx.fillStyle = '#fff';
            ctx.fillRect(0, 0, c.width, c.height);
            await page.render({ canvas: c, canvasContext: ctx, viewport }).promise;
            page.cleanup();
            out.push({ number, blocks: await recognizeCanvas(number, c) });
          } catch (e) {
            if (e instanceof RecognizeError) throw e;
            throw new RecognizeError(`Page ${number} could not be read. Your pages are kept — try again.`);
          }
        }
        return out;
      } finally {
        pdf.close();
      }
    },
  };
}
