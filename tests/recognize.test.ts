import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { InferenceEngine, OcrEngine } from '@/ai/engines';
import type { PdfTextResult } from '@/ai/sources/pdfTextLayer';
import type { DocumentPage } from '@/domain/schema';

const mockExtract = jest.fn<(uri: string) => Promise<PdfTextResult>>();
jest.mock('@/ai/sources/pdfTextLayer', () => ({
  extractPdfTextLayer: (uri: string) => mockExtract(uri),
  pdfTextAvailable: () => true,
}));

// Imported after the mock is registered.
// eslint-disable-next-line import/first
import { demoEngine } from '@/ai/demoEngine';
// eslint-disable-next-line import/first
import { recognizeDocument, RecognizeError } from '@/ai/recognize';
// eslint-disable-next-line import/first
import { pageTextToBlocks } from '@/ai/textBlocks';

const captured = [{ id: 'pg1', rotation: 0 as const }];

describe('recognizeDocument', () => {
  beforeEach(() => {
    mockExtract.mockReset();
  });

  it('uses the PDF text layer when the PDF has text', async () => {
    mockExtract.mockResolvedValue({
      status: 'ok',
      pages: [{ number: 1, blocks: pageTextToBlocks(1, 'The fee is PHP 5,000.') }],
    });
    const r = await recognizeDocument({ engine: demoEngine, captured, pdfUri: 'file:///a.pdf' });
    expect(r.source).toBe('pdf_text');
    expect(r.pages[0]?.blocks[0]?.text).toBe('The fee is PHP 5,000.');
  });

  it('explains scanned PDFs instead of pretending to read them', async () => {
    mockExtract.mockResolvedValue({ status: 'no_text_layer', pageCount: 2 });
    await expect(recognizeDocument({ engine: demoEngine, captured, pdfUri: 'file:///scan.pdf' })).rejects.toBeInstanceOf(
      RecognizeError,
    );
  });

  it('asks for an unlocked copy of password-protected PDFs', async () => {
    mockExtract.mockResolvedValue({ status: 'password_required' });
    await expect(recognizeDocument({ engine: demoEngine, captured, pdfUri: 'file:///p.pdf' })).rejects.toThrow(/password/i);
  });

  it('falls back to the OCR engine when the PDF reader is not in this build', async () => {
    mockExtract.mockResolvedValue({ status: 'unavailable' });
    const r = await recognizeDocument({ engine: demoEngine, captured, pdfUri: 'file:///a.pdf' });
    expect(r.source).toBe('ocr');
  });

  it('uses OCR for photos and scans', async () => {
    const r = await recognizeDocument({ engine: demoEngine, captured });
    expect(r.source).toBe('ocr');
    expect(r.note).toBeUndefined(); // Demo sample text: no claim about how it was read
    expect(mockExtract).not.toHaveBeenCalled();
  });
});

describe('recognizeDocument with on-device OCR', () => {
  const scannedPage = (n: number, text: string): DocumentPage => ({ number: n, blocks: pageTextToBlocks(n, text).map((b) => ({ ...b, origin: 'ocr' as const })) });
  const recognizePdf = jest.fn<NonNullable<OcrEngine['recognizePdf']>>();
  const recognize = jest.fn<OcrEngine['recognize']>();
  const engine: InferenceEngine = { ...demoEngine, info: { ...demoEngine.info, kind: 'local' }, ocr: { recognize, recognizePdf } };

  beforeEach(() => {
    mockExtract.mockReset();
    recognizePdf.mockReset();
    recognize.mockReset();
  });

  it('reads scanned PDFs on the device and says so', async () => {
    mockExtract.mockResolvedValue({ status: 'no_text_layer', pageCount: 1 });
    recognizePdf.mockResolvedValue([scannedPage(1, 'The fee is PHP 5,000.')]);
    const r = await recognizeDocument({ engine, captured, pdfUri: 'file:///scan.pdf' });
    expect(recognizePdf).toHaveBeenCalledWith('file:///scan.pdf', { signal: undefined });
    expect(r.source).toBe('ocr');
    expect(r.note).toMatch(/is a scan.*Check the amounts/);
  });

  it('recognizes only the image pages of a mixed PDF and keeps the exact text of the rest', async () => {
    mockExtract.mockResolvedValue({
      status: 'ok',
      pages: [
        { number: 1, blocks: pageTextToBlocks(1, 'The fee is PHP 5,000.') },
        { number: 2, blocks: [] },
      ],
    });
    recognizePdf.mockResolvedValue([scannedPage(2, 'Signed by both parties.')]);
    const r = await recognizeDocument({ engine, captured, pdfUri: 'file:///mixed.pdf' });
    expect(recognizePdf).toHaveBeenCalledWith('file:///mixed.pdf', { pages: [2], signal: undefined });
    expect(r.pages.map((p) => p.blocks[0]?.origin)).toEqual(['pdf_text', 'ocr']);
    expect(r.source).toBe('ocr');
    expect(r.note).toMatch(/Page 2 is a scan/);
  });

  it('names pages where nothing could be read', async () => {
    recognize.mockResolvedValue([scannedPage(1, 'The fee is PHP 5,000.'), { number: 2, blocks: [] }, { number: 3, blocks: [] }]);
    const r = await recognizeDocument({ engine, captured });
    expect(r.note).toMatch(/Pages 2 and 3 had no readable text/);
  });
});
