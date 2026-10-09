/**
 * Scores the real extraction stack (prompt → parser → evidence gate) on the
 * fictional eval contracts in tests/fixtures/contracts.ts, using a local
 * OpenAI-compatible server running the same GGUF (llama.cpp `llama-server`).
 *
 *   llama-server -m Qwen3-0.6B-Q4_K_M.gguf --host 127.0.0.1 --port 8080 --jinja -c 4096
 *   npm run eval:llm -- [--ids svc-01,ins-02] [--limit 10] [--verbose]
 *
 * Privacy: only fictional fixtures are sent, and only to localhost (enforced).
 */
import { scoreFindings, type ExtractionScore } from '@/ai/eval/score';
import { validateCandidates } from '@/ai/evidenceGate';
import { createLocalLlmEngine, type CompletionRunner } from '@/ai/llm/localLlmEngine';
import { PROMPT_VERSION } from '@/ai/llm/prompt';
import type { FindingType } from '@/domain/schema';
import { EVAL_CONTRACTS } from '../tests/fixtures/contracts';

const url = new URL(process.env.LLM_URL ?? 'http://127.0.0.1:8080');
if (!['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) {
  throw new Error(`Refusing to send prompts to ${url.hostname}: the eval only talks to a local server.`);
}

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const ids = arg('ids')?.split(',');
const limit = Number(arg('limit') ?? Infinity);
const verbose = process.argv.includes('--verbose');

const runner: CompletionRunner = async (req) => {
  const res = await fetch(new URL('/v1/chat/completions', url), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages: req.messages,
      temperature: 0,
      max_tokens: req.maxTokens,
      response_format: { type: 'json_schema', json_schema: { name: 'output', strict: true, schema: req.jsonSchema } },
      chat_template_kwargs: { enable_thinking: false },
    }),
  });
  if (!res.ok) throw new Error(`LLM server ${res.status}: ${await res.text()}`);
  const json = (await res.json()) as { choices: { message: { content: string } }[] };
  return json.choices[0]?.message.content ?? '';
};

const TYPE_NAMES = new Set<string>([
  'payment_condition', 'payment_amount', 'due_date', 'late_fee', 'deliverables', 'revisions',
  'ownership', 'termination', 'notice_period', 'party', 'other',
] satisfies FindingType[]);

interface Row extends ExtractionScore {
  id: string;
  category: string;
  labels: number;
  rejected: Record<string, number>;
  echoedTitles: number;
  incomplete: boolean;
  seconds: number;
}

async function main() {
  const engine = createLocalLlmEngine(runner);
  const contracts = EVAL_CONTRACTS.filter((c) => !ids || ids.includes(c.id)).slice(0, limit);
  const rows: Row[] = [];

  console.log(`prompt ${PROMPT_VERSION} · ${contracts.length} contracts · ${url.origin}\n`);
  for (const c of contracts) {
    const started = Date.now();
    const raw = await engine.extract({ pages: c.pages, documentType: c.type, language: 'en' });
    const { accepted, rejected } = validateCandidates(raw.findings, c.pages);
    const score = scoreFindings(c.labels, accepted, c.injectionBlockIds);
    const rejectedBy: Record<string, number> = {};
    for (const r of rejected) rejectedBy[r.reason] = (rejectedBy[r.reason] ?? 0) + 1;
    const row: Row = {
      id: c.id,
      category: c.category,
      labels: c.labels.length,
      ...score,
      rejected: rejectedBy,
      echoedTitles: accepted.filter((f) => TYPE_NAMES.has(f.title.trim())).length,
      incomplete: (raw.incompletePages ?? []).length > 0,
      seconds: (Date.now() - started) / 1000,
    };
    rows.push(row);
    if (verbose) {
      // Fictional fixtures only — safe to print locally while tuning prompts.
      const byId = new Map((raw.findings as { id?: string; normalizedValue?: string; title?: string; explanation?: string }[]).map((f) => [f.id, f]));
      for (const r of rejected) {
        const f = byId.get(r.id);
        console.log(`    rejected ${r.reason}: ${r.id} value=${JSON.stringify(f?.normalizedValue)} title=${JSON.stringify(f?.title)}`);
      }
      for (const f of accepted.filter((a) => a.evidence && c.injectionBlockIds.includes(a.evidence.blockId))) {
        console.log(`    INJECTION cited as ${f.type}: title=${JSON.stringify(f.title)} explanation=${JSON.stringify(f.explanation)}`);
      }
    }
    const rej = Object.entries(rejectedBy).map(([k, v]) => `${k}:${v}`).join(' ') || '-';
    console.log(
      `${c.id.padEnd(7)} found ${row.truePositives}/${row.labels}  fp ${row.falsePositives}  wrong-type ${row.typeMismatches}  ` +
        `injection ${row.injectionCited}  rejected ${rej}  echoed-titles ${row.echoedTitles}${row.incomplete ? '  INCOMPLETE' : ''}  ${row.seconds.toFixed(1)}s`,
    );
  }

  const sum = (k: 'truePositives' | 'falsePositives' | 'typeMismatches' | 'labels' | 'injectionCited' | 'echoedTitles') =>
    rows.reduce((n, r) => n + r[k], 0);
  const tp = sum('truePositives');
  const precision = tp / Math.max(1, tp + sum('falsePositives') + sum('typeMismatches'));
  const recall = tp / Math.max(1, sum('labels'));
  console.log('\nby category (recall):');
  for (const cat of [...new Set(rows.map((r) => r.category))]) {
    const rs = rows.filter((r) => r.category === cat);
    const t = rs.reduce((n, r) => n + r.truePositives, 0);
    const l = rs.reduce((n, r) => n + r.labels, 0);
    console.log(`  ${cat.padEnd(15)} ${(100 * t / l).toFixed(0)}%  (${t}/${l})`);
  }
  const verdicts = rows.reduce((n, r) => n + (r.rejected.verdict_language ?? 0), 0);
  console.log(
    `\nTOTAL  precision ${(100 * precision).toFixed(0)}%  recall ${(100 * recall).toFixed(0)}%  ` +
      `injection-cited ${sum('injectionCited')}  verdict-rejected ${verdicts}  echoed-titles ${sum('echoedTitles')}  ` +
      `incomplete ${rows.filter((r) => r.incomplete).length}  time ${rows.reduce((n, r) => n + r.seconds, 0).toFixed(0)}s`,
  );
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
