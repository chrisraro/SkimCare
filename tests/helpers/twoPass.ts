/**
 * Test helper for fake models. Tests describe what the model "decides" for a block as
 * one finding ({"relevant": …, "finding": {type, title, explanation, review_status,
 * questions}}), the shape that is easiest to read in a test. The engine asks in two
 * calls (extract-v5: a type call, then an explain call for terms), so this turns that
 * decision into the reply for the call being made. Unusable text is passed through
 * unchanged, so retry/incomplete paths stay testable.
 */
import type { CompletionRequest } from '@/ai/llm/localLlmEngine';

/** The block text a type/explain request asks about, or undefined for other calls (quiz). */
export function blockTextOf(req: CompletionRequest): string | undefined {
  return /<block>\n([\s\S]*?)\n<\/block>/.exec(req.messages[1]?.content ?? '')?.[1];
}

const STATUS: Record<string, string> = { needs_attention: 'attention', needs_clarification: 'unclear', explained: 'ok' };

export function replyFor(req: CompletionRequest, decision: string): string {
  let d: { relevant?: unknown; finding?: Record<string, unknown> } | null;
  try {
    d = JSON.parse(decision);
  } catch {
    return decision;
  }
  if (!d || typeof d.relevant !== 'boolean') return decision;
  if (req.kind === 'triage') return JSON.stringify({ t: d.relevant && d.finding ? d.finding.type : 'none' });
  const f = d.finding ?? {};
  const status = typeof f.review_status === 'string' ? (STATUS[f.review_status] ?? f.review_status) : f.review_status;
  const questions = Array.isArray(f.questions) ? f.questions : [];
  return JSON.stringify({ title: f.title, e: f.explanation, s: status, q: questions[0] ?? '' });
}
