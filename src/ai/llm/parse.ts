/**
 * Turns raw model text into finding candidates. This is only a shape mapping
 * (snake_case → domain fields, page from block id); it does NOT decide what is
 * true. Every candidate still goes through `validateCandidates` in the evidence gate.
 */
import type { Chunk } from './chunking';

export type ParseResult = { ok: true; candidates: unknown[] } | { ok: false; error: 'no_json' | 'invalid_json' | 'wrong_shape' };

/** Strips Qwen3 reasoning blocks and Markdown fences, then returns the outermost JSON object text. */
export function extractJsonText(output: string): string | null {
  const cleaned = output
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/<think>[\s\S]*$/i, '') // unterminated reasoning: nothing usable after it
    .replace(/```(?:json)?/gi, '');
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  return start >= 0 && end > start ? cleaned.slice(start, end + 1) : null;
}

const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);

function pageFor(blockId: string | undefined, chunk: Chunk): number | undefined {
  if (!blockId) return undefined;
  const own = chunk.blocks.find((b) => b.id === blockId);
  if (own) return own.page;
  // Unknown id: keep the page it claims so the evidence gate rejects it as unknown_source.
  const m = /^p(\d+)_/.exec(blockId);
  return m ? Number(m[1]) : chunk.page;
}

function toCandidate(item: unknown, chunk: Chunk, i: number): unknown {
  if (!item || typeof item !== 'object') return item;
  const r = item as Record<string, unknown>;
  const blockId = str(r.block_id);
  const quote = str(r.quote);
  return {
    id: `c${chunk.index}_f${i}`,
    type: r.type,
    title: r.title,
    normalizedValue: str(r.normalized_value),
    evidence: blockId || quote ? { page: pageFor(blockId, chunk), blockId, quote } : undefined,
    explanation: r.explanation,
    uncertainty: str(r.uncertainty),
    reviewStatus: r.review_status,
    questions: Array.isArray(r.questions) ? r.questions.filter((q) => typeof q === 'string' && q.trim()) : [],
  };
}

export function parseModelOutput(output: string, chunk: Chunk): ParseResult {
  const json = extractJsonText(output);
  if (!json) return { ok: false, error: 'no_json' };
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    return { ok: false, error: 'invalid_json' };
  }
  const findings = (data as { findings?: unknown } | null)?.findings;
  if (!Array.isArray(findings)) return { ok: false, error: 'wrong_shape' };
  return { ok: true, candidates: findings.map((f, i) => toCandidate(f, chunk, i)) };
}
