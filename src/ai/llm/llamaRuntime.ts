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

/** Extraction chunk (~750 tokens) + prompt (~500) + output (≤1024) fits with headroom. */
export const CONTEXT_TOKENS = 4096;

export function modelFile(spec: ModelSpec): File {
  return new File(Paths.document, 'models', spec.fileName);
}

let loaded: { path: string; context: LlamaContext } | null = null;
let loading: Promise<LlamaContext> | null = null;

/** Loads the model once and reuses the context; a different path releases the old one first. */
async function contextFor(path: string): Promise<LlamaContext> {
  if (loaded?.path === path) return loaded.context;
  if (loading) return loading;
  loading = (async () => {
    if (loaded) await releaseModel();
    const context = await initLlama({ model: path, n_ctx: CONTEXT_TOKENS, n_gpu_layers: 0, use_mlock: false });
    loaded = { path, context };
    return context;
  })();
  try {
    return await loading;
  } finally {
    loading = null;
  }
}

/** Frees model memory (PRD §12: low memory → release model, keep the document). */
export async function releaseModel(): Promise<void> {
  const current = loaded;
  loaded = null;
  await current?.context.release();
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
  return async (req) => {
    const context = await contextFor(modelFile(spec).uri);
    const result = await complete(context, req);
    return result.content || result.text;
  };
}

export function createLlamaProbe(spec: ModelSpec, ocrAvailable: () => boolean): ReadinessProbe {
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
      const context = await contextFor(path);
      const result = await complete(context, { messages: SMOKE_TEST_MESSAGES, maxTokens: 32 });
      const text = result.content || result.text;
      return {
        ok: isSmokeTestReply(text),
        tokensPerSecond: result.timings?.predicted_per_second,
        error: isSmokeTestReply(text) ? undefined : 'unexpected reply',
      };
    },
  };
}
