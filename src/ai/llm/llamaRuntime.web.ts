/**
 * Web stand-in for llamaRuntime.ts. llama.rn is a native module: importing it in a
 * browser runs `TurboModuleRegistry.get('RNLlama')` at load and crashes the whole app.
 * Metro picks this file on web, so llama.rn never enters the web bundle. The browser
 * engine (wllama) lives in its own files; these functions are never reached there.
 */
import type { CompletionRunner } from './localLlmEngine';
import type { ModelSpec } from './models';
import type { ReadinessProbe } from './readiness';

export const CONTEXT_TOKENS = 2048;

// Type-only re-exports are erased at bundle time, so they never pull llama.rn in.
import type { BenchRow, CpuSettings } from './llamaRuntime';
export type { BenchRow, CpuSettings } from './llamaRuntime';

export const CPU_SETTINGS: CpuSettings = {};

const unavailable = () => new Error('The native model runtime is not available in the browser.');

export function modelFile(_spec: ModelSpec): never {
  throw unavailable();
}

export function benchmark(_models: ModelSpec[], _cpus: CpuSettings[], _onRow: (row: BenchRow) => void): Promise<void> {
  return Promise.reject(unavailable());
}

export function releaseModel(): Promise<void> {
  return Promise.resolve();
}

export function createLlamaRunner(_spec: ModelSpec): CompletionRunner {
  return () => Promise.reject(unavailable());
}

export function createLlamaProbe(_spec: ModelSpec, _ocrAvailable: () => Promise<boolean>): ReadinessProbe {
  throw unavailable();
}
