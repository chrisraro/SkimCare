/**
 * Document scanner via expo-document-scanner (ML Kit Document Scanner on
 * Android, VisionKit on iOS): edge detection, perspective fix, cleanup, multi-page.
 *
 * Android caveat: Google Play services downloads the scanner module on first
 * use, which needs internet once. Open the scanner while online during setup.
 * Requires a development build (Nitro module); falls back to the system camera.
 */
import { Platform } from 'react-native';

type ScannerModule = typeof import('expo-document-scanner');

let cached: ScannerModule | null | undefined;

function loadScanner(): ScannerModule | null {
  if (cached !== undefined) return cached;
  if (Platform.OS !== 'android' && Platform.OS !== 'ios') return (cached = null);
  try {
    // The native entry creates its hybrid object at import time; this throws in Expo Go.
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- intentional lazy native load
    cached = require('expo-document-scanner') as ScannerModule;
  } catch {
    cached = null;
  }
  return cached;
}

export function scannerAvailable(): boolean {
  return loadScanner() !== null;
}

export type ScanOutcome =
  | { status: 'ok'; uris: string[] }
  | { status: 'cancelled' }
  | { status: 'unavailable' }
  /** The scanner exists but could not run (e.g. Play services module not downloaded yet, offline). */
  | { status: 'failed' };

export async function scanPages(maxPages = 20): Promise<ScanOutcome> {
  const scanner = loadScanner();
  if (!scanner) return { status: 'unavailable' };
  try {
    const result = await scanner.scanDocument({ maxNumDocuments: maxPages, scannerMode: 'full', galleryImportAllowed: false });
    return result.pages.length ? { status: 'ok', uris: result.pages.map((p) => p.uri) } : { status: 'cancelled' };
  } catch (e) {
    // The native side rejects with "User cancelled the scan…" on cancel; anything else is a failure.
    const message = e instanceof Error ? e.message : '';
    return /cancel/i.test(message) ? { status: 'cancelled' } : { status: 'failed' };
  }
}
