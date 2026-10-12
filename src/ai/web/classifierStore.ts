/**
 * The clause classifier's files in this browser (web build). Downloaded only when the
 * user asks, from THIS site (`spec.webPath`, copied there at build time by
 * scripts/copy-web-assets.mjs — GitHub release assets send no CORS headers, so a
 * cross-origin download would fail under COEP), checked against the pinned SHA-256, and
 * kept in Cache Storage under a name the service worker never deletes. A file that does
 * not match is not stored.
 *
 * The request is a plain GET of a public file: no document content, no identifiers.
 */
import { AbortedError } from '../engines';
import { classifierFiles, type ClassifierSpec, type ModelSpec } from '../llm/models';
import { sha256OfBlob } from './sha256';
import { absoluteUrl } from './vendor';

/** Not "skimcare-…": build-sw.mjs deletes those caches on every deploy. */
export const CLASSIFIER_CACHE = 'laya-classifier';

const fileUrl = (spec: ClassifierSpec, f: ModelSpec) => absoluteUrl(`${spec.webPath}/${f.fileName}`);
/** The cache key carries the checksum, so a new pinned file never reuses an old copy. */
const cacheKey = (spec: ClassifierSpec, f: ModelSpec) => `${fileUrl(spec, f)}?sha256=${f.sha256}`;

function cacheStorage(): CacheStorage {
  const c = globalThis.caches;
  if (!c) throw new Error('This browser has no Cache Storage (private window?).');
  return c;
}

/** The stored copy of a file, or undefined. */
export async function storedClassifierFile(spec: ClassifierSpec, f: ModelSpec): Promise<Blob | undefined> {
  const cache = await cacheStorage().open(CLASSIFIER_CACHE);
  const res = await cache.match(cacheKey(spec, f));
  return res ? res.blob() : undefined;
}

async function fetchWithProgress(url: string, expected: number, onBytes: (n: number) => void, signal?: AbortSignal): Promise<Blob> {
  const res = await fetch(url, { signal, credentials: 'omit', cache: 'no-store' });
  if (!res.ok) throw new Error(res.status === 404 ? 'The classifier is not available on this site yet.' : `Download failed (HTTP ${res.status}).`);
  if (!res.body) {
    const blob = await res.blob();
    onBytes(blob.size);
    return blob;
  }
  const reader = res.body.getReader();
  const chunks: BlobPart[] = [];
  let n = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value as Uint8Array<ArrayBuffer>);
    n += value.byteLength;
    if (n > expected) throw new Error('The download is larger than expected.');
    onBytes(n);
  }
  return new Blob(chunks);
}

/** Downloads every missing file, verifies its SHA-256, then stores it. Rejects on failure or cancel. */
export async function downloadClassifierToBrowser(spec: ClassifierSpec, onProgress: (loaded: number, total: number) => void, signal?: AbortSignal): Promise<void> {
  await globalThis.navigator?.storage?.persist?.().catch(() => false);
  const files = classifierFiles(spec);
  const total = files.reduce((n, f) => n + f.sizeBytes, 0);
  const cache = await cacheStorage().open(CLASSIFIER_CACHE);
  let done = 0;
  for (const f of files) {
    if (await cache.match(cacheKey(spec, f))) {
      done += f.sizeBytes;
      onProgress(done, total);
      continue;
    }
    let blob: Blob;
    try {
      blob = await fetchWithProgress(fileUrl(spec, f), f.sizeBytes, (n) => onProgress(done + n, total), signal);
    } catch (e) {
      if (signal?.aborted) throw new AbortedError();
      throw e;
    }
    if (blob.size !== f.sizeBytes || (await sha256OfBlob(blob, signal)) !== f.sha256) {
      throw new Error('The download was damaged (checksum mismatch) and was not kept. Try again.');
    }
    await cache.put(cacheKey(spec, f), new Response(blob, { headers: { 'Content-Type': 'application/octet-stream' } }));
    done += f.sizeBytes;
    onProgress(done, total);
  }
  // Drop copies of files that are no longer pinned.
  const keep = new Set(files.map((f) => cacheKey(spec, f)));
  for (const req of await cache.keys()) if (!keep.has(req.url)) await cache.delete(req);
}
