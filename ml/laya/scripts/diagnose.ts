/**
 * Development aid: prints templates whose expansions often fail the app's prefilter
 * or the type check (those expansions are dropped by generate.ts).
 *
 *   npx tsx ml/laya/scripts/diagnose.ts [label]
 */
import { checkFindingType } from '@/ai/llm/typeCheck';
import { FindingType } from '@/domain/schema';
import { type Label, LABELS, type Lang, reachesTriage } from './common';
import { fillSlot, mulberry32, type FillState } from './fillers';
import { TEMPLATES } from './templates';

const only = process.argv[2];
const rng = mulberry32(7);

function expand(t: string): string {
  let s = t;
  for (let guard = 0; guard < 50 && s.includes('{'); guard++) {
    s = s.replace(/\{([^{}]*)\}/, (_, body: string) => {
      const parts = body.split('|');
      return parts[Math.floor(rng() * parts.length)]!;
    });
  }
  return s;
}

for (const label of LABELS as readonly Label[]) {
  if (only && label !== only) continue;
  for (const lang of ['en', 'fil', 'taglish'] as Lang[]) {
    TEMPLATES[label][lang].forEach((t, i) => {
      let pre = 0;
      let type = 0;
      let example = '';
      for (let k = 0; k < 40; k++) {
        const state: FillState = { rng, split: 'train', lang, memo: new Map() };
        const text = expand(t).replace(/\[([A-Z_]+\d*)\]/g, (_, n: string) => fillSlot(n, state));
        const p = reachesTriage(text);
        const ok = !(FindingType.options as readonly string[]).includes(label) || checkFindingType(label as FindingType, text) === label;
        if (p) pre++;
        if (ok) type++;
        if ((!p || !ok) && !example) example = text;
      }
      if (pre < 40 || type < 40) console.log(`${label}/${lang}/${i}${i % 5 === 4 ? ' (dev)' : ''} prefilter ${pre}/40 type ${type}/40 :: ${example}`);
    });
  }
}
