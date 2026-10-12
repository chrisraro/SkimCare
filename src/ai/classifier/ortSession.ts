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

export type OrtTensorCtor = new (type: 'int64' | 'int32', data: BigInt64Array | Int32Array, dims: readonly number[]) => unknown;

/** Throws `load_failed` when the model does not take the inputs the spec names. */
export function wrapOrtSession(session: OrtLikeSession, Tensor: OrtTensorCtor, spec: LayaInferenceSpec): ClassifierSession {
  const { ids, mask, typeIds, dtype } = spec.inputs;
  for (const name of [ids, mask]) {
    if (!session.inputNames.includes(name)) throw new ClassifierLoadError('load_failed', `the model has no input "${name}"`);
  }
  const output = session.outputNames.includes(spec.output) ? spec.output : undefined;
  if (!output) throw new ClassifierLoadError('load_failed', `the model has no output "${spec.output}"`);
  const wantsTypeIds = typeIds !== undefined && session.inputNames.includes(typeIds);

  const tensor = (values: number[]) =>
    dtype === 'int64'
      ? new Tensor('int64', BigInt64Array.from(values, (v) => BigInt(v)), [1, values.length])
      : new Tensor('int32', Int32Array.from(values), [1, values.length]);

  return {
    async run(input: EncodedInput) {
      const feeds: Record<string, unknown> = { [ids]: tensor(input.ids), [mask]: tensor(input.mask) };
      if (wantsTypeIds && typeIds) feeds[typeIds] = tensor(input.typeIds);
      const out = await session.run(feeds);
      const data = out[output]?.data;
      if (!(data instanceof Float32Array)) throw new Error('the model returned no float scores');
      return data;
    },
    release: () => session.release(),
  };
}
