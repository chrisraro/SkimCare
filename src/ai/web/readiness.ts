/**
 * Readiness for the in-browser engine (S03 on web). Same honesty rule as the
 * phone: offline-ready only when every check passes — the model is stored in this
 * browser and matches its pinned SHA-256, text recognition read a test image here,
 * and the model actually answered here. Browser access is injected so this is testable.
 */
import type { ReadinessCheck, ReadinessReport } from '../engines';
import type { ModelSpec } from '../llm/models';
import type { SmokeTestResult } from '../llm/readiness';

export interface WebReadinessProbe {
  /** The model stored in this browser (OPFS), or undefined when it was not downloaded. */
  cachedModel(): Promise<{ sizeBytes: number } | undefined>;
  /** SHA-256 of the stored model (computed once after download, then remembered). */
  sha256(): Promise<string>;
  /** Space this site may still use, when the browser says. */
  freeStorageBytes(): Promise<number | undefined>;
  /** Tesseract read a drawn test image ("Offline check 2468") in this browser. */
  ocrSelfTest(): Promise<boolean>;
  /** Load the model and answer a fixed prompt (no document text). */
  smokeTest(): Promise<SmokeTestResult>;
  /** Runtime facts for the details line. */
  runtime(): { threads: number; compat: boolean };
}

/** The model needs about this much browser storage. */
export const WEB_LOW_STORAGE_BYTES = 100 * 1024 * 1024;

const mb = (bytes: number) => `${Math.round(bytes / (1024 * 1024))} MB`;

async function attempt<T>(fn: () => Promise<T>): Promise<{ value?: T; error?: string }> {
  try {
    return { value: await fn() };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Unknown error' };
  }
}

export const MODEL_MISSING_DETAIL = 'Not downloaded to this browser yet.';

export async function checkWebReadiness(spec: ModelSpec, probe: WebReadinessProbe): Promise<ReadinessReport> {
  const checks: ReadinessCheck[] = [];
  const add = (c: ReadinessCheck) => checks.push(c);

  const cached = await attempt(() => probe.cachedModel());
  const installed = cached.value;
  add(
    installed
      ? { id: 'model_present', label: 'Language model in this browser', status: 'pass', detail: `${spec.name} ${spec.quantization} (${mb(installed.sizeBytes)}), stored in this browser.` }
      : {
          id: 'model_present',
          label: 'Language model in this browser',
          status: 'fail',
          detail: cached.error ? `This browser's storage could not be read: ${cached.error}` : MODEL_MISSING_DETAIL,
        },
  );

  let verified = false;
  if (!installed) {
    add({ id: 'checksum', label: 'Model checksum', status: 'warn', detail: 'Skipped — no model to verify.' });
  } else if (installed.sizeBytes !== spec.sizeBytes) {
    add({ id: 'checksum', label: 'Model checksum', status: 'fail', detail: `Stored size ${mb(installed.sizeBytes)} does not match the expected ${mb(spec.sizeBytes)}. Download it again.` });
  } else {
    const hash = await attempt(() => probe.sha256());
    verified = hash.value?.toLowerCase() === spec.sha256;
    add({
      id: 'checksum',
      label: 'Model checksum',
      status: verified ? 'pass' : 'fail',
      detail: hash.error ? `Could not verify: ${hash.error}` : verified ? 'SHA-256 matches the pinned model.' : 'SHA-256 does not match. Download it again.',
    });
  }

  const free = await attempt(() => probe.freeStorageBytes());
  const memoryNote = 'On the web, reviews stay in this tab only and are gone when it closes.';
  if (free.value === undefined) {
    add({ id: 'storage', label: 'Browser storage', status: 'warn', detail: `Free space could not be measured. ${memoryNote}` });
  } else {
    const low = free.value < WEB_LOW_STORAGE_BYTES && !installed;
    add({ id: 'storage', label: 'Browser storage', status: low ? 'warn' : 'pass', detail: `${mb(free.value)} available to this site${low ? ' — the model may not fit.' : '.'} ${memoryNote}` });
  }

  const ocr = await attempt(() => probe.ocrSelfTest());
  add({
    id: 'ocr',
    label: 'Text recognition in this browser',
    status: ocr.value ? 'pass' : 'fail',
    detail: ocr.value
      ? 'Tesseract read a test image in this browser.'
      : `Text recognition failed its test${ocr.error ? ` (${ocr.error})` : ''}. Photos and scanned PDFs cannot be read; digital PDFs still work.`,
  });

  let inferenceOk = false;
  if (!verified) {
    add({ id: 'inference', label: 'Local inference test', status: 'fail', detail: 'Skipped — the model is missing or not verified.' });
  } else {
    const smoke = await attempt(() => probe.smokeTest());
    inferenceOk = smoke.value?.ok === true;
    const speed = smoke.value?.tokensPerSecond;
    const rt = probe.runtime();
    const how = `${rt.threads > 1 ? `${rt.threads} threads` : '1 thread'}${rt.compat ? ', compatibility build' : ''}`;
    add({
      id: 'inference',
      label: 'Local inference test',
      status: inferenceOk ? 'pass' : 'fail',
      detail: inferenceOk
        ? `The model loaded and answered in this browser (${how}${speed ? `, ${speed.toFixed(1)} tokens/s` : ''}).`
        : `The model did not answer correctly: ${smoke.error ?? smoke.value?.error ?? 'unexpected reply'}.`,
    });
  }

  add({
    id: 'network_independent',
    label: 'Works without internet',
    status: inferenceOk && ocr.value ? 'pass' : 'warn',
    detail:
      inferenceOk && ocr.value
        ? 'Reading and analysis run inside this tab. Document text is never sent anywhere. Reopening the site itself may need a connection.'
        : 'Not confirmed until the inference and text recognition tests pass.',
  });

  return { checks, offlineReady: checks.every((c) => c.status === 'pass') };
}
