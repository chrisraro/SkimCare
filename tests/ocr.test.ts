import { describe, expect, it } from '@jest/globals';
import type { LocalOcrModule, OcrLine, OcrPageResult, OcrRegion } from '../modules/local-ocr';
import { LOW_CONFIDENCE, moneyAmountsIn } from '@/ai/evidenceGate';
import { ocrPageToBlocks, readingOrder, repairDigits } from '@/ai/ocr/layout';
import { createMlKitOcr, MAX_SCANNED_PDF_PAGES } from '@/ai/ocr/mlKitOcr';
import { RecognizeError } from '@/ai/recognize';

const LINE_H = 40;

/** One ML Kit line; `top` in pixels of a 1000 × 2000 page. */
const line = (text: string, top: number, left = 50, confidence = 0.95, width = 900): OcrLine => ({
  text,
  confidence,
  frame: { left, top, right: left + width, bottom: top + LINE_H },
});

const region = (...lines: OcrLine[]): OcrRegion => ({
  lines,
  frame: {
    left: Math.min(...lines.map((l) => l.frame.left)),
    top: Math.min(...lines.map((l) => l.frame.top)),
    right: Math.max(...lines.map((l) => l.frame.right)),
    bottom: Math.max(...lines.map((l) => l.frame.bottom)),
  },
});

/** A region of stacked lines starting at `top`. */
const paragraph = (top: number, ...texts: string[]) => region(...texts.map((t, i) => line(t, top + i * (LINE_H + 10))));

const page = (...blocks: OcrRegion[]): OcrPageResult => ({ width: 1000, height: 2000, blocks });

const texts = (result: OcrPageResult, n = 1) => ocrPageToBlocks(n, result).map((b) => b.text);

describe('OCR layout → evidence blocks', () => {
  it('joins wrapped lines and splits at sentence ends, with stable ids', () => {
    const blocks = ocrPageToBlocks(
      2,
      page(paragraph(100, 'The Client shall pay the Provider', 'PHP 18,000 within seven (7) days.', 'The Provider keeps the files', 'until paid in full.')),
    );
    expect(blocks.map((b) => [b.id, b.text])).toEqual([
      ['p2_b1', 'The Client shall pay the Provider PHP 18,000 within seven (7) days.'],
      ['p2_b2', 'The Provider keeps the files until paid in full.'],
    ]);
  });

  it('starts a new block at headings and clause numbers', () => {
    const result = page(paragraph(100, '1. PAYMENT', '1.1 The fee is PHP 5,000', 'payable every month', '(a) A late fee applies', 'after five days.'));
    expect(texts(result)).toEqual(['1. PAYMENT', '1.1 The fee is PHP 5,000 payable every month', '(a) A late fee applies after five days.']);
    // A wrapped line that merely starts with a number is not a new clause.
    expect(texts(page(paragraph(100, 'Notice must be given at least', '15 days before the term ends.')))).toEqual([
      'Notice must be given at least 15 days before the term ends.',
    ]);
  });

  it('reads top to bottom, and side-by-side regions left to right without merging them', () => {
    const body = paragraph(100, 'Signed on 3 March 2026 in Quezon City');
    const left = region(line('THE CLIENT', 400, 50, 0.95, 400), line('Ana Reyes', 450, 50, 0.95, 400));
    const right = region(line('signed by the Provider', 400, 550, 0.95, 400));
    const ordered = readingOrder([right, left, body]);
    expect(ordered).toEqual([body, left, right]);
    expect(texts(page(right, left, body))).toEqual(['Signed on 3 March 2026 in Quezon City', 'THE CLIENT', 'Ana Reyes', 'signed by the Provider']);
  });

  it('continues a sentence that ML Kit split into two regions', () => {
    const result = page(paragraph(100, 'Payment is due within thirty (30) days'), paragraph(160, 'from the invoice date.'));
    expect(texts(result)).toEqual(['Payment is due within thirty (30) days from the invoice date.']);
  });

  it('keeps a hyphenated line break as one word', () => {
    expect(texts(page(paragraph(100, 'The monthly pay-', 'ment is due on the 15th.')))).toEqual(['The monthly pay-ment is due on the 15th.']);
  });

  it('normalizes the box, takes the weakest line’s confidence and flags critical details', () => {
    const result = page(region(line('The deposit is PHP 9,500', 200, 100, 0.98, 800), line('and is not refundable.', 250, 100, 0.62, 600)));
    const [b] = ocrPageToBlocks(1, result);
    expect(b).toMatchObject({ confidence: 0.62, critical: true, origin: 'ocr', originalText: b!.text });
    expect(b!.bbox).toEqual({ x: 0.1, y: 0.1, w: 0.8, h: 90 / 2000 });
  });

  it('repairs digits read as look-alike letters and flags the block for the user', () => {
    // Seen on the emulator with old-style numerals: "0" read as "o".
    const [b] = ocrPageToBlocks(1, page(paragraph(100, 'The down payment of PHP 6,40o is due on the 1oth.')));
    expect(b!.text).toBe('The down payment of PHP 6,400 is due on the 10th.');
    expect(b!.confidence).toBeLessThan(LOW_CONFIDENCE);
    expect(moneyAmountsIn(b!.text)).toEqual([6400]);
  });

  it('never changes words, codes or numbers glued to words', () => {
    for (const text of ['Ilocos Norte', 'Model FR-22o', 'PHP 4,000only', 'I owe 10 pesos', 'Lot l', 'Section lo']) {
      expect(repairDigits(text)).toEqual({ text, repaired: false });
    }
    expect(repairDigits('(l5) days, 2O26.')).toEqual({ text: '(15) days, 2026.', repaired: true });
  });

  it('drops lines with no letters or digits (rules, stray marks)', () => {
    expect(texts(page(paragraph(100, '|', 'The term is one year.', '—')))).toEqual(['The term is one year.']);
  });

  it('returns no blocks for a blank page', () => {
    expect(ocrPageToBlocks(1, page())).toEqual([]);
  });
});

/** Fake native module: one PDF with `pdfPages`, photos that read as "Photo <uri>." */
function fakeNative(pdfPages: OcrPageResult[] = [], fail?: { code: string; page?: number }) {
  const calls: string[] = [];
  const native: LocalOcrModule = {
    selfTest: async () => true,
    async recognizeImage(uri, rotation) {
      calls.push(`image ${uri} ${rotation}`);
      return page(paragraph(100, `Photo ${uri}.`));
    },
    pdfPageCount: async () => pdfPages.length,
    async recognizePdfPage(_uri, n) {
      calls.push(`pdf ${n}`);
      if (fail && fail.page === n) throw Object.assign(new Error('native detail'), { code: fail.code });
      return pdfPages[n - 1]!;
    },
  };
  return { native, calls };
}

describe('ML Kit OCR engine', () => {
  it('recognizes photos in order with the user’s rotation', async () => {
    const { native, calls } = fakeNative();
    const pages = await createMlKitOcr(native).recognize([
      { id: 'a', uri: 'file:///a.jpg', rotation: 0 },
      { id: 'b', uri: 'file:///b.jpg', rotation: 90 },
    ]);
    expect(calls).toEqual(['image file:///a.jpg 0', 'image file:///b.jpg 90']);
    expect(pages.map((p) => [p.number, p.blocks[0]?.id])).toEqual([
      [1, 'p1_b1'],
      [2, 'p2_b1'],
    ]);
  });

  it('refuses a page without an image instead of skipping it', async () => {
    await expect(createMlKitOcr(fakeNative().native).recognize([{ id: 'a', rotation: 0 }])).rejects.toThrow(/Page 1 has no image/);
  });

  it('recognizes all PDF pages, or only the requested ones', async () => {
    const pdf = [page(paragraph(100, 'One.')), page(paragraph(100, 'Two.')), page(paragraph(100, 'Three.'))];
    const all = fakeNative(pdf);
    expect((await createMlKitOcr(all.native).recognizePdf!('file:///s.pdf')).map((p) => p.blocks[0]?.text)).toEqual(['One.', 'Two.', 'Three.']);
    const some = fakeNative(pdf);
    const pages = await createMlKitOcr(some.native).recognizePdf!('file:///s.pdf', { pages: [3, 9] });
    expect(some.calls).toEqual(['pdf 3']);
    expect(pages.map((p) => p.number)).toEqual([3]);
  });

  it('turns native errors into plain messages without document text', async () => {
    const pdf = [page(), page()];
    const unreadable = createMlKitOcr(fakeNative(pdf, { code: 'ERR_OCR_FAILED', page: 2 }).native).recognizePdf!('file:///s.pdf');
    await expect(unreadable).rejects.toThrow(new RecognizeError('Page 2 could not be read. Your pages are kept — try again.'));
    const locked = createMlKitOcr(fakeNative(pdf, { code: 'ERR_PDF_PASSWORD', page: 1 }).native).recognizePdf!('file:///s.pdf');
    await expect(locked).rejects.toThrow(/password-protected/);
  });

  it(`refuses scanned PDFs over ${MAX_SCANNED_PDF_PAGES} pages before reading any`, async () => {
    const { native, calls } = fakeNative(Array.from({ length: MAX_SCANNED_PDF_PAGES + 1 }, () => page()));
    await expect(createMlKitOcr(native).recognizePdf!('file:///big.pdf')).rejects.toBeInstanceOf(RecognizeError);
    expect(calls).toEqual([]);
  });

  it('stops between pages when cancelled', async () => {
    const controller = new AbortController();
    const { native, calls } = fakeNative([page(), page(), page()]);
    const recognizePdfPage = native.recognizePdfPage;
    native.recognizePdfPage = async (uri, n) => {
      controller.abort();
      return recognizePdfPage(uri, n);
    };
    await expect(createMlKitOcr(native).recognizePdf!('file:///s.pdf', { signal: controller.signal })).rejects.toThrow('Cancelled');
    expect(calls).toEqual(['pdf 1']);
  });
});
