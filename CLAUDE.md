# PirmaBago — agent instructions

Read `AGENTS.md` (Expo SDK rules) and `docs/ARCHITECTURE.md` first. Spec: `PirmaBago_Product_Requirements_Document.pdf`.

## Always

- **Log every change in `PROGRESS.md`** (newest on top, template at the top of the file) and update its milestone/screen tables. Two developers share this repo; the log is the handoff record.
- Run `npm run typecheck && npm test && npm run lint` before declaring work done; record what you ran in the log entry.
- Install packages with `npx expo install <pkg>` (SDK-matched versions).

## Product guardrails (from the PRD — do not weaken)

- No network calls with document content. No cloud AI, no accounts, no telemetry of contract text/prompts/PII.
- All model output is untrusted: it must pass `src/ai/evidenceGate.ts` before reaching the UI.
- Money/date math runs in `src/ai/scenarioRules.ts` (deterministic), never in the LLM. Missing terms → "insufficient information".
- Never present Demo engine / fixture output as real inference. Keep `DemoBanner` on screens that show engine output; readiness must not claim offline-ready unless real checks pass.
- Never call a clause legal/illegal, fair/unfair, or tell the user whether to sign.
- Status is shown with icon + words, never color alone. Source text (`SourceQuote`) must look different from AI text (`AiNote`).

## Layout

`src/app` routes · `src/components` UI · `src/theme` tokens · `src/i18n` copy · `src/domain` schemas · `src/ai` inference · `src/features` stores · `src/db` storage contract · `modules/local-ocr` native OCR · `tests` unit tests.
