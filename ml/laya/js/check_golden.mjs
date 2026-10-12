// Reproduce the golden vectors in JavaScript with the app's own libraries:
// @huggingface/tokenizers (token ids, exact) and onnxruntime-web on WASM (logits, tolerance).
//
//   node ml/laya/js/check_golden.mjs <export-dir> <golden.json> [node_modules-dir]
//
// <export-dir> holds laya-v1.tokenizer.json, laya-v1.tokenizer_config.json, the .onnx named in the golden file
// and triage_spec.json. node_modules-dir defaults to the repo's node_modules.
import { readFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const [exportDir, goldenPath, nm = resolve(dirname(fileURLToPath(import.meta.url)), '../../../node_modules')] = process.argv.slice(2);
const golden = JSON.parse(readFileSync(goldenPath, 'utf8'));
const spec = JSON.parse(readFileSync(join(exportDir, 'triage_spec.json'), 'utf8'));
const { Tokenizer } = await import(pathToFileURL(join(nm, '@huggingface/tokenizers/dist/tokenizers.mjs')).href);
const ort = await import(pathToFileURL(join(nm, 'onnxruntime-web/dist/ort.node.min.mjs')).href).catch(
  () => import(pathToFileURL(join(nm, 'onnxruntime-web/dist/ort.min.mjs')).href),
);

// ---- the INFERENCE_SPEC.md algorithm, verbatim
const WS = /[\t\n\u000b\u000c\r \u0085\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]+/g;
const normalizeBlock = (t) => t.replaceAll('<mask>', ' ').replace(WS, ' ').replace(/^ +| +$/g, '');
const makeState = (text, context) => {
  let s = normalizeBlock(text);
  if (spec.use_context && context && normalizeBlock(context)) s += spec.context_sep + normalizeBlock(context);
  return s;
};
const tokJson = JSON.parse(readFileSync(join(exportDir, spec.tokenizer_file), 'utf8'));
const tokCfgPath = join(exportDir, spec.tokenizer_config_file ?? 'tokenizer_config.json');
const tok = new Tokenizer(tokJson, JSON.parse(readFileSync(tokCfgPath, 'utf8')));
const inputIds = (text, context) => {
  const st = tok.encode(makeState(text, context), { add_special_tokens: false }).ids.slice(0, spec.room);
  return [...spec.head_ids, ...st, spec.sep_id];
};
const session = await ort.InferenceSession.create(readFileSync(join(exportDir, spec.model_file ?? golden.model_file)), { executionProviders: ['wasm'] });
const softmax = (z, T) => {
  const s = z.map((v) => v / T);
  const m = Math.max(...s);
  const e = s.map((v) => Math.exp(v - m));
  const sum = e.reduce((a, b) => a + b, 0);
  return e.map((v) => v / sum);
};

let fail = 0;
for (const c of golden.cases) {
  const ids = inputIds(c.text, c.context);
  const idsOk = ids.length === c.input_ids.length && ids.every((v, i) => v === c.input_ids[i]);
  const L = ids.length;
  const feeds = {
    input_ids: new ort.Tensor('int64', BigInt64Array.from(ids.map(BigInt)), [1, L]),
    attention_mask: new ort.Tensor('int64', BigInt64Array.from(ids.map(() => 1n)), [1, L]),
  };
  const logits = Array.from((await session.run(feeds)).logits.data);
  const maxDiff = Math.max(...logits.map((v, i) => Math.abs(v - c.logits[i])));
  const p = softmax(logits, spec.temperature);
  const k = p.indexOf(Math.max(...p));
  const label = spec.labels[k];
  const ok = idsOk && label === c.label && maxDiff < 1e-2;
  if (!ok) fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${c.note}: ids ${idsOk ? 'match' : 'DIFFER'} (${L}), label ${label} (${p[k].toFixed(4)}) vs ${c.label}, max|dlogit| ${maxDiff.toExponential(2)}`);
  if (!idsOk) console.log('  js  ', ids.join(','), '\n  py  ', c.input_ids.join(','));
}
process.exit(fail ? 1 : 0);
