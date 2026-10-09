import { beforeEach, describe, expect, it, jest } from '@jest/globals';

/** Fake file system: a map of uri → { size, md5 }. */
const mockFs = {
  files: new Map<string, { size: number; md5: string }>(),
  dirs: new Set<string>(),
  free: 10 * 1024 * 1024 * 1024,
};
const mockPicker: { result: unknown; error?: Error } = { result: { canceled: true, assets: null } };
const mockRelease = jest.fn(async () => undefined);

jest.mock('expo-document-picker', () => ({
  getDocumentAsync: async () => {
    if (mockPicker.error) throw mockPicker.error;
    return mockPicker.result;
  },
}));

jest.mock('@/ai/llm/llamaRuntime', () => ({ releaseModel: () => mockRelease() }));

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
    async copy(to: File) {
      const src = mockFs.files.get(this.uri);
      if (!src) throw new Error('source missing');
      mockFs.files.set(to.uri, { ...src });
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
import { importModel, validatePickedModel, type ImportPhase } from '@/features/model/importModel';
// eslint-disable-next-line import/first
import { getModelSpec } from '@/ai/llm/models';

const spec = getModelSpec()!;
const SOURCE = 'content://picked/1';
const TARGET = `file:///docs/models/${spec.fileName}`;
const PART = `${TARGET}.part`;

function pick(name: string, size: number | undefined, md5: string, fileSize = size ?? spec.sizeBytes) {
  mockFs.files.set(SOURCE, { size: fileSize, md5 });
  mockPicker.result = { canceled: false, assets: [{ name, size, uri: SOURCE, lastModified: 0 }] };
}

async function run() {
  const phases: ImportPhase[] = [];
  const result = await importModel((p) => phases.push(p));
  return { result, phases };
}

beforeEach(() => {
  mockFs.files.clear();
  mockFs.dirs.clear();
  mockFs.free = 10 * 1024 * 1024 * 1024;
  mockPicker.error = undefined;
  mockPicker.result = { canceled: true, assets: null };
  mockRelease.mockClear();
});

describe('validatePickedModel', () => {
  it('accepts a known spec by name and size', () => {
    const v = validatePickedModel(spec.fileName, spec.sizeBytes);
    expect(v).toEqual({ ok: true, spec });
  });

  it('accepts the Q4_0 candidate and a renamed duplicate download', () => {
    const q40 = getModelSpec('qwen3-0.6b-q4_0')!;
    expect(validatePickedModel(q40.fileName, q40.sizeBytes)).toEqual({ ok: true, spec: q40 });
    expect(validatePickedModel('Qwen3-0.6B-Q4_K_M (1).gguf', spec.sizeBytes)).toEqual({ ok: true, spec });
  });

  it('rejects an unknown file with a plain message', () => {
    const v = validatePickedModel('holiday.jpg', 1234);
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.message).toMatch(/not a model this app can use/);
  });

  it('rejects the right name with the wrong size (incomplete download)', () => {
    const v = validatePickedModel(spec.fileName, spec.sizeBytes - 1);
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.message).toMatch(/incomplete/);
  });

  it('rejects a model without a pinned MD5 (cannot be verified on the phone)', () => {
    const big = getModelSpec('qwen3-1.7b-q4_k_m')!;
    const v = validatePickedModel(big.fileName, big.sizeBytes);
    expect(v.ok).toBe(false);
  });
});

describe('importModel', () => {
  it('copies, verifies and installs a matching file', async () => {
    pick(spec.fileName, spec.sizeBytes, spec.md5!);
    const { result, phases } = await run();
    expect(result).toEqual({ status: 'done', spec });
    expect(phases).toEqual(['picking', 'copying', 'verifying', 'done']);
    expect(mockFs.files.has(TARGET)).toBe(true);
    expect(mockFs.files.has(PART)).toBe(false);
    expect(mockRelease).toHaveBeenCalled();
  });

  it('deletes the copy when the checksum does not match', async () => {
    pick(spec.fileName, spec.sizeBytes, '00000000000000000000000000000000');
    const { result, phases } = await run();
    expect(result.status).toBe('failed');
    if (result.status === 'failed') expect(result.message).toMatch(/checksum/);
    expect(phases.at(-1)).toBe('failed');
    expect(mockFs.files.has(PART)).toBe(false);
    expect(mockFs.files.has(TARGET)).toBe(false);
  });

  it('keeps an existing installed model when a bad file is imported', async () => {
    mockFs.files.set(TARGET, { size: spec.sizeBytes, md5: spec.md5! });
    pick(spec.fileName, spec.sizeBytes, 'ffffffffffffffffffffffffffffffff');
    await run();
    expect(mockFs.files.get(TARGET)?.md5).toBe(spec.md5);
  });

  it('deletes the copy when the copied size is wrong (picker gave no size)', async () => {
    pick(spec.fileName, undefined, spec.md5!, spec.sizeBytes - 10);
    const { result } = await run();
    expect(result.status).toBe('failed');
    expect(mockFs.files.has(PART)).toBe(false);
  });

  it('returns canceled without copying when the user backs out', async () => {
    const { result, phases } = await run();
    expect(result).toEqual({ status: 'canceled' });
    expect(phases).toEqual(['picking', 'canceled']);
    expect(mockFs.files.size).toBe(0);
  });

  it('reports a picker already in progress plainly', async () => {
    mockPicker.error = new Error('Different document picking in progress. Await other document picking first.');
    const { result } = await run();
    expect(result).toEqual({ status: 'failed', message: 'A file picker is already open. Close it and try again.' });
  });

  it('rejects a wrong file before copying anything', async () => {
    pick('notes.pdf', 2048, 'abc');
    const { result, phases } = await run();
    expect(result.status).toBe('failed');
    expect(phases).not.toContain('copying');
    expect(mockFs.files.has(PART)).toBe(false);
  });

  it('refuses when storage is too low', async () => {
    mockFs.free = spec.sizeBytes;
    pick(spec.fileName, spec.sizeBytes, spec.md5!);
    const { result } = await run();
    expect(result.status).toBe('failed');
    if (result.status === 'failed') expect(result.message).toMatch(/free space/);
  });
});
