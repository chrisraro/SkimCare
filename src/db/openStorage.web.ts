/**
 * Web: browsers have no SQLCipher, and documents must not go into unencrypted
 * IndexedDB/localStorage. Reviews stay in memory until the tab closes.
 */
import type { StorageHandle } from './sqliteRepository';

export async function openStorage(): Promise<StorageHandle> {
  return { kind: 'web' };
}
