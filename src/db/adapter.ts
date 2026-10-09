/**
 * Small seams between the repository logic and the device APIs, so the
 * repository can be unit-tested with fakes (tests/sqliteRepository.test.ts).
 * Native implementations: src/db/encryptedDb.ts (SQLCipher) and src/db/pageFiles.ts.
 */
import type { DocumentPage } from '@/domain/schema';

export type SqlParam = string | number | null;

/** The subset of expo-sqlite the repository uses. */
export interface SqlDb {
  exec(sql: string): Promise<void>;
  run(sql: string, params?: SqlParam[]): Promise<void>;
  all<T>(sql: string, params?: SqlParam[]): Promise<T[]>;
}

/** App-private page images (Paths.document/pages/<docId>/). */
export interface PageFileStore {
  /**
   * Copy page images that still point at cache/temp URIs into the document's
   * private folder and return the pages with `uri` rewritten. Pages already in
   * the folder, or without an image, are returned unchanged.
   */
  importPages(docId: string, pages: DocumentPage[]): Promise<DocumentPage[]>;
  /** Remove every page file of one document. Missing folder is not an error. */
  removeDocument(docId: string): Promise<void>;
  /** Remove every page file of every document. */
  removeAll(): Promise<void>;
}
