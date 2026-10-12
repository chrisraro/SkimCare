/**
 * Writes ml/laya/data/eval.jsonl from the 30 fictional eval contracts
 * (tests/fixtures/contracts.ts), using the app's own extractionUnits() so the
 * eval file holds exactly the blocks the app sends to triage:
 *   - a labelled block → its first fixture type as `label`, all accepted types in `labels`;
 *   - every other unit → "none".
 * Blocks extractionUnits() skips (headings, boilerplate, instruction-like text) never
 * reach the model and are not included.
 *
 *   npx tsx ml/laya/scripts/export-eval.ts
 */
import * as path from 'node:path';
import { extractionUnits } from '@/ai/llm/chunking';
import { EVAL_CONTRACTS } from '../../../tests/fixtures/contracts';
import { appContext, DATA_DIR, detectLang, type Example, type Label, writeJsonl } from './common';

export function evalExamples(): Example[] {
  const rows: Example[] = [];
  for (const contract of EVAL_CONTRACTS) {
    const labelsById = new Map(contract.labels.map((l) => [l.blockId, l.types as Label[]]));
    for (const unit of extractionUnits(contract.pages)) {
      const types = labelsById.get(unit.block.id);
      const label: Label = types?.[0] ?? 'none';
      const context = appContext(unit.block.text, unit.context);
      rows.push({
        text: unit.block.text,
        label,
        labels: types ?? ['none'],
        lang: contract.language === 'mixed' ? detectLang(unit.block.text) : contract.language === 'fil' ? 'fil' : 'en',
        ...(context ? { context } : {}),
        source: 'eval-fixture',
        ref: `${contract.id}/${unit.block.id}`,
      });
    }
  }
  return rows;
}

if (require.main === module) {
  const rows = evalExamples();
  writeJsonl(path.join(DATA_DIR, 'eval.jsonl'), rows);
  const counts: Record<string, number> = {};
  for (const r of rows) counts[r.label] = (counts[r.label] ?? 0) + 1;
  console.log(`eval.jsonl: ${rows.length} blocks`, counts);
}
