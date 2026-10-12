/**
 * How to feed the Laya classifier and read its output. Everything the runtime needs to
 * know about the exported model lives here, so adapting to ml/laya/INFERENCE_SPEC.md is a
 * change to this object (and its golden vectors in tests/classifier.test.ts), not to the
 * runtimes.
 *
 * TODO(laya): the values below are a standard sequence-classification export
 * (`optimum` / `torch.onnx` of AutoModelForSequenceClassification: inputs `input_ids` +
 * `attention_mask` int64 [1, n], output `logits` float32 [1, labels]). Replace them with the
 * spec when it lands: label order, max length, how the context and document type are
 * encoded, input dtype, and the calibrated threshold.
 */
import { DEFAULT_TRIAGE_THRESHOLD, TRIAGE_LABELS, type TriageLabel } from '../llm/triageClassifier';

export interface LayaInferenceSpec {
  /** Version tag shown in diagnostics. */
  version: string;
  /** Output index → label. Indices whose label is unknown to the app make the classifier unusable. */
  labels: readonly TriageLabel[];
  /** Token budget including special tokens. */
  maxTokens: number;
  /**
   * How the previous block is given to the model:
   *  - 'pair': as the second segment of a text pair (truncated first when too long)
   *  - 'none': not given
   */
  context: 'pair' | 'none';
  /** Characters of context kept (the end of the previous block, like prompt.ts). */
  contextChars: number;
  inputs: {
    ids: string;
    mask: string;
    /** Only for exports that take token type ids. */
    typeIds?: string;
    dtype: 'int64' | 'int32';
  };
  output: string;
  /** Confidence at or above which the classifier's label is used. */
  threshold: number;
  /** Fixed readiness input (no user data) and the label a working model must give it. */
  smoke: { text: string; expect?: TriageLabel };
}

export const LAYA_SPEC: LayaInferenceSpec = {
  version: 'laya-v1 (provisional)',
  labels: TRIAGE_LABELS,
  maxTokens: 256,
  context: 'pair',
  contextChars: 300,
  inputs: { ids: 'input_ids', mask: 'attention_mask', dtype: 'int64' },
  output: 'logits',
  threshold: DEFAULT_TRIAGE_THRESHOLD,
  smoke: { text: 'The Client shall pay the Provider PHP 18,000 within seven (7) days after receiving each invoice.' },
};
