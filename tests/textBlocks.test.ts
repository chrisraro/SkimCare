import { describe, expect, it } from '@jest/globals';
import { isCriticalText, pageTextToBlocks } from '@/ai/textBlocks';

const PAGE = `INSTALLMENT SALE AGREEMENT

Buyer agrees to pay a monthly installment of PHP 2,000
for twelve (12) months.
Each installment is due on the 15th day of every month.

A fixed late charge of PHP 100 shall apply to any
installment paid after its due date.`;

describe('pageTextToBlocks (PDF text layer → evidence blocks)', () => {
  const blocks = pageTextToBlocks(2, PAGE);

  it('creates stable page-scoped block ids in reading order', () => {
    expect(blocks.map((b) => b.id)).toEqual(['p2_b1', 'p2_b2', 'p2_b3', 'p2_b4']);
    expect(blocks.every((b) => b.page === 2)).toBe(true);
  });

  it('joins wrapped lines back into whole sentences', () => {
    expect(blocks[1]?.text).toBe('Buyer agrees to pay a monthly installment of PHP 2,000 for twelve (12) months.');
    expect(blocks[3]?.text).toBe('A fixed late charge of PHP 100 shall apply to any installment paid after its due date.');
  });

  it('keeps headings as their own block', () => {
    expect(blocks[0]?.text).toBe('INSTALLMENT SALE AGREEMENT');
  });

  it('marks text-layer blocks as exact and flags critical ones', () => {
    expect(blocks.every((b) => b.origin === 'pdf_text' && b.confidence === 1)).toBe(true);
    expect(blocks.map((b) => b.critical)).toEqual([false, true, true, true]);
    expect(blocks[1]?.originalText).toBe(blocks[1]?.text);
  });

  it('returns no blocks for an empty (scanned, image-only) page', () => {
    expect(pageTextToBlocks(1, '  \n \n')).toEqual([]);
  });

  it('normalizes Windows line endings and extra spaces', () => {
    const b = pageTextToBlocks(1, 'The fee is   PHP 5,000.\r\nPayment is due upon signing.');
    expect(b.map((x) => x.text)).toEqual(['The fee is PHP 5,000.', 'Payment is due upon signing.']);
  });
});

describe('isCriticalText', () => {
  it.each([
    ['The fee is PHP 60,000', true],
    ['₱1,500 deposit', true],
    ['due on the 15th day', true],
    ['effective March 3, 2026', true],
    ['signed 03/15/2026', true],
    ['between Kalayaan Digital Co. ("Client") and Maria Santos', true],
    ['The Client may request revisions.', false],
  ])('%s → %s', (text, expected) => {
    expect(isCriticalText(text)).toBe(expected);
  });
});
