import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { makeDoc } from './fixtures/fakeStorage';

/** Minimal expo-file-system stand-in: a set of existing paths plus copy/delete. */
const mockDisk = new Set<string>();
const mockFailing = new Set<string>();

jest.mock('expo-file-system', () => {
  const join = (parts: unknown[]) =>
    parts
      .map((p) => (typeof p === 'string' ? p : (p as { uri: string }).uri))
      .map((s, i) => (i === 0 ? s.replace(/\/$/, '') : s.replace(/^\/|\/$/g, '')))
      .join('/');
  class Directory {
    uri: string;
    constructor(...parts: unknown[]) {
      this.uri = `${join(parts)}/`;
    }
    get exists() {
      return [...mockDisk].some((p) => p.startsWith(this.uri));
    }
    create() {}
    delete() {
      for (const p of [...mockDisk]) if (p.startsWith(this.uri)) mockDisk.delete(p);
    }
  }
  class File {
    uri: string;
    constructor(...parts: unknown[]) {
      this.uri = join(parts);
    }
    get exists() {
      return mockDisk.has(this.uri);
    }
    async copy(dest: { uri: string }) {
      if (mockFailing.has(this.uri) || !mockDisk.has(this.uri)) throw new Error('copy failed');
      mockDisk.add(dest.uri);
    }
  }
  return { Directory, File, Paths: { document: new Directory('file:///data/app/files') } };
});

// Imported after the mock is registered.
const { pageFiles, safeSegment } = require('@/db/pageFiles') as typeof import('@/db/pageFiles');

const PRIVATE = 'file:///data/app/files/pages';

describe('app-private page files', () => {
  beforeEach(() => {
    mockDisk.clear();
    mockFailing.clear();
  });

  it('copies cache images into pages/<docId>/ and rewrites the URI', async () => {
    const doc = makeDoc('doc1');
    mockDisk.add(doc.pages[0]!.uri!);
    const pages = await pageFiles.importPages('doc1', doc.pages);
    expect(pages[0]?.uri).toBe(`${PRIVATE}/doc1/page-1.jpg`);
    expect(mockDisk.has(`${PRIVATE}/doc1/page-1.jpg`)).toBe(true);
    // Already private: returned unchanged, no copy.
    expect(await pageFiles.importPages('doc1', pages)).toBe(pages);
  });

  it('keeps the original URI when the copy fails and there is no earlier copy', async () => {
    const doc = makeDoc('doc2');
    const pages = await pageFiles.importPages('doc2', doc.pages);
    expect(pages[0]?.uri).toBe(doc.pages[0]?.uri);
  });

  it('deletes only the folder of the deleted document; removeAll deletes every folder', async () => {
    mockDisk.add(`${PRIVATE}/doc1/page-1.jpg`);
    mockDisk.add(`${PRIVATE}/doc10/page-1.jpg`);
    await pageFiles.removeDocument('doc1');
    expect([...mockDisk]).toEqual([`${PRIVATE}/doc10/page-1.jpg`]);
    await pageFiles.removeAll();
    expect(mockDisk.size).toBe(0);
  });

  it('never lets a document id escape the pages folder', () => {
    expect(safeSegment('../../databases')).toBe('______databases');
    expect(safeSegment('')).toBe('_');
  });
});
