/**
 * Splits a document into small extraction chunks (PRD §10: "avoid prompting over
 * an entire long contract at once — extract by page or clause"). A chunk never
 * crosses a page and never cuts a block, so every quote the model returns can be
 * matched against one whole recorded block.
 */
import type { DocumentPage, OcrBlock } from '@/domain/schema';

export interface Chunk {
  index: number;
  page: number;
  blocks: OcrBlock[];
}

/** Source characters per chunk. ~4 chars/token keeps one chunk near 750 tokens, leaving room in a 2–4k context. */
export const DEFAULT_CHUNK_CHARS = 3000;

export function chunkPages(pages: DocumentPage[], maxChars = DEFAULT_CHUNK_CHARS): Chunk[] {
  const chunks: Chunk[] = [];
  for (const page of pages) {
    let current: OcrBlock[] = [];
    let size = 0;
    const flush = () => {
      if (current.length) chunks.push({ index: chunks.length, page: page.number, blocks: current });
      current = [];
      size = 0;
    };
    for (const block of page.blocks) {
      if (!block.text.trim()) continue;
      // An oversized block still goes alone: trimming it would make exact quotes impossible.
      if (size > 0 && size + block.text.length > maxChars) flush();
      current.push(block);
      size += block.text.length;
    }
    flush();
  }
  return chunks;
}
