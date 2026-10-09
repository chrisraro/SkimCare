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
| **Native libs** | `postinstall` downloads prebuilt Android JNI libraries from the GitHub release and checks their SHA-256 (`install/native-artifacts.json`). llama.cpp is not compiled with our NDK. That network access happens only at install time; the app makes no network calls |
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

## Still to decide / verify

- **Model location:** ship it inside the app (APK grows by roughly 400 MB to 1 GB) or place it separately (development: `adb push`, then copy into the app's files directory with `run-as`). Readiness reports a missing file either way.
- **SHA-256 of a 400 MB+ file** must be computed natively and in a streaming way. In-memory digests (e.g. `expo-crypto` over a byte array) are not suitable. Check what SDK 57's `expo-file-system` offers before adding a native helper.
- **Context size:** start with `n_ctx` 4096. Extraction chunks are ≤3000 characters (~750 tokens) plus about 500 prompt tokens and ≤1024 output tokens.
