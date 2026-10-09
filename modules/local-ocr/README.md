# local-ocr

Expo native module (Android) wrapping **bundled** Google ML Kit Text Recognition v2, Latin script (`com.google.mlkit:text-recognition:16.0.1`). The model ships inside the APK (about 13 MB per ABI), so recognition works offline from the first run. Don't switch to `play-services-mlkit-text-recognition`: that variant downloads the model through Play services.

Autolinked from `./modules` (no `package.json` needed). Needs a development build, not Expo Go. In Expo Go, on web and in Jest, `getLocalOcr()` returns `null` and the local engine refuses photos and scans instead of returning sample text.

## Native API (`index.ts`)

| Function | What it does |
|---|---|
| `selfTest()` | Draws "Offline check 2468" on a bitmap and reads it back. Used by readiness, so "On-device text recognition" passes only when the model actually runs on this phone |
| `recognizeImage(uri, rotation)` | Decodes a photo with its long side between 1600 and 3200 px, applies EXIF orientation plus the user's extra rotation (0/90/180/270), then recognizes it |
| `pdfPageCount(uri)` | Page count via Android `PdfRenderer` |
| `recognizePdfPage(uri, page)` | Renders a 1-based page on white in memory (long side 2400 px, about 200 dpi for A4) and recognizes it. Never written to disk |

Each result is `{ width, height, blocks: [{ frame, lines: [{ text, confidence, frame }] }] }`, with frames in pixels of the upright image. Rejections use codes only (`ERR_IMAGE_UNREADABLE`, `ERR_PDF_UNREADABLE`, `ERR_PDF_PASSWORD`, `ERR_PAGE_RANGE`, `ERR_OCR_FAILED`, `ERR_ROTATION`). Messages never contain document text.

## JS side

- `src/ai/ocr/layout.ts` turns ML Kit output into evidence blocks:
  - Reading order: top to bottom; side-by-side regions (columns, signature blocks) left to right.
  - Splits at sentence ends, headings and clause numbers (`1.`, `2.3`, `(a)`), and rejoins a sentence ML Kit split across regions.
  - Stable ids `p{page}_b{n}`, normalized `bbox`.
  - `confidence` is that of the weakest line.
  - `critical` uses the same rule as the PDF text layer.
  - **Digit repair:** inside a token that is otherwise a number, look-alike letters are turned back into digits ("PHP 6,40o" → "PHP 6,400", "1oth" → "10th"). This happens only when the result is a well-formed number. A repaired block's confidence is capped below `LOW_CONFIDENCE`, so the user always checks it on S08.
- `src/ai/ocr/mlKitOcr.ts` is the `OcrEngine`. It reads one page at a time, so cancelling stops between pages. Scanned PDFs over 30 pages are refused with a plain message.
- `src/ai/recognize.ts` routes documents:
  - Digital PDF: text layer.
  - Scanned PDF: this module.
  - Mixed PDF: text layer, plus OCR for the image-only pages.
  - Pages with no readable text are named in the note.

## Privacy

- Recognized text is only returned to JS. Never log it.
- ML Kit's terms say on-device APIs don't send inputs or outputs to Google. When the phone is online, ML Kit does send **usage metrics** (device and app info, API performance, input/output sizes, error codes; see developers.google.com/ml-kit/android-data-disclosure). The terms require that this is disclosed to users, so the welcome/privacy copy should mention it. No document content is involved, and recognition works in airplane mode.
