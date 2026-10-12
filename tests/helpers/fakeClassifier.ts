/**
 * Test double for `TriageClassifier`: answers from a table keyed by block text (or a
 * function), records what it was asked, and can be "missing" (ready() → false) or throw.
 */
import type { ClassifierContext, TriageClassification, TriageClassifier, TriageLabel } from '@/ai/llm/triageClassifier';

export type FakeAnswer = { label: TriageLabel; confidence: number } | Error;

export interface FakeClassifier extends TriageClassifier {
  calls: { text: string; ctx?: ClassifierContext }[];
  released: number;
}

export function fakeClassifier(answer: (text: string) => FakeAnswer | undefined, opts: { ready?: boolean } = {}): FakeClassifier {
  const fake: FakeClassifier = {
    name: 'fake classifier',
    calls: [],
    released: 0,
    async ready() {
      return opts.ready ?? true;
    },
    async classify(text, ctx): Promise<TriageClassification> {
      fake.calls.push({ text, ctx });
      const a = answer(text) ?? { label: 'none', confidence: 0.99 };
      if (a instanceof Error) throw a;
      return { label: a.label, confidence: a.confidence, probs: { [a.label]: a.confidence } };
    },
    async release() {
      fake.released++;
    },
  };
  return fake;
}
