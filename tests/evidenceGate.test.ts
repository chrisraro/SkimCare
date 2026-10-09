import { describe, expect, it } from '@jest/globals';
import { validateCandidates } from '@/ai/evidenceGate';
import { installmentAgreement, serviceAgreement } from '@/ai/demo/fixtures';

describe('evidence gate (PRD §05 guardrails)', () => {
  const { accepted, rejected } = validateCandidates(serviceAgreement.rawCandidates, serviceAgreement.pages);

  it('accepts findings whose quote matches a recorded OCR block', () => {
    expect(accepted.map((f) => f.id)).toContain('f_payment_condition');
  });

  it('rejects a source pointer to a page/block that does not exist', () => {
    expect(accepted.map((f) => f.id)).not.toContain('f_fabricated');
    expect(rejected.find((r) => r.id === 'f_fabricated')?.reason).toBe('unknown_source');
  });

  it('rejects a quote that does not match the recorded text', () => {
    expect(rejected.find((r) => r.id === 'f_misquote')?.reason).toBe('quote_mismatch');
  });

  it('rejects malformed output', () => {
    const result = validateCandidates([{ nope: true }, 'text', null], serviceAgreement.pages);
    expect(result.accepted).toHaveLength(0);
    expect(result.rejected.every((r) => r.reason === 'malformed')).toBe(true);
  });

  it('downgrades findings that cite a low-confidence critical block to unable_to_verify', () => {
    const lowConf = {
      id: 'f_down',
      type: 'payment_amount',
      title: 'Down payment PHP 30,000',
      normalizedValue: 'PHP 30,000',
      evidence: { page: 2, blockId: 'p2_b2', quote: 'A down payment of PHP 30,000 is due upon signing.' },
      explanation: 'You pay PHP 30,000 when signing.',
      reviewStatus: 'explained',
      questions: [],
    };
    const result = validateCandidates([lowConf], serviceAgreement.pages);
    expect(result.accepted[0]?.reviewStatus).toBe('unable_to_verify');
  });

  it('rejects a money value not present in the cited source', () => {
    const wrongAmount = {
      id: 'f_wrong',
      type: 'payment_amount',
      title: 'Monthly PHP 3,000',
      normalizedValue: 'PHP 3,000',
      evidence: {
        page: 1,
        blockId: 'p1_b2',
        quote: 'Buyer agrees to pay a monthly installment of PHP 2,000 for twelve (12) months.',
      },
      explanation: 'x',
      reviewStatus: 'explained',
      questions: [],
    };
    const result = validateCandidates([wrongAmount], installmentAgreement.pages);
    expect(result.rejected[0]?.reason).toBe('value_not_in_source');
  });

  it('forces findings without evidence to unable_to_verify', () => {
    const noEvidence = {
      id: 'f_none',
      type: 'other',
      title: 'Something',
      explanation: 'Unclear.',
      reviewStatus: 'explained',
      questions: [],
    };
    const result = validateCandidates([noEvidence], serviceAgreement.pages);
    expect(result.accepted[0]?.reviewStatus).toBe('unable_to_verify');
  });

  it('respects user OCR corrections — quotes must match the corrected text', () => {
    const pages = structuredClone(installmentAgreement.pages);
    pages[0]!.blocks[1]!.text = 'Buyer agrees to pay a monthly installment of PHP 2,500 for twelve (12) months.';
    const { rejected: r } = validateCandidates(installmentAgreement.rawCandidates, pages);
    expect(r.map((x) => x.id)).toContain('f_installment');
  });
});
