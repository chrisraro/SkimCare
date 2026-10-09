/**
 * In-progress capture flow state (S05 → S10). Cleared once a review is saved
 * or cancelled, so no temporary page data lingers.
 */
import { create } from 'zustand';
import type { CapturedPage } from '@/ai/engines';
import type { DocumentPage, DocumentType } from '@/domain/schema';

interface DraftState {
  source: 'camera' | 'gallery' | 'pdf' | 'sample' | null;
  captured: CapturedPage[];
  recognized: DocumentPage[];
  documentType: DocumentType | null;
  detectedType: DocumentType | null;
  language: 'en' | 'fil';
  title: string;

  start: (source: NonNullable<DraftState['source']>, title?: string) => void;
  addPages: (pages: CapturedPage[]) => void;
  replacePage: (id: string, uri: string) => void;
  removePage: (id: string) => void;
  rotatePage: (id: string) => void;
  movePage: (id: string, dir: -1 | 1) => void;
  setRecognized: (pages: DocumentPage[]) => void;
  updateBlock: (blockId: string, page: number, patch: { text?: string; verified?: boolean }) => void;
  setType: (t: DocumentType, detected?: boolean) => void;
  setLanguage: (l: 'en' | 'fil') => void;
  reset: () => void;
}

const initial = {
  source: null,
  captured: [],
  recognized: [],
  documentType: null,
  detectedType: null,
  language: 'en' as const,
  title: '',
};

export const useDraft = create<DraftState>((set) => ({
  ...initial,
  start: (source, title = '') => set({ ...initial, source, title }),
  addPages: (pages) => set((s) => ({ captured: [...s.captured, ...pages] })),
  replacePage: (id, uri) => set((s) => ({ captured: s.captured.map((p) => (p.id === id ? { ...p, uri } : p)) })),
  removePage: (id) => set((s) => ({ captured: s.captured.filter((p) => p.id !== id) })),
  rotatePage: (id) =>
    set((s) => ({
      captured: s.captured.map((p) =>
        p.id === id ? { ...p, rotation: (((p.rotation + 90) % 360) as CapturedPage['rotation']) } : p,
      ),
    })),
  movePage: (id, dir) =>
    set((s) => {
      const i = s.captured.findIndex((p) => p.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= s.captured.length) return s;
      const next = [...s.captured];
      [next[i], next[j]] = [next[j]!, next[i]!];
      return { captured: next };
    }),
  setRecognized: (recognized) => set({ recognized }),
  updateBlock: (blockId, page, patch) =>
    set((s) => ({
      recognized: s.recognized.map((p) =>
        p.number !== page
          ? p
          : {
              ...p,
              blocks: p.blocks.map((b) => {
                if (b.id !== blockId) return b;
                const now = new Date().toISOString();
                const changed = patch.text !== undefined && patch.text !== b.text;
                return {
                  ...b,
                  text: patch.text ?? b.text,
                  correctedAt: changed ? now : b.correctedAt,
                  verifiedAt: patch.verified ? now : b.verifiedAt,
                };
              }),
            },
      ),
    })),
  setType: (t, detected) => set(detected ? { documentType: t, detectedType: t } : { documentType: t }),
  setLanguage: (language) => set({ language }),
  reset: () => set(initial),
}));
