/**
 * Shared helpers for the Laya triage dataset (ml/laya/data).
 *
 * Every example must be a block the app would actually send to triage: it is
 * checked with the app's own filters (chunking.ts / prefilter.ts / injection.ts),
 * and `context` is built the way prompt.ts builds it (needsContext + 200-char tail).
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { looksLikeInstruction } from '@/ai/injection';
import { isBoilerplate, isTrivialBlock } from '@/ai/llm/chunking';
import { mayStateTerm } from '@/ai/llm/prefilter';
import { CONTEXT_CHARS, needsContext } from '@/ai/llm/prompt';
import { FindingType } from '@/domain/schema';

export const LABELS = [...FindingType.options, 'none'] as const;
export type Label = (typeof LABELS)[number];
export type Lang = 'en' | 'fil' | 'taglish';

export interface Example {
  text: string;
  label: Label;
  lang: Lang;
  context?: string;
  source: 'synthetic' | 'eval-fixture';
  /** eval only: every type the fixture accepts for this block (label is the first). */
  labels?: Label[];
  /** eval only: fixture contract id and block id. */
  ref?: string;
}

export const DATA_DIR = path.resolve(__dirname, '..', 'data');

/** True when extractionUnits() would keep this block (single-block view: no repeated-page check). */
export function reachesTriage(text: string): boolean {
  return !isTrivialBlock(text) && !looksLikeInstruction(text) && !isBoilerplate(text) && mayStateTerm(text);
}

/** Same as prompt.ts sanitize(): the block text the model sees. */
export function sanitize(text: string): string {
  return text.replace(/<\/?(block|source)>/gi, '').replace(/\s+/g, ' ').trim();
}

function tail(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(-max);
  const space = cut.indexOf(' ');
  return `…${space >= 0 ? cut.slice(space + 1) : cut}`;
}

/** The context string the app would send for this block, or undefined (prompt.ts blockMessage). */
export function appContext(text: string, previous: string | undefined): string | undefined {
  if (!previous || !needsContext(text)) return undefined;
  return tail(sanitize(previous), CONTEXT_CHARS);
}

export function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFKC')
    .replace(/[^\p{L}\p{N}%₱]+/gu, ' ')
    .trim();
}

export function writeJsonl(file: string, rows: Example[]): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, rows.map((r) => JSON.stringify(r)).join('\n') + '\n', 'utf8');
}

export function readJsonl(file: string): Example[] {
  return fs
    .readFileSync(file, 'utf8')
    .split('\n')
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l) as Example);
}

const FIL_WORDS =
  /\b(?:ang|ng|mga|sa|ay|ni|nina|kay|ito|nito|iyon|kung|hindi|bawat|kada|araw|buwan|taon|bayad|babayaran|magbabayad|upa|umuupa|may-ari|kasunduan|kasunduang|dapat|kailangan|maaaring|lamang|lang|na|po|para|tuwing|ika|loob|bago|pagkatapos|hanggang|multa|hulog|abiso|pag-aari|gagawa|ibibigay|natitira|kapag|siya|sila|kanila|niya|ating|aming)\b/gi;
const EN_WORDS =
  /\b(?:the|is|are|of|and|or|shall|will|must|may|to|be|for|with|within|each|per|after|before|upon|this|that|any|all|by|from|if|payment|fee|due|agreement|contract|client|days?|month|monthly)\b/gi;

/** Rough per-block language tag for fixture blocks (synthetic blocks carry their template's tag). */
export function detectLang(text: string): Lang {
  const fil = (text.match(FIL_WORDS) ?? []).length;
  const en = (text.match(EN_WORDS) ?? []).length;
  if (fil === 0) return 'en';
  if (en === 0) return 'fil';
  const ratio = fil / (fil + en);
  if (ratio >= 0.8) return 'fil';
  if (ratio <= 0.15) return 'en';
  return 'taglish';
}
