# SkimCare

**Understand what you are signing.** — *Unawain bago pirmahan.*

A private, on-device agreement-understanding companion for Filipinos. Scan or import an agreement; on-device OCR and a quantized language model extract terms, explain them in plain English or Filipino, and link every finding back to the exact source passage — without internet, accounts, or uploads.

> SkimCare is a document comprehension and legal-information aid. It is not legal advice.

SkimCare was formerly named PirmaBago; the Expo slug, URL scheme and Android package id still use `pirmabago`.

Built for the AppBuilders PH Local AI Hackathon. Full spec: [`PirmaBago_Product_Requirements_Document.pdf`](PirmaBago_Product_Requirements_Document.pdf). Progress: [`PROGRESS.md`](PROGRESS.md).

## Status

Frontend structure and design system are in place. All 19 H1 screens run on a clearly labeled **Demo engine** that returns fictional sample findings. Real on-device inference (llama.rn + GGUF), bundled ML Kit OCR, and SQLCipher storage are next. See [`PROGRESS.md`](PROGRESS.md).

## Stack

Expo SDK 57 · React Native 0.86 · TypeScript (strict) · Expo Router · Zustand · Zod · Jest (jest-expo)
Planned native: llama.rn (GGUF, Qwen3 0.6B/1.7B candidate) · ML Kit Text Recognition v2 (bundled) · expo-sqlite + SQLCipher · expo-secure-store

## Getting started

```bash
npm install
npm run web        # quick UI preview in the browser
npm run android    # Expo Go / dev build on a device
```

Checks — run before every commit:

```bash
npm run typecheck
npm test
npm run lint
```

## Project layout

```
src/app/            Expo Router screens (S01–S19), one file per route
src/components/     UI kit (ui/) + shared composites (FindingCard, DemoBanner…)
src/theme/          Design tokens
src/i18n/           English + Filipino copy
src/domain/         Zod schemas = the inference contract & data model
src/ai/             Engine interfaces, evidence gate, scenario rules, pipeline, Demo engine
src/features/       Zustand stores (documents vault, capture draft, settings)
src/db/             Storage contract for the encrypted SQLCipher implementation
modules/local-ocr/  Native ML Kit OCR bridge (to be implemented)
tests/              Unit tests
docs/               Architecture & design notes
```

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for how the pieces fit together.

## Contributing

1. Branch from `main` (`feat/…`, `fix/…`).
2. Make the change; keep the evidence gate and "Demo engine" labeling intact.
3. Run typecheck, tests, lint.
4. **Add an entry to `PROGRESS.md`** (template at the top) in the same commit/PR.
5. Open a PR.
