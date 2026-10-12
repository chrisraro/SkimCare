// Token-id parity between Python `tokenizers` and @huggingface/tokenizers (JS) on many states.
//   python scripts/dump_state_ids.py --tokenizer <tok.json> --jsonl data/*.jsonl --out /tmp/ids.jsonl
//   node ml/laya/js/check_tokenizer_parity.mjs <tok.json> <tokenizer_config.json> /tmp/ids.jsonl [node_modules]
import { readFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const [tokPath, cfgPath, idsPath, nm = resolve(dirname(fileURLToPath(import.meta.url)), '../../../node_modules')] = process.argv.slice(2);
const { Tokenizer } = await import(pathToFileURL(join(nm, '@huggingface/tokenizers/dist/tokenizers.mjs')).href);
const tok = new Tokenizer(JSON.parse(readFileSync(tokPath, 'utf8')), JSON.parse(readFileSync(cfgPath, 'utf8')));
let n = 0, bad = 0;
for (const line of readFileSync(idsPath, 'utf8').split('\n')) {
  if (!line.trim()) continue;
  const { state, ids } = JSON.parse(line);
  const js = tok.encode(state, { add_special_tokens: false }).ids;
  n++;
  if (js.length !== ids.length || js.some((v, i) => v !== ids[i])) {
    bad++;
    if (bad <= 5) console.log('MISMATCH', JSON.stringify(state).slice(0, 120), '\n  js', js.join(','), '\n  py', ids.join(','));
  }
}
console.log(`${n - bad}/${n} states tokenize identically`);
process.exit(bad ? 1 : 0);
