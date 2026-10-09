import { describe, expect, it, jest } from '@jest/globals';
import { demoEngine, setDemoFixture } from '@/ai/demoEngine';
import { installmentAgreement, serviceAgreement } from '@/ai/demo/fixtures';
import { deriveFacts, hashPages, runAnalysis } from '@/ai/pipeline';
import { validateCandidates } from '@/ai/evidenceGate';

jest.setTimeout(10_000);

describe('analysis pipeline', () => {
  it('discards fabricated and misquoted findings, keeps grounded ones', async () => {
    setDemoFixture(serviceAgreement.id);
    const run = await runAnalysis({
      engine: demoEngine,
      pages: serviceAgreement.pages,
      ocrRevision: 0,
      documentType: 'service_agreement',
      language: 'en',
    });
    expect(run.rejectedCount).toBe(2);
    expect(run.engine.kind).toBe('demo');
    expect(run.findings.every((f) => !f.evidence || f.evidence.page <= 3)).toBe(true);
    expect(run.comprehension.length).toBe(3);
    expect(run.questions.length).toBeGreaterThan(0);
  });

  it('derives scenario facts that stay unconfirmed until the user verifies critical blocks', () => {
    const { accepted } = validateCandidates(installmentAgreement.rawCandidates, installmentAgreement.pages);
    const facts = deriveFacts(installmentAgreement.pages, accepted);
    expect(facts.map((f) => [f.key, f.value])).toEqual(
      expect.arrayContaining([
        ['installment_amount', 2000],
        ['due_day', 15],
        ['late_fee_fixed', 100],
      ]),
    );
    expect(facts.every((f) => f.confirmedByUser === false)).toBe(true);

    const verified = structuredClone(installmentAgreement.pages);
    verified[0]!.blocks.forEach((b) => (b.verifiedAt = '2026-10-09T00:00:00.000Z'));
    expect(deriveFacts(verified, accepted).every((f) => f.confirmedByUser)).toBe(true);
  });

  it('changes the provenance hash when OCR text is corrected', () => {
    const edited = structuredClone(installmentAgreement.pages);
    edited[0]!.blocks[1]!.text += ' ';
    expect(hashPages(edited)).not.toBe(hashPages(installmentAgreement.pages));
  });

  it('reports the demo engine as not offline-ready', async () => {
    const report = await demoEngine.checkReadiness();
    expect(report.offlineReady).toBe(false);
  });
});
