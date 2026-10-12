/**
 * Pass 1 ("triage": is this block a term, and which type?) by a small on-device
 * classifier instead of the language model. The extraction engine asks the classifier
 * first and uses its label only when it is confident (`threshold`); otherwise, or when the
 * classifier is missing, unverified or fails, it asks the language model exactly as before
 * (localLlmEngine.ts). Pass 2 (the explanation) always uses the language model.
 *
 * The classifier only picks a label from a fixed list. Its output is untrusted like any
 * model output: the type is still checked against the block (typeCheck.ts) and every
 * finding still goes through the evidence gate. Implementations never log text.
 */
import { FindingType, type DocumentType } from '@/domain/schema';

export type TriageLabel = FindingType | 'none';

/** Every label the classifier may return. */
export const TRIAGE_LABELS: readonly TriageLabel[] = ['none', ...FindingType.options];

export function isTriageLabel(v: unknown): v is TriageLabel {
  return typeof v === 'string' && (TRIAGE_LABELS as readonly string[]).includes(v);
}

export interface ClassifierContext {
  /** Previous block on the same page (read-only context, never cited). */
  context?: string;
  documentType?: DocumentType;
  language?: 'en' | 'fil';
}

export interface TriageClassification {
  label: TriageLabel;
  /** Probability of `label` (0–1). */
  confidence: number;
  /** Probability of every label the model knows (softmax over its outputs). */
  probs: Partial<Record<TriageLabel, number>>;
}

export interface TriageClassifier {
  /** For diagnostics only. */
  readonly name: string;
  /**
   * Loads the classifier if needed: files present, checksums verified, session created.
   * Resolves false (never throws) when it cannot be used; the engine then uses the
   * language model for the type pass. An unverified file is never loaded.
   */
  ready(): Promise<boolean>;
  classify(text: string, ctx?: ClassifierContext, signal?: AbortSignal): Promise<TriageClassification>;
  /** Frees the session (low memory). The next `ready()` loads it again. */
  release(): Promise<void>;
}

/**
 * Below this confidence the language model decides instead. Placeholder until the
 * classifier's calibration is known (ml/laya/INFERENCE_SPEC.md); the spec may override it.
 */
export const DEFAULT_TRIAGE_THRESHOLD = 0.85;
