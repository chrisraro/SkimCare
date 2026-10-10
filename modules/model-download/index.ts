/**
 * JS side of the Android DownloadManager wrapper used to fetch the on-device model.
 * `getModelDownloader()` returns null where the native module isn't linked (web,
 * iOS, Expo Go, builds made before this module existed, Jest); callers then use
 * the expo-file-system download instead.
 *
 * Only the model URL is requested. No document content is ever sent.
 */
import { requireOptionalNativeModule } from 'expo';

export type NativeDownloadStatus = 'pending' | 'running' | 'paused' | 'successful' | 'failed' | 'missing';

export interface NativeDownloadInfo {
  status: NativeDownloadStatus;
  /** Bytes downloaded so far (absent when `missing`). */
  bytes?: number;
  /** Total size, or -1 while the server has not said yet. */
  total?: number;
  /** DownloadManager COLUMN_REASON: an HTTP status or an ERROR_* / PAUSED_* code. */
  reason?: number;
}

/** Rejection codes; messages never contain anything but plain status. */
export type ModelDownloadErrorCode = 'ERR_NO_CONTEXT' | 'ERR_STORAGE' | 'ERR_FILE_NAME' | 'ERR_URL' | 'ERR_MISSING' | 'ERR_DEST' | 'ERR_MOVE';

export interface ModelDownloadModule {
  /** Enqueues `url` into app-specific storage as `<fileName>.part`; returns the download id. */
  start(url: string, fileName: string, title: string, description: string): Promise<string>;
  query(id: string): Promise<NativeDownloadInfo>;
  /** Newest non-failed download of `url` by this app (to re-attach after a restart), or null. */
  findByUrl(url: string): Promise<string | null>;
  /** Stops the download and deletes the partial file. */
  cancel(id: string): Promise<void>;
  /** Moves the finished `<fileName>.part` to `destUri` (file://) and clears the entry. */
  install(id: string, fileName: string, destUri: string): Promise<void>;
}

export function getModelDownloader(): ModelDownloadModule | null {
  return requireOptionalNativeModule<ModelDownloadModule>('ModelDownload');
}
