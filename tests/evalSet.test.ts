import { describe, expect, it } from '@jest/globals';
import { scoreFindings } from '@/ai/eval/score';
import { moneyAmountsIn, validateCandidates } from '@/ai/evidenceGate';
import { extractionUnits } from '@/ai/llm/chunking';
import { buildExtractionMessages, systemPrompt } from '@/ai/llm/prompt';
import type { Finding } from '@/domain/schema';
import { EVAL_CONTRACTS, type EvalContract } from './fixtures/contracts';

const textOf = (c: EvalContract, blockId: string) => c.pages.flatMap((p) => p.blocks).find((b) => b.id === blockId)!.text;

/** What a perfect model would return for a contract: one cited finding per labelled block. */
function perfectCandidates(c: EvalContract) {
  return c.labels.map((l, i) => ({
    id: `${c.id}_${i}`,
    type: l.types[0],
    title: 'Term',
    evidence: { page: Number(l.blockId.slice(1, l.blockId.indexOf('_'))), blockId: l.blockId, quote: textOf(c, l.blockId) },
    explanation: 'What this sentence says.',
    reviewStatus: 'explained',
    questions: [],
  }));
}

describe('evaluation contract set (PRD §17)', () => {
  const count = (cat: string) => EVAL_CONTRACTS.filter((c) => c.category === cat).length;

  it('meets the PRD minimum per text category', () => {
    expect(count('service')).toBeGreaterThanOrEqual(10);
    expect(count('installment')).toBeGreaterThanOrEqual(10);
    expect(count('mixed_language')).toBeGreaterThanOrEqual(5);
    expect(count('injection')).toBeGreaterThanOrEqual(5);
  });

  it('has unique ids and enough labelled terms per contract', () => {
    expect(new Set(EVAL_CONTRACTS.map((c) => c.id)).size).toBe(EVAL_CONTRACTS.length);
    for (const c of EVAL_CONTRACTS) expect(c.labels.length).toBeGreaterThanOrEqual(3);
  });

  it('marks injection text in every injection contract and never labels it as a term', () => {
    for (const c of EVAL_CONTRACTS.filter((x) => x.category === 'injection')) {
      expect(c.injectionBlockIds.length).toBeGreaterThan(0);
      expect(c.labels.some((l) => c.injectionBlockIds.includes(l.blockId))).toBe(false);
    }
  });

  it('never sends injection text to the model, even as context it cannot break out of', () => {
    for (const c of EVAL_CONTRACTS.filter((x) => x.category === 'injection')) {
      const units = extractionUnits(c.pages);
      expect(units.some((u) => c.injectionBlockIds.includes(u.block.id))).toBe(false);
      for (const u of units) {
        const user = buildExtractionMessages(u, c.type, 'en')[1]!.content;
        expect(user.match(/<\/block>/g)).toHaveLength(1);
      }
    }
  });

  it('keeps the prompt’s example amounts out of the eval contracts', () => {
    const inPrompt = new Set([...moneyAmountsIn(systemPrompt('en')), ...moneyAmountsIn(systemPrompt('fil'))]);
    expect(inPrompt.size).toBeGreaterThan(0);
    const leaked = EVAL_CONTRACTS.flatMap((c) =>
      c.pages.flatMap((p) => p.blocks).flatMap((b) => moneyAmountsIn(b.text).filter((n) => inPrompt.has(n)).map((n) => `${c.id}/${b.id}: ${n}`)),
    );
    expect(leaked).toEqual([]);
  });

  it('asks the model about every labelled term', () => {
    for (const c of EVAL_CONTRACTS) {
      const asked = new Set(extractionUnits(c.pages).map((u) => u.block.id));
      expect(c.labels.filter((l) => !asked.has(l.blockId))).toEqual([]);
    }
  });

  it.each(EVAL_CONTRACTS.map((c) => [c.id, c] as const))('%s: a perfect extraction passes the gate and scores 1.0', (_id, c) => {
    const { accepted, rejected } = validateCandidates(perfectCandidates(c), c.pages);
    expect(rejected).toEqual([]);
    const score = scoreFindings(c.labels, accepted, c.injectionBlockIds);
    expect([score.precision, score.recall, score.injectionCited]).toEqual([1, 1, 0]);
  });
});

describe('extraction scoring', () => {
  it('counts misses, wrong types, unlabelled citations, injection citations and abstentions', () => {
    const c = EVAL_CONTRACTS.find((x) => x.id === 'inj-02')!;
    const { accepted } = validateCandidates(perfectCandidates(c), c.pages);
    const [first, second, ...rest] = accepted as [Finding, Finding, ...Finding[]];
    const injection = c.injectionBlockIds[0]!;
    const findings: Finding[] = [
      { ...second, type: 'ownership' }, // wrong type on a labelled block
      ...rest,
      { ...first, id: 'inj', evidence: { page: 1, blockId: injection, quote: textOf(c, injection) } }, // cites the instruction
      { ...first, id: 'abstain', evidence: undefined },
    ];
    // `first` itself is dropped → one more miss.
    const score = scoreFindings(c.labels, findings, c.injectionBlockIds);
    expect(score).toMatchObject({
      truePositives: c.labels.length - 2,
      falseNegatives: 2,
      typeMismatches: 1,
      falsePositives: 1,
      injectionCited: 1,
      abstentions: 1,
    });
    expect(score.recall).toBeCloseTo((c.labels.length - 2) / c.labels.length);
  });
});
