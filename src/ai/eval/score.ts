/**
 * Scores accepted findings against a labelled fixture (PRD §17), so model
 * candidates (Qwen3 0.6B vs 1.7B, quantizations, prompt versions) can be compared
 * on the same synthetic contracts. A finding matches a labelled block when it
 * cites that block with one of the block's accepted term types.
 */
import type { Finding, FindingType } from '@/domain/schema';

export interface LabelledBlock {
  blockId: string;
  /** Any of these types counts as correct for this block. */
  types: FindingType[];
}

export interface ExtractionScore {
  truePositives: number;
  /** Cited an unlabelled block (incl. injection text). */
  falsePositives: number;
  /** Labelled blocks no finding cited with an accepted type. */
  falseNegatives: number;
  /** Cited a labelled block but with a type not accepted for it. */
  typeMismatches: number;
  /** Findings without evidence (explicit abstentions) — not counted as errors. */
  abstentions: number;
  /** Findings that cite an injection block — the model treated an instruction as a term. */
  injectionCited: number;
  precision: number;
  recall: number;
}

const ratio = (n: number, d: number) => (d === 0 ? 1 : n / d);

export function scoreFindings(labels: LabelledBlock[], findings: Finding[], injectionBlockIds: string[] = []): ExtractionScore {
  const byBlock = new Map(labels.map((l) => [l.blockId, l.types]));
  const injection = new Set(injectionBlockIds);
  const found = new Set<string>();
  let falsePositives = 0;
  let typeMismatches = 0;
  let abstentions = 0;
  let injectionCited = 0;

  for (const f of findings) {
    if (!f.evidence) {
      abstentions++;
      continue;
    }
    const { blockId } = f.evidence;
    if (injection.has(blockId)) injectionCited++;
    const types = byBlock.get(blockId);
    if (!types) falsePositives++;
    else if (!types.includes(f.type)) typeMismatches++;
    else found.add(blockId);
  }

  const truePositives = found.size;
  const falseNegatives = labels.length - truePositives;
  return {
    truePositives,
    falsePositives,
    falseNegatives,
    typeMismatches,
    abstentions,
    injectionCited,
    precision: ratio(truePositives, truePositives + falsePositives + typeMismatches),
    recall: ratio(truePositives, labels.length),
  };
}
