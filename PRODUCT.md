# Product

<!-- impeccable:product-schema 1 -->

## Platform

android

## Users
Filipinos about to sign an everyday agreement — freelance/service agreements and simple installment or loan agreements — who usually skim it on their phone and sign. They want to know what the document actually commits them to before they sign, without uploading it anywhere.

Secondary audience for the marketing site: AppBuilders PH Local AI Hackathon judges and early users evaluating whether the on-device promise is real.

## Product Purpose
SkimCare (formerly PirmaBago) reads an agreement fully on the phone: on-device OCR and a quantized language model extract the terms, explain them in plain English or Filipino, and link every finding back to the exact source sentence. Success: the user can say what they are agreeing to, in their own words, before they sign.

## Positioning
People skim contracts; SkimCare takes care of what skimming misses. Everything runs on the device — no internet, accounts, or uploads — and every finding points to the sentence it came from. The name is a deliberate pun on "skincare": a care routine for the documents you skim.

## Operating Context
Android phone, often mid-transaction (at a lender's counter, in a chat with a client, before a lease signing). Pages are scanned with the camera or imported as PDF. Works in airplane mode once the model is installed.

## Capabilities and Constraints
- Scan pages / import images or PDF; OCR verification step; preferences (language, document type).
- Findings carry a status shown with icon + words: Needs attention, Needs clarification, Explained from source, Cannot verify.
- What-if scenarios use deterministic money/date math, never the model. Missing terms → "insufficient information".
- Never calls a clause legal/illegal, fair/unfair, or tells the user whether to sign. Not legal advice.
- Today the app runs on a clearly labeled Demo engine with fictional sample findings; real on-device inference is in progress. Marketing must not claim the real engine is shipping.
- Identifiers: Expo project `@chrisraro/skimcare`, Android package `ph.skimcare.app` (set before the first APK). The deep-link scheme stays `pirmabago`.

## Brand Commitments
- Name: SkimCare. Filipino promise line: "Unawain bago pirmahan." English: "Understand what you are signing."
- Existing app visual world (src/theme/tokens.ts): deep navy, teal primary, amber attention, warm quote paper for source text; Newsreader serif display over Instrument Sans; Liquid Glass surfaces on iOS 26 with solid fallbacks.
- Source text must look different from AI text. Status never by color alone.

## Evidence on Hand
- PRD: `PirmaBago_Product_Requirements_Document.pdf`.
- 19 H1 screens running on the Demo engine (see PROGRESS.md).
- No users, testimonials, benchmarks, download counts, or press exist. Do not fabricate them. Sample findings shown anywhere must be labeled as sample.

## Product Principles
1. Source first: every claim the app makes is traceable to a sentence in the user's document.
2. Private by construction: the document never leaves the phone.
3. Explain, never judge: describe what the document says; the decision stays with the signer.
4. Honest about readiness: never present demo output as real inference.

## Accessibility & Inclusion
English and Filipino copy; plain language over legal jargon. Touch targets ≥48dp. Status by icon + words. WCAG AA contrast.
