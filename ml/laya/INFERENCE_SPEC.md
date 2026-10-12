# Laya triage, inference spec (laya-v1)

This document is the contract between the trained model and the JavaScript runtime
(`src/ai/classifier/*`). Following it exactly reproduces the Python reference
(`scripts/predict.py`) bit for bit up to the token ids, and to within float rounding for the logits.
Every number below comes from `release/laya-v1.spec.json`. The runtime should read that file
and not hard-code the values.

Verified in JS: `js/check_golden.mjs` runs this algorithm with `@huggingface/tokenizers` 0.2.0
and `onnxruntime-web` 1.30.0 (WASM). All 5 golden vectors pass, with ids identical and |Δlogit| ≤ 2e-5.
`js/check_tokenizer_parity.mjs` checks the JS and Python tokenizers against each other on all
6,321 train/dev/eval states and finds 6,321/6,321 identical.

## Files (release `laya-v1`)

| File | Bytes | SHA-256 | MD5 |
|---|---:|---|---|
| `laya-v1.q4g.onnx` | 99,393,827 | `e7d3f186514905b05dbdebc5da1cda15aa41aea7e9ef8016377d44cf0d34ecec` | `c0bfa57ff8a46cf044396d580bb7194b` |
| `laya-v1.tokenizer.json` | 2,508,750 | `5a6d8079dcaeec0d8982ed75c78a73d5cc00e1d2192020e1e454d6952def15f4` | `b1f34543d35a4314689315b6601fd862` |
| `laya-v1.tokenizer_config.json` | 239 | `f639700696789f5d36e0bcfa0ee647eeef9ca162a261de6ef3ef3a49e972256e` | `d1462fd313772e64360cc12abd71416e` |
| `laya-v1.spec.json` | 1,540 | `38120df60f0315fd70293c07bd00a1052ef9b249a4e407e7ae446d471a16972a` | `4be70b9be5a5fdcc05ef3db4beea22e0` |

The model file is named `q4g`, not `int8`. Its MatMul weights are 4-bit (`MatMulNBits`,
block 32, symmetric) and its token embedding is 4-bit (`GatherBlockQuantized`, block 32). Activations
stay fp32. Both ops are `com.microsoft` contrib ops: ORT ≥ 1.20 CPU EP and onnxruntime-web
WASM have them, and onnxruntime-web 1.30.0 was verified. onnxruntime-react-native 1.24.3 has
not been run on a device yet. `laya-files.json` needs `"fileName": "laya-v1.q4g.onnx"`. Small
files (`*.spec.json`, `*.tokenizer_config.json`, `release_manifest.json`) are committed in
`ml/laya/release/`. The `.onnx` and `tokenizer.json` are release assets and are not in git.

## Model I/O

- ONNX opset 18, one graph.
- Inputs: `input_ids` int64 `[batch, seq]` and `attention_mask` int64 `[batch, seq]`.
  Both dims are dynamic, with batch 1..64 and seq from `len(head_ids)+2` up to `max_len` (256).
- Output: `logits` float32 `[batch, 12]`, in `spec.labels` order.
- There is no `token_type_ids`, no text pair and no position ids. The question head and the 12
  option-marker positions are baked into the graph, so the runtime only builds `input_ids`.
- The app sends one block per call (batch 1, `attention_mask` all ones). Padded batches also
  work: pad with `pad_id` (0) and mask 0. Padded and unpadded results agree to about 1e-5.

## Algorithm

```
INPUT: text (the block), context (string or null; the app's existing context, i.e. the previous
       block's last ≤200 chars with "…", present only when needsContext(text) is true)

1. normalize(s) = s.replaceAll("<mask>", " ")
                   .replace(/[\t\n\u000b\u000c\r \u0085   -     　﻿]+/g, " ")
                   .replace(/^ +| +$/g, "")
2. state = normalize(text)
   if spec.use_context (true) and context and normalize(context) != "":
       state = state + spec.context_sep + normalize(context)        // context_sep = " || earlier text: "
3. stateIds = tokenizer.encode(state, { add_special_tokens: false }).ids    // NO special tokens
   stateIds = stateIds.slice(0, spec.room)                          // room = 211; keeps the START
4. input_ids = [...spec.head_ids, ...stateIds, spec.sep_id]         // sep_id = 1 (<eos>)
   attention_mask = all 1, same length                              // length ≤ max_len = 256
5. logits = model(input_ids, attention_mask)[0]                     // 12 floats
6. z = logits / spec.temperature                                    // 2.07
   p = softmax(z)                                                   // subtract max first
7. k = argmax(p); label = spec.labels[k]; confidence = p[k]
8. accepted = confidence >= spec.threshold                          // 0.85
   if !accepted: the app asks Qwen for this block's type (pass-1 fallback).
```

Notes:

- The tokenizer is `new Tokenizer(tokenizerJson, tokenizerConfigJson)` from `@huggingface/tokenizers`.
  It is a Gemma-style BPE with byte fallback and Metaspace, `prepend_scheme: "always"`. Encoding
  `state` with `add_special_tokens: false` adds the leading `▁` itself. Do not prepend a space.
- Unseen characters (emoji, rare scripts) become byte-fallback tokens. Nothing maps to `<unk>`.
  Golden case 5 covers this.
- Do not reuse the provisional `createHfEncoder` pair or truncation logic for this model. The
  layout is not `[CLS] a [SEP] b [SEP]`. The block comes first, then the context, both inside one
  segment. Truncation keeps the start, which is the block, so the context is what gets cut. In the
  data no block is cut: p99 is 86 tokens and the max is 121, against `room` 211.
- `argmax` does not depend on the temperature. The temperature only matters for `confidence` and
  therefore for `accepted`. Confidence is calibrated on dev (ECE 0.04).
- `head_ids` decode to `<bos> ▁choice ▁question : ▁Contract ▁term ▁type ? <eos> <mask> ▁payment _ condition <mask> … <mask> ▁none <eos>`.
  This is the official Laya `choice` encoding (`laya.common.build_head`, laya 0.4.4) of the
  question `"Contract term type?"` with the 12 labels as options. Each option is scored at its
  `<mask>` token (`marker_pos`).
- Never show "none" blocks as findings. Blocks that are terms continue to pass 2 (Qwen explain).
  The engine output must still pass `src/ai/evidenceGate.ts`, as for any model.

## Golden vectors

The full vectors are in `golden/laya-v1.golden.json`: text, context, state, `state_ids`, full
`input_ids`, logits (`q4g` and fp32), probabilities, label, confidence and accepted. Summary,
with ids after the 44 head ids and before the final `1`:

| # | text (context) | state ids | label (conf, accepted) |
|---|---|---|---|
| 1 | `The total fee is PHP 18,000, payable in two equal installments.` | `711 2818 8837 603 8162 39315 39268 39294 39341 39289 39296 39296 39296 39289 19485 575 1323 5989 4385 1101 39285` | payment_amount (0.9936, yes) |
| 2 | `Maaaring wakasan ng alinmang partido ang kasunduang ito sa pamamagitan ng nakasulat na abiso tatlumpung (30) araw bago nito.` | `33454 2814 14448 9886 2548 37504 25059 18637 2460 10279 1061 23367 21860 854 38787 2548 16371 508 23495 1509 830 8805 8926 38319 1035 591 39324 39296 39295 35765 38751 31143 39285` | termination (0.8422, **no**, so Qwen decides) |
| 3 | `Kung ma-late ang bayad, may penalty na ₱500 per week hanggang ma-settle ang balance.` | `27627 715 39310 5578 2460 9201 566 39289 1205 14434 1509 39268 40976 39328 39296 39296 831 2593 38413 715 39310 36500 2460 6635 39285` | late_fee (0.9920, yes) |
| 4 | `The balance is due within  seven (7)\n days after the Client approves the final design.` (context `…the Client shall pay a down payment of PHP 10,000 upon signing.`) | 44 ids, see JSON; state = `The balance is due within seven (7) days after the Client approves the final design. \|\| earlier text: …the Client shall pay a down payment of PHP 10,000 upon signing.` | due_date (0.9918, yes) |
| 5 | `SIGNED this 3rd day of March at Quezon City. — “Señora Dela Peña” 🙂` | `20211 39320 1536 731 39268 39324 1819 1656 576 4049 694 36174 3576 39285 1951 1052 2793 39446 2091 33150 3421 5211 39387 39268 457 376 370 347` | none (0.9912, yes) |

Logits for case 1, `q4g`:
`[-5.46439, 9.73733, -5.57357, -5.42617, -5.49455, -5.86309, -5.81632, -5.74473, -5.97115, -5.76088, -5.66229, -5.59498]`.

To re-check after any change:
`node ml/laya/js/check_golden.mjs <dir with release files + triage_spec.json> ml/laya/golden/laya-v1.golden.json [node_modules]`.
