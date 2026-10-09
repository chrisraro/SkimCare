/**
 * Storage contract (PRD §13–14).
 *   - Android/iOS: src/db/sqliteRepository.ts over an expo-sqlite database keyed
 *     with SQLCipher (src/db/encryptedDb.ts); the key lives in expo-secure-store.
 *   - Page images are copied into app-private storage (src/db/pageFiles.ts).
 *     File-level encryption of page images is a follow-up.
 *   - Web: no repository; reviews stay in memory (src/db/openStorage.web.ts).
 *
 * The Zustand stores stay the UI's source of truth; src/features/storage/persistence.ts
 * hydrates them from this repository at startup and writes changes back.
 */
import type { DocumentRecord } from '@/domain/schema';

export interface DocumentRepository {
  list(): Promise<DocumentRecord[]>;
  get(id: string): Promise<DocumentRecord | undefined>;
  /** Returns the record as stored (page URIs rewritten to app-private files). */
  save(doc: DocumentRecord): Promise<DocumentRecord>;
  rename(id: string, title: string): Promise<void>;
  /** Must erase originals, analysis, temp files and caches — not just the row. */
  delete(id: string): Promise<void>;
  eraseAll(): Promise<void>;
}

/** Small key/value settings (locale, onboarding). Never document content. */
export interface SettingsRepository {
  getSettings(): Promise<Record<string, string>>;
  setSetting(key: string, value: string): Promise<void>;
}
