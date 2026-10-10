/**
 * wllama adapter (llama.cpp compiled to WebAssembly): the web counterpart of
 * llamaRuntime.ts. Same GGUF, same prompts, temperature 0, Qwen3 thinking off,
 * JSON-schema constrained output (llama.cpp converts the schema to a grammar), and
 * one model operation at a time.
 *
 * The model is downloaded only when the user asks (`downloadModel`) into the
 * browser's Origin Private File System, then loaded from there — no network after
 * that. The wasm and worker files come from this site (`/vendor/wllama`), never a CDN.
 * Nothing here logs prompts or model output (PRD §14).
 */
import type { Model, Wllama, WllamaLogger } from '@wllama/wllama/esm/index';
import { AbortedError } from '../engines';
import type { CompletionRequest, CompletionRunner } from '../llm/localLlmEngine';
import type { ModelSpec } from '../llm/models';
import { isSmokeTestReply, SMOKE_TEST_MESSAGES, type SmokeTestResult } from '../llm/readiness';
import { fromLlamaTimings, type LlamaTimings } from '../llm/stats';
import { sha256OfBlob } from './sha256';
import { absoluteUrl, importVendor, vendorManifest, VENDOR } from './vendor';

type WllamaLib = typeof import('@wllama/wllama/esm/index');

/** Same budget as the phone (llamaRuntime.ts CONTEXT_TOKENS). */
export const WEB_CONTEXT_TOKENS = 2048;

const noop = () => undefined;
/** Library progress chatter is dropped; warnings and errors (no document text) are kept. */
const QUIET: WllamaLogger = { debug: noop, log: noop, warn: console.warn, error: console.error };

const lib = () => importVendor<WllamaLib>('wllama/index.js');

let manager: Promise<Wllama> | null = null;

/** A Wllama instance used only for its model cache (OPFS); it never loads a model. */
function cacheOwner(): Promise<Wllama> {
  manager ??= lib().then((l) => new l.Wllama({ default: absoluteUrl(`${VENDOR}/wllama/wllama.wasm`) }, { logger: QUIET, suppressNativeLog: true, allowOffline: true }));
  manager.catch(() => (manager = null));
  return manager;
}

async function createRuntime(): Promise<{ wllama: Wllama; compat: boolean }> {
  const [l, manifest] = await Promise.all([lib(), vendorManifest()]);
  const wllama = new l.Wllama({ default: absoluteUrl(`${VENDOR}/wllama/wllama.wasm`) }, { logger: QUIET, suppressNativeLog: true, allowOffline: true });
  // Browsers without JSPI/Memory64 (Safari, so every iPhone browser) need the compatibility build.
  // Self-hosted only: if it was not shipped, wllama tries the standard build and the readiness test reports the result.
  wllama.setCompat(
    manifest.wllamaCompat ? { worker: absoluteUrl(`${VENDOR}/wllama/compat/wllama.js`), wasm: absoluteUrl(`${VENDOR}/wllama/compat/wllama.wasm`) } : null,
  );
  const needsCompat = !('Suspending' in WebAssembly);
  return { wllama, compat: manifest.wllamaCompat && needsCompat };
}

export async function findCachedModel(spec: ModelSpec): Promise<Model | undefined> {
  const owner = await cacheOwner();
  const models = await owner.modelManager.getModels();
  return models.find((m) => m.url === spec.sourceUrl);
}

// ---- checksum, remembered per browser so the 400 MB hash runs once ----

const HASH_KEY = (spec: ModelSpec) => `skimcare.modelHash.${spec.id}`;

function rememberedHash(spec: ModelSpec, size: number): string | undefined {
  try {
    const raw = globalThis.localStorage?.getItem(HASH_KEY(spec));
    const rec = raw ? (JSON.parse(raw) as { size?: number; sha256?: string }) : undefined;
    return rec?.size === size ? rec.sha256 : undefined;
  } catch {
    return undefined;
  }
}

function rememberHash(spec: ModelSpec, size: number, sha256: string) {
  try {
    globalThis.localStorage?.setItem(HASH_KEY(spec), JSON.stringify({ size, sha256 }));
  } catch {
    // Storage blocked: the hash is simply computed again next time.
  }
}

export async function cachedModelSha256(spec: ModelSpec, signal?: AbortSignal): Promise<string> {
  const model = await findCachedModel(spec);
  if (!model) throw new Error('model not stored');
  const known = rememberedHash(spec, model.size);
  if (known) return known;
  const blobs = await model.open();
  if (blobs.length !== 1 || !blobs[0]) throw new Error('unexpected model files');
  const hex = await sha256OfBlob(blobs[0], signal);
  rememberHash(spec, model.size, hex);
  return hex;
}

/** User-started download into this browser, then SHA-256 verification. A damaged download is deleted. */
export async function downloadModel(spec: ModelSpec, onProgress: (loaded: number, total: number) => void, signal?: AbortSignal): Promise<void> {
  // Ask the browser not to evict the model under storage pressure (it may say no).
  await globalThis.navigator?.storage?.persist?.().catch(() => false);
  const owner = await cacheOwner();
  const model = await owner.modelManager.downloadModel(spec.sourceUrl, {
    signal,
    progressCallback: ({ loaded, total }) => onProgress(loaded, total > 0 ? total : spec.sizeBytes),
  });
  if (signal?.aborted) throw new AbortedError();
  const hex = await cachedModelSha256(spec, signal);
  if (hex !== spec.sha256) {
    await model.remove();
    try {
      globalThis.localStorage?.removeItem(HASH_KEY(spec));
    } catch {
      // ignore
    }
    throw new Error('The download was damaged (checksum mismatch) and was deleted. Try again.');
  }
}

// ---- inference ----

let loaded: { wllama: Wllama; compat: boolean } | null = null;
/** Set when this llama.cpp build rejects the JSON schema; then output is unconstrained and parsed tolerantly (parse.ts). */
let schemaUnsupported = false;

let queue: Promise<unknown> = Promise.resolve();
function serial<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task, task);
  queue = run.catch(() => undefined);
  return run;
}

async function release() {
  const current = loaded;
  loaded = null;
  await current?.wllama.exit().catch(() => undefined);
}

/** Frees the model's memory (e.g. when the page is hidden on a phone). */
export function releaseWebModel(): Promise<void> {
  return serial(release);
}

async function runtimeFor(spec: ModelSpec): Promise<{ wllama: Wllama; compat: boolean }> {
  if (loaded) return loaded;
  const model = await findCachedModel(spec);
  if (!model) throw new Error('The language model is not in this browser yet. Open the AI check and download it.');
  const rt = await createRuntime();
  try {
    await rt.wllama.loadModel(model, {
      n_ctx: WEB_CONTEXT_TOKENS,
      // CPU only, like the phone: same numerics everywhere, and WebGPU is not on every iPhone.
      n_gpu_layers: 0,
      n_parallel: 1,
      jinja: true,
    });
  } catch (e) {
    await rt.wllama.exit().catch(() => undefined);
    throw e;
  }
  loaded = rt;
  return rt;
}

const isAbort = (e: unknown) => e instanceof Error && (e.name === 'AbortError' || /abort/i.test(e.message));
const isSchemaError = (e: unknown) => e instanceof Error && /grammar|schema|response_format/i.test(e.message);

async function complete(wllama: Wllama, req: Omit<CompletionRequest, 'jsonSchema'> & { jsonSchema?: object }) {
  if (req.signal?.aborted) throw new AbortedError();
  const constrained = req.jsonSchema && !schemaUnsupported;
  const started = Date.now();
  try {
    const res = await wllama.createChatCompletion({
      messages: req.messages,
      max_tokens: req.maxTokens,
      temperature: 0,
      chat_template_kwargs: { enable_thinking: false },
      // wllama runs llama.cpp's server code: with cache_prompt the slot keeps the previous
      // prompt in its KV cache and evaluates only the part after the common prefix, so the
      // shared system prompt is evaluated once per review (prompt.ts). It is the server
      // default; set explicitly so a library default change cannot silently slow reviews.
      cache_prompt: true,
      abortSignal: req.signal,
      ...(constrained ? { response_format: { type: 'json_schema' as const, json_schema: { name: 'output', schema: req.jsonSchema, strict: true } } } : {}),
    });
    if (req.signal?.aborted) throw new AbortedError();
    const text = (res.choices[0]?.message.content ?? '').replace(/<think>[\s\S]*?<\/think>/gi, '');
    const seconds = (Date.now() - started) / 1000;
    const tokens = res.usage?.completion_tokens;
    // The non-streaming reply is llama.cpp's server JSON, which carries `timings` (counts and times only).
    const timings = fromLlamaTimings((res as { timings?: LlamaTimings }).timings);
    return { text, timings, tokensPerSecond: tokens && seconds > 0 ? tokens / seconds : undefined };
  } catch (e) {
    if (req.signal?.aborted || isAbort(e)) throw new AbortedError();
    if (constrained && isSchemaError(e)) {
      schemaUnsupported = true;
      return complete(wllama, req);
    }
    // A crashed wasm runtime cannot be reused: load again next time.
    if (e instanceof Error && e.name === 'RuntimeError') await release();
    throw e;
  }
}

export function createWllamaRunner(spec: ModelSpec): CompletionRunner {
  return (req) =>
    serial(async () => {
      const { wllama } = await runtimeFor(spec);
      const { text, timings } = await complete(wllama, req);
      return { text, timings };
    });
}

export function webSmokeTest(spec: ModelSpec): Promise<SmokeTestResult> {
  return serial(async () => {
    const { wllama } = await runtimeFor(spec);
    const result = await complete(wllama, { messages: SMOKE_TEST_MESSAGES, maxTokens: 32 });
    const ok = isSmokeTestReply(result.text);
    return { ok, tokensPerSecond: result.tokensPerSecond, error: ok ? undefined : 'unexpected reply' };
  });
}

export function webRuntimeInfo(): { threads: number; compat: boolean } {
  return { threads: loaded?.wllama.getNumThreads() ?? 1, compat: loaded?.compat ?? false };
}
