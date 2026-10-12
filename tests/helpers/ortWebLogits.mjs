// Test helper (run as a child process by tests/classifier.test.ts, because onnxruntime-web
// loads its WASM glue with a dynamic import that Jest's VM does not allow).
//
//   node tests/helpers/ortWebLogits.mjs <model.onnx>   < [[ids...], ...]   > [[logits...], ...]
//
// Feeds exactly what src/ai/classifier/ortSession.ts feeds: int64 input_ids and an all-ones
// int64 attention_mask, shape [1, n], one input per run; reads `logits`.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const [modelPath, threads = '1'] = process.argv.slice(2);
const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const ort = await import(pathToFileURL(join(root, 'node_modules/onnxruntime-web/dist/ort.node.min.mjs')).href);
ort.env.wasm.numThreads = Number(threads);

const inputs = JSON.parse(readFileSync(0, 'utf8'));
const session = await ort.InferenceSession.create(readFileSync(modelPath), { executionProviders: ['wasm'], graphOptimizationLevel: 'all' });
const out = { inputNames: session.inputNames, outputNames: session.outputNames, logits: [], ms: [] };
for (const ids of inputs) {
  const dims = [1, ids.length];
  const feeds = {
    input_ids: new ort.Tensor('int64', BigInt64Array.from(ids, (v) => BigInt(v)), dims),
    attention_mask: new ort.Tensor('int64', BigInt64Array.from(ids, () => 1n), dims),
  };
  const t = performance.now();
  const res = await session.run(feeds);
  out.ms.push(performance.now() - t);
  out.logits.push(Array.from(res.logits.data));
}
await session.release();
process.stdout.write(JSON.stringify(out));
