/**
 * Regressions for the 2026-10-10 QA pass (stored review state). Synthetic data only.
 */
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { demoEngine, setDemoFixture } from '@/ai/demoEngine';
import { installmentAgreement } from '@/ai/demo/fixtures';
import { runAnalysis } from '@/ai/pipeline';
import { lateInstallmentScenario } from '@/ai/scenarioRules';
import type { AnalysisRun, DocumentRecord } from '@/domain/schema';
import { useDocuments } from '@/features/documents/store';
import { useReviewJob } from '@/features/review/jobStore';

jest.setTimeout(15_000);

async function savedDoc(): Promise<DocumentRecord> {
  setDemoFixture(installmentAgreement.id);
  const pages = structuredClone(installmentAgreement.pages);
  pages.forEach((p) => p.blocks.forEach((b) => (b.verifiedAt = '2026-10-10T00:00:00.000Z')));
  const analysis = await runAnalysis({ engine: demoEngine, pages, ocrRevision: 0, documentType: 'installment_agreement', language: 'en' });
  const doc: DocumentRecord = {
    id: 'doc_qa',
    title: 'Fictional installment',
    type: 'installment_agreement',
    language: 'en',
    createdAt: '2026-10-10T00:00:00.000Z',
    updatedAt: '2026-10-10T00:00:00.000Z',
    pages,
    ocrRevision: 0,
    analysis,
    analysisStale: false,
  };
  useDocuments.getState().save(doc);
  return doc;
}

const current = () => useDocuments.getState().byId.doc_qa!;

describe('documents store', () => {
  beforeEach(() => {
    useDocuments.getState().eraseAll();
    useReviewJob.getState().clear();
  });

  it('a corrected block un-confirms the facts read from it, so What-if cannot use the old figure (#11, #28)', async () => {
    await savedDoc();
    expect(lateInstallmentScenario(current().analysis!.facts).status).toBe('computed');
    useDocuments.getState().correctBlock('doc_qa', 1, 'p1_b2', 'Buyer agrees to pay a monthly installment of PHP 2,500 for twelve (12) months.');
    expect(current().analysisStale).toBe(true);
    expect(lateInstallmentScenario(current().analysis!.facts).status).toBe('insufficient_information');
  });

  it('a re-run built from older text keeps the review marked out of date (#15)', async () => {
    const doc = await savedDoc();
    const stale: AnalysisRun = { ...doc.analysis!, ocrRevision: 0 };
    useDocuments.getState().correctBlock('doc_qa', 1, 'p1_b3', 'Each installment is due on the 20th day of every month.');
    useDocuments.getState().setAnalysis('doc_qa', stale);
    expect(current().analysisStale).toBe(true);
    useDocuments.getState().setAnalysis('doc_qa', { ...stale, ocrRevision: current().ocrRevision });
    expect(current().analysisStale).toBe(false);
  });

  it('a re-run keeps the person’s own questions and edits (#17)', async () => {
    await savedDoc();
    const s = useDocuments.getState();
    s.upsertQuestion('doc_qa', { id: 'user_1', text: 'Can I pay early without a fee?', edited: true });
    const derived = current().analysis!.questions.find((q) => !q.id.startsWith('user_'))!;
    s.upsertQuestion('doc_qa', { ...derived, text: `${derived.text} (asked by phone)`, edited: true });
    const fresh = await runAnalysis({ engine: demoEngine, pages: current().pages, ocrRevision: current().ocrRevision, documentType: 'installment_agreement', language: 'en' });
    s.setAnalysis('doc_qa', fresh);
    const texts = current().analysis!.questions.map((q) => q.text);
    expect(texts).toContain('Can I pay early without a fee?');
    expect(texts).toContain(`${derived.text} (asked by phone)`);
    expect(texts.filter((t) => t.startsWith(derived.text))).toHaveLength(1);
  });

  it('deleting a finished review retires the "Review ready" notice (#20)', async () => {
    await savedDoc();
    useReviewJob.setState({ status: 'done', docId: 'doc_qa' });
    useDocuments.getState().remove('doc_qa');
    expect(useReviewJob.getState().status).toBe('idle');
  });
});
