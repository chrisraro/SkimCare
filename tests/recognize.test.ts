import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { PdfTextResult } from '@/ai/sources/pdfTextLayer';

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
    expect(mockExtract).not.toHaveBeenCalled();
  });
});
