#!/usr/bin/env node
/**
 * Copies the in-browser engine's runtime files into public/vendor so the web app
 * serves them itself (Expo web serves public/ at the site root). Nothing is loaded
 * from a CDN at runtime. Plain Node, no dependencies. Run before `expo export -p web`.
 *
 *   wllama (llama.cpp wasm)          node_modules/@wllama/wllama/esm
 *   wllama compat build (Safari/iOS) node_modules/@wllama/wllama-compat, else fetched at BUILD time (pinned SHA-256)
 *   Tesseract.js worker + LSTM core  node_modules/tesseract.js, tesseract.js-core
 *   Tesseract eng + fil data         node_modules/@tesseract.js-data/<lang>, else fetched at BUILD time (pinned SHA-256)
 *   pdf.js (legacy build) + worker   node_modules/pdfjs-dist
 *   ONNX Runtime Web (wasm, SIMD+threads) node_modules/onnxruntime-web (clause classifier)
 *   Laya classifier files            GitHub release laya-v1, fetched at BUILD time when pinned in
 *                                    src/ai/classifier/laya-files.json (SHA-256 verified). GitHub
 *                                    release downloads send no CORS headers, so the cross-origin-
 *                                    isolated site must serve them itself.
 *
 * Build-time downloads are cached in node_modules/.cache/skimcare-web-assets.
 * Set SKIMCARE_OFFLINE_BUILD=1 to forbid them (missing optional files are then skipped and noted in the manifest).
 */
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const nm = join(root, 'node_modules');
const out = join(root, 'public', 'vendor');
const cache = join(nm, '.cache', 'skimcare-web-assets');
const offline = process.env.SKIMCARE_OFFLINE_BUILD === '1';

/** SHA-256 (base64, as listed by jsdelivr) of files fetched at build time. */
const PINNED = {
  'https://cdn.jsdelivr.net/npm/@wllama/wllama-compat@3.8.1/wasm/wllama.js': 'JknutAiYiEHDcuVIBa36Ja7V0C+FDAmt14wvOsDz/OE=',
  'https://cdn.jsdelivr.net/npm/@wllama/wllama-compat@3.8.1/wasm/wllama.wasm': 'LbP2fQvMGc348U8SnkbKtpG/+JiVSAj4otxMWG61u2g=',
  'https://cdn.jsdelivr.net/npm/@tesseract.js-data/eng@1.0.0/4.0.0_best_int/eng.traineddata.gz': 'RbTLNGckrBd08cNvQvGCuIe82yjr5j5v/5CsQfP8/5E=',
  'https://cdn.jsdelivr.net/npm/@tesseract.js-data/fil@1.0.0/4.0.0_best_int/fil.traineddata.gz': 'c+KvDK2FRKUzWB9qA2yjEso8RbydUUUbGZea5DE9oAM=',
};

const log = (msg) => console.log(`[web-assets] ${msg}`);
const sha256b64 = (buf) => createHash('sha256').update(buf).digest('base64');

function copy(from, to) {
  if (!existsSync(from)) throw new Error(`missing ${from} — run npm install first`);
  mkdirSync(dirname(to), { recursive: true });
  cpSync(from, to, { recursive: true });
}

/** A local file if present, else a pinned build-time download (verified). Returns the bytes, or null. */
async function localOrPinned(localPath, url) {
  if (existsSync(localPath)) return readFileSync(localPath);
  const cached = join(cache, createHash('sha1').update(url).digest('hex'));
  if (existsSync(cached) && sha256b64(readFileSync(cached)) === PINNED[url]) return readFileSync(cached);
  if (offline) return null;
  log(`fetching ${url}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const got = sha256b64(buf);
  if (got !== PINNED[url]) throw new Error(`SHA-256 mismatch for ${url}: ${got}`);
  mkdirSync(cache, { recursive: true });
  writeFileSync(cached, buf);
  return buf;
}

function write(to, buf) {
  mkdirSync(dirname(to), { recursive: true });
  writeFileSync(to, buf);
}

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

// wllama: ES module (worker + emscripten glue are embedded) and the single wasm build.
const wllamaVersion = JSON.parse(readFileSync(join(nm, '@wllama/wllama/package.json'), 'utf8')).version;
copy(join(nm, '@wllama/wllama/esm/index.js'), join(out, 'wllama/index.js'));
copy(join(nm, '@wllama/wllama/esm/wasm/wllama.wasm'), join(out, 'wllama/wllama.wasm'));

// Compatibility build for browsers without JSPI / Memory64 — Safari, i.e. every browser on iPhone.
let wllamaCompat = false;
{
  const base = `https://cdn.jsdelivr.net/npm/@wllama/wllama-compat@${wllamaVersion}/wasm`;
  const local = join(nm, '@wllama/wllama-compat/wasm');
  const pinned = PINNED[`${base}/wllama.js`] && PINNED[`${base}/wllama.wasm`];
  if (existsSync(local) || pinned) {
    const js = await localOrPinned(join(local, 'wllama.js'), `${base}/wllama.js`);
    const wasm = await localOrPinned(join(local, 'wllama.wasm'), `${base}/wllama.wasm`);
    if (js && wasm) {
      write(join(out, 'wllama/compat/wllama.js'), js);
      write(join(out, 'wllama/compat/wllama.wasm'), wasm);
      wllamaCompat = true;
    }
  }
  if (!wllamaCompat) log(`WARNING: no wllama compat build for ${wllamaVersion} — the model will not run on iPhone/Safari.`);
}

// Tesseract.js: ESM entry, worker, and the LSTM-only cores (OEM 1) for each SIMD level.
copy(join(nm, 'tesseract.js/dist/tesseract.esm.min.js'), join(out, 'tesseract/tesseract.esm.min.js'));
copy(join(nm, 'tesseract.js/dist/worker.min.js'), join(out, 'tesseract/worker.min.js'));
for (const f of readdirSync(join(nm, 'tesseract.js-core')).filter((n) => /-lstm\.wasm\.js$/.test(n))) {
  copy(join(nm, 'tesseract.js-core', f), join(out, 'tesseract/core', f));
}
const tesseractLangs = [];
for (const lang of ['eng', 'fil']) {
  const url = `https://cdn.jsdelivr.net/npm/@tesseract.js-data/${lang}@1.0.0/4.0.0_best_int/${lang}.traineddata.gz`;
  const buf = await localOrPinned(join(nm, `@tesseract.js-data/${lang}/4.0.0_best_int/${lang}.traineddata.gz`), url);
  if (buf) {
    write(join(out, `tesseract/lang/${lang}.traineddata.gz`), buf);
    tesseractLangs.push(lang);
  } else {
    log(`WARNING: no ${lang} traineddata`);
  }
}
if (!tesseractLangs.includes('eng')) throw new Error('English OCR data is required');

// pdf.js legacy build (older iPhone Safari), its worker, CMaps, standard fonts and image-decoder wasm.
copy(join(nm, 'pdfjs-dist/legacy/build/pdf.min.mjs'), join(out, 'pdfjs/pdf.min.mjs'));
copy(join(nm, 'pdfjs-dist/legacy/build/pdf.worker.min.mjs'), join(out, 'pdfjs/pdf.worker.min.mjs'));
copy(join(nm, 'pdfjs-dist/cmaps'), join(out, 'pdfjs/cmaps'));
copy(join(nm, 'pdfjs-dist/standard_fonts'), join(out, 'pdfjs/standard_fonts'));
copy(join(nm, 'pdfjs-dist/wasm'), join(out, 'pdfjs/wasm'));

// ONNX Runtime Web for the clause classifier: the wasm-only ESM entry and its SIMD+threads build.
const ortVersion = JSON.parse(readFileSync(join(nm, 'onnxruntime-web/package.json'), 'utf8')).version;
for (const f of ['ort.wasm.min.mjs', 'ort-wasm-simd-threaded.mjs', 'ort-wasm-simd-threaded.wasm']) {
  copy(join(nm, 'onnxruntime-web/dist', f), join(out, 'ort', f));
}

// Laya classifier files, only when pinned (sizes + SHA-256 in laya-files.json). Not pinned → skipped;
// the app then reports the clause sorter as "not set up" and uses the language model.
const laya = JSON.parse(readFileSync(join(root, 'src/ai/classifier/laya-files.json'), 'utf8'));
const layaFiles = Object.values(laya.files);
let layaShipped = false;
if (layaFiles.every((f) => f.sizeBytes > 0 && /^[0-9a-f]{64}$/i.test(f.sha256))) {
  const sha256hex = (buf) => createHash('sha256').update(buf).digest('hex');
  const bufs = [];
  for (const f of layaFiles) {
    const url = `${laya.release}/${f.fileName}`;
    const cached = join(cache, `laya-${f.sha256.toLowerCase()}`);
    let buf = existsSync(cached) ? readFileSync(cached) : null;
    if (buf && sha256hex(buf) !== f.sha256.toLowerCase()) buf = null;
    if (!buf && !offline) {
      log(`fetching ${url}`);
      const res = await fetch(url); // follows GitHub's redirect to its asset CDN
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
      buf = Buffer.from(await res.arrayBuffer());
      if (buf.length !== f.sizeBytes || sha256hex(buf) !== f.sha256.toLowerCase()) throw new Error(`size/SHA-256 mismatch for ${url}`);
      mkdirSync(cache, { recursive: true });
      writeFileSync(cached, buf);
    }
    if (!buf) break;
    bufs.push([f.fileName, buf]);
  }
  if (bufs.length === layaFiles.length) {
    for (const [name, buf] of bufs) write(join(out, 'laya', name), buf);
    layaShipped = true;
  } else {
    log('WARNING: Laya classifier files not available offline — skipped.');
  }
} else {
  log('Laya classifier not pinned yet (laya-files.json) — skipped.');
}

writeFileSync(join(out, 'manifest.json'), JSON.stringify({ wllamaVersion, wllamaCompat, tesseractLangs, ortVersion, laya: layaShipped ? laya.id : null }, null, 2));
log(`done → public/vendor (wllama ${wllamaVersion}, compat ${wllamaCompat ? 'yes' : 'NO'}, OCR ${tesseractLangs.join('+')}, ort ${ortVersion}, laya ${layaShipped ? laya.id : 'no'})`);
