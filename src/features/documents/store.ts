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

/**
 * A re-run replaces the analysis, but what the person did with the last one is theirs:
 * their own and edited questions, confirmed figures (if the value is unchanged) and
 * quiz answers (if the item is unchanged) carry over.
 */
export function carryOverUserState(prev: AnalysisRun | undefined, next: AnalysisRun): AnalysisRun {
  if (!prev) return next;
  const own = prev.questions.filter((q) => q.edited || q.id.startsWith('user_'));
  const ownById = new Map(own.map((q) => [q.id, q]));
  const questions = [
    ...next.questions.map((q) => ownById.get(q.id) ?? q),
    ...own.filter((q) => !next.questions.some((n) => n.id === q.id)),
  ];
  const facts = next.facts.map((f) => {
    const old = prev.facts.find((p) => p.id === f.id);
    return old?.confirmedByUser && old.value === f.value ? { ...f, confirmedByUser: true } : f;
  });
  const comprehension = next.comprehension.map((c) => {
    const old = prev.comprehension.find((p) => p.id === c.id);
    return old?.userChoiceId && old.supportedChoiceId === c.supportedChoiceId && old.prompt === c.prompt
      ? { ...c, userChoiceId: old.userChoiceId }
      : c;
  });
  return { ...next, questions, facts, comprehension };
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

  setAnalysis: (id, run) =>
    set((s) =>
      patchDoc(s, id, (d) => ({
        ...d,
        analysis: carryOverUserState(d.analysis, run),
        // A run built from older text (the user corrected a block while it ran) is still stale.
        analysisStale: run.ocrRevision !== d.ocrRevision,
      })),
    ),

  correctBlock: (id, page, blockId, text) =>
    set((s) =>
      patchDoc(s, id, (d) => ({
        ...patchRun(d, (r) => ({
          ...r,
          // Figures read from the old text must not feed What-if until the review is re-run.
          facts: r.facts.map((f) =>
            f.evidence.page === page && f.evidence.blockId === blockId ? { ...f, confirmedByUser: false } : f,
          ),
        })),
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
