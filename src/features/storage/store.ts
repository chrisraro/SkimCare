import { create } from 'zustand';

/**
 * Where reviews are kept this session.
 * - pending: startup has not finished opening storage
 * - encrypted: SQLCipher database opened; reviews survive restart
 * - unavailable: encrypted storage failed to open; reviews stay in memory only
 * - web: browser build; reviews stay in memory until the tab closes
 */
export type StorageStatus = 'pending' | 'encrypted' | 'unavailable' | 'web';

export const useStorageStatus = create<{ status: StorageStatus }>(() => ({ status: 'pending' }));
