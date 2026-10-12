# Local LLM runtime notes (Milestone 1)

Checked 2026-10-09, before installing anything. Re-check versions before upgrading.

## llama.rn version

| | |
|---|---|
| **Pin** | `llama.rn@0.12.9`, the stable release marked "Latest" on GitHub (2026-08-04) |
| **Watch out** | npm's `latest` dist-tag points to `0.13.0-rc.7`. A plain `npx expo install llama.rn` would install the release candidate, so install with `npx expo install llama.rn@0.12.9` |
| **Architecture** | v0.10+ requires the New Architecture. This project has `newArchEnabled=true` |
| **ABIs** | arm64-v8a and x86_64, so the `test_device` emulator works |
| **Expo** | Config plugin: add `"llama.rn"` to `plugins` in `app.json`, then rebuild |
| **Native libs** | Android builds llama.cpp **from the patched source** in `node_modules/llama.rn` (`rnllamaBuildFromSource=true`, set by `plugins/withLlamaFromSource.js`), so the first `expo run:android` needs the NDK and Python 3 and takes a while (≈27 min for arm64 on the dev PC). `postinstall` still downloads prebuilt libs (SHA-256 checked, install time only), but Android does not use them. **Do not remove the plugin:** the prebuilt libs are unpatched and log document text (see the privacy patches in this doc). On Windows, `npm install` needs `C:\Windows\System32` first on PATH so Windows `tar` unpacks those downloads. The app itself makes no network calls apart from the user-started model download (below), which sends no document content |
| **RN 0.86** | Neither confirmed nor ruled out in the docs or release notes; verify on the first build. 0.13.0-rc.2 lists an iOS fix for RN 0.87 |

## API mapping (0.12.9 typings)

| Our code | llama.rn |
|---|---|
| load model | `initLlama({ model: 'file://…', n_ctx, n_threads, use_mlock }, onProgress)` → `LlamaContext` |
| `CompletionRunner` | `context.completion({ messages, response_format: { type: 'json_schema', json_schema: { schema } }, n_predict, temperature, enable_thinking: false })` → `result.content` (or `result.text`). `response_format` with a JSON schema is converted to a GBNF grammar |
| cancel (`AbortSignal`) | `context.stopCompletion()`; the result then has `interrupted: true` |
| speed for readiness/diagnostics | `result.timings.predicted_per_second`, `result.tokens_predicted`, `result.truncated` |
| free memory (PRD §12 low-memory row) | `context.release()` / `releaseAllLlama()` |

Qwen3 thinks by default. Pass `enable_thinking: false`; `src/ai/llm/parse.ts` also strips any `<think>` block.

## Model candidates

Pinned in `src/ai/llm/models.ts` (size + SHA-256 from Hugging Face LFS metadata at a fixed revision). All are Apache-2.0.

| id | file | size |
|---|---|---|
| `qwen3-0.6b-q4_k_m` (default) | `Qwen3-0.6B-Q4_K_M.gguf` | 378 MB |
| `qwen3-0.6b-q4_0` | `Qwen3-0.6B-Q4_0.gguf` | 364 MB (Q4_0 is often faster on ARM CPUs; compare on the phone) |
| `qwen3-1.7b-q4_k_m` | `Qwen3-1.7B-Q4_K_M.gguf` | 1.03 GB |

The emulator (`test_device`, 2 GB RAM, x86_64) can only test the 0.6B model, and its speed doesn't reflect the phone. Make the 0.6B vs 1.7B decision on the demo phone.

## Running the local engine (development)

The adapter is `src/ai/llm/llamaRuntime.ts`, and the engine is `src/ai/localEngine.ts`. The local engine is opt-in: Metro inlines `EXPO_PUBLIC_ENGINE=local`, otherwise the app keeps the Demo engine.

1. Download the GGUF from `sourceUrl` in `models.ts` and check its SHA-256 (`sha256sum`). If the model has no `md5` pinned yet, record it (`md5sum`).
2. Place it in the app's private files (debug build only — `run-as` needs a debuggable app):
   ```bash
   export MSYS_NO_PATHCONV=1   # Git Bash on Windows, so /data paths are not rewritten
   adb push Qwen3-0.6B-Q4_K_M.gguf /data/local/tmp/
   adb shell run-as ph.skimcare.app mkdir -p files/models
   adb shell run-as ph.skimcare.app cp /data/local/tmp/Qwen3-0.6B-Q4_K_M.gguf files/models/
   adb shell run-as ph.skimcare.app chmod 600 files/models/Qwen3-0.6B-Q4_K_M.gguf
   adb shell rm /data/local/tmp/Qwen3-0.6B-Q4_K_M.gguf
   ```
   Reinstalling the debug APK keeps this file; uninstalling removes it.
3. Start Metro with the local engine: `EXPO_PUBLIC_ENGINE=local npx expo start --dev-client` (PowerShell: `$env:EXPO_PUBLIC_ENGINE="local"; npx expo start --dev-client`).

**Checksum on the phone:** SDK 57 `expo-file-system` hashes files natively with MD5 only (`file.info({ md5: true })`; no SHA-256). The SHA-256 is verified on the developer machine against Hugging Face, the MD5 of the same bytes is pinned in `models.ts`, and readiness compares MD5 on the phone. This guards against truncation, corruption and the wrong file; it is not a defence against a deliberately crafted collision. The call is synchronous, so the JS thread pauses for a few seconds on a 400 MB file.

## Download the model in the app (default)

Phone, local engine only (`EXPO_PUBLIC_ENGINE=local`). Code: `src/features/model/downloadModel.ts` (download → verify → install), `src/features/model/downloadStore.ts` (global Zustand state), `modules/model-download` (Android DownloadManager), UI: `src/components/ModelDownloadCard.tsx`.

1. On the readiness screen (when the model check fails) or **Settings › On-device AI**, tap **Download the model (≈380 MB, once)**. The app asks first, showing the size and a "use Wi-Fi" note.
2. Free space is checked before starting: model size + 200 MB margin, and twice the model size on the DownloadManager path (the file is downloaded to app-specific external storage, then copied into internal storage).
3. **Android with the `model-download` module:** Android's DownloadManager fetches `sourceUrl` into `Android/data/ph.skimcare.app/files/model-downloads/<fileName>.part`. The system shows a progress notification and the download keeps going when the user leaves the screen, backgrounds the app, or the app is killed. On the next launch, `_layout.tsx` re-attaches to that job (`findByUrl`) and continues: progress, then install. The app polls the job every second (no events).
4. **Fallback (iOS, Android builds made before the module, any build where `requireOptionalNativeModule('ModelDownload')` is null):** expo-file-system `File.createDownloadTask` with progress. It runs while the app process is alive; leaving the screen is fine, but a killed app loses the partial file and starts over.
5. Either way the file is moved to `files/models/<fileName>.part`, checked natively against the pinned size and MD5 (`verifyAndInstall`, shared with import), and only then moved over the real name. Any loaded model is released first. A mismatching file is deleted; an installed model is kept.
6. Readiness runs its checks again when the install finishes. It still reports offline-ready only when every real check passes.

Progress (%, MB done/total, speed, "waiting for internet") shows on the card and as a small pill on Home; it lives in a global store, so it survives navigation. Status is always icon + words. Cancel removes the partial file.

**Privacy:** the only request is a GET of the public model file at a pinned Hugging Face revision. No document content, identifiers or telemetry are sent, and nothing in the download code logs. Hugging Face/its CDN sees the phone's IP address and the file requested, as with any download.

**Native part:** `modules/model-download/android/.../ModelDownloadModule.kt` exposes `start`, `query`, `findByUrl`, `cancel`, `install`. It needs a new development/EAS build; until then the fallback is used.

## Import the model file instead (no adb)

Android, local engine only (`EXPO_PUBLIC_ENGINE=local`). Code: `src/features/model/importModel.ts`, UI: `src/components/ModelImportCard.tsx` (shown under **Import a file instead** on the download card).

1. Get `Qwen3-0.6B-Q4_K_M.gguf` (≈380 MB, `sourceUrl` in `models.ts`) onto the phone once: USB copy to `Download/`, the Files app, or a one-time download in the browser.
2. In the app, open **Settings › On-device AI** (or the readiness screen when the model check fails), tap **Import a file instead**, then **Import model file**, and pick the file.
3. The app checks name and size against `models.ts`, copies the file into its private storage (`files/models/<fileName>` of `ph.skimcare.app`, the same place as the adb steps above) under a temporary `.part` name, checks the pinned MD5 natively, and only then moves it into place. A mismatching copy is deleted and an already-installed model is kept. Readiness runs again after a successful import.

Any pinned model with an `md5` can be imported (0.6B Q4_K_M or Q4_0); readiness still checks `DEFAULT_MODEL_ID`. The picker opens the file in place (`copyToCacheDirectory: false`), so there is only one extra copy, and nothing is uploaded. You can delete the file from `Download/` afterwards. The MD5 check is synchronous, so the screen pauses for a few seconds during "Checking the file".

## Still to decide / verify

- **Model location for the demo build:** ship it inside the app (APK grows by roughly 400 MB to 1 GB) or place it separately as above. Readiness reports a missing file either way.
- **Memory:** check peak RAM and `context.release()` behaviour on the demo phone (PRD §12 low-memory row).
- **Native logging of document text — fixed (3 places):** `patches/llama.rn+0.12.9.patch` makes these lines log counts only. `plugins/withLlamaFromSource.js` sets `rnllamaBuildFromSource=true` so the patched source is compiled; the source build needs Python 3 on the build machine.
  1. `cpp/rn-completion.cpp:402` (INFO) logged every prompt's token IDs.
  2. `cpp/rn-completion.cpp:1011` (ERROR) logged token text when an eval failed.
  3. `cpp/common/chat.cpp:3566` (WARN, found 2026-10-10) logged the model's whole reply whenever llama.rn's chat parser couldn't parse it. With Qwen3 that is **every** call, because of the empty `<think></think>` prefix, so explanations, amounts and names reached logcat. The DEBUG lines next to it (full output, parsed message) are removed too.

  Verified on the emulator: across 16 extraction calls, logcat shows only `prompt tokenized, num_prompt_tokens: N` and `unparsed peg-native output (N of M chars)`. When upgrading llama.rn, run a review and grep logcat for `RNLlama|RNLLAMA` before shipping, then regenerate the patch with `npx patch-package llama.rn --include "(rn-completion|common[\\/]chat)\.cpp$"`.
- **Speed:** llama.rn reuses the KV cache for the shared system prompt, so only the first call evaluates the whole prompt (≈690 tokens). Later blocks evaluate only ≈40–100 new tokens. Generating the answer is the main cost.

  | Device | Prompt | Generation | Per block |
  |---|---|---|---|
  | Emulator (2 x86_64 threads, PC idle) | ≈22 tok/s | ≈8 tok/s | ≈20 s |
  | TECNO Spark 50 5G (MT6835, 2×A76 + 6×A55, 3.7 GB), 4 threads, **thermal status 3 and swapping** | 6–27 tok/s | 2–3 tok/s | 40–80 s |

  The phone numbers were taken while it was hot (CPU 61–64 °C, all cores capped at 1.4 GHz) and out of memory (74 MB free, 1.7 GB swap), while charging over USB. Re-measure cool, with background apps closed.
- **Device benchmark (dev builds):** open `pirmabago://diagnostics?bench=1` (e.g. `adb shell am start -d "pirmabago://diagnostics?bench=1" ph.skimcare.app`). It runs llama.cpp's synthetic bench (no document text) for every installed 0.6B model × CPU setting (default, 2 threads, 2 threads pinned to cores 6–7, 6 and 8 threads) and prints `[bench]` lines to the Metro log. Use the result to set `CPU_SETTINGS` in `src/ai/llm/llamaRuntime.ts` and `DEFAULT_MODEL_ID` in `models.ts`. The Q4_0 file is pinned (SHA-256 verified, MD5 recorded) and was copied to the test phone, but the bench hasn't been run yet.
- **Context size:** `n_ctx` 2048 (was 4096; the KV cache costs ≈112 KB per token, so this frees ≈235 MB). One call holds the system prompt (≈690 tokens), at most 300 characters of earlier text, one block and ≤200 output tokens; quiz calls ≤256.

## Measuring extraction quality (PC, no phone needed)

`npm run eval:llm` runs the real prompt → parser → evidence gate → scorer on the 30 fictional contracts in `tests/fixtures/contracts.ts`, against a local llama.cpp server running the same GGUF. Same prompts and gate as the app, so prompt changes can be scored in about 10 minutes without a device. CPU speed and sampling differ from llama.rn on the phone, so treat timings as relative and confirm the final choice on the phone.

1. Get the official llama.cpp Windows CPU build (`llama-<build>-bin-win-cpu-x64.zip` from github.com/ggml-org/llama.cpp releases; check the SHA-256 listed on the release) and unzip it outside the repo.
2. Start the server on localhost only:
   ```bash
   llama-server -m Qwen3-0.6B-Q4_K_M.gguf --host 127.0.0.1 --port 8080 -c 4096 --jinja -t 8
   ```
3. Run the eval: `npm run eval:llm -- [--ids svc-01,ins-02] [--limit 10] [--verbose]`. `--verbose` prints gate rejections and any finding that cites injection text.

The script refuses any `LLM_URL` that isn't localhost and only sends fictional fixtures. Never point it at real contracts. Record the results in `PROGRESS.md` with the `PROMPT_VERSION`.

## Clause classifier (Laya) for the type pass

Checked 2026-10-12. Pass 1 of extraction (one block → finding type or "none") can run on a small encoder classifier instead of Qwen. Pass 2 (explanations) stays on Qwen. Code: `src/ai/llm/triageClassifier.ts` (interface) and `src/ai/classifier/` (core, tokenizer, phone and web runtimes, readiness row, on/off switch). The engine uses the classifier's label only when it is installed, verified and confident (`LAYA_SPEC.threshold`). Otherwise Qwen decides as before, and after 3 classifier errors in one review Qwen decides the rest. Labels still go through `typeCheck.ts` and the evidence gate.

| | |
|---|---|
| **Phone runtime** | `onnxruntime-react-native@1.24.3`, the latest on npm (the JS package has not been published past 1.24.3, while onnxruntime-web is at 1.30). It is a JSI host object installed through a legacy NativeModule. On RN 0.86 bridgeless, that goes through `getCatalystInstance()`, which still returns a `BridgelessCatalystInstance` and logs a warning |
| **Autolinking fix** | The package ships a legacy `unimodule.json`, so Expo autolinking skipped it and `NativeModules.Onnxruntime` was null ("Cannot read property 'install' of null"). `react-native.config.js` at the repo root forces React Native autolinking. Check with `npx expo-modules-autolinking react-native-config --platform android --json` |
| **Gradle patch** | `patches/onnxruntime-react-native+1.24.3.patch` pins `onnxruntime-android:1.24.3`. Upstream uses `latest.integration`, which would pull the 1.31.0 headers and libs at build time. The patch also drops `org.gradle.util.VersionNumber`, because Expo SDK 57 builds with Gradle 9.3.1 |
| **APK size** | arm64-v8a `libonnxruntime.so` 1.24.3 is 25.8 MB raw / 9.4 MB zipped (1.31.0 would be 34.2 / 12.9 MB). The preview APK is arm64 only |
| **Web runtime** | `onnxruntime-web@1.30.0`, wasm backend only: `ort.wasm.min.mjs` (50 KB) and `ort-wasm-simd-threaded.{mjs,wasm}` (14.2 MB), copied to `public/vendor/ort` by `scripts/copy-web-assets.mjs` (no CDN). Threads: `min(4, cores − 1)` when `crossOriginIsolated`, else 1. SIMD build only, which every current browser supports |
| **Tokenizer** | `@huggingface/tokenizers@0.2.0`: pure JS, no dependencies, 37 KB minified, and it compiles with this project's `hermesc`. TextDecoder is polyfilled only when missing. The library has no truncation, so we add our own, and the context is cut first. Jest maps it to the CJS build (`package.json` `moduleNameMapper`) |
| **Files** | Pins live in `src/ai/classifier/laya-files.json` (TODO: sizes, SHA-256, MD5) and become `LAYA_CLASSIFIER` in `models.ts`. The files are assets of the GitHub release `laya-v1` on chrisraro/SkimCare. **Phone:** downloaded with the GGUF downloader into `<documents>/models/`. DownloadManager follows GitHub's redirect; we check size and MD5, download to a `.part` file, and delete it on mismatch. **Web:** GitHub asset downloads send **no** `Access-Control-Allow-Origin`, on the 302 or on the final CDN response. So the Vercel build copies the files into `public/vendor/laya` (SHA-256 checked at build time). The browser then downloads them from our own origin into Cache Storage (`laya-classifier`) and verifies them again before loading. The service worker passes `/vendor/laya/` through |
| **Readiness** | Row "Clause sorter (optional)" passes only after the files are present, the checksums match and one test classification runs. It never changes `offlineReady` |
| **Switch** | Diagnostics → Clause sorter (persisted as setting `clauseSorter`). To turn it off for a whole build, set `EXPO_PUBLIC_CLAUSE_SORTER=off` |

To verify on a device: make an EAS preview build (native module + Gradle 9), then check the readiness row and the `[llm-stats] … sorter asked N used M` line in the Metro log.
