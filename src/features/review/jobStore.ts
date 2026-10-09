/**
 * The running review (S10). Lives outside the processing screen so a review keeps
 * going when the person minimizes it, and the tab bar accessory can show progress.
 */
import { create } from 'zustand';
import { getEngine } from '@/ai/demoEngine';
import { runAnalysis, type StageId } from '@/ai/pipeline';
import { useDocuments } from '@/features/documents/store';
import { useDraft } from './draftStore';

export type ReviewJobStatus = 'idle' | 'running' | 'done' | 'error';

interface ReviewJobState {
  status: ReviewJobStatus;
  stage: StageId;
  title: string;
  /** Set once the finished review is saved. */
  docId?: string;
  error?: string;
  /** True while the person is elsewhere in the app; the tab bar accessory takes over. */
  minimized: boolean;
  start: () => void;
  cancel: () => void;
  setMinimized: (minimized: boolean) => void;
  /** Forget a finished or failed job once it has been opened or dismissed. */
  clear: () => void;
}

let controller: AbortController | null = null;

export const useReviewJob = create<ReviewJobState>((set, get) => ({
  status: 'idle',
  stage: 'organize',
  title: '',
  minimized: false,

  start: () => {
    if (get().status === 'running') return;
    const draft = useDraft.getState();
    const ac = new AbortController();
    controller = ac;
    const now = new Date().toISOString();
    const id = `doc_${Date.now().toString(36)}`;
    const title = draft.title || 'Untitled agreement';
    set({ status: 'running', stage: 'organize', title, docId: undefined, error: undefined });

    runAnalysis({
      engine: getEngine(),
      pages: draft.recognized,
      ocrRevision: 0,
      documentType: draft.documentType ?? 'other',
      language: draft.language,
      onStage: (stage) => {
        if (!ac.signal.aborted) set({ stage });
      },
      signal: ac.signal,
    })
      .then((run) => {
        if (ac.signal.aborted) return;
        useDocuments.getState().save({
          id,
          title,
          type: draft.documentType ?? 'other',
          language: draft.language,
          createdAt: now,
          updatedAt: now,
          pages: draft.recognized,
          ocrRevision: 0,
          analysis: run,
          analysisStale: false,
        });
        useDraft.getState().reset();
        set({ status: 'done', docId: id });
      })
      .catch((e: Error) => {
        if (ac.signal.aborted) return;
        // The draft is kept on failure, so "Try again" reruns on the same pages.
        set({ status: 'error', error: `${e.message}. Your pages are safe — you can try again.` });
      });
  },

  cancel: () => {
    controller?.abort();
    controller = null;
    set({ status: 'idle', minimized: false, error: undefined });
  },

  setMinimized: (minimized) => set({ minimized }),

  clear: () => set({ status: 'idle', minimized: false, docId: undefined, error: undefined }),
}));
