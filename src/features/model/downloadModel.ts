/**
 * In-app model download (phone). Fetches the pinned GGUF from `spec.sourceUrl`
 * (Hugging Face, fixed revision) into the app-private models folder that
 * `llamaRuntime.modelFile()` reads from.
 *
 * - Android with the `model-download` native module: Android DownloadManager. The
 *   transfer survives leaving the screen, backgrounding and even an app restart
 *   (`findInFlightDownload` re-attaches), and the system shows a progress notification.
 * - Anywhere else (iOS, builds without the module): expo-file-system `DownloadTask`
 *   with progress. It keeps going while the app is open; never crashes when the
 *   native module is missing.
 * - Either way the file lands under a temporary `.part` name, is checked against the
 *   pinned size and MD5 natively (`verifyAndInstall`, shared with import), and only
 *   then replaces the real file. A mismatching file is deleted.
 *
 * Privacy: the only request is a GET of the public model URL. No document content,
 * no identifiers, no telemetry. Nothing here logs.
 */
import { File, Paths } from 'expo-file-system';
import { getModelDownloader, type ModelDownloadModule, type NativeDownloadInfo } from '../../../modules/model-download';
import type { ModelSpec } from '@/ai/llm/models';
import { errorMessage, modelsDir, safeDelete, STORAGE_MARGIN_BYTES, verifyAndInstall, type InstallFailure } from './importModel';

export type DownloadVia = 'system' | 'app';

export type DownloadFailure = 'no_space' | 'network' | 'server' | 'storage' | 'removed' | InstallFailure | 'unknown';

export type DownloadOutcome =
  | { status: 'done' }
  | { status: 'canceled' }
  | { status: 'failed'; reason: DownloadFailure; needBytes?: number; freeBytes?: number };

export interface DownloadCallbacks {
  /** `waiting` is true while the system has paused the transfer (no network, retrying). */
  onProgress: (bytes: number, total: number, waiting: boolean) => void;
  onVerifying: () => void;
  /** System downloads only: the DownloadManager id, as soon as it is known. */
  onNativeId?: (id: string) => void;
}

export interface DownloadOptions {
  /** Re-attach to this DownloadManager id instead of starting a new download. */
  resumeId?: string;
  /** How often the system download is polled. */
  pollMs?: number;
  /** Notification copy (already translated). */
  title?: string;
  description?: string;
}

export function downloadVia(native: ModelDownloadModule | null = getModelDownloader()): DownloadVia {
  return native ? 'system' : 'app';
}

/**
 * Free space needed before starting. The system download lands in app-specific
 * external storage and is then copied into internal storage (different mounts),
 * so for a moment both copies exist.
 */
export function requiredFreeBytes(spec: ModelSpec, via: DownloadVia): number {
  return spec.sizeBytes * (via === 'system' ? 2 : 1) + STORAGE_MARGIN_BYTES;
}

export function checkFreeSpace(spec: ModelSpec, via: DownloadVia, free: number | undefined = Paths.availableDiskSpace): DownloadOutcome | null {
  const need = requiredFreeBytes(spec, via);
  if (typeof free === 'number' && free < need) return { status: 'failed', reason: 'no_space', needBytes: need, freeBytes: free };
  return null;
}

/** DownloadManager COLUMN_REASON for a failed download → a plain reason. */
export function nativeFailureReason(reason: number | undefined): DownloadFailure {
  if (reason === undefined) return 'unknown';
  if (reason >= 400 && reason < 600) return 'server';
  switch (reason) {
    case 1006: // ERROR_INSUFFICIENT_SPACE
      return 'no_space';
    case 1001: // ERROR_FILE_ERROR
    case 1007: // ERROR_DEVICE_NOT_FOUND
    case 1009: // ERROR_FILE_ALREADY_EXISTS
      return 'storage';
    case 1002: // ERROR_UNHANDLED_HTTP_CODE
      return 'server';
    case 1004: // ERROR_HTTP_DATA_ERROR
    case 1005: // ERROR_TOO_MANY_REDIRECTS
    case 1008: // ERROR_CANNOT_RESUME
      return 'network';
    default:
      return 'unknown';
  }
}

/** Waits `ms`, or less if `signal` aborts. */
function wait(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) return resolve();
    const t = setTimeout(done, ms);
    function done() {
      clearTimeout(t);
      signal.removeEventListener('abort', done);
      resolve();
    }
    signal.addEventListener('abort', done);
  });
}

function targets(spec: ModelSpec) {
  const dir = modelsDir();
  return { dir, part: new File(dir, `${spec.fileName}.part`), target: new File(dir, spec.fileName) };
}

async function verify(spec: ModelSpec, cb: DownloadCallbacks): Promise<DownloadOutcome> {
  const { part, target } = targets(spec);
  cb.onVerifying();
  const r = await verifyAndInstall(part, target, spec);
  return r.ok ? { status: 'done' } : { status: 'failed', reason: r.code };
}

/** An in-flight (or finished but not yet installed) system download of this model, if any. */
export async function findInFlightDownload(spec: ModelSpec, native: ModelDownloadModule | null = getModelDownloader()): Promise<string | null> {
  if (!native) return null;
  try {
    return await native.findByUrl(spec.sourceUrl);
  } catch {
    return null;
  }
}

async function viaSystem(native: ModelDownloadModule, spec: ModelSpec, cb: DownloadCallbacks, signal: AbortSignal, opts: DownloadOptions): Promise<DownloadOutcome> {
  let id = opts.resumeId;
  if (!id) {
    try {
      id = await native.start(spec.sourceUrl, spec.fileName, opts.title ?? 'SkimCare model', opts.description ?? spec.fileName);
    } catch {
      return { status: 'failed', reason: 'storage' };
    }
  }
  cb.onNativeId?.(id);

  const pollMs = opts.pollMs ?? 1000;
  let info: NativeDownloadInfo;
  for (;;) {
    if (signal.aborted) {
      await native.cancel(id).catch(() => undefined);
      return { status: 'canceled' };
    }
    try {
      info = await native.query(id);
    } catch {
      info = { status: 'missing' };
    }
    if (info.status === 'successful') break;
    if (info.status === 'failed') {
      await native.cancel(id).catch(() => undefined);
      return { status: 'failed', reason: nativeFailureReason(info.reason) };
    }
    if (info.status === 'missing') {
      // Removed outside the app (e.g. from the system Downloads list).
      return { status: 'failed', reason: 'removed' };
    }
    cb.onProgress(info.bytes ?? 0, info.total && info.total > 0 ? info.total : spec.sizeBytes, info.status === 'paused');
    await wait(pollMs, signal);
  }
  cb.onProgress(spec.sizeBytes, spec.sizeBytes, false);

  const { dir, part } = targets(spec);
  try {
    if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
    await native.install(id, spec.fileName, part.uri);
  } catch {
    safeDelete(part);
    await native.cancel(id).catch(() => undefined);
    return { status: 'failed', reason: 'install' };
  }
  return verify(spec, cb);
}

function isAbort(e: unknown): boolean {
  return (e instanceof Error && e.name === 'AbortError') || /abort|cancel/i.test(errorMessage(e));
}

async function viaApp(spec: ModelSpec, cb: DownloadCallbacks, signal: AbortSignal): Promise<DownloadOutcome> {
  const { dir, part } = targets(spec);
  try {
    if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
    safeDelete(part);
  } catch {
    return { status: 'failed', reason: 'storage' };
  }
  if (signal.aborted) return { status: 'canceled' };
  const task = File.createDownloadTask(spec.sourceUrl, part, {
    signal,
    onProgress: ({ bytesWritten, totalBytes }) => cb.onProgress(bytesWritten, totalBytes > 0 ? totalBytes : spec.sizeBytes, false),
  });
  try {
    const file = await task.downloadAsync();
    if (!file) {
      safeDelete(part);
      return { status: 'canceled' };
    }
  } catch (e) {
    safeDelete(part);
    if (signal.aborted || isAbort(e)) return { status: 'canceled' };
    return { status: 'failed', reason: /\b[45]\d\d\b|UnableToDownload/i.test(errorMessage(e)) ? 'server' : 'network' };
  } finally {
    try {
      task.release();
    } catch {
      // Already released.
    }
  }
  return verify(spec, cb);
}

/**
 * Download → verify → install. Resolves (never rejects) with what happened.
 * The caller checks free space first (`checkFreeSpace`) and asks the user.
 */
export async function downloadModel(
  spec: ModelSpec,
  cb: DownloadCallbacks,
  signal: AbortSignal,
  opts: DownloadOptions = {},
  native: ModelDownloadModule | null = getModelDownloader(),
): Promise<DownloadOutcome> {
  try {
    return native ? await viaSystem(native, spec, cb, signal, opts) : await viaApp(spec, cb, signal);
  } catch {
    return { status: 'failed', reason: 'unknown' };
  }
}
