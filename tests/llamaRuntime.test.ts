import { beforeEach, describe, expect, it, jest } from '@jest/globals';

/** Fake llama.rn: counts how many native operations overlap. */
const mockNative = { inFlight: 0, maxInFlight: 0, inits: 0, failNext: false };
async function mockOperation<T>(result: T): Promise<T> {
  mockNative.inFlight++;
  mockNative.maxInFlight = Math.max(mockNative.maxInFlight, mockNative.inFlight);
  await new Promise((r) => setTimeout(r, 5));
  mockNative.inFlight--;
  return result;
}

jest.mock('llama.rn', () => ({
  initLlama: async () => {
    mockNative.inits++;
    return mockOperation({
      completion: async () => {
        if (mockNative.failNext) {
          mockNative.failNext = false;
          throw new Error('native failure');
        }
        return mockOperation({ content: 'OK', text: '', interrupted: false, timings: { predicted_per_second: 5 } });
      },
      stopCompletion: async () => undefined,
      release: () => mockOperation(undefined),
    });
  },
}));

jest.mock('expo-file-system', () => ({
  Paths: { document: 'file:///docs', availableDiskSpace: 1 },
  File: class {
    uri: string;
    exists = true;
    constructor(...parts: string[]) {
      this.uri = parts.join('/');
    }
    info() {
      return { size: 1, md5: 'x' };
    }
  },
}));

// eslint-disable-next-line import/first
import { createLlamaProbe, createLlamaRunner, releaseModel } from '@/ai/llm/llamaRuntime';
// eslint-disable-next-line import/first
import { getModelSpec } from '@/ai/llm/models';

const spec = getModelSpec()!;
const req = { messages: [{ role: 'user' as const, content: 'x' }], jsonSchema: {}, maxTokens: 8 };

describe('llama.rn runtime', () => {
  beforeEach(() => {
    Object.assign(mockNative, { inFlight: 0, maxInFlight: 0, inits: 0, failNext: false });
  });

  it('never runs two native model operations at once (e.g. a readiness check during a review)', async () => {
    const run = createLlamaRunner(spec);
    const probe = createLlamaProbe(spec, async () => true);
    await Promise.all([run(req), probe.smokeTest('file:///other.gguf'), run(req), releaseModel(), run(req)]);
    expect(mockNative.maxInFlight).toBe(1);
  });

  it('keeps serving calls after one fails', async () => {
    const run = createLlamaRunner(spec);
    mockNative.failNext = true;
    const [first, second] = await Promise.allSettled([run(req), run(req)]);
    expect(first.status).toBe('rejected');
    expect(second).toEqual({ status: 'fulfilled', value: 'OK' });
  });
});
