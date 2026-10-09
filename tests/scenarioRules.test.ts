import { describe, expect, it } from '@jest/globals';
import { formatPhp, lateInstallmentScenario, parsePhpAmount } from '@/ai/scenarioRules';
import type { ExtractedFact } from '@/domain/schema';

const ev = (blockId: string) => ({ page: 1, blockId, quote: 'q' });

const facts: ExtractedFact[] = [
  { id: 'a', key: 'installment_amount', value: 2000, evidence: ev('p1_b2'), confirmedByUser: true },
  { id: 'b', key: 'late_fee_fixed', value: 100, evidence: ev('p1_b4'), confirmedByUser: true },
  { id: 'c', key: 'due_day', value: 15, evidence: ev('p1_b3'), confirmedByUser: true },
];

describe('parsePhpAmount', () => {
  it.each([
    ['PHP 2,000', 2000],
    ['a fee of PHP 60,000, payable', 60000],
    ['₱1,250.50 only', 1250.5],
    ['P 100', 100],
  ])('parses %s', (input, expected) => {
    expect(parsePhpAmount(input)).toBe(expected);
  });

  it('returns null when no amount is present', () => {
    expect(parsePhpAmount('due on the 15th')).toBeNull();
  });
});

describe('formatPhp', () => {
  it('formats with peso sign and grouping', () => {
    expect(formatPhp(2100)).toBe('₱2,100.00');
  });
});

describe('lateInstallmentScenario (PRD §06 A)', () => {
  it('computes on-time and late totals from confirmed facts', () => {
    const r = lateInstallmentScenario(facts);
    expect(r.status).toBe('computed');
    expect(r.outputs).toEqual([
      { label: 'On-time payment', value: '₱2,000.00' },
      { label: 'Paid after the due date', value: '₱2,100.00' },
    ]);
    expect(r.evidence.map((e) => e.blockId)).toEqual(['p1_b2', 'p1_b4']);
    expect(r.assumptions.length).toBeGreaterThan(0);
  });

  it('returns insufficient information when the late charge is missing — never invents a fee', () => {
    const r = lateInstallmentScenario(facts.filter((f) => f.key !== 'late_fee_fixed'));
    expect(r.status).toBe('insufficient_information');
    expect(r.outputs).toEqual([]);
  });

  it('refuses to compute from values the user has not confirmed', () => {
    const unconfirmed = facts.map((f) => ({ ...f, confirmedByUser: false }));
    expect(lateInstallmentScenario(unconfirmed).status).toBe('insufficient_information');
  });

  it('avoids floating point drift', () => {
    const r = lateInstallmentScenario([
      { ...facts[0]!, value: 0.1 },
      { ...facts[1]!, value: 0.2 },
    ]);
    expect(r.outputs[1]?.value).toBe('₱0.30');
  });
});
