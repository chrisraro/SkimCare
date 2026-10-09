import { describe, expect, it } from '@jest/globals';
import { scoreFindings } from '@/ai/eval/score';
import { validateCandidates } from '@/ai/evidenceGate';
import { extractionUnits } from '@/ai/llm/chunking';
import { parseModelOutput } from '@/ai/llm/parse';
import { checkFindingType } from '@/ai/llm/typeCheck';
import type { Finding, FindingType } from '@/domain/schema';
import { EVAL_CONTRACTS } from './fixtures/contracts';

const reply = (type: string, extra: Record<string, unknown> = {}) =>
  JSON.stringify({
    relevant: true,
    finding: { type, title: '', explanation: 'What this sentence says.', review_status: 'explained', questions: [], ...extra },
  });

describe('type sanity check', () => {
  it('re-types findings whose type the block contradicts', () => {
    expect(checkFindingType('late_fee', 'The fee is due on the 5th day of each month.')).toBe('due_date');
    expect(checkFindingType('payment_amount', 'Either party may terminate this Agreement with thirty (30) days written notice.')).toBe('termination');
    expect(checkFindingType('due_date', 'The Developer will build a clickable prototype with up to ten (10) screens.')).toBe('other');
    expect(checkFindingType('termination', 'A fixed late fee of PHP 250 applies to each late installment.')).toBe('late_fee');
    expect(checkFindingType('party', 'The monthly fee is PHP 20,000, payable in advance.')).toBe('payment_amount');
  });

  it('keeps types the block supports, and never touches types it does not check', () => {
    expect(checkFindingType('late_fee', 'Unpaid amounts incur a charge of PHP 1,000 per month of delay.')).toBe('late_fee');
    expect(checkFindingType('payment_amount', 'Kailangan ng isang (1) buwang deposit at isang (1) buwang advance bago lumipat.')).toBe('payment_amount');
    expect(checkFindingType('ownership', 'The fee is due on the 5th day of each month.')).toBe('ownership');
    expect(checkFindingType('other', 'The fee is due on the 5th day of each month.')).toBe('other');
  });

  it('never breaks a labelled type in the 30-contract eval set', () => {
    const broken: string[] = [];
    for (const c of EVAL_CONTRACTS) {
      for (const l of c.labels) {
        const text = c.pages.flatMap((p) => p.blocks).find((b) => b.id === l.blockId)!.text;
        for (const t of l.types) if (!l.types.includes(checkFindingType(t, text))) broken.push(`${c.id}/${l.blockId}: ${t}`);
      }
    }
    expect(broken).toEqual([]);
  });

  it('recovers wrong model types on the eval set and the result still passes the evidence gate', () => {
    // Simulated model mistakes: every labelled block answered with a type it is NOT labelled with.
    const WRONG: FindingType[] = ['late_fee', 'payment_amount', 'due_date', 'termination', 'party'];
    let before = 0;
    let after = 0;
    for (const c of EVAL_CONTRACTS) {
      const units = extractionUnits(c.pages);
      const candidates = c.labels.flatMap((l) => {
        const unit = units.find((u) => u.block.id === l.blockId)!;
        const wrong = WRONG.find((t) => !l.types.includes(t))!;
        const parsed = parseModelOutput(reply(wrong), unit);
        return parsed.ok ? parsed.candidates : [];
      });
      const { accepted, rejected } = validateCandidates(candidates, c.pages);
      expect(rejected).toEqual([]);
      before += c.labels.length; // every simulated answer had a wrong type
      after += scoreFindings(c.labels, accepted, c.injectionBlockIds).typeMismatches;
    }
    expect(after).toBeLessThan(before * 0.6);
  });

  it('parse output carries the checked type and a matching readable title, and never adds an amount', () => {
    const c = EVAL_CONTRACTS.find((x) => x.id === 'svc-04')!;
    const unit = extractionUnits(c.pages).find((u) => u.block.text.startsWith('The fee is due'))!;
    const parsed = parseModelOutput(reply('late_fee', { title: 'Late fee' }), unit);
    expect(parsed.ok).toBe(true);
    const [f] = (parsed as { candidates: Finding[] }).candidates;
    expect(f!.type).toBe('due_date');
    expect(f!.title).toBe('Due date');
    expect(f!.normalizedValue).toBeUndefined();
  });
});
