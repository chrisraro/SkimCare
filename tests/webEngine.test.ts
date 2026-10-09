import { describe, expect, it } from '@jest/globals';
import type { ReadinessReport } from '@/ai/engines';
import { getModelSpec } from '@/ai/llm/models';
import { tesseractPageToBlocks, tesseractToOcrPage, type TesseractBlock, type TesseractLine } from '@/ai/ocr/tesseractLayout';
import { pdfItemsToText } from '@/ai/sources/pdfTextMapping';
import { pageTextToBlocks } from '@/ai/textBlocks';
import { checkWebReadiness, type WebReadinessProbe } from '@/ai/web/readiness';
import { Sha256 } from '@/ai/web/sha256';

const LINE_H = 40;
const tLine = (text: string, top: number, confidence = 95, left = 50, width = 900): TesseractLine => ({
  text,
  confidence,
  bbox: { x0: left, y0: top, x1: left + width, y1: top + LINE_H },
});
const tBlock = (top: number, ...lines: TesseractLine[]): TesseractBlock => {
  const bbox = { x0: 50, y0: top, x1: 950, y1: Math.max(...lines.map((l) => l.bbox.y1)) };
  return { bbox, paragraphs: [{ bbox, lines }] };
};

describe('Tesseract → layout mapping', () => {
  it('maps paragraphs to ML Kit-shaped regions with 0–1 confidence', () => {
    const page = tesseractToOcrPage([tBlock(100, tLine('1. RENT', 100, 87.5), tLine('  ', 150))], 1000, 2000);
    expect(page.width).toBe(1000);
    expect(page.blocks).toHaveLength(1);
    expect(page.blocks[0]!.lines).toEqual([{ text: '1. RENT', confidence: 0.875, frame: { left: 50, top: 100, right: 950, bottom: 140 } }]);
  });

  it('produces the same evidence blocks as ML Kit output: ids, critical flags, bbox, digit repair', () => {
    const blocks = tesseractPageToBlocks(
      2,
      [
        tBlock(100, tLine('PAYMENT TERMS', 100)),
        tBlock(200, tLine('The monthly rent is PHP 6,40o payable', 200), tLine('on the 5th day of each month.', 250)),
        tBlock(400, tLine('The tenant keeps the unit clean.', 400, 91)),
      ],
      1000,
      2000,
    );
    expect(blocks.map((b) => b.id)).toEqual(['p2_b1', 'p2_b2', 'p2_b3']);
    expect(blocks[1]!.text).toBe('The monthly rent is PHP 6,400 payable on the 5th day of each month.');
    expect(blocks[1]!.critical).toBe(true);
    expect(blocks[1]!.confidence).toBe(0.5); // repaired digits are always shown to the user to check
    expect(blocks[1]!.origin).toBe('ocr');
    expect(blocks[1]!.bbox).toEqual({ x: 0.05, y: 0.1, w: 0.9, h: 0.045 });
    expect(blocks[2]!.critical).toBe(false);
    expect(blocks[2]!.confidence).toBeCloseTo(0.91);
  });

  it('handles an empty page', () => {
    expect(tesseractPageToBlocks(1, null, 0, 0)).toEqual([]);
  });
});

describe('pdf.js text content → page text', () => {
  const item = (str: string, y: number, hasEOL = false, height = 12) => ({ str, hasEOL, height, transform: [1, 0, 0, 1, 72, y] });

  it('keeps explicit line ends and joins items on one line', () => {
    expect(pdfItemsToText([item('LEASE AGREEMENT', 700, true), item('The rent is ', 680), item('PHP 6,400.', 680, true)])).toBe(
      'LEASE AGREEMENT\nThe rent is PHP 6,400.\n',
    );
  });

  it('breaks lines on a y change without an EOL marker and paragraphs on a large gap', () => {
    const text = pdfItemsToText([item('First line', 700), item('second line.', 686), item('New paragraph.', 640)]);
    expect(text).toBe('First line\nsecond line.\n\nNew paragraph.');
    expect(pageTextToBlocks(1, text).map((b) => b.text)).toEqual(['First line second line.', 'New paragraph.']);
  });

  it('skips marked-content items without text', () => {
    expect(pdfItemsToText([{ transform: [1, 0, 0, 1, 0, 0] }, item('Only.', 500)])).toBe('Only.');
  });
});

describe('SHA-256', () => {
  const hex = (s: string, split = 0) => {
    const bytes = new TextEncoder().encode(s);
    const h = new Sha256();
    if (split) h.update(bytes.subarray(0, split)).update(bytes.subarray(split));
    else h.update(bytes);
    return h.hex();
  };
  it('matches the standard vectors, also across chunk boundaries', () => {
    expect(hex('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    expect(hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    const long = 'abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq';
    expect(hex(long)).toBe('248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1');
    expect(hex(long, 7)).toBe('248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1');
    expect(hex('a'.repeat(1000), 63)).toBe(hex('a'.repeat(1000)));
  });
});

describe('web readiness', () => {
  const spec = getModelSpec()!;
  const probe = (o: Partial<WebReadinessProbe> = {}): WebReadinessProbe => ({
    cachedModel: async () => ({ sizeBytes: spec.sizeBytes }),
    sha256: async () => spec.sha256,
    freeStorageBytes: async () => 2e9,
    ocrSelfTest: async () => true,
    smokeTest: async () => ({ ok: true, tokensPerSecond: 6 }),
    runtime: () => ({ threads: 4, compat: false }),
    ...o,
  });
  const status = (r: ReadinessReport, id: string) => r.checks.find((c) => c.id === id)?.status;

  it('is offline-ready only when every check passes', async () => {
    const r = await checkWebReadiness(spec, probe());
    expect(r.offlineReady).toBe(true);
    expect(r.checks.every((c) => c.status === 'pass')).toBe(true);
    expect(r.checks.find((c) => c.id === 'storage')!.detail).toMatch(/this tab only/);
  });

  it('a missing model fails and skips inference without loading anything', async () => {
    let smoked = false;
    const r = await checkWebReadiness(spec, probe({ cachedModel: async () => undefined, smokeTest: async () => ((smoked = true), { ok: true }) }));
    expect(status(r, 'model_present')).toBe('fail');
    expect(status(r, 'inference')).toBe('fail');
    expect(smoked).toBe(false);
    expect(r.offlineReady).toBe(false);
  });

  it('a wrong checksum or failed OCR test is not offline-ready', async () => {
    expect((await checkWebReadiness(spec, probe({ sha256: async () => 'deadbeef' }))).offlineReady).toBe(false);
    const noOcr = await checkWebReadiness(spec, probe({ ocrSelfTest: async () => false }));
    expect(status(noOcr, 'ocr')).toBe('fail');
    expect(status(noOcr, 'network_independent')).toBe('warn');
    expect(noOcr.offlineReady).toBe(false);
  });
});
