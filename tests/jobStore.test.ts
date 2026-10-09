import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { installmentAgreement, serviceAgreement } from '@/ai/demo/fixtures';
import { useDocuments } from '@/features/documents/store';
import { useDraft } from '@/features/review/draftStore';
import { useReviewJob } from '@/features/review/jobStore';

jest.setTimeout(15_000);

/** Wait until the job leaves `running`. */
async function settle() {
  for (let i = 0; i < 100 && useReviewJob.getState().status === 'running'; i++) {
    await new Promise((r) => setTimeout(r, 50));
  }
}

function prepareDraft(title: string, pages = installmentAgreement.pages) {
  useDraft.getState().start('sample', title);
  useDraft.getState().setRecognized(structuredClone(pages), 'ocr');
  useDraft.getState().setType('installment_agreement');
}

describe('review job', () => {
  beforeEach(() => {
    useReviewJob.getState().cancel();
    useDocuments.getState().eraseAll();
    useDraft.getState().reset();
  });

  it('saves the review and clears the draft it started from', async () => {
    prepareDraft('First');
    useReviewJob.getState().start();
    await settle();
    expect(useReviewJob.getState().status).toBe('done');
    expect(useDocuments.getState().order).toHaveLength(1);
    expect(useDraft.getState().recognized).toHaveLength(0);
  });

  it('does not wipe a newer draft the person started while the review ran minimized', async () => {
    prepareDraft('First');
    useReviewJob.getState().start();
    // A second capture flow begins before the first review finishes.
    prepareDraft('Second', serviceAgreement.pages);
    await settle();
    expect(useReviewJob.getState().status).toBe('done');
    expect(useDraft.getState().title).toBe('Second');
    expect(useDraft.getState().recognized).toHaveLength(serviceAgreement.pages.length);
  });

  it('refuses to start without pages instead of saving an empty review', () => {
    useReviewJob.getState().start();
    expect(useReviewJob.getState().status).toBe('error');
    expect(useDocuments.getState().order).toHaveLength(0);
  });

  it('can discard a failed review', () => {
    useReviewJob.getState().start();
    useReviewJob.getState().discard();
    expect(useReviewJob.getState().status).toBe('idle');
  });

  it('reports a review in progress so a new one cannot start over it', () => {
    prepareDraft('First');
    useReviewJob.getState().start();
    expect(useReviewJob.getState().isBusy()).toBe(true);
    useReviewJob.getState().cancel();
    expect(useReviewJob.getState().isBusy()).toBe(false);
  });
});
