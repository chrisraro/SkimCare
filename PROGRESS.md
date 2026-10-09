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

## Milestone tracker (PRD §18)

| # | Milestone | Status | Notes |
|---|-----------|--------|-------|
| 0 | Project setup, UI/UX design system, frontend structure | ✅ Done | Expo SDK 57, Router, all 19 H1 screens on Demo engine; Liquid Glass UI (floating tab bar, glass header, real Android blur); landing page in `site/` |
| 1 | Prove local AI — llama.rn + GGUF extraction offline on device | 🟨 Partial | Runtime-independent engine done (`src/ai/llm/`: extraction + quiz prompts, JSON schemas, parsers, retry, readiness, pinned GGUF candidates); 30-contract eval set + scorer; llama.rn adapter + first dev build pending; pick Qwen3 0.6B vs 1.7B after device test (`docs/LOCAL_LLM.md`) |
| 2 | Prove document evidence — bundled ML Kit OCR, stable block IDs | 🟨 Partial | Evidence gate + source viewer done; document scanner + digital-PDF text layer wired (untested on device); ML Kit text recognition bridge pending (`modules/local-ocr`) |
| 3 | Prove differentiated UX — scenarios, Understand-It-Back, questions | 🟨 Partial | UI + deterministic rules done; local Understand-It-Back generation done (`src/ai/llm/comprehension.ts`); needs real model output |
| 4 | Prove reliability — SQLCipher, encrypted files, airplane-mode rehearsal | ⬜ Not started | Store is in-memory today (`src/db/repository.ts` contract) |

## Screen tracker (PRD §07)

| ID | Screen | Route | Status |
|----|--------|-------|--------|
| S01 | Launch | `src/app/index.tsx` | ✅ UI |
| S02 | Welcome & privacy | `src/app/welcome.tsx` | ✅ UI |
| S03 | Model readiness | `src/app/readiness.tsx` | ✅ UI (Demo engine reports not-ready, by design); real checks in `src/ai/llm/readiness.ts`, not wired yet |
| S04 | Home | `src/app/(tabs)/index.tsx` | ✅ UI |
| S05 | Add document | `src/app/review/new.tsx` | ✅ UI (scan / gallery / PDF wired) |
| S06 | Capture | `src/app/review/capture.tsx` | ✅ ML Kit document scanner, camera fallback (device test pending) |
| S07 | Preview | `src/app/review/preview.tsx` | ✅ UI; digital PDFs read via text layer (scanned-PDF render + OCR pending) |
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
- Not done: llama.rn adapter (`CompletionRunner` + `ReadinessProbe`); `getEngine()` still returns the Demo engine; on-device eval runner.
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
