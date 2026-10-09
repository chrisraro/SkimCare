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
  /** Blocks read so far during extraction, when the engine reports it. */
  progress?: { done: number; total: number };
  title: string;
  /** Set once the finished review is saved. */
  docId?: string;
  error?: string;
  /** The draft session this job was started from; only that draft is cleared when it finishes. */
  draftSessionId?: string;
  /** True while the person is elsewhere in the app; the tab bar accessory takes over. */
  minimized: boolean;
  start: () => void;
  /** Stop a running review; the draft is kept so the person can go back and adjust. */
  cancel: () => void;
  /** Give up on a stopped or failed review, dropping its draft. */
  discard: () => void;
  setMinimized: (minimized: boolean) => void;
  /** Forget a finished or failed job once it has been opened or dismissed. */
  clear: () => void;
  /** A review is running or waiting on the person after a failure — a new one must not start over it. */
  isBusy: () => boolean;
}

let controller: AbortController | null = null;

function clearDraftIfOwn(sessionId: string | undefined) {
  const draft = useDraft.getState();
  if (draft.sessionId === sessionId) draft.reset();
}

export const useReviewJob = create<ReviewJobState>((set, get) => ({
  status: 'idle',
  stage: 'organize',
  title: '',
  minimized: false,

  start: () => {
    if (get().status === 'running') return;
    const draft = useDraft.getState();
    const title = draft.title || 'Untitled agreement';

    if (draft.recognized.length === 0) {
      set({
        status: 'error',
        stage: 'organize',
        title,
        docId: undefined,
        draftSessionId: draft.sessionId,
        error: 'There are no pages to review. Start a new review and add your pages.',
      });
      return;
    }

    const ac = new AbortController();
    controller = ac;
    const now = new Date().toISOString();
    const id = `doc_${Date.now().toString(36)}`;
    set({ status: 'running', stage: 'organize', progress: undefined, title, docId: undefined, error: undefined, draftSessionId: draft.sessionId });

    runAnalysis({
      engine: getEngine(),
      pages: draft.recognized,
      ocrRevision: 0,
      documentType: draft.documentType ?? 'other',
      language: draft.language,
      onStage: (stage) => {
        if (!ac.signal.aborted) set({ stage });
      },
      onProgress: (done, total) => {
        if (!ac.signal.aborted) set({ progress: { done, total } });
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
        // Only clear the draft this review came from — never one started since.
        clearDraftIfOwn(draft.sessionId);
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

  discard: () => {
    controller?.abort();
    controller = null;
    clearDraftIfOwn(get().draftSessionId);
    set({ status: 'idle', minimized: false, error: undefined, docId: undefined, draftSessionId: undefined });
  },

  setMinimized: (minimized) => set({ minimized }),

  clear: () => set({ status: 'idle', minimized: false, docId: undefined, error: undefined, draftSessionId: undefined }),

  isBusy: () => {
    const { status } = get();
    return status === 'running' || status === 'error';
  },
}));

// A finished review's "Review ready" notice must not outlive the document it opens.
useDocuments.subscribe((docs) => {
  const job = useReviewJob.getState();
  if (job.status === 'done' && job.docId && !docs.byId[job.docId]) job.clear();
});
