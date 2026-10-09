/**
 * Document vault (F16). In-memory today; see src/db/repository.ts for the
 * encrypted SQLCipher contract this store will be backed by.
 */
import { create } from 'zustand';
import type { AnalysisRun, ClarificationQuestion, DocumentRecord } from '@/domain/schema';

interface DocumentsState {
  byId: Record<string, DocumentRecord>;
  order: string[];

  save: (doc: DocumentRecord) => void;
  rename: (id: string, title: string) => void;
  remove: (id: string) => void;
  eraseAll: () => void;

  setAnalysis: (id: string, run: AnalysisRun) => void;
  /** User OCR correction — invalidates dependent findings (PRD §05). */
  correctBlock: (id: string, page: number, blockId: string, text: string) => void;
  confirmFact: (id: string, factId: string) => void;
  answerComprehension: (id: string, itemId: string, choiceId: string) => void;
  upsertQuestion: (id: string, q: ClarificationQuestion) => void;
  removeQuestion: (id: string, questionId: string) => void;
}

const now = () => new Date().toISOString();

function patchDoc(
  state: DocumentsState,
  id: string,
  fn: (d: DocumentRecord) => DocumentRecord,
): Partial<DocumentsState> {
  const doc = state.byId[id];
  if (!doc) return {};
  return { byId: { ...state.byId, [id]: { ...fn(doc), updatedAt: now() } } };
}

function patchRun(doc: DocumentRecord, fn: (r: AnalysisRun) => AnalysisRun): DocumentRecord {
  return doc.analysis ? { ...doc, analysis: fn(doc.analysis) } : doc;
}

export const useDocuments = create<DocumentsState>((set) => ({
  byId: {},
  order: [],

  save: (doc) =>
    set((s) => ({
      byId: { ...s.byId, [doc.id]: doc },
      order: [doc.id, ...s.order.filter((x) => x !== doc.id)],
    })),
  rename: (id, title) => set((s) => patchDoc(s, id, (d) => ({ ...d, title }))),
  remove: (id) =>
    set((s) => {
      const { [id]: _removed, ...rest } = s.byId;
      return { byId: rest, order: s.order.filter((x) => x !== id) };
    }),
  eraseAll: () => set({ byId: {}, order: [] }),

  setAnalysis: (id, run) => set((s) => patchDoc(s, id, (d) => ({ ...d, analysis: run, analysisStale: false }))),

  correctBlock: (id, page, blockId, text) =>
    set((s) =>
      patchDoc(s, id, (d) => ({
        ...d,
        ocrRevision: d.ocrRevision + 1,
        analysisStale: Boolean(d.analysis),
        pages: d.pages.map((p) =>
          p.number !== page
            ? p
            : {
                ...p,
                blocks: p.blocks.map((b) =>
                  b.id === blockId ? { ...b, text, correctedAt: now(), verifiedAt: now() } : b,
                ),
              },
        ),
      })),
    ),

  confirmFact: (id, factId) =>
    set((s) =>
      patchDoc(s, id, (d) =>
        patchRun(d, (r) => ({
          ...r,
          facts: r.facts.map((f) => (f.id === factId ? { ...f, confirmedByUser: true } : f)),
        })),
      ),
    ),

  answerComprehension: (id, itemId, choiceId) =>
    set((s) =>
      patchDoc(s, id, (d) =>
        patchRun(d, (r) => ({
          ...r,
          comprehension: r.comprehension.map((c) => (c.id === itemId ? { ...c, userChoiceId: choiceId } : c)),
        })),
      ),
    ),

  upsertQuestion: (id, q) =>
    set((s) =>
      patchDoc(s, id, (d) =>
        patchRun(d, (r) => {
          const exists = r.questions.some((x) => x.id === q.id);
          return { ...r, questions: exists ? r.questions.map((x) => (x.id === q.id ? q : x)) : [...r.questions, q] };
        }),
      ),
    ),

  removeQuestion: (id, questionId) =>
    set((s) =>
      patchDoc(s, id, (d) => patchRun(d, (r) => ({ ...r, questions: r.questions.filter((x) => x.id !== questionId) }))),
    ),
}));

export function useDocument(id: string | undefined) {
  return useDocuments((s) => (id ? s.byId[id] : undefined));
}
