/**
 * Scores the real extraction stack (prompt → parser → evidence gate) on the
 * fictional eval contracts in tests/fixtures/contracts.ts, using a local
 * OpenAI-compatible server running the same GGUF (llama.cpp `llama-server`).
 *
 *   llama-server -m Qwen3-0.6B-Q4_K_M.gguf --host 127.0.0.1 --port 8080 --jinja -c 4096 -np 1
 *   npm run eval:llm -- [--ids svc-01,ins-02] [--limit 10] [--verbose]
 *   (another port: LLM_URL=http://127.0.0.1:8091 npm run eval:llm)
 *
 * `-np 1` (one slot) matches the phone: one context whose KV cache carries the shared
 * system prompt from call to call, so the evaluated/cached prompt token counts printed
 * at the end are the ones the phone would see.
 *
 * Privacy: only fictional fixtures are sent, and only to localhost (enforced).
 */
import { scoreFindings, type ExtractionScore } from '@/ai/eval/score';
import { validateCandidates } from '@/ai/evidenceGate';
import { createLocalLlmEngine, type CompletionRunner } from '@/ai/llm/localLlmEngine';
import { PROMPT_VERSION } from '@/ai/llm/prompt';
import { emptyStats, fromLlamaTimings, totalCalls, type LlamaTimings, type LlmRunStats } from '@/ai/llm/stats';
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
  const json = (await res.json()) as { choices: { message: { content: string } }[]; timings?: LlamaTimings };
  // Same llama.cpp `timings` the phone (llama.rn) and the web (wllama) report; the engine sums them (stats.ts).
  return { text: json.choices[0]?.message.content ?? '', timings: fromLlamaTimings(json.timings) };
};

/** Summed over all contracts: generated and evaluated prompt tokens dominate time on a phone. */
const totals = emptyStats('extract');
function addStats(s: LlmRunStats) {
  totals.blocks += s.blocks;
  totals.asked += s.asked;
  totals.relevant += s.relevant;
  totals.calls.triage += s.calls.triage;
  totals.calls.explain += s.calls.explain;
  totals.retries += s.retries;
  for (const k of ['timed', 'promptTokens', 'cachedTokens', 'promptMs', 'generatedTokens', 'generationMs', 'callMs', 'wallMs'] as const) totals[k] += s[k];
}

/**
 * Phone time projected from token counts at measured phone speeds (docs/LOCAL_LLM.md):
 * evaluated prompt tokens ÷ prompt speed + generated tokens ÷ generation speed.
 * A projection, not a measurement — confirm on the phone.
 */
const PHONE_SPEEDS = [
  { name: 'TECNO throttled (prompt 15, gen 2.5 tok/s)', prompt: 15, gen: 2.5 },
  { name: 'emulator / cool mid-range (prompt 22, gen 8 tok/s)', prompt: 22, gen: 8 },
];
const projectSeconds = (s: Pick<LlmRunStats, 'promptTokens' | 'generatedTokens'>, v: { prompt: number; gen: number }) =>
  s.promptTokens / v.prompt + s.generatedTokens / v.gen;

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
  let last: LlmRunStats | undefined;
  const engine = createLocalLlmEngine(runner, {
    onStats: (s) => {
      last = s;
      addStats(s);
    },
  });
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
        `injection ${row.injectionCited}  rejected ${rej}  echoed-titles ${row.echoedTitles}${row.incomplete ? '  INCOMPLETE' : ''}  ${row.seconds.toFixed(1)}s` +
        (last ? `  calls ${totalCalls(last)} prompt ${last.promptTokens} gen ${last.generatedTokens}` : ''),
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
  const calls = totalCalls(totals);
  const n = Math.max(1, rows.length);
  console.log(
    `model calls ${calls} (type ${totals.calls.triage}, explain ${totals.calls.explain}, retries ${totals.retries})  ` +
      `blocks ${totals.blocks} asked ${totals.asked} terms ${totals.relevant}`,
  );
  console.log(
    `generated tokens ${totals.generatedTokens} (${(totals.generatedTokens / Math.max(1, calls)).toFixed(1)} per call, ${(totals.generatedTokens / n).toFixed(0)} per contract)  ` +
      `prompt tokens evaluated ${totals.promptTokens} (${(totals.promptTokens / n).toFixed(0)} per contract), reused from cache ${totals.cachedTokens}`,
  );
  console.log(`server time: prompt ${(totals.promptMs / 1000).toFixed(1)}s, generation ${(totals.generationMs / 1000).toFixed(1)}s`);
  for (const v of PHONE_SPEEDS) console.log(`projected phone model time per contract, ${v.name}: ${(projectSeconds(totals, v) / n).toFixed(0)}s`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
