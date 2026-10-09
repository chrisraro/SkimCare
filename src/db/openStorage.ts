/**
 * Android/iOS: open the SQLCipher database and the app-private page folder.
 * Throws when encrypted storage cannot open; the caller keeps working in memory.
 * Web uses openStorage.web.ts instead (no SQLCipher in browsers).
 */
import { openEncryptedDb } from './encryptedDb';
import { pageFiles } from './pageFiles';
import { createSqliteRepository, type StorageHandle } from './sqliteRepository';

export async function openStorage(): Promise<StorageHandle> {
  const db = await openEncryptedDb();
  return { kind: 'encrypted', repo: await createSqliteRepository(db, pageFiles) };
}
