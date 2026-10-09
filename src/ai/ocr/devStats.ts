/**
 * Dev-only OCR benchmark for real documents: counts and confidences, never text.
 * Lets a developer measure recognition on a real contract (Metro log, __DEV__
 * builds only) without its content leaving the phone or appearing in any log.
 */
import type { DocumentPage } from '@/domain/schema';
import { LOW_CONFIDENCE, moneyAmountsIn } from '../evidenceGate';
import { looksLikeInstruction } from '../injection';
import { extractionUnits } from '../llm/chunking';
import { REPAIRED_CONFIDENCE } from './layout';

const round = (n: number) => Math.round(n * 100) / 100;

/** Tokens mixing letters and digits ("l0", "S00") hint at misreads; ordinals are excluded. */
const MIXED_TOKEN = /^(?=\S*\d)(?=\S*[A-Za-z])\S+$/;
const ORDINAL = /^\d+(st|nd|rd|th)[.,;:)]*$/i;

export function ocrStats(pages: DocumentPage[]) {
  const blocks = pages.flatMap((p) => p.blocks);
  const conf = blocks.map((b) => b.confidence).sort((a, b) => a - b);
  const at = (q: number) => (conf.length ? round(conf[Math.min(conf.length - 1, Math.floor(q * conf.length))]!) : 0);
  const chars = blocks.map((b) => b.text.length);
  const tokens = blocks.flatMap((b) => b.text.split(/\s+/));
  return {
    pages: pages.length,
    emptyPages: pages.filter((p) => !p.blocks.length).map((p) => p.number),
    blocksPerPage: pages.map((p) => p.blocks.length),
    blocks: blocks.length,
    ocrBlocks: blocks.filter((b) => b.origin === 'ocr').length,
    critical: blocks.filter((b) => b.critical).length,
    lowConfidence: blocks.filter((b) => b.confidence < LOW_CONFIDENCE).length,
    criticalLowConfidence: blocks.filter((b) => b.critical && b.confidence < LOW_CONFIDENCE).length,
    digitRepairedBlocks: blocks.filter((b) => b.confidence === REPAIRED_CONFIDENCE).length,
    blocksWithPhpAmounts: blocks.filter((b) => moneyAmountsIn(b.text).length > 0).length,
    mixedLetterDigitTokens: tokens.filter((t) => MIXED_TOKEN.test(t) && !ORDINAL.test(t)).length,
    tokens: tokens.length,
    confidence: { min: at(0), p10: at(0.1), median: at(0.5), mean: conf.length ? round(conf.reduce((a, b) => a + b, 0) / conf.length) : 0 },
    blockChars: { mean: chars.length ? Math.round(chars.reduce((a, b) => a + b, 0) / chars.length) : 0, max: Math.max(0, ...chars) },
    sentToModel: extractionUnits(pages).length,
    skippedAsAiInstructions: blocks.filter((b) => looksLikeInstruction(b.text)).length,
  };
}
