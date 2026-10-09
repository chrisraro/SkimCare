# Architecture

Maps the PRD (§10–§13) onto the code. Keep this file current when structure changes.

## Data flow

```
Capture/Import (S05–S07)          OCR verify (S08)        Preferences (S09)
 expo-image-picker / doc picker ─▶ engine.ocr.recognize ─▶ user confirms/corrects ─▶ engine.classify + override
                                                                                         │
                                                                                         ▼
Processing (S10)  src/ai/pipeline.ts runAnalysis()
 organize ─▶ extract (engine.llm.extract → RAW, untrusted)
         ─▶ validate (evidenceGate.validateCandidates: schema, page/block exists, quote matches, amounts in source)
         ─▶ explain (deriveFacts, deriveQuestions — deterministic)
         ─▶ save (documents store; later SQLCipher)
                                                                                         │
                                                                                         ▼
Review (S11–S17)  Overview · Terms · Finding (SourceQuote + AiNote) · Source viewer (corrections → analysisStale)
                  What-if (scenarioRules, confirmed facts only) · Understand-It-Back · Questions
```

## Swap points for real on-device AI

| Concern | Interface | Today | Target (H1) |
|---|---|---|---|
| Capture | `src/features/capture/scanner.ts` | expo-document-scanner (ML Kit Document Scanner), camera fallback | same — device-verify; Play services downloads module once |
| Digital PDF text | `src/ai/sources/pdfTextLayer.ts` via `src/ai/recognize.ts` | expo-pdf-text-extract (PDFBox) | same; add scanned-PDF render → OCR |
| OCR | `OcrEngine` in `src/ai/engines.ts` | Demo fixture text | `modules/local-ocr` — bundled ML Kit Text Recognition v2, block text + bounds |
| LLM | `LlmEngine` | Demo fixture candidates; real engine in `src/ai/llm/` (`createLocalLlmEngine(runner)`: chunking, prompt, JSON schema, parser) awaiting a runner | llama.rn + GGUF (Qwen3 0.6B/1.7B) implementing `CompletionRunner`, schema-constrained JSON |
| Readiness | `InferenceEngine.checkReadiness` | Honest "not ready"; real logic in `src/ai/llm/readiness.ts` (`checkLocalReadiness(spec, probe)`) awaiting a device `ReadinessProbe` | Model file present, checksum, warm load, tiny inference test |
| Storage | `DocumentRepository` in `src/db/repository.ts` | In-memory Zustand | expo-sqlite + SQLCipher, key in expo-secure-store, encrypted page files |

Switch engines in one place: `getEngine()` in `src/ai/demoEngine.ts`.

## Invariants (tested in `tests/`)

- A finding with a source pointer is shown only if the page + block exist and the current (possibly corrected) block text contains the quote.
- A claimed PHP amount must appear in the cited source text.
- Model-written text (finding fields, quiz prompts/choices) that calls a clause legal/illegal, fair/unfair or safe, or advises on signing, is rejected (`containsVerdict`, reason `verdict_language`).
- Critical blocks with OCR confidence < 0.7 that the user has not verified → finding downgraded to "Cannot verify".
- Scenario math uses only facts the user confirmed; missing terms → `insufficient_information`.
- OCR corrections bump `ocrRevision`, change the provenance hash and mark the analysis stale.

## Design system

- Glass chrome: `GlassScene` (content = BlurTargetView, chrome = overlays) → `GlassSurface` / `GlassHeader` / `FloatingTabBar`. Android blur only works for glass rendered as a scene's chrome; glass is for controls, never contract text.

- Tokens: `src/theme/tokens.ts` — navy (`#14273E`) structure, teal (`#0E8584`) primary/"explained", amber attention, coral "needs attention", slate "cannot verify".
- Source text: serif on warm paper with gold rule (`SourceQuote`). AI text: labeled "Explanation by the on-device model — not contract text" (`AiNote`).
- Status badges always pair icon + words. Touch targets ≥ 48dp. Text scales up to 2× (`maxFontSizeMultiplier`).
- Copy: plain language, English + Filipino (`src/i18n/strings.ts`), PRD §15 labels (e.g. "Tingnan ang nakasulat / View source").
