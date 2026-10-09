/**
 * Page images in app-private storage: Paths.document/pages/<docId>/page-<n>.<ext>.
 * Captured pages point at cache/temp URIs that the OS may clear; a saved review
 * gets its own copies, deleted with the document.
 *
 * TODO(M4 follow-up): encrypt these files (authenticated encryption, key in
 * expo-secure-store). Today they are app-private but not encrypted.
 */
import { Directory, File, Paths } from 'expo-file-system';
import type { DocumentPage } from '@/domain/schema';
import type { PageFileStore } from './adapter';

const IMAGE_EXT = /\.(jpe?g|png|webp|heic|heif)$/i;

/** Document ids come from the app, but never let one escape the pages folder. */
export function safeSegment(id: string): string {
  return id.replace(/[^A-Za-z0-9_-]/g, '_') || '_';
}

const withSlash = (uri: string) => (uri.endsWith('/') ? uri : `${uri}/`);

function extensionOf(uri: string): string {
  const path = uri.split(/[?#]/)[0] ?? '';
  return IMAGE_EXT.exec(path)?.[0].toLowerCase() ?? '.jpg';
}

const pagesRoot = () => new Directory(Paths.document, 'pages');
const docDir = (docId: string) => new Directory(pagesRoot(), safeSegment(docId));

export const pageFiles: PageFileStore = {
  async importPages(docId, pages) {
    const dir = docDir(docId);
    const prefix = withSlash(dir.uri);
    if (!pages.some((p) => p.uri && !p.uri.startsWith(prefix))) return pages;
    dir.create({ intermediates: true, idempotent: true });

    const out: DocumentPage[] = [];
    for (const page of pages) {
      if (!page.uri || page.uri.startsWith(prefix)) {
        out.push(page);
        continue;
      }
      const dest = new File(dir, `page-${page.number}${extensionOf(page.uri)}`);
      try {
        await new File(page.uri).copy(dest, { overwrite: true });
        out.push({ ...page, uri: dest.uri });
      } catch {
        // Source gone (cache cleared) but an earlier save copied it: use that copy.
        // Otherwise keep the original URI; the text of the review is still saved.
        out.push(dest.exists ? { ...page, uri: dest.uri } : page);
      }
    }
    return out;
  },

  async removeDocument(docId) {
    const dir = docDir(docId);
    if (dir.exists) dir.delete();
  },

  async removeAll() {
    const root = pagesRoot();
    if (root.exists) root.delete();
  },
};
