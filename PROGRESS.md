# PirmaBago — Progress Log

Shared log for everyone working on this repo. **Every change gets an entry.**
Newest entries go on top. Keep entries short and factual.

## How to log

Add an entry under **Log** for each working session or PR:

```md
### YYYY-MM-DD — <your name> — <short title>
- What changed (files / features)
- Status: done | in progress | blocked
- Verified: typecheck / tests / lint / device / web (what you actually ran)
- Next / handoff notes
```

Then update the **Milestone tracker** and **Screen tracker** tables if status changed.
Rules: don't log secrets or real contract text; note anything deferred honestly.

---

## Handover — backend (2026-10-09)

Frontend work is **paused** here; the backend/on-device AI moves to the co-developer. Everything below is on `main` (latest: glass navigation, `0d16347`).

**State of the app**
- All 19 H1 screens + diagnostics are built and run on the **Demo engine** (fictional sample contracts, always labelled "Demo engine"). No real OCR, LLM or encrypted storage yet.
- Display name is **SkimCare** (formerly PirmaBago); slug, scheme and Android package still `pirmabago`.
- Checks: `npm run typecheck`, `npm test` (45 tests), `npm run lint` — all green at handover. Web preview: `npm run web`. Native modules need a dev build: `npx expo run:android`.

**Where the backend plugs in (no screen changes needed)** — see `docs/ARCHITECTURE.md` › "Swap points"
1. **LLM** — implement `LlmEngine` (`src/ai/engines.ts`) with llama.rn + GGUF (Qwen3 0.6B/1.7B candidate). Return raw candidates; never bypass `src/ai/evidenceGate.ts`.
2. **OCR** — implement `OcrEngine` via `modules/local-ocr` (bundled ML Kit Text Recognition v2; contract in its README). Digital PDFs already use the text layer (`src/ai/recognize.ts`).
3. **Readiness** — `InferenceEngine.checkReadiness`: model present, checksum, warm load, tiny inference. Only report `offlineReady: true` when real checks pass.
4. **Switch engines** in one place: `getEngine()` in `src/ai/demoEngine.ts`.
5. **Storage** — implement `DocumentRepository` (`src/db/repository.ts`) with expo-sqlite + SQLCipher, key in expo-secure-store, encrypted page files; back `src/features/documents/store.ts` (and settings, so onboarding persists).
6. **Reviews** run through `src/features/review/jobStore.ts` (one at a time, minimizable); `runAnalysis` in `src/ai/pipeline.ts` is the entry point.

**Priority order (PRD §18):** Milestone 1 (real llama.rn extraction offline on the demo phone) is the top risk — prove it before more UI. Then OCR bridge, then SQLCipher, then airplane-mode rehearsal.

**Untested on device (first dev build checklist):** expo-document-scanner (needs one online launch for Google Play services), expo-pdf-text-extract (New Architecture support undocumented), Android Dimezis glass blur performance, headless glass tab bar.

**Rules to keep** (also in `CLAUDE.md`): no network calls with document content; all model output through the evidence gate; money/date math only in `scenarioRules.ts`; never present demo output as real; never call a clause legal/illegal or say whether to sign; **log every change in this file**.

---

## Backend status & next steps (2026-10-10, Glenn)

Branch `feat/local-llm-engine`, merged to `main` (PRs #1, #2). Details are in the log entries below.

**Finished**
- **Real on-device AI:** llama.rn 0.12.9 + Qwen3 0.6B GGUF, opt-in with `EXPO_PUBLIC_ENGINE=local`; the Demo engine is still the default.
  - Per-block extraction with the citation filled in by code. Evidence gate, verdict filter and injection skip.
  - Understand-It-Back quiz.
  - Readiness checks: model file, MD5, storage, OCR self-test, smoke inference.
- **Physical phone (TECNO Spark 50 5G, Android 16):** arm64 build installed, model and OCR run offline, **readiness passes ("Ready to work offline")**.
- **On-device OCR** (`modules/local-ocr`, bundled ML Kit): photos (EXIF + rotation), scanned PDFs, mixed PDFs (only image pages OCR'd). Reading order, sentence blocks, bboxes, digit repair ("6,40o" → "6,400", always flagged). Verified on the emulator, plus a real 10-page signed contract read with counts only.
- **Privacy:** three llama.rn native log leaks patched (prompt tokens, token text on error, every model reply) and verified in the built libs and logcat. Recognized text is never logged. The dev `[ocr-stats]` line prints counts only.
- **Stability:** all model calls serialized (concurrent calls crashed natively).
- **Quality tooling:** 30-contract fictional eval set; `npm run eval:llm` (localhost llama.cpp, fictional fixtures only) reports precision, recall and generated tokens.

**Current numbers** (30-contract eval, Qwen3 0.6B Q4_K_M, PC)

| Prompt | Precision | Recall | Tokens per call |
|---|---|---|---|
| `extract-v3` | 79% | 75% | 94.6 |
| **`extract-v4`** (current) | 74% | 71% | **78.6** (−17%) |

- Injection text cited: 0 in both.
- The quality drop is mostly wrong type labels: 38 vs 29.
- On the phone, a review is **too slow**: 2–3 tok/s, 40–80 s per block, because the phone was thermally throttled and swapping. A 10-page contract is ≈138 model calls.

**Next, in order**
1. **Phone speed:**
   - Run the device bench cool and unplugged as much as possible: `pirmabago://diagnostics?bench=1`, see `docs/LOCAL_LLM.md`.
   - Set `CPU_SETTINGS` (try 2 threads on the fast cores) and pick Q4_0 vs Q4_K_M. Also run `npm run eval:llm` with the Q4_0 GGUF to check quality.
   - Re-run the fictional test review on the phone and record the time.
2. **Architecture for long contracts:** per-block explanations don't scale to 100+ blocks on a 4 GB phone.
   - Fast pass first: type/relevance only (a few tokens per block). Then explain important blocks first (amounts, dates, needs_attention).
   - Show findings progressively. The UI part needs Chris.
3. **Recover type accuracy** lost in `extract-v4` (wrong types 29 → 38), e.g. one-line type hints back, or a keyword check when the model's type contradicts the block.
4. **Document-type guess:** count keyword hits instead of first match (a real services contract was guessed as "employment").
5. **In-app model import** (Android Files picker → app storage → checksum), so the model can be installed without adb. Decide whether to bundle it in the APK (+≈380 MB).
6. **Privacy copy:** disclose ML Kit usage metrics (no content is sent) in the welcome/privacy text, as the ML Kit terms require (with Chris).
7. **Milestone 4:** SQLCipher storage and encrypted files, then an airplane-mode rehearsal on the phone.
8. **iPhone (phase 2, outside PRD H1):** needs EAS Build or a Mac plus an Apple Developer account; Apple Vision OCR; llama.rn built from source (`RNLLAMA_BUILD_FROM_SOURCE=1`, so the log patches apply); in-app model import.

**For Chris (UI):** ✅ all done 2026-10-10 (picker errors, plural, per-section progress, readiness recheck, PDF copy, confirmed-button box, require cycle, ML Kit disclosure); see the log entry "UI fixes Glenn flagged".

**Housekeeping:** fictional test files are on the test phone (`Download/SkimCare-test-scanned.pdf`, `Pictures/SkimCare-test-photo-exif.jpg`). A copy of Glenn's signed contract is in the repo root, untracked; never commit it.

---

## Milestone tracker (PRD §18)

| # | Milestone | Status | Notes |
|---|-----------|--------|-------|
| 0 | Project setup, UI/UX design system, frontend structure | ✅ Done | Expo SDK 57, Router, all 19 H1 screens on Demo engine; Liquid Glass UI (floating tab bar, glass header, real Android blur); landing page in `site/` |
| 1 | Prove local AI — llama.rn + GGUF extraction offline on device | 🟨 Mostly done | Engine, eval set and llama.rn integration done; **real phone (TECNO Spark 50 5G): arm64 build, readiness all pass, offline inference ✅**; native log leaks patched; `extract-v4` precision 74% / recall 71% (v3: 79/75); **open: speed on the phone** (2–3 tok/s while throttled; device bench, CPU settings, Q4_0, fast-pass architecture; see "Backend status & next steps") |
| 2 | Prove document evidence — bundled ML Kit OCR, stable block IDs | 🟨 Partial | Evidence gate + source viewer done; digital-PDF text layer ✅ on emulator; **bundled ML Kit OCR (`modules/local-ocr`) ✅ on emulator** for scanned PDFs (stable `p{page}_b{n}` blocks, bboxes, digit repair); still to verify: photos/scanner capture on device, real phone (arm64), real-world scans |
| 3 | Prove differentiated UX — scenarios, Understand-It-Back, questions | 🟨 Partial | UI + deterministic rules done; local Understand-It-Back generation done (`src/ai/llm/comprehension.ts`); needs real model output |
| 4 | Prove reliability — SQLCipher, encrypted files, airplane-mode rehearsal | ⬜ Not started | Store is in-memory today (`src/db/repository.ts` contract) |

## Screen tracker (PRD §07)

| ID | Screen | Route | Status |
|----|--------|-------|--------|
| S01 | Launch | `src/app/index.tsx` | ✅ UI |
| S02 | Welcome & privacy | `src/app/welcome.tsx` | ✅ UI |
| S03 | Model readiness | `src/app/readiness.tsx` | ✅ UI (Demo engine reports not-ready, by design); local engine runs real checks (model, MD5, storage, OCR self-test, inference) — all pass on the emulator |
| S04 | Home | `src/app/(tabs)/index.tsx` | ✅ UI |
| S05 | Add document | `src/app/review/new.tsx` | ✅ UI (scan / gallery / PDF wired) |
| S06 | Capture | `src/app/review/capture.tsx` | ✅ ML Kit document scanner, camera fallback (device test pending) |
| S07 | Preview | `src/app/review/preview.tsx` | ✅ UI; digital PDFs via text layer, scanned/mixed PDFs via on-device OCR (local engine) |
| S08 | OCR verification | `src/app/review/verify.tsx` | ✅ UI |
| S09 | Analysis preferences | `src/app/review/preferences.tsx` | ✅ UI |
| S10 | Processing | `src/app/review/processing.tsx` | ✅ UI |
| S11 | Overview | `src/app/doc/[id]/index.tsx` | ✅ UI |
| S12 | Terms & obligations | `src/app/doc/[id]/terms.tsx` | ✅ UI |
| S13 | Finding detail | `src/app/doc/[id]/finding/[findingId].tsx` | ✅ UI |
| S14 | Original viewer | `src/app/doc/[id]/source.tsx` | ✅ UI (text view; image bbox overlay pending) |
| S15 | What-if explorer | `src/app/doc/[id]/what-if.tsx` | ✅ UI |
| S16 | Understanding check | `src/app/doc/[id]/check.tsx` | ✅ UI |
| S17 | Questions to ask | `src/app/doc/[id]/questions.tsx` | ✅ UI |
| S18 | My Documents | `src/app/(tabs)/documents.tsx` | ✅ UI |
| S19 | Settings | `src/app/(tabs)/settings.tsx` | ✅ UI |
| F17 | Inference diagnostics | `src/app/diagnostics.tsx` | ✅ UI |

---

## Log

### 2026-10-10 — Claude (with Chris) — Landing page ready for Vercel
- Repo is private (now `chrisraro/SkimCare`), so the page no longer links to it: removed "Read the source on GitHub", the footer repo link and the GitHub Releases download link (all would 404 for visitors). Removed the `[TEAM NAMES]` placeholder.
- Signing clause: download button is now a non-clickable "Android build coming soon" (`.btn-soon`) with "The download goes live with the first public release." Witness line reads "AppBuilders PH Local AI Hackathon". Swap in a real `<a class="btn btn-primary">` when a public APK exists.
- Added `site/vercel.json`: CSP (only `main.js` + Google Fonts; `'unsafe-inline'` styles for inline style attributes; `frame-ancestors 'none'`), `nosniff`, `Referrer-Policy`, `Permissions-Policy`, clean URLs.
- Removed the GitHub Pages workflow (`.github/workflows/pages.yml`) and `site/.nojekyll`: deploying with Vercel instead.
- `site/README.md`: Vercel settings (Root Directory `site`, preset Other, no build, no env vars, Ignored Build Step `git diff --quiet HEAD^ HEAD -- .`).
- Verified: page loaded with the CSP enforced in a headless browser: 0 violations, both fonts load, 7/7 clauses reveal, no GitHub links left. `npm run typecheck` ✅, `npm test` ✅ (162), `npx eslint site/main.js` ✅. `npm run lint` ❌ pre-existing on main (not from this change): `import/no-unresolved` for `expo-file-system` and `llama.rn` — those packages aren't installed locally; run `npm install` after pulling the local-LLM PR.
- Next (Chris): create the Vercel project with the settings above; check the live URL on desktop + phone.

### 2026-10-10 — Claude (with Glenn) — First run on a physical phone; speed work (extract-v4, 2048 context, boilerplate skip, device bench)
- **Physical phone:** TECNO Spark 50 5G (MediaTek MT6835: 2×A76 2.5 GHz + 6×A55 2.0 GHz, arm64 with dotprod, no i8mm; 3.7 GB RAM; Android 16).
  - USB debugging first failed: Windows saw no device at all (cable or USB mode); it worked after reconnecting.
  - arm64 debug build: 27 min (llama.rn source build compiles 7 ARM variants). All carry the log patches (strings checked in the APK).
  - Installed with `adb install`; model copied via `run-as` (MD5 matches).
  - **Readiness: all checks pass, "Ready to work offline"**: model, MD5, storage, OCR self-test, inference (load 9.3 s, smoke test 4.9 tok/s).
- **Review on the phone is too slow:** fictional 2-page scanned contract, cancelled after 11 of ≈16 model calls (≈10 min).
  - Generation 2–3 tok/s, prompt 6–27 tok/s, 40–80 s per block.
  - Cause: **thermal status 3 (severe)**; CPU 61–64 °C, skin 53 °C, every core capped at 1.4 GHz. Plus **memory exhaustion**: 74 MB free, 1.7 GB swap; the app held 850 MB. The phone was charging over USB at 370% CPU.
- **Speed changes** (JS only, no rebuild needed):
  - `src/ai/llm/llamaRuntime.ts`: `n_ctx` 4096 → **2048** (≈235 MB less KV cache). Added `CPU_SETTINGS` (threads, core mask; empty = llama.rn default until the bench decides). Added `benchmark()`: llama.cpp's synthetic bench through the serial queue, no document text.
  - `src/ai/llm/devBench.ts` + `src/app/diagnostics.tsx`: dev-only trigger `pirmabago://diagnostics?bench=1` (lazy import, `__DEV__` and local engine only), printing `[bench]` lines to Metro. Not run yet: the phone was still at thermal status 3.
  - `src/ai/llm/prompt.ts` **`extract-v4`**:
    - The model no longer writes `uncertainty` or `normalized_value`; at most 1 question; title ≤ 8 words with no amount in the examples; explanation ≤ 25 words.
    - The "earlier text" context is capped at its last 300 characters (`CONTEXT_CHARS`).
    - Output cap 384 → 200 tokens (`localLlmEngine.ts`).
    - The parser ignores fields outside the schema.
  - `src/ai/llm/chunking.ts`: skips signing/notarial boilerplate (notary public, subscribed and sworn, Doc./Page/Book No., Series of, IN WITNESS WHEREOF, in the presence of, ID-number lines, "Republic of the Philippines") and **short lines repeated on 2+ pages** (letterheads, footers, "Page 3 of 10"). Long repeated sentences are still sent. The eval-set test confirms no labelled term is skipped.
  - `src/ai/llm/models.ts`: Q4_0 GGUF downloaded from the pinned revision; SHA-256 matches; **MD5 `14d5eac0…` pinned**. Copied to the test phone, not yet the default.
- **Eval** (`scripts/eval-extraction.ts` now reports generated tokens; v3 re-measured from a temporary worktree):
  - v3: precision 79%, recall 75%, 94.6 tokens per call.
  - First v4: 78% / 70% / 82.4. Short "key detail" titles made the model borrow amounts into titles (18 gate rejections; one title copied the prompt example).
  - **Final v4: 74% / 71% / 78.6 (−17%)**; amount rejections 9, injection cited 0, wrong types 38 (v3: 29).
  - Kept for speed; recovering type accuracy is on the next-steps list.
- Docs: `docs/LOCAL_LLM.md` (phone numbers, device bench, context size), `docs/ARCHITECTURE.md` (LLM row). `docs/local-ai-pipeline-blueprint.pdf` (added by Glenn) is committed as a general reference. Where SkimCare differs:
  - The model is not bundled through Metro (+≈380 MB per APK); it's placed separately and checksummed.
  - Its scan-quality ratio counts ₱, ñ and curly quotes as garbage, so it would reject Filipino contracts.
  - OCR is our own bundled ML Kit module.
  - Prompts already restrict the model to the cited block, with grammar-constrained JSON.
- Verified: typecheck ✅, tests ✅ 162/162 (new: boilerplate/repeated-line skip, context cap, schema-only fields), lint ✅; phone runs as above.

### 2026-10-10 — Claude (with Glenn) — Real-contract OCR benchmark, llama.rn concurrent-call crash fixed, dev OCR stats
- **Crash fixed:** two model calls at once crash llama.rn natively (SIGSEGV, null dereference in `llm_graph_context::build_inp_out_ids`). Seen on the emulator when "Run checks again" was tapped while readiness was still running. The same would happen if readiness ran during a background review. `src/ai/llm/llamaRuntime.ts` now runs every model operation (load, completion, release) through one serial queue.
  - `tests/llamaRuntime.test.ts` uses a fake llama.rn: at most 1 operation in flight, and the queue keeps working after a failed call. The test fails without the queue (4 overlapping).
  - Emulator: double-tapping "Run checks again" gives no crash; the 3 smoke tests ran one after another.
- **Dev-only OCR stats:** `src/ai/ocr/devStats.ts`, printed as one `[ocr-stats]` line in the Metro log by S07 in `__DEV__` builds. Counts and confidences only, never text, so real documents can be measured without their content showing up anywhere.
- **Benchmark on a real document:** Glenn's 10-page signed services contract, an image-only scan. The file is kept outside the repo and never committed, and its text wasn't viewed during the test.
  - 10/10 pages read, none empty; 203 blocks, ≈3,300 words.
  - 74–92 s on the emulator (≈7–9 s/page with the PC under load); deterministic across two runs.
  - 36 critical blocks (17 with PHP amounts).
  - Confidence: median 0.86, mean 0.84, p10 0.74, min 0.36. 10 blocks below 0.7, none of them critical.
  - 0 digit repairs; 11 tokens mixing letters and digits (possible misreads or codes); 0 blocks flagged as AI instructions (no false positives).
  - 138 blocks would go to the model.
  - **Type guess wrong:** "employment". `guessDocumentType` takes the first keyword match, and services contracts often say "no employer-employee relationship". Fix: count hits per type. The user can already correct it on S09.
  - OCR accuracy against the paper still needs Glenn's own check on S08.
- **Review speed problem:** a full 138-block review on the emulator slowed from ≈8 to 0.8 tok/s because the PC had 0.5 GB free and the emulator was swapping (≈1 GB). Not workable on the emulator. Planned optimizations:
  1. `n_ctx` 4096 → 2048, saving ≈235 MB of KV cache.
  2. Skip boilerplate and page headers/footers repeated on every page.
  3. Shorter model answers (flatter JSON, one-sentence explanation, at most one question), checked with `npm run eval:llm`.
  4. llama.rn parallel slots (`context.parallel`, `n_parallel`) on the phone.
  5. Q4_0 on ARM.
  6. Progressive results with critical blocks first (needs Chris for the UI).
- Dev gotcha: editing code while a recognition runs makes Fast Refresh reload the JS, which drops the in-flight recognition (it stopped after page 5). Don't edit during device runs.
- Verified: typecheck ✅, tests ✅ 160/160, lint ✅; emulator runs as above.

### 2026-10-10 — Claude (with Glenn) — On-device OCR (bundled ML Kit), scanned & mixed PDFs, digit repair; second native log leak fixed
- **`modules/local-ocr` (new Expo module, Android/Kotlin):** bundled ML Kit Text Recognition v2, Latin (`com.google.mlkit:text-recognition:16.0.1`). The model ships in the APK (≈13 MB per ABI: 11 MB `.so` + 2 MB models).
  - `selfTest()` draws a test string and reads it back.
  - `recognizeImage(uri, rotation)` applies EXIF orientation plus the user's rotation; the long side ends up between 1600 and 3200 px.
  - `pdfPageCount` / `recognizePdfPage` render a page in memory with `PdfRenderer` (white background, 2400 px), never written to disk.
  - Errors are codes only; recognized text is never logged. Contract and privacy notes are in the module README.
  - `.gitignore` now ignores `modules/*/android/build/`, which Gradle creates inside local modules.
- **`src/ai/ocr/layout.ts`** turns ML Kit lines into evidence blocks:
  - Reading order: top to bottom; side-by-side regions (columns, signature blocks) left to right.
  - Splits at sentence ends, headings and clause numbers (`1.`, `2.3`, `(a)`, but not "15 days"), and rejoins a sentence split across regions. Hyphenated breaks are joined.
  - Normalized bbox; confidence is that of the weakest line; same `critical` rule as the PDF text layer.
  - **Digit repair:** inside a token that is otherwise a number, look-alike letters become digits ("PHP 6,40o" → "PHP 6,400", "1oth" → "10th", "2o26" → "2026"). This happens only when the result is a well-formed number; words, codes and "4,000only" are never touched. A repaired block's confidence is capped at 0.5, so S08 always shows it as "Hard to read" and asks the user to check it. Found on the emulator: without the repair, "PHP 6,40o" parses as **PHP 640**.
- **`src/ai/ocr/mlKitOcr.ts`** is the `OcrEngine`: page by page, cancel between pages, scanned PDFs over 30 pages refused, user messages without document text. New optional `OcrEngine.recognizePdf`.
- **`src/ai/recognize.ts`:**
  - Scanned PDF → on-device OCR.
  - Mixed PDF → text layer plus OCR for the image-only pages only; source is reported as `ocr`.
  - Pages with no readable text are named in the note.
  - The Demo engine gets no "read on this phone" note.
- **Local engine:** uses ML Kit when the module is linked, otherwise refuses photos and scans with a clear message. Readiness "On-device text recognition" is now a real self-test, not "is linked".
- **Evidence gate fix:** a low-confidence critical block the user **confirmed** ("Matches the paper") no longer turns findings into "Cannot verify". The gate only checked `correctedAt`; `ARCHITECTURE.md` and the S08 copy already said "not verified". Test added.
- **Extraction:** numbered section headings ("2. MONTHLY INSTALLMENTS") are skipped like other headings, saving one model call each.
- UI copy (small): the S08 note banner is `info` (not `success`) when OCR was used; the S07 PDF banner mentions scanned pages only when the engine can read them.
- **Emulator verification** (fictional 2-page installment contract, made with headless Chrome, never real data):
  - **Readiness: every check passes → "Ready to work offline"**, the first time on any device.
  - **Image-only PDF** (tilted 0.5–0.7°, slight blur, Georgia old-style numerals): OCR ≈2 s/page. Text exact except digit look-alikes, which the repair fixed and flagged. Type detected as installment. Full review after confirming the 5 details: 9 terms, 6 to clarify, 0 cannot verify, 1 discarded, 3 quiz items. Findings carry the repaired amounts correctly ("PHP 6,400 paid upon signing", "PHP 32,000 … PHP 4,000 each, due on the 10th").
  - **Mixed PDF** (page 1 text, page 2 image): note "Page 2 is a scan…", page 1 exact. Full review: 9 terms, 3 quiz items.
  - ML Kit logs only "OCR process succeeded" (no text).
- ⚠️ **Second native privacy leak — fixed:** llama.rn's chat parser can't parse Qwen3's output (empty `<think></think>` prefix) and logged the **whole model reply at WARN on every call** (`cpp/common/chat.cpp:3566`): explanations with party names and amounts. `patches/llama.rn+0.12.9.patch` now covers `chat.cpp` too (lengths only; DEBUG lines with the full output and parsed message removed). Verified in the rebuilt APK (old strings absent) and at runtime: 16 calls, logcat shows only token/char counts. `docs/LOCAL_LLM.md` updated with a re-check procedure for upgrades.
- **Speed:** llama.rn reuses the KV cache for the shared system prompt. Only the first call evaluates ≈690 prompt tokens (30 s); later blocks evaluate ≈60–70 (≈4 s). Generation (≈110 tokens at 8 tok/s on the emulator) dominates: ≈5 min for a 2-page contract on the emulator.
- **ML Kit metrics:** inputs and outputs stay on the device (ML Kit terms), but when online ML Kit sends usage metrics (device/app info, sizes, error codes) to Google. The terms require disclosing this to users, so the privacy copy needs a line. Decision for Glenn/Chris: disclose only, or also try blocking it.
- Notes for Chris:
  - `pickPdf` (S05) doesn't catch `getDocumentAsync` rejections. After the system picker crashed once on the emulator, the next tap raised "Different document picking in progress" as an uncaught error.
  - The Overview says "1 outputs were discarded" (plural).
  - S05's "Import PDF — Digital PDFs are read exactly, no scanning needed" could now mention scans.
  - The processing screen has no per-block progress, although `onProgress` exists.
- Not done: photos/gallery and the document scanner through OCR on the device (only PDFs exercised); arm64 build on the real phone; OCR quality on real-world scans and photos. The user's signed contract is the planned benchmark, run on the device only and reported as counts, not text.
- Verified: typecheck ✅, tests ✅ 158/158 (new `ocr` 16; `recognize` +3; gate, chunking and eval checks extended), lint ✅; Android debug build ✅ (x86_64); emulator runs as above.

### 2026-10-10 — Claude (with Glenn) — Extraction quality pass: per-block prompting, eval harness, injection skip (extract-v3)
- **Why:** the first on-device review found 1 of 5 terms. Scored on all 30 fictional eval contracts, `extract-v1` (one call per page) had recall 12%.
- **Results** (Qwen3 0.6B Q4_K_M, 30 contracts / 161 labelled terms, llama.cpp on the PC CPU):

  | Prompt | Precision | Recall | Injection text cited | Echoed titles | Time |
  |---|---|---|---|---|---|
  | `extract-v1` (per page) | 56% | 12% | 0 | 14 | 133 s |
  | `extract-v2` (per block), before guards | 79% | 62% | **2** | 0 | 631 s (PC swapping) |
  | `extract-v2` + guards | 79% | 71% | 0 | 0 | 391 s |
  | **`extract-v3`** (current) | **79%** | **75%** | **0** | 0 | 333 s |

  v3 recall by category: service 74%, installment 76%, mixed EN/FIL 58%, injection contracts 90%. No verdict-language rejections and no incomplete pages in any v2/v3 run.
- **Per-block extraction** (`src/ai/llm/chunking.ts`, `prompt.ts`, `parse.ts`, `localLlmEngine.ts`): one call per non-trivial block (headings and fragments skipped), with the previous block on the page as labelled read-only context. The model only answers `{relevant, finding{type,title,explanation,uncertainty,review_status,questions,normalized_value}}`. The citation (page, block id, exact quote) is filled in by code from the block it asked about, so the model can't misquote. Includes a fictional worked example, readable EN/FIL fallback titles when the model echoes the type name (`TYPE_TITLES`), `normalized_value` dropped when the block has no amount, `maxTokens` 384, retry once, then the page is marked incomplete. `onProgress(done, total)` replaces `onChunk`.
- **Injection skip** (`src/ai/injection.ts`, `looksLikeInstruction`, EN + FIL): blocks addressed to AI tools ("SYSTEM:", "ignore previous instructions", "PAALALA SA AI", …) are never sent to the model. Found in the v2 run: on inj-01 the model cited the injection sentence as a real term ("No payment conditions…"). Now flags all 5 eval injection blocks plus demo `p2_b4`, with no false positives on the 30 contracts. The gate still checks everything that is sent.
- **Evidence gate** (`src/ai/evidenceGate.ts`): new rule. Any PHP amount in a finding's title, explanation or uncertainty must appear in the cited block, otherwise `value_not_in_source`. This catches amounts borrowed from the context block and model arithmetic: in v3 the model titled svc-01's "Half of the fee is due upon signing" as "PHP 9,000 paid upon signing" (half of PHP 18,000 from the sentence before), and the gate rejected it. `moneyAmountsIn` is now exported.
- **Prompt contamination fixed (`extract-v3`):** the v2 prompt's examples used PHP 18,000 and PHP 12,000, which also appear in eval contracts (svc-01 and two others), so the eval could reward copying the example. v3 uses amounts that appear in no fixture and adds "use only amounts written inside `<block>`; never copy the earlier text's amounts". New test in `tests/evalSet.test.ts` fails if any amount in the system prompt (EN or FIL) appears in an eval contract.
- **Eval harness:** `npm run eval:llm` (`scripts/eval-extraction.ts`, `tsx` dev dependency) runs the real prompt → parser → gate → scorer against a local OpenAI-compatible server. Refuses any non-localhost `LLM_URL`; sends fictional fixtures only. Flags: `--ids`, `--limit`, `--verbose` (prints rejections and injection citations). Setup in `docs/LOCAL_LLM.md` › "Measuring extraction quality" (official llama.cpp `b11524` Windows CPU build, SHA-256 checked, kept outside the repo).
- **What still loses terms (next tuning targets):**
  1. **Wrong type** (29 in v3): the term is found but given a different type, e.g. due_date vs payment_condition. Check the labels for missing acceptable types before changing the prompt.
  2. **Context borrowing** (12 rejections in v3): the model still copies amounts from the previous block into explanations. The gate catches every one, but each is a lost term. Try context-free prompting for blocks that have no pronoun or "the fee"-style reference.
  3. **Mixed EN/FIL** is the weakest category (58%).
  4. **Speed:** per-block means one call per block (v3 is 2.5× v1's time on the PC). On the phone, check whether llama.rn reuses the KV cache for the shared system-prompt prefix between calls; if not, a long document will be slow. Compare with 1.7B there.
- Tests rewritten for the per-block design (`tests/localLlm.test.ts`, `tests/evalSet.test.ts`, `tests/comprehension.test.ts`).
- Not done: re-running the review on the emulator/phone with v3 (the emulator was shut down for low memory); OCR (`modules/local-ocr`); arm64 APK + in-app model import for the real phone.
- ⚠️ A real signed contract PDF sits untracked in the repo root for upcoming OCR testing. **Never commit it**; it should be moved out of the repo.
- Verified: typecheck ✅, tests ✅ 139/139, lint ✅; `npm run eval:llm` full runs for v2 + guards and v3 (above).

### 2026-10-09 — Claude (with Glenn) — Local LLM engine (pre-llama.rn), verdict guardrail, readiness, eval set, first dev build
- New `src/ai/llm/` — the real `LlmEngine`, independent of the model runtime:
  - `chunking.ts`: per-page chunks (≤3000 chars, blocks never split, pages never mixed).
  - `prompt.ts`: `PROMPT_VERSION = 'extract-v1'`; system prompt (source text is untrusted data, cite one block + exact quote, no legal/fair/safe verdicts, no sign advice, abstain via `uncertainty`); `<source>`-delimited `[block_id] text` lines; `EXTRACTION_JSON_SCHEMA` (snake_case, PRD §12) for llama.rn grammar-constrained output.
  - `parse.ts`: strips Qwen3 `<think>` and Markdown fences, maps snake_case → domain candidates, page derived from `block_id`. Shape mapping only — the evidence gate still decides.
  - `localLlmEngine.ts`: `createLocalLlmEngine(runner)`; one completion per chunk, retry once on unusable JSON, dedupe same type+block, abort between chunks, `onChunk` progress (counts only, no text logged). The llama.rn adapter only needs to implement `CompletionRunner`.
- `RawExtraction.incompletePages` (`src/ai/engines.ts`) → `runAnalysis` now reports pages whose output failed after retry as not read (`coverage.incomplete`).
- `package.json`: `expo prebuild` switched `android`/`ios` scripts to `expo run:android|ios` (dev build). `android/` generated, gitignored.
- Understand-It-Back (`src/ai/llm/comprehension.ts`, `quiz-v1`): one item per verified finding (max 3, most important first, one per block). Evidence is taken from the finding (not the model), the answer position is shuffled deterministically, and "I'm not sure" / "Hindi ako sigurado" is added by code. Items are dropped when the correct answer has numbers not written in the source (no LLM arithmetic). New optional `LlmEngine.comprehend()`; `runAnalysis` calls it after the gate, else uses `RawExtraction.comprehension` (Demo engine unchanged).
- Readiness (`src/ai/llm/readiness.ts`): `checkLocalReadiness(spec, probe)` is offline-ready only when the model is present, size + SHA-256 match, bundled OCR is linked and a smoke inference answered. Never loads an unverified file; low storage only warns. Device access via injected `ReadinessProbe` (adapter TODO). The smoke prompt is fixed and has no user data.
- Models (`src/ai/llm/models.ts`): Qwen3 0.6B Q4_K_M (default), 0.6B Q4_0, 1.7B Q4_K_M with pinned size/SHA-256/revision (Apache-2.0).
- llama.rn research → `docs/LOCAL_LLM.md`: pin **0.12.9** (npm `latest` tag is 0.13.0-rc.7, so `npx expo install llama.rn` alone would pull an RC); New Arch required (we have it); arm64-v8a + x86_64; Expo config plugin; prebuilt JNI libs fetched at install time; API mapping for the adapter; open questions (model location, native SHA-256).
- Eval set (`tests/fixtures/contracts.ts`): 30 fictional contracts — 10 service, 10 installment, 5 mixed EN/FIL, 5 prompt-injection — each block labelled with its accepted finding types. `src/ai/eval/score.ts` scores precision/recall, type mismatches, abstentions and injection citations. Image categories (photos/PDFs, blurry pages) still need real files.
- Dev build: Gradle's NDK 27.1 auto-download stalled at 417 MB; Glenn installed it with `sdkmanager`. Gradle then installed Build-Tools 35/36 and Platform 36 itself. First full build **failed at link time** for nitro-modules, worklets and screens (`undefined symbol: std::__ndk1::…`, `__cxa_throw`). Cause: the SDK path contains spaces (`C:\Users\ACER NITRO V15\…`), so CMake's Ninja generator invokes `clang++.exe` by its 8.3 short name `CLANG_~1.EXE`; clang picks C vs C++ mode from its file name, so it linked as C and dropped libc++. **Windows workaround:** junction without spaces, `mklink /J C:\Android\Sdk "%LOCALAPPDATA%\Android\Sdk"`, then build with `ANDROID_HOME=C:\Android\Sdk`. Next failure: `ninja: error: Stat(…RNGestureHandlerDetectorShadowNode.cpp.o): Filename longer than 260 characters` (gesture-handler codegen object path ≈377 chars; still ≈295 even at a drive root). Fix: Windows `LongPathsEnabled=1` (admin) + CMake 3.31.6 from the SDK (ships Ninja 1.12.1; default 3.22.1 has Ninja 1.10.2). The app's CMake version is not set by RN (`CMAKE_VERSION` env only affects building RN from source), so it is pinned in machine-local `android/local.properties`: `sdk.dir=C\:\\Android\\Sdk` and `cmake.dir=C\:\\Android\\Sdk\\cmake\\3.31.6`. Re-add after `expo prebuild --clean`.
- **Dev build ✅ on emulator** (`test_device`, x86_64): `npx expo run:android --no-bundler --device test_device`, then `npx expo start --dev-client` + `adb reverse tcp:8081 tcp:8081`. Welcome → readiness → Home render; custom fonts and glass tab bar work. Readiness: Demo engine, not offline-ready (correct); **document scanner ✅ and PDF text reader ✅ load** (Nitro `ExpoDocumentScanner` registered, PDFBox initialized). First launch after install showed a blank screen until a force-stop + relaunch (likely the deep-link intent arrived during a reload). Dev warning: require cycle `FloatingTabBar → ReviewAccessory → ui/index → Screen → FloatingTabBar`. Scanner capture, PDF import and blur performance not exercised yet. Emulator `test_device` (API 34, x86_64, 2 GB) boots; `ambagan_playstore` is missing its system image. No physical phone connected yet (Windows does not see it — cable/driver).
- **llama.rn integrated** (commit after `43b528e`): `llama.rn@0.12.9` (+ config plugin) and `expo-file-system` as a direct dependency. Adapter `src/ai/llm/llamaRuntime.ts` (model at `<documents>/models/<fileName>`, `initLlama` n_ctx 4096 CPU, JSON-schema `response_format`, `enable_thinking: false`, temperature 0, abort → `stopCompletion`, `releaseModel()`), engine `src/ai/localEngine.ts` (kind `local`; photo OCR refused with a clear `RecognizeError` instead of sample text; keyword type guess, user confirms on S09). `getEngine()` returns it only when Metro runs with `EXPO_PUBLIC_ENGINE=local`; default stays Demo. Readiness hash is now MD5 on the phone (expo-file-system has no SHA-256) against an MD5 pinned after verifying the SHA-256 on the PC.
- **First real on-device inference ✅ (emulator):** Qwen3 0.6B Q4_K_M pushed via `adb` + `run-as` (steps in `docs/LOCAL_LLM.md`). Readiness: model ✅, MD5 ✅, storage ✅, inference ✅ (**3.8 tok/s** on the 2-thread x86_64 emulator — not representative), works without internet ✅, OCR ❌ → correctly **not** offline-ready. Re-ran with emulator **airplane mode on** (`ping` unreachable): inference still passes. Full extraction on a fixture contract not run yet.
- ⚠️ **Privacy blocker before real documents:** llama.rn's prebuilt native lib logs every prompt's token IDs to logcat at INFO (`cpp/rn-completion.cpp:402`, `loadPrompt: prompt_tokens = …`); token IDs decode straight back to text, so contract text would reach the system log (PRD §14). No runtime switch (`toggleNativeLog` doesn't cover it). **Fix:** `patches/llama.rn+0.12.9.patch` (patch-package, re-applied by `postinstall`) replaces that log with a token count and drops the token text (`tokens_to_str`) from the eval-failure ERROR log (`:1011`). VERBOSE logs with text stay compiled out (`RNLLAMA_VERBOSE` undefined). `plugins/withLlamaFromSource.js` (in `app.json`) sets `rnllamaBuildFromSource=true` so the patched C++ is compiled instead of the prebuilt `.so`. Source build needs **Python 3** (llama.rn's CMake `find_package(Python3 REQUIRED)` for OpenCL kernel embedding; the arm64 build has an `_hexagon_opencl` variant) — on Windows: `winget install -e --id Python.Python.3.12 --scope user`. **Verified in the built APK** (x86_64): the prebuilt lib contains `prompt_tokens = ` and `n_threads: %d, embd: %s`; our source-built `librnllama*.so` contains neither and has the new `prompt tokenized, num_prompt_tokens` message. Runtime logcat check on the emulator still to do. Source-built Debug libs are 96 MB unstripped (≈10 MB each after AGP strips them in the APK; debug APK 112 MB). One `packageDebug` failure with no cause was transient (passed on retry).
- Prebuild note: `expo prebuild` (even without `--clean`) deletes `android/local.properties` on SDK 57 — re-create it (sdk.dir + cmake.dir) after every prebuild.
- **First end-to-end review with the real model ✅ (emulator, fictional `svc-01` as a Chrome-printed digital PDF):** import PDF → text layer read exactly → user confirmed 2 critical blocks → type guessed "service agreement" → Qwen3 0.6B extraction (538-token prompt, ~43 s) → evidence gate → quiz generation (198-token prompt) → Overview "reviewed on this phone · Qwen3 0.6B Q4_K_M". Runtime logcat shows only `prompt tokenized, num_prompt_tokens: N` (no token dump) ✅. Results: **1 of 5 labelled terms found** (payment_condition on `p1_b5`, quote exact, shown as SourceQuote + AiNote correctly); title was the raw type name `payment_condition`; explanation vague ("The fee is split as specified in the agreement"); 1 quiz item, sensible, answer grounded in the source. **Quality is the next problem:** low recall and weak wording from 0.6B — try a few-shot example in the prompt, one-finding-per-block prompting, a readable fallback title when the model echoes the type, and 1.7B on the phone; score with `tests/fixtures/contracts.ts`.
- UI notes for Chris: the processing screen says "up to a minute" (true on a phone, not the emulator); the disabled "Matches the paper" button draws a white rectangle over itself on Android (S08).
- Not done: extraction quality work + scoring all 30 eval contracts on device; `modules/local-ocr`; 0.6B vs 1.7B on the real phone (arm64 APK sideload + an in-app model import, since USB debugging isn't available yet).
- Verified (this commit): typecheck ✅, tests ✅ 133/133, lint ✅; Android debug build ✅ (llama.rn from patched source).
- Guardrail: `containsVerdict()` in `src/ai/evidenceGate.ts` — new rejection reason `verdict_language`. Rejects findings whose title/explanation/uncertainty/questions call the agreement or a clause legal/illegal, (un)fair, (un)safe, (un)enforceable, a scam, or advise whether to sign, in English and Filipino. Runs before the evidence check, so it also covers findings without evidence. Understand-It-Back items (prompt + choices) are filtered the same way in `pipeline.ts`. Closes the gap where a correctly-quoted finding on injection text (fixture `p2_b4`) could say "safe to sign". Patterns are deliberately narrow (factual paraphrase like "the Client should sign the acceptance form" or "not legally yours until paid" passes) — extend `VERDICT_PATTERNS` when real model output shows new phrasings.
- Verified: typecheck ✅, tests ✅ 132/132 (new: `localLlm` 11, verdict 22, `readiness` 9, `comprehension` 10, `evalSet` 35), lint ✅. Device: emulator dev build launches (see above); no physical phone yet.

### 2026-10-09 — Claude (with Chris) — Landing page deploy workflow (GitHub Pages)
- `.github/workflows/pages.yml` publishes `site/` to GitHub Pages on pushes to `main` that touch `site/**`; `site/.nojekyll` serves files as-is.
- **Not live yet:** needs a one-time manual setup — repo Settings › Pages › Source: "GitHub Actions". Pages on a private repo needs GitHub Pro / a paid org plan.
- Status: workflow committed; deployment not enabled or verified.

### 2026-10-09 — Claude (with Chris) — Pause frontend; backend handover
- Added the "Handover — backend" section at the top of this file (state, swap points, priorities, device checklist, rules) and updated the milestone tracker.
- No code changes. Working tree clean; all commits pushed to `origin/main`.
- Verified: typecheck ✅, tests ✅ 45/45, lint ✅ (at `0d16347`).

### 2026-10-09 — Claude (with Chris) — Glass navigation from the design canvas (floating tab bar, glass header)
- Source: "PirmaBago Screens" design canvas, rows "iOS 26 · Liquid Glass direction" and "Glass · …" (GlassHome, GlassOverview, GlassDocuments, GlassSpec).
- **Real blur on Android:** `expo-blur` BlurView with `blurMethod="dimezisBlurViewSdk31Plus"` + `BlurTargetView`. New `GlassScene` (`src/components/ui/GlassScene.tsx`) splits each screen into content (the blur target) and chrome (glass that blurs it). `GlassSurface` tiers: Reduce Transparency → solid; iOS 26 → native Liquid Glass; else expo-blur (iOS material, web backdrop-filter, Android Dimezis; Android 11 and below get a tint). Glass inside content never blurs its own target — it uses a fill.
- **Floating tab bar** (`src/components/glass/FloatingTabBar.tsx`): glass capsule (Home / Documents / Settings) + glass search circle, on all platforms via headless tabs (`expo-router/ui`), replacing NativeTabs. Scrolling a tab screen past 40px collapses it to the current tab (`src/features/chrome/store.ts`); the review-progress capsule sits above the bar, or beside it when collapsed. Search circle opens Documents with the search field focused.
- **Glass nav header** (`src/components/glass/GlassHeader.tsx`): glass back circle + title capsule + optional grouped actions over a frosted scroll edge. All stack screens use it via `<Screen title=…>` (native headers off). Overview has the design's action group (Terms / Questions / What if). Processing has no back button.
- Fix found while building: headless TabSlot sizes screens to content (`flexShrink: 0`), so tab ScrollViews never scrolled; tab screen roots are now pinned to the slot.
- Removed `AccessorySpacer` (tab screens reserve bar + capsule space via `tabBarSpace()`).
- Verified: typecheck ✅, tests ✅ 45/45, lint ✅; web at 390×844: header on Add document / Verify / Overview, tab switching, collapse on scroll (DOM: only the current tab remains), search circle focuses Documents search. **Not yet run on Android** — Dimezis blur needs a dev build (`npx expo run:android`); check blur performance on the demo phone.
- Next: finding as a detented sheet (GlassFinding), glass camera controls (GlassCapture), Overview filter segmented control.

### 2026-10-09 — Claude (with Chris) — SkimCare landing page (`site/`)
- New static marketing site in `site/` (`index.html`, `styles.css`, `main.js`, `assets/icon.png` + `favicon.png`, `README.md`). No build step, no new dependencies, separate from the Expo app.
- Direction "the page is the fine print": the page is a plain-language SkimCare agreement on paper; the owl icon peeks over the sheet; 7 clauses. As each scrolls in, its key sentence gets highlighted, a SkimCare note slides in, and a sticky clause list ticks it off. Clause 2 shows sample findings, all labelled "Sample agreement, fictional", plus a deterministic what-if (5% × ₱4,500 = ₱225). Clause 6 states the Demo engine status honestly.
- Fully readable without JS; reduced motion shows everything highlighted, with no animation.
- Placeholders before launch: `[TEAM NAMES]` in the footer; download buttons point to the GitHub Releases page until there is an APK.
- `.claude/launch.json`: added `site` preview config (`python -m http.server 8130 --directory site`).
- Verified: typecheck ✅, tests ✅ 45/45, `npm run lint` ✅, `npx eslint site/main.js` ✅. Browser: desktop 1440 + phone 390 screenshots; scroll reveal checked in a headless browser (7 of 7 clauses caught, sticky list works, no horizontal overflow). Fixed: `overflow-x: hidden` broke the sticky list → `clip`; phone header wrapped → short "Get the app" label.

### 2026-10-09 — Claude (with Chris) — Review fixes for the Liquid Glass frontend
- **Bug fix — second review while one runs minimized:** finishing review A used to wipe review B's in-progress draft, and B's Processing screen showed/opened A instead of running B. Now: drafts carry a `sessionId`; a job only clears the draft it started from (`src/features/review/jobStore.ts`). Add document (S05) is blocked while a review is running or failed, with a "See the review in progress" button; a finished job's notice is cleared when a new review starts.
- Failed reviews can be discarded (`discard()` + "Discard this review" on Processing); "Try again" only shows when there are pages to retry.
- Processing refuses to run without pages (no more empty "Untitled agreement" saves).
- `AccessorySpacer` keeps the floating progress capsule from covering the last item on Home/Documents/Settings.
- Button labels wrap to 2 lines instead of truncating on Android ("Matches the paper" was "Matches …").
- Home stack: cards behind the front one keep a 64px visible strip (≥48dp target) showing the title; "Not reviewed yet" only when there is no analysis, otherwise "No verified findings".
- Finding title (model-written) now uses the sans, not the contract-quote serif (PRD §06 D).
- Welcome hex colors moved to tokens (`navy200`, `highlight`); `.impeccable/` added to .gitignore.
- Verified: typecheck ✅, tests ✅ 45/45 (new `tests/jobStore.test.ts`, 5 cases incl. the draft-wipe regression), lint ✅, web check at 375px (Verify buttons wrap, Home stack, two sequential reviews). Not checked on Android/iOS device.

### 2026-10-09 — Claude (with Chris) — Liquid Glass design system + background review (commit 4771dbd, logged after the fact)
- `GlassSurface`: native Liquid Glass on iOS 26 (`expo-glass-effect`), system blur on older iOS (`expo-blur`), opaque fills on Android/web and with Reduce Transparency. Liquid Glass only renders on iOS 26 dev builds — web preview and Android show the fallbacks by design.
- Glass pill buttons, floating frosted footers, transparent blurred iOS headers, 22px cards, pill chips; quote card lost its left rule.
- Fonts: Newsreader (serif headlines + contract quotes) and Instrument Sans (UI), bundled via `@expo-google-fonts/*` (offline-safe).
- Native tabs (`expo-router/unstable-native-tabs`, experimental API) on device; plain tabs on web.
- Reviews run in a job store so they can be minimized; progress in the iOS 26 tab-bar accessory or a floating glass capsule elsewhere.
- Wallet-style recent stack on Home; redesigned Welcome; primary color → teal700 for 4.5:1 contrast.
- Verified at the time: typecheck, tests, lint.

### 2026-10-09 — Claude (with Chris) — SkimCare app icon (owl mark "The Peek")
- Logo direction from teammate: owl + monocle + document. Four iterations explored on the "SkimCare Brand & Landing" design canvas; team chose **C, The Peek** (owl gripping the top of a page, brass monocle catching one highlighted line).
- New vector sources in `assets/brand/`: `skimcare-icon.svg` (master), `skimcare-icon-foreground.svg` (adaptive, scaled into the 66dp safe zone), `skimcare-icon-background.svg` (navy #14273E), `skimcare-icon-monochrome.svg` (Android 13 themed icon).
- Replaced Expo placeholder PNGs, same sizes/paths so `app.json` is unchanged: `assets/icon.png` 1024, `android-icon-foreground.png` 512, `android-icon-background.png` 512, `android-icon-monochrome.png` 432, `favicon.png` 48. Rendered locally with headless Chrome (no new deps). `splash-icon.png` not changed (no splash configured).
- Status: done (icon). Landing page: next.
- Verified: `npm run typecheck` ✅, `npm test` ✅ (5 suites, 40 tests), `npm run lint` ✅; icon checked in circle mask, themed-mono and 20–72px previews. Not yet checked on a device launcher.
- Next: to re-render after editing an SVG, render it with Chrome headless at the target size, or use any SVG→PNG tool.

### 2026-10-09 — Claude (with Chris) — Rename display name PirmaBago → SkimCare
- App display name is now **SkimCare** (display name + copy only).
- Files changed: `app.json` (`expo.name`), `src/i18n/strings.ts` (`appName` + all user-facing EN/FIL copy), `src/app/welcome.tsx` (header now uses `t('appName')` instead of a hard-coded name), `src/ai/scenarioRules.ts` ("SkimCare will not guess a fee…"), `src/theme/tokens.ts` (header comment), `README.md` (title, prose, "formerly PirmaBago" note), `CLAUDE.md` (title line only).
- Deliberately NOT changed: app.json `slug`, `scheme`, `android.package`; package.json `name`; the PRD PDF filename and its links; import paths/identifiers. Tagline "Understand what you are signing." / "Unawain bago pirmahan." unchanged. `docs/ARCHITECTURE.md` does not name the product — untouched.
- Added PRODUCT.md (impeccable product record). Logo + landing page designs in progress on the SkimCare Brand & Landing design canvas.
- Status: done
- Verified: `npm run typecheck` (clean), `npm test` (5 suites, 40 tests passed), `npm run lint` (clean).

### 2026-10-09 — Claude (with Chris) — Document scanner + PDF text extraction
- Added `expo-document-scanner@0.2.8` (+ `react-native-nitro-modules`) and `expo-pdf-text-extract@1.1.0`.
- `src/features/capture/scanner.ts` — lazy-loaded scanner (ML Kit Document Scanner on Android: edge detection, perspective fix, cleanup, multi-page). Falls back to system camera when not in the build (Expo Go / web).
- `src/ai/sources/pdfTextLayer.ts` — reads digital-PDF text page by page (PDFBox). Handles: no text layer (scanned PDF → clear message), password-protected, module unavailable (→ OCR fallback).
- `src/ai/textBlocks.ts` — page text → evidence blocks with stable ids (`p{page}_b{n}`), rejoins wrapped lines into sentences, flags amounts/dates/parties as critical. New optional `OcrBlock.origin` ('ocr' | 'pdf_text').
- `src/ai/recognize.ts` — Recognize stage router: PDF text layer first, OCR engine otherwise. Wired into Preview (S07); Verify (S08) shows "read directly from the PDF" when applicable.
- Capture (S06) now scans first; Readiness (S03) gained a "Capture tools" section that reports honestly whether scanner/PDF reader are in this build.
- Fixed navigation found while testing: finishing onboarding now makes Home the stack root, and finishing a review returns to Home underneath the Overview (Back used to land on Welcome / nowhere). Back label now reads "Home".
- Verified: typecheck ✅, tests ✅ 40/40 (new: textBlocks 13, recognize 5), lint ✅, web walk-through (onboarding → sample review → Back → Documents; no nested buttons in DOM). **Not yet tested on an Android dev build** — both libraries are native-only.
- Caveats / next:
  1. Scanner on Android is downloaded once by Google Play services → open it once while online during setup before going to airplane mode.
  2. Confirm both libs build with RN 0.86 New Architecture in the first `npx expo run:android`; the PDF lib's docs don't state New Arch support.
  3. Scanned PDFs still unsupported — needs PDF page → image rendering, then OCR.
  4. With the Demo engine, a real PDF's text yields no findings (the sample candidates don't match it and the evidence gate rejects them). That is expected until llama.rn is wired.

### 2026-10-09 — Claude (with Chris) — Project foundation, design system, frontend structure
- Scaffolded Expo SDK 57 + React Native 0.86 + TypeScript (strict) with Expo Router (`src/app`), Zustand, Zod.
- Design system: `src/theme/tokens.ts` (navy/teal/amber from PRD, status = icon + words), UI kit in `src/components/ui/`.
- Bilingual copy (English + Filipino per PRD §15 style guide): `src/i18n/`.
- Domain model per PRD §12–13: `src/domain/schema.ts` (Document → Page → OcrBlock → EvidenceRef → Finding, AnalysisRun, facts, scenarios, comprehension, questions).
- AI layer behind interfaces (`src/ai/engines.ts`) so llama.rn / ML Kit drop in without UI changes:
  - `evidenceGate.ts` — rejects fabricated pages/blocks, misquotes, amounts not in source, malformed output; downgrades low-confidence critical blocks.
  - `scenarioRules.ts` — deterministic late-installment math in centavos; returns "insufficient information" instead of guessing.
  - `pipeline.ts` — stages, provenance hash, fact derivation (facts only "confirmed" after user verifies OCR).
  - `demoEngine.ts` + `demo/fixtures.ts` — **fictional** sample contracts. Always labeled "Demo engine" in UI; readiness never claims offline-ready.
- Built all 19 H1 screens + diagnostics. Document vault is in-memory (`src/features/documents/store.ts`) behind `src/db/repository.ts` contract.
- Status: done (frontend structure). Native AI/OCR/encryption not started.
- Verified: `npm run typecheck` ✅, `npm test` ✅ 22/22, `npm run lint` ✅. Expo web (375px) walk-through: Welcome → Readiness (honest "not ready") → Home → sample installment → Verify → Process → Overview → What-if shows ₱2,000 / ₱2,100 with sources (matches PRD §06 example). Not yet run on an Android device.
- Fixes found during walk-through: selected chip invisible on navy (now teal); nested buttons in Documents rows (`ListRow` now renders trailing actions beside, not inside, the pressable).
- Known gaps: state is in-memory (lost on reload); `Alert` confirm dialogs (delete/erase) don't render on web — Android only.
- Next / handoff:
  1. Create dev build on the target Android ARM64 phone; pin llama.rn version; load a GGUF and run one strict-JSON extraction offline (Milestone 1).
  2. Implement `modules/local-ocr` (ML Kit Text Recognition v2, bundled) returning blocks with bounds → replace `demoEngine.ocr`.
  3. Swap in-memory store for expo-sqlite + SQLCipher with key in expo-secure-store.
  4. Note: Jev scope check flagged that the PRD says "prove inference before styling all 19 screens" — we chose UI-first deliberately; Milestone 1 is now the top risk.
