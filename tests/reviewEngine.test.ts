import { afterEach, describe, expect, it, jest } from '@jest/globals';
import type { InferenceEngine } from '@/ai/engines';

const mockLocal = { info: { kind: 'local' as const }, isModelInstalled: jest.fn<() => Promise<boolean>>() };
jest.mock('@/ai/localEngine', () => ({ getLocalEngine: () => mockLocal, guessDocumentType: () => ({ type: 'other', confidence: 0 }) }));

// Imported after the mock is registered.
// eslint-disable-next-line import/first
import { demoEngine, getReviewEngine } from '@/ai/demoEngine';

const original = process.env.EXPO_PUBLIC_ENGINE;
afterEach(() => {
  process.env.EXPO_PUBLIC_ENGINE = original;
  mockLocal.isModelInstalled.mockReset();
});

describe('getReviewEngine — which engine runs a review', () => {
  it('a built-in sample uses the instant Demo engine until the model is installed', async () => {
    process.env.EXPO_PUBLIC_ENGINE = 'local';
    mockLocal.isModelInstalled.mockResolvedValue(false);
    expect(await getReviewEngine({ isSample: true })).toBe(demoEngine);
  });

  it('a built-in sample uses the real engine once the model is installed', async () => {
    process.env.EXPO_PUBLIC_ENGINE = 'local';
    mockLocal.isModelInstalled.mockResolvedValue(true);
    expect(await getReviewEngine({ isSample: true })).toBe(mockLocal as unknown as InferenceEngine);
  });

  it('your own document always uses the real engine, installed or not (it reports what is missing)', async () => {
    process.env.EXPO_PUBLIC_ENGINE = 'local';
    mockLocal.isModelInstalled.mockResolvedValue(false);
    expect(await getReviewEngine({ isSample: false })).toBe(mockLocal as unknown as InferenceEngine);
    expect(mockLocal.isModelInstalled).not.toHaveBeenCalled();
  });

  it('falls back to the Demo engine for a sample if the installed-check itself fails', async () => {
    process.env.EXPO_PUBLIC_ENGINE = 'local';
    mockLocal.isModelInstalled.mockRejectedValue(new Error('storage unavailable'));
    expect(await getReviewEngine({ isSample: true })).toBe(demoEngine);
  });

  it('on a Demo-engine build everything stays on the Demo engine', async () => {
    process.env.EXPO_PUBLIC_ENGINE = 'demo';
    expect(await getReviewEngine({ isSample: false })).toBe(demoEngine);
    expect(await getReviewEngine({ isSample: true })).toBe(demoEngine);
  });
});
