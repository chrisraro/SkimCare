/**
 * Demo engine — a stand-in that returns fictional fixture text so the UI can be
 * built and tested before llama.rn and ML Kit are integrated.
 *
 * Honesty rules (PRD §19, §12):
 *  - readiness never reports offlineReady = true
 *  - every screen that shows its output displays the "Demo engine" banner
 *  - it does not read the user's photos; it always returns a sample contract
 */
import type { DocumentPage } from '@/domain/schema';
import { DEMO_FIXTURES, type DemoFixture } from './demo/fixtures';
import { throwIfAborted, type InferenceEngine } from './engines';

const wait = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(t);
      reject(new Error('Cancelled'));
    });
  });

let activeFixture: DemoFixture = DEMO_FIXTURES[0];

/** Choose which sample contract the Demo engine "recognizes". */
export function setDemoFixture(id: string) {
  activeFixture = DEMO_FIXTURES.find((f) => f.id === id) ?? DEMO_FIXTURES[0];
}

export function getDemoFixture(): DemoFixture {
  return activeFixture;
}

function fixtureFor(pages: DocumentPage[]): DemoFixture {
  const firstBlock = pages[0]?.blocks[0]?.text;
  return DEMO_FIXTURES.find((f) => f.pages[0]?.blocks[0]?.text === firstBlock) ?? activeFixture;
}

export const demoEngine: InferenceEngine = {
  info: {
    kind: 'demo',
    name: 'Demo engine',
    runtime: 'JavaScript stand-in (no model loaded)',
    ocrModel: 'Not installed — returns sample text',
    llmModel: 'Not installed — returns sample findings',
    promptVersion: 'demo-0',
    license: 'n/a',
  },

  async checkReadiness() {
    await wait(400);
    return {
      offlineReady: false,
      checks: [
        { id: 'model_present', label: 'Language model file', status: 'fail', detail: 'No GGUF model installed yet.' },
        { id: 'checksum', label: 'Model checksum', status: 'warn', detail: 'Skipped — no model to verify.' },
        { id: 'storage', label: 'Private storage', status: 'pass', detail: 'App-private storage available.' },
        { id: 'ocr', label: 'On-device text recognition', status: 'warn', detail: 'Bundled OCR not linked; using sample text.' },
        { id: 'inference', label: 'Local inference test', status: 'fail', detail: 'Demo engine only — no real inference.' },
        { id: 'network_independent', label: 'Works without internet', status: 'pass', detail: 'No network calls are made.' },
      ],
    };
  },

  async classify(pages) {
    await wait(200);
    return { type: fixtureFor(pages).type, confidence: 0.9 };
  },

  ocr: {
    async recognize(captured, signal) {
      await wait(900, signal);
      throwIfAborted(signal);
      // Keep the user's page images attached for the source viewer, but text comes from the fixture.
      return structuredClone(activeFixture.pages).map((p, i) => ({ ...p, uri: captured[i]?.uri }));
    },
  },

  llm: {
    async extract(req, signal) {
      await wait(1400, signal);
      throwIfAborted(signal);
      const fixture = fixtureFor(req.pages);
      return {
        findings: structuredClone(fixture.rawCandidates),
        comprehension: structuredClone(fixture.rawComprehension),
      };
    },
  },
};

/** Single switch point for wiring the real local engine later. */
export function getEngine(): InferenceEngine {
  return demoEngine;
}
