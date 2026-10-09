/**
 * Storage contract (PRD §13–14). H1 target implementation:
 *   - expo-sqlite opened with SQLCipher, key from expo-secure-store (OS keystore)
 *   - page images in app-private storage with authenticated encryption
 *   - delete() removes source files, derived records, temp files and caches
 *
 * Today the in-memory Zustand store (src/features/documents/store.ts) satisfies
 * this interface so screens can be built; swap the backing without touching UI.
 */
import type { DocumentRecord } from '@/domain/schema';

export interface DocumentRepository {
  list(): Promise<DocumentRecord[]>;
  get(id: string): Promise<DocumentRecord | undefined>;
  save(doc: DocumentRecord): Promise<void>;
  rename(id: string, title: string): Promise<void>;
  /** Must erase originals, analysis, temp files and caches — not just the row. */
  delete(id: string): Promise<void>;
  eraseAll(): Promise<void>;
}
