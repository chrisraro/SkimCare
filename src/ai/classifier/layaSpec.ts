/**
 * How to feed the Laya clause classifier and read its output. The values are not typed in
 * here: they are read from the release's own spec, `ml/laya/release/laya-v1.spec.json`
 * (bundled by Metro on phone and web), and checked once at startup. The algorithm that
 * uses them is ml/laya/INFERENCE_SPEC.md, implemented in laya.ts (`buildLayaInput`,
 * `decodeLogits`) and checked against the golden vectors in tests/classifier.test.ts.
 *
 * Summary of laya-v1: input = head_ids (the fixed "Contract term type?" question and its
 * 12 options) + tokens of "block || earlier text: context" (no special tokens, start kept,
 * at most `room`) + sep_id. Inputs `input_ids` and `attention_mask`, both int64 [1, n]; no
 * token type ids, no text pair. Output `logits` [1, 12] in `labels` order. Confidence =
 * softmax(logits / temperature); used only at or above `threshold`.
 */
import release from '../../../ml/laya/release/laya-v1.spec.json';
import { isTriageLabel, type TriageLabel } from '../llm/triageClassifier';

export interface LayaInferenceSpec {
  /** Release tag shown in diagnostics (e.g. "laya-v1"). */
  version: string;
  /** Output index → label (the model's order, `none` last in laya-v1). */
  labels: readonly TriageLabel[];
  /** The "not a term" label. */
  noneLabel: TriageLabel;
  /** Question + options, prepended to every input (already includes <bos> … <eos>). */
  headIds: readonly number[];
  /** Appended after the block tokens (<eos>). */
  sepId: number;
  /** Total input length limit (head + block + sep). */
  maxLen: number;
  /** Block (+ context) tokens kept: maxLen − head − sep. The START is kept. */
  room: number;
  /** Whether the previous block is appended after `contextSep`. */
  useContext: boolean;
  contextSep: string;
  /** Logits are divided by this before the softmax (calibrated confidence). */
  temperature: number;
  /** Confidence at or above which the classifier's label is used. */
  threshold: number;
  /** Input / output tensor names. Inputs are int64 [1, n]. */
  inputs: { ids: string; mask: string };
  output: string;
  /** Fixed readiness input (no user data) and the label a working model must give it (golden case 1). */
  smoke: { text: string; expect?: TriageLabel };
}

/** The shape of `*.spec.json` (format skimcare-laya-triage/1) that the runtime relies on. */
interface ReleaseSpecJson {
  format: string;
  release: string;
  labels: string[];
  none_label: string;
  head_ids: number[];
  max_len: number;
  room: number;
  sep_id: number;
  use_context: boolean;
  context_sep: string;
  temperature: number;
  threshold: number;
  onnx: { inputs: Record<string, string>; outputs: Record<string, string> };
}

/** Builds and validates the runtime spec from a release spec.json. Throws on anything the runtime cannot follow. */
export function specFromRelease(json: ReleaseSpecJson, smoke: LayaInferenceSpec['smoke']): LayaInferenceSpec {
  const fail = (why: string): never => {
    throw new Error(`Laya spec ${json.release ?? '?'}: ${why}`);
  };
  if (json.format !== 'skimcare-laya-triage/1') fail(`unknown format ${json.format}`);
  const labels = json.labels.map((l) => (isTriageLabel(l) ? l : fail(`unknown label ${l}`)));
  if (!isTriageLabel(json.none_label) || !labels.includes(json.none_label)) fail('none_label is not a label');
  if (json.head_ids.length + json.room + 1 !== json.max_len) fail('head + room + sep must equal max_len');
  if (!(json.temperature > 0) || !(json.threshold > 0 && json.threshold <= 1)) fail('bad temperature or threshold');
  const inputNames = Object.keys(json.onnx.inputs);
  if (inputNames.join(',') !== 'input_ids,attention_mask' || Object.values(json.onnx.inputs).some((t) => !t.startsWith('int64'))) {
    fail('expected int64 inputs input_ids + attention_mask only');
  }
  const output = Object.keys(json.onnx.outputs)[0] ?? fail('no output');
  return {
    version: json.release,
    labels,
    noneLabel: json.none_label as TriageLabel,
    headIds: json.head_ids,
    sepId: json.sep_id,
    maxLen: json.max_len,
    room: json.room,
    useContext: json.use_context,
    contextSep: json.context_sep,
    temperature: json.temperature,
    threshold: json.threshold,
    inputs: { ids: 'input_ids', mask: 'attention_mask' },
    output,
    smoke,
  };
}

/** Golden case 1 (ml/laya/golden/laya-v1.golden.json): payment_amount at 0.9936. Fixed text, no user data. */
export const LAYA_SMOKE = { text: 'The total fee is PHP 18,000, payable in two equal installments.', expect: 'payment_amount' } as const;

export const LAYA_SPEC: LayaInferenceSpec = specFromRelease(release, LAYA_SMOKE);
