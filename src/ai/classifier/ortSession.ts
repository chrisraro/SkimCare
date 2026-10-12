/**
 * ONNX Runtime session → `ClassifierSession`. onnxruntime-react-native and
 * onnxruntime-web share the onnxruntime-common API (InferenceSession / Tensor), so the
 * phone and the browser feed the model the same way. Structural types keep this file
 * free of either package (they ship different onnxruntime-common versions).
 */
import type { ClassifierSession, EncodedInput } from './laya';
import { ClassifierLoadError } from './laya';
import type { LayaInferenceSpec } from './layaSpec';

export interface OrtLikeSession {
  readonly inputNames: readonly string[];
  readonly outputNames: readonly string[];
  run(feeds: Record<string, unknown>): Promise<Record<string, { data: unknown } | undefined>>;
  release(): Promise<void>;
}

export type OrtTensorCtor = new (type: 'int64', data: BigInt64Array, dims: readonly number[]) => unknown;

/**
 * Feeds `input_ids` and `attention_mask` as int64 [1, n] (nothing else: laya-v1 has no
 * token type ids) and reads `logits`. Throws `load_failed` when the model's inputs or
 * output differ from the spec.
 */
export function wrapOrtSession(session: OrtLikeSession, Tensor: OrtTensorCtor, spec: LayaInferenceSpec): ClassifierSession {
  const { ids, mask } = spec.inputs;
  for (const name of [ids, mask]) {
    if (!session.inputNames.includes(name)) throw new ClassifierLoadError('load_failed', `the model has no input "${name}"`);
  }
  const extra = session.inputNames.filter((n) => n !== ids && n !== mask);
  if (extra.length) throw new ClassifierLoadError('load_failed', `the model takes inputs the spec does not name (${extra.join(', ')})`);
  if (!session.outputNames.includes(spec.output)) throw new ClassifierLoadError('load_failed', `the model has no output "${spec.output}"`);

  const tensor = (values: number[]) => new Tensor('int64', BigInt64Array.from(values, (v) => BigInt(v)), [1, values.length]);

  return {
    async run(input: EncodedInput) {
      const out = await session.run({ [ids]: tensor(input.ids), [mask]: tensor(input.mask) });
      const data = out[spec.output]?.data;
      if (!(data instanceof Float32Array)) throw new Error('the model returned no float scores');
      return data;
    },
    release: () => session.release(),
  };
}
