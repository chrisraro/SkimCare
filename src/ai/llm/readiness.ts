/**
 * Readiness for the local engine (F02 / S03). Reports offline-ready only when
 * every real check passes: the model file is installed, its SHA-256 matches the
 * pinned spec, bundled OCR is linked, and a tiny inference actually ran.
 *
 * Device access is injected through `ReadinessProbe` so this logic stays
 * testable; the llama.rn / file-system adapter implements it.
 */
import type { ReadinessCheck, ReadinessReport } from '../engines';
import type { ChatMessage } from './prompt';
import type { ModelSpec } from './models';

export interface SmokeTestResult {
  ok: boolean;
  tokensPerSecond?: number;
  error?: string;
}

export interface ReadinessProbe {
  /** The installed model file, or undefined when it is missing. */
  modelFile(): Promise<{ path: string; sizeBytes: number } | undefined>;
  /** Hash of the file computed natively — never read a GGUF into JS memory. */
  hash(path: string): Promise<{ algorithm: 'sha256' | 'md5'; hex: string }>;
  /** Free app storage in bytes, or undefined when the OS will not say. */
  freeStorageBytes(): Promise<number | undefined>;
  ocrAvailable(): Promise<boolean>;
  /** Load the model and run `SMOKE_TEST_MESSAGES` (no document text). */
  smokeTest(path: string): Promise<SmokeTestResult>;
}

/** Fixed prompt for the inference check. Contains no user data. */
export const SMOKE_TEST_MESSAGES: ChatMessage[] = [
  { role: 'system', content: 'Answer with JSON only.' },
  { role: 'user', content: 'Reply with {"ok": true}.' },
];

export function isSmokeTestReply(text: string): boolean {
  const m = /\{[^{}]*\}/.exec(text.replace(/<think>[\s\S]*?<\/think>/gi, ''));
  if (!m) return false;
  try {
    return (JSON.parse(m[0]) as { ok?: unknown }).ok === true;
  } catch {
    return false;
  }
}

/** Below this, saving page images and analyses may fail. */
export const LOW_STORAGE_BYTES = 500 * 1024 * 1024;

const mb = (bytes: number) => `${Math.round(bytes / (1024 * 1024))} MB`;

async function attempt<T>(fn: () => Promise<T>): Promise<{ value?: T; error?: string }> {
  try {
    return { value: await fn() };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Unknown error' };
  }
}

export async function checkLocalReadiness(spec: ModelSpec, probe: ReadinessProbe): Promise<ReadinessReport> {
  const checks: ReadinessCheck[] = [];
  const add = (c: ReadinessCheck) => checks.push(c);

  const file = await attempt(() => probe.modelFile());
  const installed = file.value;
  if (!installed) {
    add({ id: 'model_present', label: 'Language model file', status: 'fail', detail: file.error ? `Could not look for the model: ${file.error}` : `${spec.fileName} is not installed.` });
  } else {
    add({ id: 'model_present', label: 'Language model file', status: 'pass', detail: `${spec.name} ${spec.quantization} (${mb(installed.sizeBytes)}).` });
  }

  let verified = false;
  if (!installed) {
    add({ id: 'checksum', label: 'Model checksum', status: 'warn', detail: 'Skipped — no model to verify.' });
  } else if (installed.sizeBytes !== spec.sizeBytes) {
    add({ id: 'checksum', label: 'Model checksum', status: 'fail', detail: `File size ${mb(installed.sizeBytes)} does not match the expected ${mb(spec.sizeBytes)}. The file may be incomplete.` });
  } else {
    const hash = await attempt(() => probe.hash(installed.path));
    const algorithm = hash.value?.algorithm;
    const name = algorithm === 'md5' ? 'MD5' : 'SHA-256';
    const expected = algorithm === 'md5' ? spec.md5 : spec.sha256;
    verified = Boolean(expected) && hash.value?.hex.toLowerCase() === expected;
    add({
      id: 'checksum',
      label: 'Model checksum',
      status: verified ? 'pass' : 'fail',
      detail: hash.error
        ? `Could not verify: ${hash.error}`
        : !expected
          ? `No pinned ${name} for this model, so it cannot be verified.`
          : verified
            ? `${name} matches the expected model.`
            : `${name} does not match. The file is damaged or a different model.`,
    });
  }

  const free = await attempt(() => probe.freeStorageBytes());
  if (free.value === undefined) {
    add({ id: 'storage', label: 'Private storage', status: 'warn', detail: 'Free space could not be measured.' });
  } else {
    const low = free.value < LOW_STORAGE_BYTES;
    add({ id: 'storage', label: 'Private storage', status: low ? 'warn' : 'pass', detail: `${mb(free.value)} free${low ? ' — saving documents may fail.' : '.'}` });
  }

  const ocr = await attempt(() => probe.ocrAvailable());
  add({
    id: 'ocr',
    label: 'On-device text recognition',
    status: ocr.value ? 'pass' : 'fail',
    detail: ocr.value ? 'Bundled text recognition is linked.' : 'Bundled text recognition is not available. Photos cannot be read.',
  });

  // Never load a file that failed verification.
  let inferenceOk = false;
  if (!verified || !installed) {
    add({ id: 'inference', label: 'Local inference test', status: 'fail', detail: 'Skipped — the model file is missing or not verified.' });
  } else {
    const smoke = await attempt(() => probe.smokeTest(installed.path));
    inferenceOk = smoke.value?.ok === true;
    const speed = smoke.value?.tokensPerSecond;
    add({
      id: 'inference',
      label: 'Local inference test',
      status: inferenceOk ? 'pass' : 'fail',
      detail: inferenceOk
        ? `The model loaded and answered on this phone${speed ? ` (${speed.toFixed(1)} tokens/s)` : ''}.`
        : `The model did not answer correctly: ${smoke.error ?? smoke.value?.error ?? 'unexpected reply'}.`,
    });
  }

  add({
    id: 'network_independent',
    label: 'Works without internet',
    status: inferenceOk ? 'pass' : 'warn',
    detail: inferenceOk ? 'The model runs from a file on this phone. No network is needed.' : 'Not confirmed until the local inference test passes.',
  });

  return { checks, offlineReady: verified && inferenceOk && ocr.value === true };
}
