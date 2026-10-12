/**
 * Per-review model diagnostics: call counts, token counts and times. Counts and
 * times only — never document text, prompts or model output (PRD §14), so the
 * summary can be printed in dev builds and by the eval while reviewing real files.
 *
 * Token counts and prefill/decode times come from llama.cpp's `timings` object,
 * which llama.rn (`NativeCompletionResult.timings`), wllama and llama-server all return
 * with the same field names. `cache_n` is how many prompt tokens were reused from the
 * KV cache (not evaluated again).
 */

/** llama.cpp `timings` fields we use (llama.rn, wllama, llama-server). */
export interface LlamaTimings {
  cache_n?: number;
  prompt_n?: number;
  prompt_ms?: number;
  predicted_n?: number;
  predicted_ms?: number;
}

export interface CallTimings {
  /** Prompt tokens evaluated in this call (not counting tokens reused from the cache). */
  promptTokens?: number;
  /** Prompt tokens reused from the KV cache. */
  cachedTokens?: number;
  promptMs?: number;
  generatedTokens?: number;
  generationMs?: number;
}

export function fromLlamaTimings(t: LlamaTimings | undefined | null): CallTimings | undefined {
  if (!t || typeof t !== 'object') return undefined;
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : undefined);
  return {
    promptTokens: num(t.prompt_n),
    cachedTokens: num(t.cache_n),
    promptMs: num(t.prompt_ms),
    generatedTokens: num(t.predicted_n),
    generationMs: num(t.predicted_ms),
  };
}

export interface LlmRunStats {
  phase: 'extract' | 'quiz';
  /** Blocks in the document. */
  blocks: number;
  /** Blocks sent to the model (after headings, boilerplate, injection text and the prefilter). */
  asked: number;
  /** Blocks the type pass called a term. */
  relevant: number;
  calls: { triage: number; explain: number; quiz: number };
  retries: number;
  /** Sums over calls whose runtime reported them (`timed` calls). */
  timed: number;
  promptTokens: number;
  cachedTokens: number;
  promptMs: number;
  generatedTokens: number;
  generationMs: number;
  /** Wall time of all model calls, measured in JS. */
  callMs: number;
  /** Wall time of the whole phase. */
  wallMs: number;
  /** Type pass by the clause classifier (classifier/laya.ts). Counts and times only. */
  classifier: ClassifierStats;
}

export interface ClassifierStats {
  /** Blocks the classifier was asked about. */
  asked: number;
  /** Confident answers used instead of a language-model type call. */
  used: number;
  /** Of `used`: blocks it called "not a term" (no explain call). */
  none: number;
  /** Answers below the threshold, sent to the language model instead. */
  belowThreshold: number;
  /** Classifier errors (the language model decided those blocks). */
  errors: number;
  /** Wall time of classifier runs, measured in JS. */
  ms: number;
}

export function emptyStats(phase: LlmRunStats['phase']): LlmRunStats {
  return {
    phase,
    blocks: 0,
    asked: 0,
    relevant: 0,
    calls: { triage: 0, explain: 0, quiz: 0 },
    retries: 0,
    timed: 0,
    promptTokens: 0,
    cachedTokens: 0,
    promptMs: 0,
    generatedTokens: 0,
    generationMs: 0,
    callMs: 0,
    wallMs: 0,
    classifier: { asked: 0, used: 0, none: 0, belowThreshold: 0, errors: 0, ms: 0 },
  };
}

export function addCall(stats: LlmRunStats, kind: keyof LlmRunStats['calls'], ms: number, t?: CallTimings): void {
  stats.calls[kind]++;
  stats.callMs += ms;
  if (!t) return;
  stats.timed++;
  stats.promptTokens += t.promptTokens ?? 0;
  stats.cachedTokens += t.cachedTokens ?? 0;
  stats.promptMs += t.promptMs ?? 0;
  stats.generatedTokens += t.generatedTokens ?? 0;
  stats.generationMs += t.generationMs ?? 0;
}

export const totalCalls = (s: LlmRunStats) => s.calls.triage + s.calls.explain + s.calls.quiz;

const secs = (ms: number) => `${(ms / 1000).toFixed(1)}s`;

/** One line, counts and times only. */
export function formatStats(s: LlmRunStats): string {
  const head =
    s.phase === 'extract'
      ? `extract blocks ${s.blocks} asked ${s.asked} skipped ${s.blocks - s.asked} terms ${s.relevant} · calls ${totalCalls(s)} (type ${s.calls.triage}, explain ${s.calls.explain}, retries ${s.retries})`
      : `quiz calls ${s.calls.quiz}`;
  const tokens = s.timed
    ? ` · prompt ${s.promptTokens} tok (+${s.cachedTokens} cached) ${secs(s.promptMs)} · generated ${s.generatedTokens} tok ${secs(s.generationMs)}` +
      (s.generationMs > 0 ? ` (${((s.generatedTokens * 1000) / s.generationMs).toFixed(1)} tok/s)` : '')
    : '';
  const c = s.classifier;
  const sorter = c.asked
    ? ` · sorter asked ${c.asked} used ${c.used} (none ${c.none}) low ${c.belowThreshold} errors ${c.errors} ${secs(c.ms)}`
    : '';
  return `${head}${tokens}${sorter} · model ${secs(s.callMs)} · wall ${secs(s.wallMs)}`;
}

/** Dev builds: one `[llm-stats]` line per extraction / quiz in the Metro or browser console. */
export function logStatsInDev(s: LlmRunStats): void {
  if (typeof __DEV__ !== 'undefined' && __DEV__) console.log(`[llm-stats] ${formatStats(s)}`);
}
