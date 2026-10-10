# SkimCare

**You skim. We read every line.** — *Unawain bago pirmahan.*

SkimCare reads the agreement you are about to sign, on your phone. On-device text recognition and a small quantized language model find the terms that matter (fees, due dates, renewals, penalties), explain them in plain English or Filipino, and link every explanation to the exact sentence it came from. Nothing is uploaded: no cloud AI, no accounts.

> SkimCare is a document comprehension and legal-information aid. It is not legal advice, and it never says whether to sign.

Team **ESG**'s entry to the **AppBuildersPH Hackathon 2026 · Theme: Local AI**, by Christian Raro and Glenn Viola. Submission details: [`docs/SUBMISSION.md`](docs/SUBMISSION.md). Change log: [`PROGRESS.md`](PROGRESS.md).

## Try it

| | Link | Notes |
|---|---|---|
| **Android app (APK)** | **[APK link — added when the EAS build finishes]** | arm64 phones. After installing, add the model file (below). |
| Web app | https://skimcare-app.vercel.app | Same app in the browser, for iPhone users. |
| Landing page | https://skimcare.vercel.app | Includes an animated walkthrough of the screens. |

**Add the model to the Android app** (≈400 MB, once; it is not bundled in the APK):
1. On the phone, download [`Qwen3-0.6B-Q4_K_M.gguf`](https://huggingface.co/unsloth/Qwen3-0.6B-GGUF/resolve/50968a4468ef4233ed78cd7c3de230dd1d61a56b/Qwen3-0.6B-Q4_K_M.gguf) (pinned revision).
2. In SkimCare, open **Settings › On-device AI › Import model file** (the same card appears on the readiness screen) and pick the file. The app checks its size and MD5, then copies it into private storage.
3. The readiness check runs again. When every check passes it says **Ready to work offline**. From then on you can switch on airplane mode.

Built-in **sample agreements** (fictional) are under **Start a review › Try a sample agreement**.

## How it works

```
Scan / import ──▶ OCR on device ──▶ you confirm amounts, dates, names
                                              │
          ┌───────────────────────────────────┘
          ▼
 local model (Qwen3 0.6B, llama.cpp) ──▶ evidence gate ──▶ findings + explanations
   one document block at a time,          every output must     linked to the source
   grammar-constrained JSON               cite a real block      sentence
                                          and quote it, or       ▼
                                          it is discarded     What-if math by fixed
                                                              rules, never the model
```

- **OCR:** Google ML Kit Text Recognition v2, bundled (`modules/local-ocr`), plus the ML Kit document scanner. Digital PDFs use their text layer. Web: tesseract.js (eng + fil) and pdf.js.
- **Model:** Qwen3 0.6B (Q4_K_M GGUF) through llama.rn on Android, and @wllama/wllama (llama.cpp WebAssembly) on the web.
- **Evidence gate:** `src/ai/evidenceGate.ts`. **Scenario math:** `src/ai/scenarioRules.ts`. Missing terms return "insufficient information".
- **Storage:** reviews encrypted with SQLCipher; the key is kept in the OS keystore.
- **Readiness:** the app checks the model checksum, storage, an OCR self-test and an inference smoke test before it claims offline readiness.

### What runs locally, what needs internet

| On the device (works in airplane mode) | Needs internet |
|---|---|
| OCR, document scanning, PDF text | Downloading the model once (Hugging Face) |
| Language model inference | Installing the APK / first load of the web app |
| Evidence checks, explanations, questions to ask | ML Kit usage statistics when online (device info and error codes, never document text) |
| What-if calculations, encrypted storage | |

No document text, prompt or model output is ever sent anywhere.

## Status (Oct 10)

- **Working:** all 19 screens. On a real Android phone (TECNO Spark 50 5G), offline inference ran with every readiness check passing. Evidence gate, deterministic what-ifs, English and Filipino copy, encrypted storage, and the web app with its in-browser engine.
- **In progress:** speed on budget phones (2–3 tokens/s on the test phone while it was throttled). ML Kit OCR on real-world scans. The airplane-mode rehearsal.
- **Extraction quality** on 30 fictional agreements (10 service, 10 installment, 5 mixed English/Filipino, 5 with hidden instructions aimed at AI), measured on a laptop with the same model and prompt: 71% of labelled terms found, 74% of reported findings correct, all 5 hidden instructions skipped. Reproduce with `npm run eval:llm`; details in [`docs/LOCAL_LLM.md`](docs/LOCAL_LLM.md).
- A clearly labelled **Demo engine** with fictional findings exists for UI work (`EXPO_PUBLIC_ENGINE=demo`). Any screen showing its output says so.

## Build it yourself

Requirements: Node 20+, npm, and for Android an [Expo account](https://expo.dev) (EAS Build) or a local Android SDK.

```bash
npm install          # also applies patches/ (llama.rn: no prompt or token text in native logs)
```

**Android APK (cloud build, real engine):**

```bash
npx eas build -p android --profile preview
```

`preview` builds an arm64 APK with `EXPO_PUBLIC_ENGINE=local`. (`preview-demo` builds the same with the Demo engine.) Install the APK, then add the model as in **Try it**. With adb and a debug build you can also push the model; see [`docs/LOCAL_LLM.md`](docs/LOCAL_LLM.md).

**Local development build:**

```bash
npm run android      # expo run:android: builds and installs a dev build on a connected phone
```

**Web app:**

```bash
EXPO_PUBLIC_ENGINE=local npm run web
```

The production web build copies the pinned engine files to our own origin, exports and adds an offline service worker:

```bash
node scripts/copy-web-assets.mjs && npx expo export -p web && node scripts/build-sw.mjs
```

It must be served with COOP/COEP headers (see `vercel.json`) for multi-threaded WebAssembly.

**Checks:**

```bash
npm run typecheck && npm test && npm run lint
```

## Project layout

```
src/app/            Expo Router screens (S01–S19), one file per route
src/components/     UI kit (ui/, glass/) + shared composites (FindingCard, DemoBanner…)
src/theme/          Design tokens
src/i18n/           English + Filipino copy
src/domain/         Zod schemas = the inference contract & data model
src/ai/             Engines (local, web, demo), evidence gate, scenario rules, pipeline
src/ai/llm/         llama.rn runtime, prompts, chunking, parsing, model pins
src/features/       Stores (documents, review job, storage, model import)
src/db/             Encrypted SQLCipher storage
modules/local-ocr/  Native ML Kit OCR module
site/               Landing page (static, deployed on Vercel)
scripts/            Eval harness, web asset and service-worker builders
tests/              Unit tests
docs/               Architecture, local LLM notes, submission pack
```

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for how the pieces fit together.

## Disclosures

Models, frameworks, cloud services, existing assets and AI development tools are listed in [`docs/SUBMISSION.md`](docs/SUBMISSION.md). In short:
- **Model:** Qwen3 0.6B (Apache-2.0, Unsloth GGUF).
- **AI runs:** on the device only.
- **Cloud services:** Hugging Face (model download), Vercel (hosting), EAS (APK build). No AI APIs.
- **AI development tools:** ChatGPT (product spec), Google AI Mode (pipeline blueprint), Gemini, Claude Code with ECC, Impeccable, Jev and multi-agent workflows (code, design, QA). Every Claude Code change is logged in `PROGRESS.md`.

## Contributing

1. Branch from `main` (`feat/…`, `fix/…`).
2. Keep the guardrails in `CLAUDE.md`: no network calls with document content, all model output through the evidence gate, money/date math only in `scenarioRules.ts`, Demo engine output always labelled.
3. Run typecheck, tests and lint.
4. **Add an entry to `PROGRESS.md`** in the same commit.
