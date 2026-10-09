/**
 * Turns ML Kit output into evidence blocks (PRD §11): reading order first, then
 * sentence-sized blocks with stable ids `p{page}_b{n}`, normalized bboxes and the
 * same `critical` rule as the PDF text layer.
 *
 * Per-block extraction (src/ai/llm/chunking.ts) works best when a block is one
 * clause, so ML Kit's paragraph-sized regions are split at sentence ends, headings
 * and clause numbers, and re-joined when ML Kit breaks a sentence across regions.
 * Pure, so it is unit-tested without a phone.
 */
import type { OcrBlock } from '@/domain/schema';
import type { OcrLine, OcrPageResult, OcrRect, OcrRegion } from '../../../modules/local-ocr';
import { endsSentence, isCriticalText, isHeading } from '../textBlocks';

/** "1.", "(2)", "2.3", "2.3.", "(a)", "b)", "iv." at the start of a line begins a new clause; "15 days" does not. */
const CLAUSE_START = /^(?:\(?\d{1,2}(?:(?:\.\d{1,2})+\.?|[.)])|\(?[a-z]\)|\(?[ivx]{1,4}[.)])\s/i;
const HAS_CONTENT = /[\p{L}\p{N}]/u;

const heightOf = (r: OcrRect) => r.bottom - r.top;

/** Below LOW_CONFIDENCE (src/ai/evidenceGate.ts), so a repaired block is always shown to the user to check. */
export const REPAIRED_CONFIDENCE = 0.5;

const NUMBER_TOKEN = /^(\(?(?:PHP|₱)?)([\d.,oOlI]+?)((?:st|nd|rd|th)?[).,;:]*)$/;
const WELL_FORMED_NUMBER = /^(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?$/;

/**
 * ML Kit reads some fonts' digits as look-alike letters (old-style "0" → "o", "1" → "l"),
 * which would turn "PHP 6,40o" into PHP 640. Inside a token that is otherwise a number,
 * swap them back — only when the result is a well-formed number, so words are never touched.
 */
export function repairDigits(text: string): { text: string; repaired: boolean } {
  let repaired = false;
  const out = text
    .split(/(\s+)/)
    .map((token) => {
      const m = NUMBER_TOKEN.exec(token);
      if (!m || !/\d/.test(m[2]!) || !/[oOlI]/.test(m[2]!)) return token;
      const core = m[2]!.replace(/[oO]/g, '0').replace(/[lI]/g, '1');
      if (!WELL_FORMED_NUMBER.test(core.replace(/[.,]$/, ''))) return token;
      repaired = true;
      return `${m[1]}${core}${m[3]}`;
    })
    .join('');
  return { text: out, repaired };
}

/** Regions in reading order: top to bottom; regions side by side (columns, signature blocks) left to right. */
export function readingOrder(regions: OcrRegion[]): OcrRegion[] {
  const sorted = [...regions].sort((a, b) => a.frame.top - b.frame.top || a.frame.left - b.frame.left);
  const rows: { bottom: number; items: OcrRegion[] }[] = [];
  for (const r of sorted) {
    const row = rows[rows.length - 1];
    // Same row when most of this region sits beside the row rather than below it.
    if (row && Math.min(r.frame.bottom, row.bottom) - r.frame.top > heightOf(r.frame) / 2) {
      row.items.push(r);
      row.bottom = Math.max(row.bottom, r.frame.bottom);
    } else {
      rows.push({ bottom: r.frame.bottom, items: [r] });
    }
  }
  return rows.flatMap((row) => row.items.sort((a, b) => a.frame.left - b.frame.left));
}

/** Joins wrapped lines; a word hyphenated at a line end keeps its hyphen but loses the space. */
function joinLines(lines: OcrLine[]): string {
  return lines.reduce((acc, l) => (!acc ? l.text : /\p{L}-$/u.test(acc) && /^\p{Ll}/u.test(l.text) ? acc + l.text : `${acc} ${l.text}`), '');
}

function union(rects: OcrRect[]): OcrRect {
  return {
    left: Math.min(...rects.map((r) => r.left)),
    top: Math.min(...rects.map((r) => r.top)),
    right: Math.max(...rects.map((r) => r.right)),
    bottom: Math.max(...rects.map((r) => r.bottom)),
  };
}

const clamp01 = (n: number) => (Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0);

export function ocrPageToBlocks(page: number, result: OcrPageResult): OcrBlock[] {
  const groups: OcrLine[][] = [];
  let current: OcrLine[] = [];
  const flush = () => {
    if (current.length) groups.push(current);
    current = [];
  };

  for (const region of readingOrder(result.blocks)) {
    const lines = region.lines
      .map((l) => {
        const { text, repaired } = repairDigits(l.text.replace(/\s+/g, ' ').trim());
        return { ...l, text, confidence: repaired ? Math.min(l.confidence, REPAIRED_CONFIDENCE) : l.confidence };
      })
      .filter((l) => HAS_CONTENT.test(l.text));
    lines.forEach((line, i) => {
      const last = current[current.length - 1];
      // A new region continues the open sentence only if it starts lowercase directly below it (never beside it).
      const continues = i > 0 || (last !== undefined && /^\p{Ll}/u.test(line.text) && line.frame.top >= last.frame.bottom - heightOf(last.frame) / 2);
      if (!continues || CLAUSE_START.test(line.text) || isHeading(line.text)) flush();
      current.push(line);
      if (isHeading(line.text) || endsSentence(line.text)) flush();
    });
  }
  flush();

  const { width, height } = result;
  return groups.map((lines, i) => {
    const text = joinLines(lines);
    const box = union(lines.map((l) => l.frame));
    return {
      id: `p${page}_b${i + 1}`,
      page,
      text,
      originalText: text,
      // The weakest line decides: one misread amount is enough to need the user's check.
      confidence: clamp01(Math.min(...lines.map((l) => l.confidence))),
      bbox: {
        x: clamp01(box.left / width),
        y: clamp01(box.top / height),
        w: clamp01((box.right - box.left) / width),
        h: clamp01((box.bottom - box.top) / height),
      },
      critical: isCriticalText(text),
      origin: 'ocr' as const,
    };
  });
}
