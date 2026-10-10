import { beforeEach, describe, expect, it, jest } from '@jest/globals';

/** Fake file system: uri → { size, md5 }. */
const mockFs = {
  files: new Map<string, { size: number; md5: string }>(),
  dirs: new Set<string>(),
  free: 10 * 1024 * 1024 * 1024 as number | undefined,
};

/** What the expo-file-system download task does: finish with `file`, fail, or wait for abort. */
const mockNet: { mode: 'ok' | 'error' | 'hang'; file: { size: number; md5: string }; error?: Error; urls: string[] } = {
  mode: 'ok',
  file: { size: 0, md5: '' },
  urls: [],
};

type NativeInfo = { status: string; bytes?: number; total?: number; reason?: number };
/** Fake DownloadManager module (null = not linked, i.e. the fallback path). */
const mockNative: { module: unknown } = { module: null };
const mockRelease = jest.fn(async () => undefined);

jest.mock('@/ai/llm/llamaRuntime', () => ({ releaseModel: () => mockRelease() }));
jest.mock('expo-document-picker', () => ({ getDocumentAsync: async () => ({ canceled: true, assets: null }) }));
jest.mock('../modules/model-download', () => ({ getModelDownloader: () => mockNative.module }));

jest.mock('expo-file-system', () => {
  const join = (parts: unknown[]) => parts.map((p) => (typeof p === 'string' ? p : (p as { uri: string }).uri)).join('/');
  class Directory {
    uri: string;
    constructor(...parts: unknown[]) {
      this.uri = join(parts);
    }
    get exists() {
      return mockFs.dirs.has(this.uri);
    }
    create() {
      mockFs.dirs.add(this.uri);
    }
  }
  class File {
    uri: string;
    constructor(...parts: unknown[]) {
      this.uri = join(parts);
    }
    get exists() {
      return mockFs.files.has(this.uri);
    }
    delete() {
      mockFs.files.delete(this.uri);
    }
    async move(to: File) {
      const src = mockFs.files.get(this.uri)!;
      mockFs.files.delete(this.uri);
      mockFs.files.set(to.uri, src);
      this.uri = to.uri;
    }
    info() {
      const f = mockFs.files.get(this.uri);
      return f ? { exists: true, size: f.size, md5: f.md5 } : { exists: false };
    }
    static createDownloadTask(
      url: string,
      dest: File,
      opts: { signal?: AbortSignal; onProgress?: (p: { bytesWritten: number; totalBytes: number }) => void },
    ) {
      return {
        release() {},
        async downloadAsync() {
          mockNet.urls.push(url);
          if (mockNet.mode === 'error') throw mockNet.error ?? new Error('network down');
          if (mockNet.mode === 'hang') {
            opts.onProgress?.({ bytesWritten: 10, totalBytes: mockNet.file.size });
            await new Promise<void>((_, reject) => {
              opts.signal?.addEventListener('abort', () => {
                mockFs.files.set(dest.uri, { size: 10, md5: 'partial' });
                const e = new Error('aborted');
                e.name = 'AbortError';
                reject(e);
              });
            });
          }
          opts.onProgress?.({ bytesWritten: mockNet.file.size / 2, totalBytes: mockNet.file.size });
          opts.onProgress?.({ bytesWritten: mockNet.file.size, totalBytes: mockNet.file.size });
          mockFs.files.set(dest.uri, { ...mockNet.file });
          return dest;
        },
      };
    }
  }
  return {
    Directory,
    File,
    Paths: {
      document: 'file:///docs',
      get availableDiskSpace() {
        return mockFs.free;
      },
    },
  };
});

// eslint-disable-next-line import/first
import { getModelSpec } from '@/ai/llm/models';
// eslint-disable-next-line import/first
import { STORAGE_MARGIN_BYTES } from '@/features/model/importModel';
// eslint-disable-next-line import/first
import {
  checkFreeSpace,
  downloadModel,
  nativeFailureReason,
  requiredFreeBytes,
  type DownloadCallbacks,
} from '@/features/model/downloadModel';
// eslint-disable-next-line import/first
import { isDownloadActive, nextSpeed, useModelDownload } from '@/features/model/downloadStore';
// eslint-disable-next-line import/first
import type { ModelDownloadModule } from '../modules/model-download';

const spec = getModelSpec()!;
const TARGET = `file:///docs/models/${spec.fileName}`;
const PART = `${TARGET}.part`;
const GOOD = { size: spec.sizeBytes, md5: spec.md5! };

function recorder() {
  const events: string[] = [];
  const progress: [number, number, boolean][] = [];
  const cb: DownloadCallbacks = {
    onProgress: (b, t, w) => progress.push([b, t, w]),
    onVerifying: () => events.push('verifying'),
    onNativeId: (id) => events.push(`id:${id}`),
  };
  return { cb, events, progress };
}

/** A fake DownloadManager whose `query` walks through `statuses`, then repeats the last one. */
function fakeNative(statuses: NativeInfo[], file = GOOD) {
  let i = 0;
  const m = {
    start: jest.fn(async () => '42'),
    query: jest.fn(async () => statuses[Math.min(i++, statuses.length - 1)]),
    findByUrl: jest.fn(async () => null as string | null),
    cancel: jest.fn(async () => undefined),
    install: jest.fn(async (_id: string, _name: string, dest: string) => {
      mockFs.files.set(dest, { ...file });
    }),
  };
  return m;
}

beforeEach(() => {
  mockFs.files.clear();
  mockFs.dirs.clear();
  mockFs.free = 10 * 1024 * 1024 * 1024;
  mockNet.mode = 'ok';
  mockNet.file = { ...GOOD };
  mockNet.error = undefined;
  mockNet.urls = [];
  mockNative.module = null;
  mockRelease.mockClear();
  useModelDownload.setState({ phase: 'idle', bytes: 0, total: 0, speedBps: null, waiting: false, via: null, specId: null, failure: null });
});

describe('helpers', () => {
  it('maps DownloadManager failure reasons to plain reasons', () => {
    expect(nativeFailureReason(404)).toBe('server');
    expect(nativeFailureReason(503)).toBe('server');
    expect(nativeFailureReason(1006)).toBe('no_space');
    expect(nativeFailureReason(1001)).toBe('storage');
    expect(nativeFailureReason(1004)).toBe('network');
    expect(nativeFailureReason(1008)).toBe('network');
    expect(nativeFailureReason(1000)).toBe('unknown');
    expect(nativeFailureReason(undefined)).toBe('unknown');
  });

  it('needs room for two copies on the DownloadManager path, one on the fallback', () => {
    expect(requiredFreeBytes(spec, 'app')).toBe(spec.sizeBytes + STORAGE_MARGIN_BYTES);
    expect(requiredFreeBytes(spec, 'system')).toBe(spec.sizeBytes * 2 + STORAGE_MARGIN_BYTES);
    expect(checkFreeSpace(spec, 'app', spec.sizeBytes)).toEqual({
      status: 'failed',
      reason: 'no_space',
      needBytes: spec.sizeBytes + STORAGE_MARGIN_BYTES,
      freeBytes: spec.sizeBytes,
    });
    expect(checkFreeSpace(spec, 'system', 10 * spec.sizeBytes)).toBeNull();
    expect(checkFreeSpace(spec, 'system', undefined)).toBeNull();
  });

  it('smooths the speed and ignores bad samples', () => {
    expect(nextSpeed(null, 1000, 1000)).toBe(1000);
    expect(nextSpeed(1000, 2000, 1000)).toBeCloseTo(1300);
    expect(nextSpeed(500, 100, 0)).toBe(500);
    expect(isDownloadActive('downloading')).toBe(true);
    expect(isDownloadActive('failed')).toBe(false);
  });
});

describe('downloadModel — fallback (no native module)', () => {
  it('downloads the pinned URL under .part, verifies the MD5 and installs it', async () => {
    const { cb, events, progress } = recorder();
    const r = await downloadModel(spec, cb, new AbortController().signal, {}, null);
    expect(r).toEqual({ status: 'done' });
    expect(mockNet.urls).toEqual([spec.sourceUrl]);
    expect(progress.at(-1)).toEqual([spec.sizeBytes, spec.sizeBytes, false]);
    expect(events).toEqual(['verifying']);
    expect(mockFs.files.get(TARGET)).toEqual(GOOD);
    expect(mockFs.files.has(PART)).toBe(false);
    expect(mockRelease).toHaveBeenCalled();
  });

  it('deletes a download whose checksum differs and keeps the installed model', async () => {
    mockFs.files.set(TARGET, { ...GOOD });
    mockNet.file = { size: spec.sizeBytes, md5: 'ffffffffffffffffffffffffffffffff' };
    const r = await downloadModel(spec, recorder().cb, new AbortController().signal, {}, null);
    expect(r).toEqual({ status: 'failed', reason: 'checksum' });
    expect(mockFs.files.has(PART)).toBe(false);
    expect(mockFs.files.get(TARGET)).toEqual(GOOD);
    expect(mockRelease).not.toHaveBeenCalled();
  });

  it('deletes a truncated download (size check)', async () => {
    mockNet.file = { size: spec.sizeBytes - 1, md5: spec.md5! };
    const r = await downloadModel(spec, recorder().cb, new AbortController().signal, {}, null);
    expect(r).toEqual({ status: 'failed', reason: 'size' });
    expect(mockFs.files.has(PART)).toBe(false);
  });

  it('cancels cleanly and removes the partial file', async () => {
    mockNet.mode = 'hang';
    const ctl = new AbortController();
    const { cb, progress } = recorder();
    const p = downloadModel(spec, cb, ctl.signal, {}, null);
    await new Promise((r) => setTimeout(r, 0));
    expect(progress.length).toBe(1);
    ctl.abort();
    expect(await p).toEqual({ status: 'canceled' });
    expect(mockFs.files.has(PART)).toBe(false);
    expect(mockFs.files.has(TARGET)).toBe(false);
  });

  it('reports a dropped connection and a server error in plain terms', async () => {
    mockNet.mode = 'error';
    expect(await downloadModel(spec, recorder().cb, new AbortController().signal, {}, null)).toEqual({ status: 'failed', reason: 'network' });
    mockNet.error = new Error('UnableToDownload: status 404');
    expect(await downloadModel(spec, recorder().cb, new AbortController().signal, {}, null)).toEqual({ status: 'failed', reason: 'server' });
    expect(mockFs.files.has(PART)).toBe(false);
  });
});

describe('downloadModel — Android DownloadManager', () => {
  it('starts, polls progress (incl. waiting for network), moves the file in and verifies it', async () => {
    const native = fakeNative([
      { status: 'pending', bytes: 0, total: -1 },
      { status: 'running', bytes: 100, total: spec.sizeBytes },
      { status: 'paused', bytes: 100, total: spec.sizeBytes, reason: 2 },
      { status: 'successful', bytes: spec.sizeBytes, total: spec.sizeBytes },
    ]);
    const { cb, events, progress } = recorder();
    const r = await downloadModel(spec, cb, new AbortController().signal, { pollMs: 0 }, native as unknown as ModelDownloadModule);
    expect(r).toEqual({ status: 'done' });
    expect(native.start).toHaveBeenCalledWith(spec.sourceUrl, spec.fileName, expect.any(String), expect.any(String));
    expect(native.install).toHaveBeenCalledWith('42', spec.fileName, PART);
    expect(progress.slice(0, 3)).toEqual([
      [0, spec.sizeBytes, false],
      [100, spec.sizeBytes, false],
      [100, spec.sizeBytes, true],
    ]);
    expect(events).toEqual(['id:42', 'verifying']);
    expect(mockFs.files.get(TARGET)).toEqual(GOOD);
    expect(mockFs.files.has(PART)).toBe(false);
  });

  it('re-attaches to an existing job without starting a new one', async () => {
    const native = fakeNative([{ status: 'successful', bytes: spec.sizeBytes, total: spec.sizeBytes }]);
    const r = await downloadModel(spec, recorder().cb, new AbortController().signal, { resumeId: '7', pollMs: 0 }, native as unknown as ModelDownloadModule);
    expect(r).toEqual({ status: 'done' });
    expect(native.start).not.toHaveBeenCalled();
    expect(native.install).toHaveBeenCalledWith('7', spec.fileName, PART);
  });

  it('maps a failed job to a plain reason and clears it', async () => {
    const native = fakeNative([{ status: 'failed', reason: 1006 }]);
    const r = await downloadModel(spec, recorder().cb, new AbortController().signal, { pollMs: 0 }, native as unknown as ModelDownloadModule);
    expect(r).toEqual({ status: 'failed', reason: 'no_space' });
    expect(native.cancel).toHaveBeenCalledWith('42');
    expect(native.install).not.toHaveBeenCalled();
  });

  it('says so when the job was removed outside the app', async () => {
    const native = fakeNative([{ status: 'missing' }]);
    const r = await downloadModel(spec, recorder().cb, new AbortController().signal, { pollMs: 0 }, native as unknown as ModelDownloadModule);
    expect(r).toEqual({ status: 'failed', reason: 'removed' });
  });

  it('cancels the system download when aborted', async () => {
    const native = fakeNative([{ status: 'running', bytes: 5, total: spec.sizeBytes }]);
    const ctl = new AbortController();
    const p = downloadModel(spec, recorder().cb, ctl.signal, { pollMs: 10_000 }, native as unknown as ModelDownloadModule);
    await new Promise((r) => setTimeout(r, 0));
    ctl.abort();
    expect(await p).toEqual({ status: 'canceled' });
    expect(native.cancel).toHaveBeenCalledWith('42');
    expect(native.install).not.toHaveBeenCalled();
  });

  it('deletes a bad file after moving it in (checksum)', async () => {
    const native = fakeNative([{ status: 'successful' }], { size: spec.sizeBytes, md5: '00000000000000000000000000000000' });
    const r = await downloadModel(spec, recorder().cb, new AbortController().signal, { pollMs: 0 }, native as unknown as ModelDownloadModule);
    expect(r).toEqual({ status: 'failed', reason: 'checksum' });
    expect(mockFs.files.has(PART)).toBe(false);
    expect(mockFs.files.has(TARGET)).toBe(false);
  });

  it('reports a failed move as an install failure', async () => {
    const native = fakeNative([{ status: 'successful' }]);
    native.install.mockImplementation(async () => {
      throw new Error('ERR_MOVE');
    });
    const r = await downloadModel(spec, recorder().cb, new AbortController().signal, { pollMs: 0 }, native as unknown as ModelDownloadModule);
    expect(r).toEqual({ status: 'failed', reason: 'install' });
  });
});

describe('useModelDownload store', () => {
  it('goes starting → downloading → verifying → done on the fallback path', async () => {
    const phases: string[] = [];
    const unsub = useModelDownload.subscribe((s, prev) => {
      if (s.phase !== prev.phase) phases.push(s.phase);
    });
    await useModelDownload.getState().start(spec);
    unsub();
    expect(phases).toEqual(['starting', 'downloading', 'verifying', 'done']);
    const s = useModelDownload.getState();
    expect(s.via).toBe('app');
    expect(s.bytes).toBe(spec.sizeBytes);
    expect(s.failure).toBeNull();
  });

  it('refuses to start without enough free space and says how much is needed', async () => {
    mockFs.free = 1024;
    await useModelDownload.getState().start(spec);
    const s = useModelDownload.getState();
    expect(s.phase).toBe('failed');
    expect(s.failure).toEqual({ reason: 'no_space', needBytes: spec.sizeBytes + STORAGE_MARGIN_BYTES, freeBytes: 1024 });
    expect(mockNet.urls).toEqual([]);
  });

  it('can be canceled mid-download and ignores a second start while running', async () => {
    mockNet.mode = 'hang';
    const p = useModelDownload.getState().start(spec);
    await new Promise((r) => setTimeout(r, 0));
    expect(useModelDownload.getState().phase).toBe('downloading');
    await useModelDownload.getState().start(spec); // no-op
    expect(mockNet.urls.length).toBe(1);
    useModelDownload.getState().cancel();
    await p;
    expect(useModelDownload.getState().phase).toBe('canceled');
    expect(mockFs.files.has(PART)).toBe(false);
    useModelDownload.getState().reset();
    expect(useModelDownload.getState().phase).toBe('idle');
  });

  it('records a plain failure reason', async () => {
    mockNet.mode = 'error';
    await useModelDownload.getState().start(spec);
    expect(useModelDownload.getState()).toMatchObject({ phase: 'failed', failure: { reason: 'network' } });
  });

  it('re-attaches to a DownloadManager job found after a restart', async () => {
    const native = fakeNative([{ status: 'successful', bytes: spec.sizeBytes, total: spec.sizeBytes }]);
    native.findByUrl.mockImplementation(async () => '99');
    mockNative.module = native;
    await useModelDownload.getState().reattach(spec);
    expect(native.findByUrl).toHaveBeenCalledWith(spec.sourceUrl);
    expect(native.start).not.toHaveBeenCalled();
    expect(native.install).toHaveBeenCalledWith('99', spec.fileName, PART);
    expect(useModelDownload.getState()).toMatchObject({ phase: 'done', via: 'system' });
  });

  it('does nothing on reattach when there is no job or no native module', async () => {
    await useModelDownload.getState().reattach(spec);
    expect(useModelDownload.getState().phase).toBe('idle');
    const native = fakeNative([]);
    mockNative.module = native;
    await useModelDownload.getState().reattach(spec);
    expect(useModelDownload.getState().phase).toBe('idle');
    expect(native.start).not.toHaveBeenCalled();
  });
});
