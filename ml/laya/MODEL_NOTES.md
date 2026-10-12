# Laya for SkimCare triage: model notes

Pass 1 of on-device extraction asks "which type of term is this block, or none?" (12 labels).
This folder fine-tunes the open Laya decision model for that question and exports it for the app.
The runtime contract is in [INFERENCE_SPEC.md](INFERENCE_SPEC.md). All numbers below were measured
on 2026-10-12 on this PC (RTX 3060 Laptop 6 GB, i7-11800H, Windows 11).

## 1. Verified facts (with sources)

| Fact | Value | Source |
|---|---|---|
| Official repos | `convaiinnovations/laya` (hub for all 3 checkpoints, root = English), `convaiinnovations/laya-multilingual`, `convaiinnovations/laya-typed-decisions`. Code: github.com/NandhaKishorM/laya (PyPI `laya` 0.4.4) | HF API `/api/models?search=laya`; model cards |
| Not used | `opg13/laya`, `aaroncool9/laya` (re-uploads), `tozp/laya-onnx` (third-party ONNX of the English model), `flydexo/bad-laya` (as instructed) | HF API |
| License | **Apache-2.0** for the Laya weights (card metadata, README "Apache 2.0 · Convai Innovations") and the code (GitHub LICENSE, `pyproject.toml`). The base encoder `jhu-clsp/mmBERT-base` is **MIT**. Commercial use is allowed. Keep the Apache NOTICE/attribution when redistributing weights | HF cards, GitHub API `license: apache-2.0`, mmBERT card `license: mit` |
| Pinned revision | `laya-multilingual` @ `1720e3e3357cfe1e281542e223f8273b0890ca34`, `model.safetensors` sha256 `9d628fd9…aa8f204` | HF API |
| English checkpoint | ModernBERT-large + decision head, 421M, context 512 (`head_max_len` 192), temperatures fitted | `rl_agent_config.json`, card |
| Multilingual checkpoint | mmBERT-base (22 layers, hidden 768, 256k vocab, Gemma BPE with byte fallback), ~322M with the head, context 1024 (`head_max_len` 256), **ships uncalibrated** (T = 1) | `multilingual/encoder/config.json`, card |
| Architecture | Bidirectional encoder → `+ type_emb(qtype)` → 2 `nn.TransformerEncoderLayer` (pre-norm, 12 heads, FF 3072) → `scorer` (LN, Linear, GELU, Linear→1) at each option's `[MASK]` → softmax over the question's options. There is also an act/escalate head, which the card says carries no signal (#185). We drop it | `laya/common.py` `DecisionModel` |
| Input format (choice) | `[CLS] "choice question: <instructions>" [SEP] [MASK] opt0 [MASK] opt1 … [SEP] <state> [SEP]`. An option is `"key: description"`, or `"key"` when it has no description, each capped at 48 tokens. The state is a string, or JSON for dicts | `laya/common.py` `build_head` / `build_sequence` |
| Training | RLCD (policy gradient against proper scoring rules) + soft CE. A `soft-ce`-only objective is also supported. Their README says RLCD added nothing on typed-decisions (#741). Official fine-tuning: `laya.train.finetune`, notebooks | `laya/train.py`, GitHub README |
| Zero-shot | "Near chance" on typed-decisions (0.342 for multilingual). For us: dev acc 0.425 / term recall 0.688, eval acc 0.603 (lenient 0.603, strict 0.547) | card; `runs/zeroshot_*.json` |

Our code reuses the official package rather than re-implementing it: the model class, the checkpoint
I/O, `build_head`/`build_sequence`, and `rlcd_loss`/`soft_ce_loss` all come from `laya==0.4.4`.
`scripts/check_encoding.py` asserts that our encoder equals `laya.common.build_sequence` on 539
states. It also asserts that the official `laya.load(...).predict` returns the same probabilities as
our forward pass (max |Δp| = 0.0000).

## 2. Checkpoint choice and the tokenizer

We use the **multilingual** checkpoint, because the English one has a 50k BPE vocabulary built for
English. Tokens per whitespace word, measured with `scripts/tokenizer_stats.py`:

| Text | mmBERT (multilingual, 256k) | ModernBERT (English, 50k) |
|---|---:|---:|
| English contract sentences | 1.26 | 1.19 |
| Filipino contract sentences | **1.85** | 2.37 |
| Taglish | 1.59 | 1.56 |
| Fixture blocks, en / taglish | 1.44 / 1.79 | 1.43 / 2.01 |

mmBERT splits Filipino into sensible pieces (`▁partido`, `▁pamamagitan`, `▁araw`, `▁nito`, with
affixes like `Maa|aring`, `kas|und|uang`). The English tokenizer falls back to character
fragments (`M|aa|aring`, `Ġit|o`, `Ġa|raw`). Digits are one token each in mmBERT (`3|0`).
The laya-multilingual card lists `tl` among its languages.

## 3. Task encoding

- One `choice` question, using the **short head**: instruction `"Contract term type?"` and the 12
  labels as bare options. The head is 44 tokens. The descriptive head (the option text from the
  Qwen prompt) is 161 tokens. Fine-tuned, the two scored the same on dev (macro-F1 0.887 short
  vs 0.880 full), and the short head is about 3× fewer tokens per block, so it is about 2–3×
  faster. The full head is still available with `--head-style full`.
- State = the block, plus `" || earlier text: " + context` when the row has context (714 train
  rows). The app sends context only when `needsContext(text)` is true, and the data was built the
  same way.
- `max_len` 256, so 211 state tokens. Block length in train: p50 22, p99 86, max 121. Nothing is truncated.

## 4. Training (`scripts/train.py`)

Recipe: the official optimizer split (encoder lr 2.5e-5, head lr 1e-4, AdamW wd 0.01, clip 1.0,
cosine to 1e-6, plus 6% warmup) and **class-weighted CE**, with sqrt-inverse-frequency weights
(none = 0.59, others 1.0–1.3). We freeze the 256k×768 token embedding: it is 196.6M of the encoder's
307M parameters, and freezing it is what makes training fit in 6 GB. The run uses bf16 autocast,
gradient checkpointing (encoder and head), micro-batch 8 × accumulation 4, seed 13, and early stopping
on dev macro-F1 (evaluated 4× per epoch, patience 4). A single temperature is fitted on dev NLL inside
Laya's clamp [0.5, 5]. Peak VRAM is 2.5–3.2 GB, and a run of 2 epochs takes about 6–7 min.

The data is `ml/laya/data` from main @ 3b1af8f: train 4,834, dev 537 (different templates),
eval 161 (the app's 30 fixture contracts, no "none" rows, scored as correct when the prediction
is in `labels`). The model overfits the synthetic train set quickly (train loss reaches 0.01 within an
epoch), so 2 epochs is enough. A 6-epoch run early-stopped after epoch 1.

### Results (torch fp32 unless noted)

Term recall = gold is a term and the prediction is not "none". A term triaged as none is silently lost.

| Run | Vocab | Dev acc / macro-F1 / **term recall** (lost) | Eval acc (lenient) / **term recall** (lost) |
|---|---|---|---|
| zero-shot base | 256k | 0.425 / 0.368 / 0.688 (124) | 0.603 / 0.857 (23) |
| v1: full head, 6 ep (stopped at 1) | 256k | 0.896 / 0.883 / 0.945 (22) | 0.938 / 0.988 (2) |
| v2: short head, 2 ep | 256k | 0.894 / 0.887 / 0.985 (6) | 0.963 / 1.000 (0) |
| v3: short, pruned 27.6k (wc-m400) | 27.6k | 0.898 / 0.890 / 0.962 (15) | 0.907 / 0.981 (3) |
| **v3: short, pruned 43.4k (wc-m150)** | 43.4k | **0.911 / 0.900 / 0.993 (3)** | **0.957 / 0.994 (1)** |
| ↳ shipped `q4g` ONNX (94.8 MB) | 43.4k | 0.888 / 0.871 / 0.987 (5) | 0.950 / 0.994 (1) |
| ↳ `int8` ONNX (207.8 MB) | 43.4k | 0.909 / 0.895 / 0.985 (6) | 0.957 / 0.994 (1) |

Shipped model (`q4g`) by language, on dev: en 0.886 (term recall 0.996), fil 0.951 (1.000),
taglish 0.846 (0.958). On eval: en 0.942, fil 1.000 (n = 18), taglish 1.000 (n = 4). On dev,
"none" precision is 0.962 and recall 0.914, and term precision is 0.970. So about 3% of the blocks
sent to the explain pass are not terms, and the evidence gate and Qwen handle them. The weakest
labels are other/deliverables/ownership on dev (F1 0.69/0.69/0.68). On eval, strict scoring
(first label only) gives 0.863 because 39 eval blocks accept several types.

Caveats: these are single seeds, and dev has 537 rows, so 1 point is 5 blocks. The differences
between v2 and v3-wc150 are inside the noise. Dev and train are both synthetic.

### Confidence threshold (fallback to Qwen), shipped `q4g`

| threshold | dev coverage | dev acc on accepted | dev terms confidently "none" | eval coverage | eval acc on accepted |
|---:|---:|---:|---:|---:|---:|
| 0 | 1.000 | 0.888 | 5 | 1.000 | 0.950 |
| 0.5 | 0.968 | 0.902 | 3 | 1.000 | 0.950 |
| 0.7 | 0.909 | 0.932 | 1 | 0.988 | 0.956 |
| 0.8 | 0.870 | 0.942 | 0 | 0.975 | 0.968 |
| **0.85** | **0.853** | **0.948** | **0** | **0.957** | **0.974** |
| 0.9 | 0.825 | 0.957 | 0 | 0.919 | 0.980 |
| 0.95 | 0.756 | 0.978 | 0 | 0.882 | 0.986 |

**Recommendation: threshold 0.85.** Laya answers 85–96% of blocks at 95–97% accuracy. No term is
dropped as a confident "none" on dev or eval; such blocks go to Qwen instead. The full tables,
including a "none-only" policy that accepts any term label and gates only "none", are in
`runs/v3wc150_q4g_{dev,eval}.json`. With that policy at 0.8, coverage is 0.968 and zero terms are
lost, but accuracy is 0.894, because wrong-term labels are no longer sent to Qwen.

## 5. Export, size and latency

`scripts/export_onnx.py` produces one ONNX graph, exported with the dynamo exporter at opset 18
(the same opset the official `laya-ts` export uses). Batch and sequence are dynamic. The head and
markers are constants, and the act head is dropped. fp32 ONNX matches PyTorch to max |Δlogit|
2.6e-5 (batch 1) and 1.1e-5 (padded batch 2).

Quantization findings, on dev with the v3-wc150 fp32 model as reference:

| Variant | Size | Dev acc | Agreement with fp32 | Note |
|---|---:|---:|---:|---|
| fp32 | 607.8 MB | 0.911 | 1.000 | |
| `int8_all`: ORT dynamic INT8, every MatMul + Gather | ~150 MB | ~0.81–0.84 | ~0.83 | **broken**: GeGLU activation outliers in the 22 encoder `mlp.Wo` inputs. Per-tensor activation quantization destroys them (on v2s: 0.808) |
| `int8`: dynamic INT8, `mlp.Wo` kept fp32 | 207.8 MB | 0.909 | 0.972 | most accurate quantized variant, too big for the web |
| `q4`: 4-bit weight-only MatMulNBits b32 + INT8 embedding | 106.7 MB | 0.898 | 0.953 | |
| **`q4g`**: 4-bit MatMulNBits + 4-bit GatherBlockQuantized embedding | **94.8 MB** | 0.888 | 0.944 | **shipped**, fits the ~100 MB Vercel limit |

q4 block 16 and asymmetric variants made no measurable difference, within ±1 pt
(`scripts/quant_sweep.py`).

CPU latency for one block per call (median 66 / p95 90 tokens, ORT 1.31, i7-11800H), p50 in ms:

| Variant | 1 thread, median | 1 thread, p95 | 4 threads, median | 4 threads, p95 |
|---|---:|---:|---:|---:|
| fp32 | 188 | 271 | 98 | 136 |
| int8 | 97 | 134 | 53 | 70 |
| q4 | 273 | 328 | 108 | 143 |
| **q4g** | 266 | 339 | 106 | 132 |

On x86, 4-bit is slower than INT8 per call because MatMulNBits dequantizes and then runs fp32.
`accuracy_level=4` (int8 compute) was about 20% faster at 4 threads but is not validated for
accuracy. The full-head 256k model was 2–3× slower (161-token head). Phone latency has not been
measured.

## 6. Vocabulary pruning (`scripts/prune_vocab.py`)

Keep set = the tokens the full tokenizer emits on the corpus at least `min_count` times, plus all
special/added tokens, the byte-fallback tokens and all single characters below U+20D0, all closed
under BPE merge ancestry. Merges are kept only if both halves and the result are kept. As a result,
text whose full-vocab tokens are all kept tokenizes **identically** (asserted), and other text
splits into smaller pieces or bytes, never `<unk>`.

- Corpus for v1: Tagalog Wikipedia (60M chars), Simple English Wikipedia (60M chars) and CUAD v1
  contracts (25.6M chars, CC BY 4.0), downloaded to `checkpoints/corpus/`. They are used only to
  count tokens. Our train data is **deliberately not** in the corpus, so training sees the same
  token fragmentation that unseen user text will get.
- `min_count 150` keeps 43,398 of 256,000 tokens (17%) and 118,803 of 580,604 merges. The embedding
  goes from 196.6M to 33.3M parameters. `tokenizer.json` goes from 34.4 MB to 2.5 MB.
- **Pruning after training costs accuracy. Pruning before training does not.** Pruning the
  trained v2 model to a train-data-informed 31k vocabulary dropped dev from 0.894 to 0.868. Only
  52% of dev blocks tokenized identically, and the fine-tuned head is sensitive to re-segmented
  words. Training on the pruned vocabulary instead gave dev 0.911 at 43k and 0.898 at 27.6k,
  equal to or better than the full 256k vocabulary (0.894).
- Generalization was measured on eval, which is not in the corpus: 19% of eval blocks keep
  identical tokens, with 7.7% more tokens per block. Eval accuracy holds at 0.957 (torch). The 27.6k
  vocabulary was worse on eval (0.907, 3 terms lost), which is why 43k ships.
- `keep_ids.json` maps new id i to the original mmBERT id `keep[i]`. It is in
  `exports/vocab-wc-m150/` and git-ignored. Regenerate it with the command in §8.

## 7. Open risks

1. **The dev/eval domain is narrow.** Train and dev are synthetic, and eval is 161 fixture blocks,
   86% of them English. Real OCR'd contracts (noise, long clauses, mixed blocks) are untested.
   Taglish on dev is the weakest language (0.846 accuracy, 4 terms lost at threshold 0).
2. **Single seed** per configuration. There are no confidence intervals.
3. **The react-native ORT runtime (1.24.3) has not been run** with `MatMulNBits` and
   `GatherBlockQuantized`. Both exist in ORT ≥ 1.20 CPU EP and were verified only with
   onnxruntime-web 1.30 WASM in Node. If either op is missing on device, `q4` (106.7 MB, standard
   INT8 Gather) is the fallback.
4. **Phone latency is unknown.** Desktop is about 270 ms/block single-threaded for q4g. Use 4
   threads on the phone if possible.
5. **The 94.8 MB model is close to the ~100 MB static-upload limit.** If the limit is
   per-deployment rather than per-file, host the model elsewhere (GitHub release, HF).
6. **Temperature and threshold were fitted on dev**, which is synthetic. Re-check coverage and
   accuracy on real documents before trusting confidence.
7. **License obligations:** Apache-2.0 for Laya (include the license and attribution with the
   weights) and MIT for mmBERT. The CUAD corpus was used only to choose vocabulary, and none of its
   text ships.

## 8. Reproduce

```bash
cd ml/laya
python -m venv .venv && .venv/Scripts/python -m pip install torch==2.11.0 --index-url https://download.pytorch.org/whl/cu128
.venv/Scripts/python -m pip install -r requirements.txt
# base checkpoint (pinned) -> checkpoints/base-multilingual/{rl_agent_config.json,encoder/,tokenizer/,model.safetensors}
#   from https://huggingface.co/convaiinnovations/laya-multilingual/resolve/1720e3e3357cfe1e281542e223f8273b0890ca34/<file>
# corpus for pruning
.venv/Scripts/python scripts/corpus_from_wiki.py checkpoints/corpus/wiki_tl.parquet checkpoints/corpus/tl.txt
.venv/Scripts/python scripts/corpus_from_wiki.py checkpoints/corpus/wiki_simple_en.parquet checkpoints/corpus/en.txt
.venv/Scripts/python scripts/corpus_from_wiki.py checkpoints/corpus/cuad_v1.json checkpoints/corpus/cuad_en.txt
.venv/Scripts/python scripts/prune_vocab.py --tokenizer checkpoints/base-multilingual/tokenizer/tokenizer.json \
    --corpus checkpoints/corpus/tl.txt checkpoints/corpus/en.txt checkpoints/corpus/cuad_en.txt --min-count 150 --out exports/vocab-wc-m150
# train (about 7 min), evaluate, export, package, golden
USE_TF=0 .venv/Scripts/python scripts/train.py --data-dir data --out checkpoints/triage-v3-wc150 --prune exports/vocab-wc-m150 \
    --head-style short --max-len 256 --epochs 2 --evals-per-epoch 4
.venv/Scripts/python scripts/evaluate.py --checkpoint checkpoints/triage-v3-wc150 --data data/eval.jsonl
.venv/Scripts/python scripts/export_onnx.py --checkpoint checkpoints/triage-v3-wc150 --out exports/v3-wc150 --data data/dev.jsonl --variants q4g q4 int8
.venv/Scripts/python scripts/evaluate.py --export exports/v3-wc150 --variant q4g --data data/dev.jsonl
.venv/Scripts/python scripts/package_release.py --export exports/v3-wc150 --checkpoint checkpoints/triage-v3-wc150 --variant q4g --threshold 0.85 --out exports/release-laya-v1
.venv/Scripts/python scripts/make_golden.py --export exports/v3-wc150 --variant q4g --threshold 0.85 --out golden/laya-v1.golden.json
node js/check_golden.mjs exports/release-laya-v1 golden/laya-v1.golden.json <repo>/node_modules
```

`scripts/make_placeholder_data.py` builds a tiny smoke-test set from `tests/fixtures/contracts.ts`
into `data/placeholder/`, which is git-ignored and is **not** training data.
