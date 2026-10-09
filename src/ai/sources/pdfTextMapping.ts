/**
 * pdf.js text content → plain page text for `pageTextToBlocks`, so a digital PDF
 * read in the browser yields the same `p{page}_b{n}` blocks as the Android text layer.
 * Pure, so it is unit-tested without pdf.js.
 */

/** The subset of a pdf.js `TextItem` this mapping reads (marked-content items have no `str`). */
export interface PdfTextItem {
  str?: string;
  hasEOL?: boolean;
  /** [a, b, c, d, x, y] — y grows upwards in PDF space. */
  transform?: number[];
  height?: number;
}

export function pdfItemsToText(items: PdfTextItem[]): string {
  let out = '';
  let lastY: number | undefined;
  let lastHeight = 0;
  for (const item of items) {
    if (typeof item.str !== 'string') continue;
    const y = item.transform?.[5];
    const height = item.height ?? 0;
    if (y !== undefined && lastY !== undefined && out && !out.endsWith('\n')) {
      const drop = lastY - y;
      const lineHeight = Math.max(height, lastHeight, 1);
      // Moved to another line without an explicit end-of-line marker.
      if (Math.abs(drop) > lineHeight * 0.5) out += '\n';
    }
    if (y !== undefined && lastY !== undefined && out.endsWith('\n') && lastY - y > Math.max(height, lastHeight, 1) * 1.8) {
      // A visibly larger gap than one line: a paragraph break.
      out += '\n';
    }
    out += item.str;
    if (item.hasEOL) out += '\n';
    if (y !== undefined && (item.str.trim() || item.hasEOL)) {
      lastY = y;
      if (height) lastHeight = height;
    }
  }
  return out;
}
