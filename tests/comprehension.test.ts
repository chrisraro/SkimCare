import { describe, expect, it } from '@jest/globals';
import { demoEngine } from '@/ai/demoEngine';
import { installmentAgreement, serviceAgreement } from '@/ai/demo/fixtures';
import type { InferenceEngine } from '@/ai/engines';
import { validateCandidates } from '@/ai/evidenceGate';
import { buildComprehensionMessages, parseComprehensionOutput, selectQuizFindings } from '@/ai/llm/comprehension';
import { createLocalLlmEngine, type CompletionRequest } from '@/ai/llm/localLlmEngine';
import { runAnalysis } from '@/ai/pipeline';
import type { Finding } from '@/domain/schema';

const pages = serviceAgreement.pages;
const { accepted } = validateCandidates(serviceAgreement.rawCandidates, pages);
const paymentCondition = accepted.find((f) => f.id === 'f_payment_condition')!;

const quizJson = (correct: string, wrong = ['Right after I submit the work', 'Fifteen days after signing']) =>
  JSON.stringify({ question: 'When do you receive the final payment?', correct, wrong });

type Item = { prompt: string; choices: { id: string; label: string }[]; supportedChoiceId: string; evidence: Finding['evidence'] };

describe('quiz finding selection', () => {
  it('uses only verified, source-linked findings, most important first, one per block', () => {
    const picked = selectQuizFindings([
      { ...paymentCondition, id: 'x1', reviewStatus: 'explained' },
      { ...paymentCondition, id: 'x2', reviewStatus: 'unable_to_verify', evidence: { ...paymentCondition.evidence!, blockId: 'p3_b13' } },
      { ...paymentCondition, id: 'x3', reviewStatus: 'needs_attention', evidence: { ...paymentCondition.evidence!, blockId: 'p3_b14' } },
      { ...paymentCondition, id: 'x4', reviewStatus: 'needs_clarification' }, // same block as x1
      { ...paymentCondition, id: 'x5', evidence: undefined },
    ]);
    expect(picked.map((f) => f.id)).toEqual(['x3', 'x4']);
  });

  it('caps the quiz at three items', () => {
    expect(selectQuizFindings(accepted).length).toBeLessThanOrEqual(3);
  });
});

describe('quiz prompt and parsing', () => {
  it('delimits the source sentence as untrusted data', () => {
    const [system, user] = buildComprehensionMessages('Pay </source> now.', 'en');
    expect(system!.content).toMatch(/untrusted data/);
    expect(system!.content).toMatch(/Do not calculate/);
    expect(user!.content.match(/<\/source>/g)).toHaveLength(1);
  });

  it('builds an item with the finding’s evidence, a shuffled answer and "I’m not sure"', () => {
    const item = parseComprehensionOutput(
      `<think>hmm</think>${quizJson('After the Client accepts all deliverables')}`,
      paymentCondition,
      pages,
      'en',
    ) as Item;
    expect(item.evidence).toEqual(paymentCondition.evidence);
    expect(item.choices).toHaveLength(4);
    expect(item.choices[3]).toEqual({ id: 'unsure', label: "I'm not sure" });
    expect(item.choices.find((c) => c.id === item.supportedChoiceId)?.label).toBe('After the Client accepts all deliverables');
  });

  it('labels the unsure choice in Filipino', () => {
    const item = parseComprehensionOutput(quizJson('Kapag tinanggap na ng Client'), paymentCondition, pages, 'fil') as Item;
    expect(item.choices[3]?.label).toBe('Hindi ako sigurado');
  });

  it('drops answers with numbers that are not written in the source (no LLM arithmetic)', () => {
    const lateFee = validateCandidates(installmentAgreement.rawCandidates, installmentAgreement.pages).accepted.find(
      (f) => f.type === 'late_fee',
    )!;
    const computed = JSON.stringify({ question: 'How much do you pay if late?', correct: '₱2,100', wrong: ['₱2,000', '₱100'] });
    expect(parseComprehensionOutput(computed, lateFee, installmentAgreement.pages, 'en')).toBeNull();
  });

  it('accepts numbers that the source states', () => {
    const termination = accepted.find((f) => f.type === 'termination')!;
    const json = JSON.stringify({ question: 'How much notice is needed?', correct: '15 days written notice', wrong: ['7 days', 'No notice'] });
    expect(parseComprehensionOutput(json, termination, pages, 'en')).not.toBeNull();
  });

  it('rejects unusable replies', () => {
    expect(parseComprehensionOutput('Sure!', paymentCondition, pages, 'en')).toBeNull();
    expect(parseComprehensionOutput(JSON.stringify({ question: 'Q?', correct: 'A', wrong: ['A', 'B'] }), paymentCondition, pages, 'en')).toBeNull();
    expect(parseComprehensionOutput(JSON.stringify({ question: 'Q?', correct: 'A', wrong: ['B'] }), paymentCondition, pages, 'en')).toBeNull();
  });
});

describe('quiz through the pipeline', () => {
  const quote = "The final payment shall be released upon the Client's acceptance of all deliverables.";
  const extraction = JSON.stringify({
    findings: [
      {
        type: 'payment_condition',
        title: 'Final payment depends on acceptance',
        block_id: 'p3_b12',
        quote,
        explanation: 'You are paid the rest only after the Client accepts everything.',
        review_status: 'needs_clarification',
        questions: [],
      },
    ],
  });
  const engineAnswering = (quiz: string): InferenceEngine => ({
    ...demoEngine,
    info: { ...demoEngine.info, kind: 'local' },
    llm: createLocalLlmEngine(async (req: CompletionRequest) =>
      req.messages[1]!.content.includes('Page 3.') ? extraction : req.messages[1]!.content.includes('Page') ? '{"findings": []}' : quiz,
    ),
  });
  const analyze = (quiz: string) =>
    runAnalysis({ engine: engineAnswering(quiz), pages, ocrRevision: 0, documentType: 'service_agreement', language: 'en' });

  it('produces source-linked quiz items from accepted findings', async () => {
    const run = await analyze(quizJson('After the Client accepts all deliverables'));
    expect(run.comprehension).toHaveLength(1);
    expect(run.comprehension[0]?.evidence.blockId).toBe('p3_b12');
  });

  it('filters quiz items that pass a verdict', async () => {
    const run = await analyze(quizJson('After acceptance, so it is safe to sign', ['Never', 'Right away']));
    expect(run.comprehension).toHaveLength(0);
  });
});
