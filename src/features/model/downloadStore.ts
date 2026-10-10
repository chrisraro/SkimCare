import { create } from 'zustand';
import { getModelSpec, type ModelSpec } from '@/ai/llm/models';
import {
  checkFreeSpace,
  downloadModel,
  downloadVia,
  findInFlightDownload,
  type DownloadFailure,
  type DownloadOptions,
  type DownloadVia,
} from './downloadModel';

/**
 * Global state of the model download, so progress survives navigation and is shown
 * on Readiness, Settings and Home. Holds counts and status only — never file content.
 */
export type DownloadPhase = 'idle' | 'starting' | 'downloading' | 'verifying' | 'done' | 'failed' | 'canceled';

export interface DownloadFailureInfo {
  reason: DownloadFailure;
  needBytes?: number;
  freeBytes?: number;
}

interface DownloadState {
  phase: DownloadPhase;
  bytes: number;
  total: number;
  /** Smoothed bytes per second; null until there are two samples. */
  speedBps: number | null;
  /** The system paused the transfer (no network / retrying). */
  waiting: boolean;
  via: DownloadVia | null;
  specId: string | null;
  failure: DownloadFailureInfo | null;
  /** Starts a download (no-op while one runs). The UI confirms with the user first. */
  start: (spec?: ModelSpec, opts?: DownloadOptions) => Promise<void>;
  cancel: () => void;
  /** After an app restart: re-attach to a system download that is still running or finished. */
  reattach: (spec?: ModelSpec) => Promise<void>;
  /** Back to idle after done / failed / canceled. */
  reset: () => void;
}

const IDLE = { phase: 'idle' as const, bytes: 0, total: 0, speedBps: null, waiting: false, via: null, specId: null, failure: null };

export function isDownloadActive(phase: DownloadPhase): boolean {
  return phase === 'starting' || phase === 'downloading' || phase === 'verifying';
}

/** Exponential moving average of the transfer rate. */
export function nextSpeed(prev: number | null, deltaBytes: number, deltaMs: number): number | null {
  if (deltaMs <= 0 || deltaBytes < 0) return prev;
  const sample = (deltaBytes / deltaMs) * 1000;
  return prev === null ? sample : prev * 0.7 + sample * 0.3;
}

/** Throttle UI updates: at most one progress update per this many ms. */
const UI_INTERVAL_MS = 250;

let controller: AbortController | null = null;

export const useModelDownload = create<DownloadState>((set, get) => {
  async function run(spec: ModelSpec, opts: DownloadOptions) {
    controller?.abort();
    const ctl = new AbortController();
    controller = ctl;
    const via = downloadVia();
    set({ ...IDLE, phase: 'starting', via, specId: spec.id, total: spec.sizeBytes });

    let last = { bytes: 0, at: Date.now() };
    const outcome = await downloadModel(
      spec,
      {
        onProgress: (bytes, total, waiting) => {
          if (ctl.signal.aborted) return;
          const now = Date.now();
          const s = get();
          if (s.phase === 'downloading' && now - last.at < UI_INTERVAL_MS && s.waiting === waiting) return;
          const speedBps = waiting ? null : s.phase === 'downloading' ? nextSpeed(s.speedBps, bytes - last.bytes, now - last.at) : null;
          last = { bytes, at: now };
          set({ phase: 'downloading', bytes, total, waiting, speedBps });
        },
        onVerifying: () => {
          if (!ctl.signal.aborted) set({ phase: 'verifying', waiting: false, speedBps: null });
        },
      },
      ctl.signal,
      opts,
    );
    if (controller !== ctl) return; // superseded
    controller = null;
    if (outcome.status === 'done') set({ phase: 'done', bytes: spec.sizeBytes, total: spec.sizeBytes, speedBps: null, waiting: false });
    else if (outcome.status === 'canceled') set({ ...IDLE, phase: 'canceled', via, specId: spec.id });
    else set({ phase: 'failed', speedBps: null, waiting: false, failure: { reason: outcome.reason, needBytes: outcome.needBytes, freeBytes: outcome.freeBytes } });
  }

  return {
    ...IDLE,
    start: async (spec = getModelSpec(), opts = {}) => {
      if (!spec || isDownloadActive(get().phase)) return;
      const noSpace = checkFreeSpace(spec, downloadVia());
      if (noSpace?.status === 'failed') {
        set({ ...IDLE, phase: 'failed', specId: spec.id, failure: { reason: noSpace.reason, needBytes: noSpace.needBytes, freeBytes: noSpace.freeBytes } });
        return;
      }
      await run(spec, opts);
    },
    cancel: () => {
      if (!isDownloadActive(get().phase)) return;
      // Verifying is short and replaces the file atomically; let it finish.
      if (get().phase === 'verifying') return;
      controller?.abort();
    },
    reattach: async (spec = getModelSpec()) => {
      if (!spec || get().phase !== 'idle') return;
      const id = await findInFlightDownload(spec);
      if (!id || get().phase !== 'idle') return;
      await run(spec, { resumeId: id });
    },
    reset: () => {
      if (isDownloadActive(get().phase)) return;
      set(IDLE);
    },
  };
});
