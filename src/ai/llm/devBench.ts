/**
 * Dev-only: runs llama.cpp's synthetic speed benchmark on this device and prints
 * one `[bench]` line per model × CPU setting to the Metro log. No document text.
 * Trigger: open `pirmabago://diagnostics?bench=1` in a __DEV__ build.
 */
import { benchmark, type CpuSettings } from './llamaRuntime';
import { MODEL_CANDIDATES } from './models';

/** "6-7" = the two fast cores on the 2+6 core MT6835 test phone; adjust per device. */
const CPUS: CpuSettings[] = [{}, { n_threads: 2 }, { n_threads: 2, cpu_mask: '6-7' }, { n_threads: 6 }, { n_threads: 8 }];

export async function runDevBench(): Promise<void> {
  const models = MODEL_CANDIDATES.filter((m) => m.id.startsWith('qwen3-0.6b'));
  console.log(`[bench] start: ${models.length} models x ${CPUS.length} CPU settings`);
  await benchmark(models, CPUS, (row) => console.log(`[bench] ${JSON.stringify(row)}`));
  console.log('[bench] done');
}
