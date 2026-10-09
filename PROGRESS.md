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

## Milestone tracker (PRD §18)

| # | Milestone | Status | Notes |
|---|-----------|--------|-------|
| 0 | Project setup, UI/UX design system, frontend structure | ✅ Done | Expo SDK 57, Router, all 19 H1 screens on Demo engine |
| 1 | Prove local AI — llama.rn + GGUF extraction offline on device | ⬜ Not started | Needs dev build; pick Qwen3 0.6B vs 1.7B after device test |
| 2 | Prove document evidence — bundled ML Kit OCR, stable block IDs | 🟨 Partial | Evidence gate + source viewer done; document scanner + digital-PDF text layer wired (untested on device); ML Kit text recognition bridge pending (`modules/local-ocr`) |
| 3 | Prove differentiated UX — scenarios, Understand-It-Back, questions | 🟨 Partial | UI + deterministic rules done; needs real model output |
| 4 | Prove reliability — SQLCipher, encrypted files, airplane-mode rehearsal | ⬜ Not started | Store is in-memory today (`src/db/repository.ts` contract) |

## Screen tracker (PRD §07)

| ID | Screen | Route | Status |
|----|--------|-------|--------|
| S01 | Launch | `src/app/index.tsx` | ✅ UI |
| S02 | Welcome & privacy | `src/app/welcome.tsx` | ✅ UI |
| S03 | Model readiness | `src/app/readiness.tsx` | ✅ UI (Demo engine reports not-ready, by design) |
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
