/**
 * Generates ml/laya/data/{train,dev,eval}.jsonl, labels.json and stats.json for the
 * Laya triage model (one contract block → term type or "none").
 *
 *   npx tsx ml/laya/scripts/generate.ts [--seed 20261012]
 *
 * Every synthetic example
 *   - comes from a hand-written template (templates.ts) filled with fictional values (fillers.ts);
 *   - reaches triage in the app: passes isTrivialBlock / looksLikeInstruction / isBoilerplate / mayStateTerm;
 *   - for a term label, carries the wording src/ai/llm/typeCheck.ts requires for that type
 *     (checkFindingType(label, text) === label), so the app would not relabel it;
 *   - is not a leak of the eval set (leakage.ts), and is unique by normalized text across all splits;
 *   - shares its template choice path with at most CAP other examples (no template spam).
 * ~10% get OCR-style noise. `context` is set the way the app sets it (needsContext + 200-char tail).
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { checkFindingType } from '@/ai/llm/typeCheck';
import { FindingType } from '@/domain/schema';
import { appContext, DATA_DIR, type Example, type Label, LABELS, type Lang, normalize, reachesTriage, writeJsonl } from './common';
import { evalExamples } from './export-eval';
import { fillSlot, mulberry32, pick, type FillState, type Rng, type Split } from './fillers';
import { leakReasons, type LeakReason } from './leakage';
import { TEMPLATES } from './templates';

const argSeed = process.argv.indexOf('--seed');
const SEED = argSeed >= 0 ? Number(process.argv[argSeed + 1]) : 20261012;

const TRAIN_TARGETS: Record<Label, number> = {
  payment_amount: 420,
  payment_condition: 380,
  due_date: 400,
  late_fee: 360,
  deliverables: 300,
  revisions: 250,
  ownership: 250,
  termination: 360,
  notice_period: 300,
  party: 250,
  other: 330,
  none: 1250,
};
const DEV_FRACTION = 0.11;
const LANG_WEIGHTS: [Lang, number][] = [
  ['en', 0.55],
  ['fil', 0.2],
  ['taglish', 0.25],
];
/** Max examples per template choice path; "none" lines vary mostly in slots (names, dates, page numbers). */
const capFor = (label: Label) => (label === 'none' ? 3 : 2);
const NOISE_RATE = 0.1;

// ── Template expansion ───────────────────────────────────────────────────────

/** Expands `{a|b}` alternations (nestable), recording the choice path. */
function expand(template: string, rng: Rng, choices: number[]): string {
  let out = '';
  for (let i = 0; i < template.length; i++) {
    const c = template[i]!;
    if (c !== '{') {
      out += c;
      continue;
    }
    let depth = 1;
    let j = i + 1;
    const parts: string[] = [];
    let start = j;
    for (; j < template.length && depth > 0; j++) {
      const d = template[j];
      if (d === '{') depth++;
      else if (d === '}') depth--;
      if ((d === '|' && depth === 1) || depth === 0) {
        parts.push(template.slice(start, j));
        start = j + 1;
      }
    }
    if (depth !== 0) throw new Error(`Unbalanced braces in template: ${template}`);
    const k = Math.floor(rng() * parts.length);
    choices.push(k);
    out += expand(parts[k]!, rng, choices);
    i = j - 1;
  }
  return out;
}

function fill(text: string, state: FillState): string {
  return text.replace(/\[([A-Z_]+\d*)\]/g, (_, name: string) => fillSlot(name, state));
}

const tidy = (t: string) => t.replace(/\s+/g, ' ').replace(/\s+([,.;:])/g, '$1').trim();

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];

/** Clause numbering as OCR keeps it at the start of a block ("3.1", "(b)", "Seksyon 4."). Not part of the path key. */
function clausePrefix(lang: Lang, rng: Rng): string {
  const n = 1 + Math.floor(rng() * 12);
  const sub = 1 + Math.floor(rng() * 6);
  const letter = String.fromCharCode(97 + Math.floor(rng() * 6));
  const forms = [`${n}.`, `${n}.${sub}`, `${n}.${sub}.`, `(${letter})`, `${letter})`, `${n})`, `(${n})`, `${ROMAN[n % 10]}.`];
  forms.push(lang === 'fil' ? `Seksyon ${n}.` : lang === 'taglish' ? pick(rng, [`Section ${n}.`, `Seksyon ${n}.`]) : `Section ${n}.`);
  return pick(rng, forms);
}

const PREFIX_RATE = 0.3;

// ── OCR noise ────────────────────────────────────────────────────────────────

const NOISE: ((t: string, rng: Rng) => string | null)[] = [
  // 0 → o/O inside a number ("PHP 6,40o")
  (t, rng) => {
    const idx = [...t.matchAll(/\d0|0\d/g)].map((m) => (m.index ?? 0) + (m[0][0] === '0' ? 0 : 1));
    if (!idx.length) return null;
    const i = pick(rng, idx);
    return t.slice(0, i) + pick(rng, ['o', 'O']) + t.slice(i + 1);
  },
  // 1 ↔ l
  (t, rng) => {
    const idx = [...t.matchAll(/1/g)].map((m) => m.index ?? 0);
    if (!idx.length) return null;
    const i = pick(rng, idx);
    return t.slice(0, i) + 'l' + t.slice(i + 1);
  },
  // missing space
  (t, rng) => {
    const idx = [...t.matchAll(/[a-z,.] [a-zA-Z]/g)].map((m) => (m.index ?? 0) + 1);
    if (!idx.length) return null;
    const i = pick(rng, idx);
    return t.slice(0, i) + t.slice(i + 1);
  },
  // broken hyphenation from a line end ("pay- ment")
  (t, rng) => {
    const ws = [...t.matchAll(/\b[a-z]{8,}\b/g)];
    if (!ws.length) return null;
    const m = pick(rng, ws);
    const cut = 3 + Math.floor(rng() * (m[0].length - 5));
    const at = (m.index ?? 0) + cut;
    return t.slice(0, at) + pick(rng, ['- ', '-', ' ']) + t.slice(at);
  },
  // m → rn, rn → m
  (t, rng) => {
    const idx = [...t.matchAll(/rn|m/g)];
    if (!idx.length) return null;
    const m = pick(rng, idx);
    const i = m.index ?? 0;
    return t.slice(0, i) + (m[0] === 'm' ? 'rn' : 'm') + t.slice(i + m[0].length);
  },
  // thousands comma read as a period
  (t) => (/\d,\d{3}/.test(t) ? t.replace(/(\d),(\d{3})/, '$1.$2') : null),
  // stray mark or dropped final period
  (t, rng) => {
    if (rng() < 0.5) return t.endsWith('.') ? t.slice(0, -1) : null;
    const spaces = [...t.matchAll(/ /g)].map((m) => m.index ?? 0);
    if (!spaces.length) return null;
    const i = pick(rng, spaces);
    return t.slice(0, i) + pick(rng, [' |', " '", ' .', ' ,']) + t.slice(i);
  },
];

function addNoise(text: string, rng: Rng): string {
  let t = text;
  const n = rng() < 0.7 ? 1 : 2;
  for (let k = 0; k < n; k++) {
    for (let tries = 0; tries < 5; tries++) {
      const next = pick(rng, NOISE)(t, rng);
      if (next && next !== t) {
        t = next;
        break;
      }
    }
  }
  return t;
}

// ── Checks ───────────────────────────────────────────────────────────────────

const isFindingType = (l: Label): l is FindingType => (FindingType.options as readonly string[]).includes(l);

function labelSupported(label: Label, text: string): boolean {
  return !isFindingType(label) || checkFindingType(label, text) === label;
}

type Reject = 'prefilter' | 'type_check' | 'duplicate' | 'path_cap' | LeakReason;

interface Stats {
  rejected: Record<string, number>;
  leakDropped: Record<string, number>;
  noisy: number;
  templates: Record<string, number>;
}

// ── Generation ───────────────────────────────────────────────────────────────

function templatesFor(label: Label, lang: Lang, split: Split): { id: string; t: string }[] {
  return TEMPLATES[label][lang]
    .map((t, i) => ({ id: `${label}/${lang}/${i}`, t, dev: i % 5 === 4 }))
    .filter((x) => (split === 'dev' ? x.dev : !x.dev));
}

function generateSplit(split: Split, targets: Record<Label, number>, seen: Set<string>, rng: Rng, stats: Stats): Example[] {
  const rows: Example[] = [];
  for (const label of LABELS) {
    let carry = 0;
    const langs = [...LANG_WEIGHTS].sort((a, b) => (a[0] === 'en' ? 1 : b[0] === 'en' ? -1 : 0)); // fil, taglish first; en absorbs shortfall
    for (const [lang, weight] of langs) {
      const want = Math.round(targets[label] * weight) + (lang === 'en' ? carry : 0);
      const pool = templatesFor(label, lang, split);
      stats.templates[`${split}/${label}/${lang}`] = pool.length;
      const pathCount = new Map<string, number>();
      let got = 0;
      for (let attempt = 0; attempt < want * 80 && got < want && pool.length; attempt++) {
        const tpl = pick(rng, pool);
        const choices: number[] = [];
        const state: FillState = { rng, split, lang, memo: new Map() };
        const body = tidy(fill(expand(tpl.t, rng, choices), state));
        // Recitals, captions and signature lines keep their own shape; clauses often carry a number.
        const clean = label !== 'none' && rng() < PREFIX_RATE ? `${clausePrefix(lang, rng)} ${body}` : body;
        const key = `${tpl.id}:${choices.join('.')}`;
        let text = clean;
        let noisy = false;
        if (rng() < NOISE_RATE) {
          const n = tidy(addNoise(clean, rng));
          if (reachesTriage(n) && labelSupported(label, n)) {
            text = n;
            noisy = true;
          }
        }
        const reject = ((): Reject | undefined => {
          if (!reachesTriage(text)) return 'prefilter';
          if (!labelSupported(label, text)) return 'type_check';
          if ((pathCount.get(key) ?? 0) >= capFor(label)) return 'path_cap';
          // Dedupe on the bare sentence too, so noise or a clause number cannot sneak a duplicate in.
          if (seen.has(normalize(text)) || seen.has(normalize(body))) return 'duplicate';
          const leaks = [...new Set([...leakReasons(text), ...leakReasons(clean)])];
          if (leaks.length) {
            for (const l of leaks) stats.leakDropped[l] = (stats.leakDropped[l] ?? 0) + 1;
            stats.leakDropped.examples = (stats.leakDropped.examples ?? 0) + 1;
            return leaks[0];
          }
          return undefined;
        })();
        if (reject) {
          const k = `${split}/${reject}`;
          stats.rejected[k] = (stats.rejected[k] ?? 0) + 1;
          if (reject === 'prefilter' || reject === 'type_check') stats.rejected[`${split}/${reject}:${tpl.id}`] = (stats.rejected[`${split}/${reject}:${tpl.id}`] ?? 0) + 1;
          continue;
        }
        seen.add(normalize(text));
        seen.add(normalize(body));
        pathCount.set(key, (pathCount.get(key) ?? 0) + 1);
        if (noisy) stats.noisy++;
        rows.push({ text, label, lang, source: 'synthetic' });
        got++;
      }
      carry += Math.max(0, want - got);
      if (lang === 'en') carry = 0;
    }
  }
  return rows;
}

const HEADINGS: Record<Lang, string[]> = {
  en: ['CONTRACT OF LEASE', 'SERVICE AGREEMENT', 'CONTRACT TO SELL', 'INSTALLMENT SALE AGREEMENT', 'EMPLOYMENT CONTRACT', 'Section 3. Payment', 'TERMS AND CONDITIONS'],
  fil: ['KASUNDUAN SA PAUPAHAN', 'KASUNDUAN SA HULUGAN', 'KASUNDUAN SA SERBISYO', 'MGA KONDISYON'],
  taglish: ['KASUNDUAN SA HULUGAN', 'SERVICE AGREEMENT', 'Payment Terms', 'KONTRATA NG UPA'],
};

/** Adds the app-style context (previous block) to examples that refer back ("the balance", "nito"). */
function addContext(rows: Example[], rng: Rng): void {
  const byLang = new Map<Lang, Example[]>();
  for (const r of rows) byLang.set(r.lang, [...(byLang.get(r.lang) ?? []), r]);
  for (const r of rows) {
    if (rng() < 0.08) continue; // first block on a page: no previous block
    const previous = rng() < 0.25 ? pick(rng, HEADINGS[r.lang]) : pick(rng, (byLang.get(r.lang) ?? []).filter((x) => x !== r)).text;
    const context = appContext(r.text, previous);
    if (context) r.context = context;
  }
}

function shuffle<T>(xs: T[], rng: Rng): T[] {
  for (let i = xs.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [xs[i], xs[j]] = [xs[j]!, xs[i]!];
  }
  return xs;
}

function counts(rows: Example[]) {
  const label: Record<string, number> = {};
  const lang: Record<string, number> = {};
  const labelLang: Record<string, Record<string, number>> = {};
  for (const r of rows) {
    label[r.label] = (label[r.label] ?? 0) + 1;
    lang[r.lang] = (lang[r.lang] ?? 0) + 1;
    labelLang[r.label] ??= {};
    labelLang[r.label]![r.lang] = (labelLang[r.label]![r.lang] ?? 0) + 1;
  }
  return { total: rows.length, label, lang, labelLang, withContext: rows.filter((r) => r.context).length };
}

function main(): void {
  const rng = mulberry32(SEED);
  const stats: Stats = { rejected: {}, leakDropped: {}, noisy: 0, templates: {} };
  const evalRows = evalExamples();
  const seen = new Set(evalRows.map((r) => normalize(r.text)));

  const train = generateSplit('train', TRAIN_TARGETS, seen, rng, stats);
  const devTargets = Object.fromEntries(LABELS.map((l) => [l, Math.round(TRAIN_TARGETS[l] * DEV_FRACTION)])) as Record<Label, number>;
  const dev = generateSplit('dev', devTargets, seen, rng, stats);
  addContext(train, rng);
  addContext(dev, rng);

  fs.mkdirSync(DATA_DIR, { recursive: true });
  writeJsonl(path.join(DATA_DIR, 'train.jsonl'), shuffle(train, rng));
  writeJsonl(path.join(DATA_DIR, 'dev.jsonl'), shuffle(dev, rng));
  writeJsonl(path.join(DATA_DIR, 'eval.jsonl'), evalRows);
  fs.writeFileSync(path.join(DATA_DIR, 'labels.json'), JSON.stringify(LABELS, null, 2) + '\n');
  const summary = {
    seed: SEED,
    train: counts(train),
    dev: counts(dev),
    eval: counts(evalRows),
    noisyExamples: stats.noisy,
    leakageDropped: stats.leakDropped,
    rejected: Object.fromEntries(Object.entries(stats.rejected).filter(([k]) => !k.includes(':'))),
    rejectedByTemplate: Object.fromEntries(Object.entries(stats.rejected).filter(([k]) => k.includes(':'))),
    templatesPerGroup: stats.templates,
  };
  fs.writeFileSync(path.join(DATA_DIR, 'stats.json'), JSON.stringify(summary, null, 2) + '\n');
  console.log(JSON.stringify({ train: summary.train, dev: summary.dev, noisy: stats.noisy, leak: stats.leakDropped, rejected: summary.rejected }, null, 1));
}

main();
