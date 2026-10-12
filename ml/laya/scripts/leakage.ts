/**
 * Leakage check between synthetic examples and the eval contracts
 * (tests/fixtures/contracts.ts — every block, including ones triage never sees).
 *
 * An example is flagged when it
 *   - shares any normalized word 8-gram with an eval block (copied sentence), or
 *   - contains a whole short eval block (4–7 words, too short to have an 8-gram), or
 *   - has word-trigram Jaccard ≥ 0.4 with an eval block (near paraphrase), or
 *   - names an eval party (full name, e.g. a person or company from a party line), or
 *   - repeats an eval amount together with an eval party name (subset of the above, reported separately).
 * The generator drops flagged examples; run this file directly to re-check the written files:
 *
 *   npx tsx ml/laya/scripts/leakage.ts
 */
import * as path from 'node:path';
import { moneyAmountsIn } from '@/ai/evidenceGate';
import { EVAL_CONTRACTS } from '../../../tests/fixtures/contracts';
import { DATA_DIR, normalize, readJsonl } from './common';

const N = 8;
export const JACCARD_MAX = 0.4;

/** Words with every number masked: a sentence copied from the eval with only its amount or date changed still matches. */
const tokens = (text: string) => normalize(text).replace(/\d+/g, '#').split(' ').filter(Boolean);

function ngrams(words: string[], n: number): Set<string> {
  const out = new Set<string>();
  for (let i = 0; i + n <= words.length; i++) out.add(words.slice(i, i + n).join(' '));
  return out;
}

const CONNECTORS = new Set(['ng', 'na', 'ni', 'de', 'dela', 'del', 'delos', 'of']);
const NOT_NAME = new Set(['Aling', 'Mang', 'This', 'The', 'Ang', 'Agreement', 'These']);

/** Names written just before a ("Role") in eval party lines: "Bayanihan Bakeshop", "Jose Reyes". */
function partyNames(text: string): string[] {
  const names: string[] = [];
  for (const m of text.matchAll(/\(\s*["“]/g)) {
    const words = text
      .slice(0, m.index)
      .replace(/,?\s*CPA\s*$/, '')
      .trim()
      .split(/\s+/);
    const picked: string[] = [];
    for (let i = words.length - 1; i >= 0; i--) {
      const w = words[i]!.replace(/[,;]$/, '');
      if (/^[A-Z]/.test(w) || CONNECTORS.has(w)) picked.unshift(w);
      else break;
    }
    while (picked.length && (CONNECTORS.has(picked[0]!) || NOT_NAME.has(picked[0]!))) picked.shift();
    const name = picked.join(' ').replace(/,$/, '');
    if (name.split(' ').length >= 2) names.push(name);
  }
  return names;
}

interface EvalIndex {
  grams: Set<string>;
  /** Eval blocks of 4–7 words, as " a b c " for containment checks. */
  shortBlocks: string[];
  trigramSets: Set<string>[];
  names: string[];
  amounts: Set<number>;
}

let cached: EvalIndex | undefined;
export function evalIndex(): EvalIndex {
  if (cached) return cached;
  const grams = new Set<string>();
  const shortBlocks: string[] = [];
  const trigramSets: Set<string>[] = [];
  const names = new Set<string>();
  const amounts = new Set<number>();
  for (const c of EVAL_CONTRACTS) {
    for (const page of c.pages) {
      for (const b of page.blocks) {
        const w = tokens(b.text);
        for (const g of ngrams(w, N)) grams.add(g);
        if (w.length >= 4 && w.length < N) shortBlocks.push(` ${w.join(" ")} `);
        if (w.length >= 4) trigramSets.push(ngrams(w, 3));
        for (const n of partyNames(b.text)) names.add(n);
        for (const a of moneyAmountsIn(b.text)) amounts.add(a);
      }
    }
  }
  cached = { grams, shortBlocks, trigramSets, names: [...names], amounts };
  return cached;
}

export type LeakReason = 'ngram8' | 'contains_eval' | 'jaccard' | 'eval_name' | 'amount_and_name';

export function leakReasons(text: string): LeakReason[] {
  const idx = evalIndex();
  const reasons: LeakReason[] = [];
  const w = tokens(text);
  if ([...ngrams(w, N)].some((g) => idx.grams.has(g))) reasons.push('ngram8');
  const padded = ` ${w.join(' ')} `;
  if (idx.shortBlocks.some((b) => padded.includes(b))) reasons.push('contains_eval');
  const tri = ngrams(w, 3);
  if (tri.size) {
    for (const s of idx.trigramSets) {
      let inter = 0;
      for (const g of tri) if (s.has(g)) inter++;
      if (inter / (tri.size + s.size - inter) >= JACCARD_MAX) {
        reasons.push('jaccard');
        break;
      }
    }
  }
  const lower = text.toLowerCase();
  const nameHit = idx.names.some((n) => lower.includes(n.toLowerCase()));
  if (nameHit) reasons.push('eval_name');
  if (nameHit && moneyAmountsIn(text).some((a) => idx.amounts.has(a))) reasons.push('amount_and_name');
  return reasons;
}

export function evalAmounts(): Set<number> {
  return evalIndex().amounts;
}

export function evalNames(): string[] {
  return evalIndex().names;
}

if (require.main === module) {
  const idx = evalIndex();
  console.log(`eval index: ${idx.grams.size} 8-grams, ${idx.trigramSets.length} blocks, ${idx.names.length} party names, ${idx.amounts.size} amounts`);
  let failed = false;
  for (const file of ['train.jsonl', 'dev.jsonl']) {
    const rows = readJsonl(path.join(DATA_DIR, file));
    const counts: Record<string, number> = {};
    let shared = 0;
    for (const r of rows) {
      for (const reason of leakReasons(r.text)) counts[reason] = (counts[reason] ?? 0) + 1;
      if (moneyAmountsIn(r.text).some((a) => idx.amounts.has(a))) shared++;
    }
    const flagged = rows.filter((r) => leakReasons(r.text).length).length;
    console.log(`${file}: ${rows.length} rows, ${flagged} flagged`, counts, `| rows sharing a bare amount with eval (not a leak by itself): ${shared}`);
    if (flagged) failed = true;
  }
  // Closest eval block per example (word-trigram Jaccard), as a distribution.
  const maxJaccard = (text: string) => {
    const tri = ngrams(tokens(text), 3);
    let best = 0;
    for (const s of idx.trigramSets) {
      let inter = 0;
      for (const g of tri) if (s.has(g)) inter++;
      best = Math.max(best, tri.size ? inter / (tri.size + s.size - inter) : 0);
    }
    return best;
  };
  for (const file of ['train.jsonl', 'dev.jsonl']) {
    const rows = readJsonl(path.join(DATA_DIR, file));
    const js = rows.map((r) => maxJaccard(r.text));
    if (process.argv.includes('--show')) rows.forEach((r, i) => js[i]! >= 0.3 && console.log(`  ${js[i]!.toFixed(2)} ${r.label}: ${r.text}`));
    const at = (t: number) => js.filter((j) => j >= t).length;
    console.log(`${file}: closest-eval trigram Jaccard ≥0.2: ${at(0.2)}, ≥0.3: ${at(0.3)}, ≥0.4: ${at(0.4)}, ≥0.5: ${at(0.5)}`);
  }
  // How separate dev is from train: dev rows sharing any 8-gram with a train row.
  const trainGrams = new Set(readJsonl(path.join(DATA_DIR, 'train.jsonl')).flatMap((r) => [...ngrams(tokens(r.text), N)]));
  const devRows = readJsonl(path.join(DATA_DIR, 'dev.jsonl'));
  const devShared = devRows.filter((r) => [...ngrams(tokens(r.text), N)].some((g) => trainGrams.has(g))).length;
  console.log(`dev rows sharing an 8-gram with train (informational): ${devShared}/${devRows.length}`);
  // Exact-text overlap between splits.
  const norm = (f: string) => new Set(readJsonl(path.join(DATA_DIR, f)).map((r) => normalize(r.text)));
  const [train, dev, ev] = [norm('train.jsonl'), norm('dev.jsonl'), norm('eval.jsonl')];
  const overlap = (a: Set<string>, b: Set<string>) => [...a].filter((x) => b.has(x)).length;
  console.log(`exact overlap: train∩dev=${overlap(train, dev)} train∩eval=${overlap(train, ev)} dev∩eval=${overlap(dev, ev)}`);
  if (overlap(train, dev) || overlap(train, ev) || overlap(dev, ev)) failed = true;
  if (failed) process.exitCode = 1;
}
