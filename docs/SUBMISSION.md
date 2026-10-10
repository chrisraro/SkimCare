# SkimCare — hackathon submission pack

AppBuildersPH Hackathon 2026 · Theme: Local AI. Source: *Participant Briefing* (Oct 9), slide 16 "Submission checklist" and FAQ slides 22–28.

- **Where:** Cerebral Valley event page — https://cerebralvalley.ai/e/appbuildersph-hackathon-2026
- **Deadline:** **10:00 AM, Saturday Oct 10. No extensions.**
- **One submission per team, no edits or resubmits.** Check everything below before pressing submit.
- **Code freezes at 10:00 AM.** Judges review the repository as of the deadline, so it must be **public** by then.

Status key: ✅ ready · ⚠️ needs an action · ⏸ deferred (demo video, per Chris).

---

## Blockers (do these first)

| # | Action | Who | Status |
|---|--------|-----|--------|
| B1 | Repo public. Verified unauthenticated via the GitHub API (`visibility: public`). Secret scan of tracked files and history was clean. | Chris | ✅ |
| B2 | `docs/local-ai-pipeline-blueprint.pdf` kept. It was generated in Chris's Google AI Mode session and is disclosed under existing assets. | Chris | ✅ |
| B3 | Team **ESG**: Christian Raro, Glenn Viola. Must match the official list at appbuildersph.com/hackathon. | Chris | ✅ |
| B4 | **README for judges:** the FAQ says the app need not be deployed live if the repo has instructions to recreate it. The README still says the app "runs on a Demo engine" and only covers dev mode. It should say how to try it (web app, APK) and how to build it (EAS, model placement). | Claude | ⚠️ |
| B5 | AI development tools confirmed by Chris. Skills and tools taken from the Claude Code session logs, git history and `PROGRESS.md`. | Chris | ✅ |

---

## 1. The project

**Project name:** SkimCare

**Short description** (pick one length):

> SkimCare reads an agreement on your phone and explains it in plain English or Filipino, with every explanation linked to the exact sentence it came from. On-device OCR and a small language model run fully offline: no uploads, no accounts.

> *Longer:* Most people skim contracts and sign. SkimCare is an Android app (with a web version) for Filipinos about to sign a freelance, service, installment or loan agreement. You scan or import the pages; on-device text recognition reads them; a quantized Qwen3 0.6B model running locally finds the terms that matter (fees, due dates, renewals, penalties); every finding must pass an evidence check against the page before it is shown, and money/date "what-ifs" are computed by fixed rules, not the model. It never says whether to sign. *Unawain bago pirmahan.*

**Team name:** ESG

**Team members:** Christian Raro, Glenn Viola

**Public GitHub repository:** https://github.com/chrisraro/SkimCare (public). The project was renamed from PirmaBago; old links redirect.

**Other links (optional, useful for judges):**
- Landing page: https://skimcare.vercel.app
- Web app: https://skimcare-app.vercel.app. The in-browser engine is wired, but the live site uses the real engine only if `EXPO_PUBLIC_ENGINE=local` is set in Vercel. Check before linking it as a demo.

## 2. The proof

- **Demo video:** ⏸ deferred.
- **X / LinkedIn video URL:** ⏸ deferred, since it depends on the video. Reminder: tag Devin / Cognition and include **#AppBuildersPH**.

**What runs locally** (on the phone; in the web app, in the browser):
- **Text recognition (OCR):** Google ML Kit Text Recognition v2, bundled in the app (`modules/local-ocr`). Web: tesseract.js (eng + fil), served from our own origin.
- **Document scanning:** ML Kit document scanner (edge detection, straightening).
- **Digital PDFs:** text layer read on device (`expo-pdf-text-extract`; web: pdf.js).
- **Language model:** Qwen3 0.6B, quantized GGUF, run with llama.rn (llama.cpp) on Android; web: @wllama/wllama (llama.cpp WebAssembly). It extracts findings with grammar-constrained JSON, one document block at a time.
- **Evidence gate:** every model output must cite a page/block that exists and quote text that matches it, or it is discarded (`src/ai/evidenceGate.ts`).
- **Plain-language explanations, questions to ask, Understand-It-Back:** on-device model plus deterministic rules.
- **What-if calculations:** fixed rules in plain code (`src/ai/scenarioRules.ts`), never the model.
- **Storage:** reviews encrypted on device with SQLCipher; the key is held in the OS keystore (expo-secure-store).
- **Readiness check:** verifies the model file (MD5), storage, an OCR self-test and an inference smoke test before claiming offline readiness.

**What requires internet:**
- **Getting the model once** (≈400 MB GGUF, pinned revision on Hugging Face). On Android it is imported from a file (in-app import with checksum check) or pushed with adb; it is not bundled in the APK. The web app downloads it once, then caches it.
- **First load of the web app.** After the engine has run once, the offline PWA works without a connection.
- **Installing the APK** (EAS Build download link).
- **ML Kit usage statistics:** when the phone is online, Google ML Kit may send usage statistics (device/app info, error codes) to Google. Never document text. This is disclosed in the app's privacy copy.
- **Nothing else.** No document content, prompt or model output is ever sent anywhere. No cloud AI, no accounts, no analytics.

## 3. The disclosures

**Models used:**
- **Qwen3 0.6B** (Alibaba Qwen), GGUF **Q4_K_M** quantization by Unsloth (`unsloth/Qwen3-0.6B-GGUF`, pinned revision), Apache-2.0. Default.
- Also supported: Qwen3 0.6B **Q4_0** (speed test on the phone); Qwen3 1.7B Q4_K_M (optional, larger).
- **Google ML Kit Text Recognition v2** (bundled on-device model) and ML Kit Document Scanner.
- **Tesseract** (tesseract.js, eng + fil traineddata) for the web app.

**Technologies and frameworks:**
- Expo SDK 57, React Native 0.86, TypeScript (strict), Expo Router, Zustand, Zod.
- llama.rn (llama.cpp bindings, patched to remove prompt/token text from native logs), @wllama/wllama.
- expo-document-scanner, expo-pdf-text-extract, pdfjs-dist, tesseract.js.
- expo-sqlite with SQLCipher, expo-secure-store, expo-crypto, expo-file-system, expo-blur / expo-glass-effect (UI).
- Jest (jest-expo) for tests; EAS Build for the Android APK.
- Landing page: plain HTML/CSS/JS.

**APIs and cloud services:**
- **No AI APIs and no cloud inference.**
- Hugging Face: model file hosting, download only.
- Vercel: hosting for the landing page and the web app.
- EAS / Expo: cloud build of the APK.
- GitHub: source.
- Google Fonts: landing page only.
- Google ML Kit usage statistics: see above.

**Existing code and assets:**
- Open-source libraries listed above, used as dependencies (one `patch-package` patch to llama.rn).
- Model weights: Qwen3 0.6B (Apache-2.0), via Unsloth's GGUF conversion.
- Fonts: Instrument Sans and Newsreader (SIL OFL). Icons: Ionicons (MIT); the landing page ships a 35-glyph subset.
- `docs/local-ai-pipeline-blueprint.pdf`: a general local-AI pipeline reference, generated in Chris's **Google AI Mode** session and used as background reading. Where SkimCare differs from it is noted in `PROGRESS.md`.
- `PirmaBago_Product_Requirements_Document.pdf` (the product spec): written **during the hackathon, after the participant briefing (Oct 9)**, with **ChatGPT**.
- All app code was written during the hackathon (repo created Oct 9; see git history and `PROGRESS.md`).

**AI development tools:**
- **ChatGPT** (OpenAI): wrote the product requirements document after the briefing.
- **Google AI Mode** (Google Search): generated `docs/local-ai-pipeline-blueprint.pdf`.
- **Gemini** (Google): used during the build.
- **Claude Code** (Anthropic): most of the code, plus design, QA, docs and the landing page. Each change is logged in `PROGRESS.md`. It ran with:
  - **ECC** (Everything Claude Code) plugin: skills `ecc:motion-advanced`, `ecc:motion-ui`, `ecc:ios-icon-gen`; its hooks (GateGuard) and the Chrome DevTools MCP.
  - **Impeccable** skill (design direction, landing page and app UI).
  - **gpt-taste** and **vercel-react-native-skills** skills.
  - **Jev** (`typesafe-jev` MCP): scope checks, decision gates and per-finding probability checks in the project-wide QA.
  - **Claude Code workflows** (`workflow-authoring`): the `skimcare-qa` multi-agent QA run (reviewers plus one adversarial verifier per finding), and parallel sub-agents on separate git worktrees.
  - **Claude Design** canvas (app screen designs, logo explorations) and Puppeteer / in-app browser for visual checks.
- No other people helped; all tools above are AI tools used by the two team members.

## 4. Every submission must answer

**Why does this product benefit from running AI locally?**

> An agreement is the most private document most people own: it carries their name, address, ID numbers, income and debts. SkimCare reads it on the phone, so the contract is never copied to anyone's server. That is the only way a borrower can safely hand an AI their loan papers.
>
> Contracts also get signed where the signal is weak: at a lender's counter, a dealer's showroom, the barangay hall. SkimCare does not need a connection to read, explain or run a what-if.
>
> Local also means no account, no per-page cloud cost and nothing about the document to log. To make a small on-device model trustworthy, every output is checked against the page before it is shown, and every number is computed by rules, not the model.

---

## Pre-submit check (right before pressing submit)

- [x] B1 repo is public (verified).
- [x] B2 blueprint PDF kept and disclosed.
- [ ] B3 double-check ESG / Christian Raro / Glenn Viola against the official list.
- [ ] B4 README updated and pushed **before 10:00 AM** (code freezes then).
- [x] B5 AI tools confirmed.
- [ ] Links open: repo, landing page, web app (and its engine mode is what we claim).
- [ ] Nothing in the form claims more than the app does (e.g. don't call the web app "offline-ready" unless its readiness check passes).
- [ ] ⏸ Demo video + X/LinkedIn post (tag Devin / Cognition, #AppBuildersPH).
