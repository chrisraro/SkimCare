/**
 * Self-hosted browser libraries (copied into `public/vendor` by
 * scripts/copy-web-assets.mjs). They are loaded at runtime from this site only —
 * never from a CDN — so the bundle stays small and nothing loads until it is used.
 * Web only.
 */

export const VENDOR = '/vendor';

export interface VendorManifest {
  /** wllama build for browsers without JSPI / Memory64 (Safari, iPhone). */
  wllamaCompat: boolean;
  /** Tesseract languages shipped in `vendor/tesseract/lang`. */
  tesseractLangs: string[];
}

export const absoluteUrl = (path: string) => new URL(path, globalThis.location?.href ?? 'http://localhost/').href;

// A variable `import()` that Metro leaves alone: the module is a plain ES module on this site.
const runtimeImport = new Function('url', 'return import(url)') as (url: string) => Promise<unknown>;

const modules = new Map<string, Promise<unknown>>();

export function importVendor<T>(path: string): Promise<T> {
  let p = modules.get(path);
  if (!p) {
    p = runtimeImport(absoluteUrl(`${VENDOR}/${path}`));
    p.catch(() => modules.delete(path));
    modules.set(path, p);
  }
  return p as Promise<T>;
}

let manifest: Promise<VendorManifest> | null = null;

export function vendorManifest(): Promise<VendorManifest> {
  manifest ??= fetch(absoluteUrl(`${VENDOR}/manifest.json`))
    .then((r): Promise<Partial<VendorManifest>> | Partial<VendorManifest> => (r.ok ? r.json() : {}))
    .catch((): Partial<VendorManifest> => ({}))
    .then((m: Partial<VendorManifest>) => ({ wllamaCompat: m.wllamaCompat === true, tesseractLangs: Array.isArray(m.tesseractLangs) ? m.tesseractLangs : [] }));
  return manifest;
}
