import { describe, expect, it, jest } from '@jest/globals';
import type { ReadinessReport } from '@/ai/engines';
import { getModelSpec, MODEL_CANDIDATES } from '@/ai/llm/models';
import { checkLocalReadiness, isSmokeTestReply, type ReadinessProbe } from '@/ai/llm/readiness';

const spec = getModelSpec()!;
const GB = 1024 * 1024 * 1024;

function probe(overrides: Partial<ReadinessProbe> = {}): ReadinessProbe {
  return {
    modelFile: async () => ({ path: `/data/models/${spec.fileName}`, sizeBytes: spec.sizeBytes }),
    hash: async () => ({ algorithm: 'sha256' as const, hex: spec.sha256 }),
    freeStorageBytes: async () => 4 * GB,
    ocrAvailable: async () => true,
    smokeTest: async () => ({ ok: true, tokensPerSecond: 18.4 }),
    ...overrides,
  };
}

const status = (r: ReadinessReport, id: string) => r.checks.find((c) => c.id === id)?.status;

describe('local readiness', () => {
  it('is offline-ready only when every real check passes', async () => {
    const report = await checkLocalReadiness(spec, probe());
    expect(report.offlineReady).toBe(true);
    expect(report.checks.map((c) => c.status)).toEqual(['pass', 'pass', 'pass', 'pass', 'pass', 'pass']);
    expect(report.checks.find((c) => c.id === 'inference')?.detail).toContain('18.4 tokens/s');
  });

  it('reports a missing model and skips the rest of the model checks', async () => {
    const smokeTest = jest.fn(async () => ({ ok: true }));
    const report = await checkLocalReadiness(spec, probe({ modelFile: async () => undefined, smokeTest }));
    expect(report.offlineReady).toBe(false);
    expect([status(report, 'model_present'), status(report, 'checksum'), status(report, 'inference')]).toEqual(['fail', 'warn', 'fail']);
    expect(smokeTest).not.toHaveBeenCalled();
  });

  it('fails a truncated file without hashing it', async () => {
    const hash = jest.fn(async () => ({ algorithm: 'sha256' as const, hex: spec.sha256 }));
    const report = await checkLocalReadiness(spec, probe({ modelFile: async () => ({ path: '/m', sizeBytes: 1000 }), hash }));
    expect(status(report, 'checksum')).toBe('fail');
    expect(hash).not.toHaveBeenCalled();
    expect(report.offlineReady).toBe(false);
  });

  it('never loads a model whose checksum does not match', async () => {
    const smokeTest = jest.fn(async () => ({ ok: true }));
    const report = await checkLocalReadiness(spec, probe({ hash: async () => ({ algorithm: 'sha256' as const, hex: 'deadbeef' }), smokeTest }));
    expect(status(report, 'checksum')).toBe('fail');
    expect(status(report, 'inference')).toBe('fail');
    expect(smokeTest).not.toHaveBeenCalled();
    expect(report.offlineReady).toBe(false);
  });

  it('is not ready when the inference test fails or throws', async () => {
    const bad = await checkLocalReadiness(spec, probe({ smokeTest: async () => ({ ok: false, error: 'out of memory' }) }));
    expect(bad.offlineReady).toBe(false);
    expect(bad.checks.find((c) => c.id === 'inference')?.detail).toContain('out of memory');
    expect(status(bad, 'network_independent')).toBe('warn');

    const thrown = await checkLocalReadiness(spec, probe({ smokeTest: async () => Promise.reject(new Error('dlopen failed')) }));
    expect(thrown.offlineReady).toBe(false);
    expect(thrown.checks.find((c) => c.id === 'inference')?.detail).toContain('dlopen failed');
  });

  it('verifies with the pinned MD5 when the phone can only hash MD5', async () => {
    const ok = await checkLocalReadiness(spec, probe({ hash: async () => ({ algorithm: 'md5' as const, hex: spec.md5!.toUpperCase() }) }));
    expect(status(ok, 'checksum')).toBe('pass');
    const unpinned = await checkLocalReadiness({ ...spec, md5: undefined }, probe({ hash: async () => ({ algorithm: 'md5' as const, hex: 'abc' }) }));
    expect(status(unpinned, 'checksum')).toBe('fail');
    expect(unpinned.offlineReady).toBe(false);
  });

  it('is not ready without bundled OCR', async () => {
    const report = await checkLocalReadiness(spec, probe({ ocrAvailable: async () => false }));
    expect(status(report, 'ocr')).toBe('fail');
    expect(report.offlineReady).toBe(false);
  });

  it('warns on low storage but does not block', async () => {
    const report = await checkLocalReadiness(spec, probe({ freeStorageBytes: async () => 100 * 1024 * 1024 }));
    expect(status(report, 'storage')).toBe('warn');
    expect(report.offlineReady).toBe(true);
  });

  it('recognizes the smoke-test reply, ignoring Qwen3 reasoning', () => {
    expect(isSmokeTestReply('<think>ok then {"ok": false}</think>{"ok": true}')).toBe(true);
    expect(isSmokeTestReply('{"ok": false}')).toBe(false);
    expect(isSmokeTestReply('Sure!')).toBe(false);
  });

  it('pins a SHA-256 and size for every model candidate', () => {
    for (const m of MODEL_CANDIDATES) {
      expect(m.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(m.sizeBytes).toBeGreaterThan(100 * 1024 * 1024);
      expect(m.sourceUrl).toContain(m.fileName);
    }
  });
});
