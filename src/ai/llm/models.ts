/**
 * GGUF model candidates for Milestone 1 (PRD §10: Qwen3 0.6B or 1.7B, chosen
 * after device testing). Sizes and SHA-256 come from the Hugging Face LFS
 * metadata at the pinned revision; readiness verifies the installed file
 * against them before reporting offline-ready.
 *
 * `sourceUrl` is for developers placing the file (e.g. `adb push`). The app
 * itself never downloads anything.
 */
export interface ModelSpec {
  id: string;
  name: string;
  fileName: string;
  quantization: string;
  sizeBytes: number;
  sha256: string;
  license: string;
  sourceUrl: string;
}

const UNSLOTH_06B = 'https://huggingface.co/unsloth/Qwen3-0.6B-GGUF/resolve/50968a4468ef4233ed78cd7c3de230dd1d61a56b';
const UNSLOTH_17B = 'https://huggingface.co/unsloth/Qwen3-1.7B-GGUF/resolve/d7f544eead698dbd1f15126ef60b45a1e1933222';

export const MODEL_CANDIDATES: readonly ModelSpec[] = [
  {
    id: 'qwen3-0.6b-q4_k_m',
    name: 'Qwen3 0.6B',
    fileName: 'Qwen3-0.6B-Q4_K_M.gguf',
    quantization: 'Q4_K_M',
    sizeBytes: 396_705_472,
    sha256: 'ac2d97712095a558e31573f62f466a3f9d93990898b0ec79d7c974c1780d524a',
    license: 'Apache-2.0',
    sourceUrl: `${UNSLOTH_06B}/Qwen3-0.6B-Q4_K_M.gguf`,
  },
  {
    id: 'qwen3-0.6b-q4_0',
    name: 'Qwen3 0.6B',
    fileName: 'Qwen3-0.6B-Q4_0.gguf',
    quantization: 'Q4_0',
    sizeBytes: 382_156_480,
    sha256: '33bcc57074ec7b6eada5a90651ee546ec0c2b271002c22baf9f1b2dd1e8f75cb',
    license: 'Apache-2.0',
    sourceUrl: `${UNSLOTH_06B}/Qwen3-0.6B-Q4_0.gguf`,
  },
  {
    id: 'qwen3-1.7b-q4_k_m',
    name: 'Qwen3 1.7B',
    fileName: 'Qwen3-1.7B-Q4_K_M.gguf',
    quantization: 'Q4_K_M',
    sizeBytes: 1_107_409_472,
    sha256: 'b139949c5bd74937ad8ed8c8cf3d9ffb1e99c866c823204dc42c0d91fa181897',
    license: 'Apache-2.0',
    sourceUrl: `${UNSLOTH_17B}/Qwen3-1.7B-Q4_K_M.gguf`,
  },
];

/** Starting point: smallest model with good quality; switch after the device benchmark. */
export const DEFAULT_MODEL_ID = 'qwen3-0.6b-q4_k_m';

export function getModelSpec(id: string = DEFAULT_MODEL_ID): ModelSpec | undefined {
  return MODEL_CANDIDATES.find((m) => m.id === id);
}
