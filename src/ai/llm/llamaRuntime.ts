/**
 * llama.rn adapter: the only file that touches the native model runtime.
 * Implements `CompletionRunner` (extraction + quiz) and `ReadinessProbe`.
 *
 * The model is a GGUF file in app-private storage: `<documents>/models/<fileName>`.
 * During development it is placed with `adb push` + `run-as` (docs/LOCAL_LLM.md).
 * Nothing here logs prompts or model output (PRD §14).
 */
import { File, Paths } from 'expo-file-system';
import { initLlama, type LlamaContext } from 'llama.rn';
import { AbortedError } from '../engines';
import type { CompletionRequest, CompletionRunner } from './localLlmEngine';
import type { ModelSpec } from './models';
import { isSmokeTestReply, SMOKE_TEST_MESSAGES, type ReadinessProbe } from './readiness';

/**
 * System prompt (~690 tokens) + context (≤300 chars) + one block + output (≤200)
 * stays under ~1,500 tokens; 2048 leaves headroom. The KV cache is ~112 KB per
 * token for Qwen3 0.6B, so 4096 reserved ~470 MB that a 4 GB phone needs elsewhere.
 */
export const CONTEXT_TOKENS = 2048;

/** CPU placement for llama.cpp. Undefined = llama.rn's default (4 threads). Set from the device benchmark. */
export interface CpuSettings {
  n_threads?: number;
  /** Cores to run on, e.g. "6-7" for the two fast cores of a 2+6 big.LITTLE chip. */
  cpu_mask?: string;
}
export const CPU_SETTINGS: CpuSettings = {};

export function modelFile(spec: ModelSpec): File {
  return new File(Paths.document, 'models', spec.fileName);
}

let loaded: { path: string; context: LlamaContext } | null = null;

/**
 * A llama.rn context is not safe for concurrent use: two completions at once crash
 * natively (seen on the emulator when "Run checks again" was tapped while the check
 * ran). Every model operation — load, completion, release — waits its turn here.
 */
let queue: Promise<unknown> = Promise.resolve();
function serial<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task, task);
  queue = run.catch(() => undefined);
  return run;
}

/** Loads the model once and reuses the context; a different path releases the old one first. Call inside `serial`. */
async function contextFor(path: string): Promise<LlamaContext> {
  if (loaded?.path === path) return loaded.context;
  if (loaded) await release();
  const context = await initLlama({ model: path, n_ctx: CONTEXT_TOKENS, n_gpu_layers: 0, use_mlock: false, ...cpuParams(CPU_SETTINGS) });
  loaded = { path, context };
  return context;
}

function cpuParams(cpu: CpuSettings) {
  return { n_threads: cpu.n_threads, cpu_mask: cpu.cpu_mask, cpu_strict: cpu.cpu_mask ? true : undefined };
}

export interface BenchRow {
  model: string;
  cpu: CpuSettings;
  promptTokensPerSecond: number;
  generatedTokensPerSecond: number;
  loadMs: number;
}

/**
 * Dev-only speed test (no document text: llama.cpp's synthetic bench). Loads each
 * model file with each CPU setting, one at a time through the serial queue, and
 * releases it again. Used to pick `CPU_SETTINGS` and the default model per device.
 */
export function benchmark(models: ModelSpec[], cpus: CpuSettings[], onRow: (row: BenchRow) => void): Promise<void> {
  return serial(async () => {
    await release();
    for (const spec of models) {
      const file = modelFile(spec);
      if (!file.exists) continue;
      for (const cpu of cpus) {
        const started = Date.now();
        const context = await initLlama({ model: file.uri, n_ctx: 512, n_gpu_layers: 0, use_mlock: false, ...cpuParams(cpu) });
        const loadMs = Date.now() - started;
        try {
          const r = await context.bench(128, 32, 1, 1);
          onRow({ model: `${spec.name} ${spec.quantization}`, cpu, promptTokensPerSecond: r.speedPp, generatedTokensPerSecond: r.speedTg, loadMs });
        } finally {
          await context.release();
        }
      }
    }
  });
}

async function release(): Promise<void> {
  const current = loaded;
  loaded = null;
  await current?.context.release();
}

/** Frees model memory (PRD §12: low memory → release model, keep the document). */
export function releaseModel(): Promise<void> {
  return serial(release);
}

async function complete(context: LlamaContext, req: Omit<CompletionRequest, 'jsonSchema'> & { jsonSchema?: object }) {
  if (req.signal?.aborted) throw new AbortedError();
  const onAbort = () => void context.stopCompletion();
  req.signal?.addEventListener('abort', onAbort);
  try {
    const result = await context.completion({
      messages: req.messages,
      response_format: req.jsonSchema ? { type: 'json_schema', json_schema: { strict: true, schema: req.jsonSchema } } : undefined,
      n_predict: req.maxTokens,
      temperature: 0,
      enable_thinking: false,
    });
    if (result.interrupted || req.signal?.aborted) throw new AbortedError();
    return result;
  } finally {
    req.signal?.removeEventListener('abort', onAbort);
  }
}

export function createLlamaRunner(spec: ModelSpec): CompletionRunner {
  return (req) =>
    serial(async () => {
      const result = await complete(await contextFor(modelFile(spec).uri), req);
      return result.content || result.text;
    });
}

export function createLlamaProbe(spec: ModelSpec, ocrAvailable: () => Promise<boolean>): ReadinessProbe {
  return {
    async modelFile() {
      const file = modelFile(spec);
      if (!file.exists) return undefined;
      return { path: file.uri, sizeBytes: file.info().size ?? 0 };
    },
    async hash(path) {
      // Native MD5 is the only file hash expo-file-system offers; SHA-256 of the same bytes was checked when pinned.
      const md5 = new File(path).info({ md5: true }).md5;
      if (!md5) throw new Error('The phone did not return a file hash.');
      return { algorithm: 'md5', hex: md5 };
    },
    async freeStorageBytes() {
      return Paths.availableDiskSpace;
    },
    async ocrAvailable() {
      return ocrAvailable();
    },
    async smokeTest(path) {
      const result = await serial(async () => complete(await contextFor(path), { messages: SMOKE_TEST_MESSAGES, maxTokens: 32 }));
      const text = result.content || result.text;
      return {
        ok: isSmokeTestReply(text),
        tokensPerSecond: result.timings?.predicted_per_second,
        error: isSmokeTestReply(text) ? undefined : 'unexpected reply',
      };
    },
  };
}
