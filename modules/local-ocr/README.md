# local-ocr (to be implemented)

Expo native module wrapping **bundled** Google ML Kit Text Recognition v2 for Android (no Play Services model download — must work offline on first run).

## Contract

Implement `OcrEngine` from `src/ai/engines.ts`:

```ts
recognize(pages: CapturedPage[], signal?: AbortSignal): Promise<DocumentPage[]>
```

Each returned `OcrBlock` needs: stable `id` (`p{page}_b{index}`), `page`, `text`, `originalText`, `confidence` (0–1; derive from element confidences), normalized `bbox` (0–1 of page size), and `critical` (true when the text contains PHP amounts, dates or party names).

## Notes

- Create with `npx create-expo-module@latest --local` inside this folder; requires a development build (not Expo Go).
- Use the bundled artifact `com.google.mlkit:text-recognition` (not the `play-services-mlkit-*` unbundled one).
- Never log recognized text.
