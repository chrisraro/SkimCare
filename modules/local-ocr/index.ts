/**
 * JS side of the bundled ML Kit text recognizer (Android only). `getLocalOcr()`
 * returns null where the native module isn't linked (Expo Go, web, Jest), so
 * callers can say so honestly instead of falling back to sample text.
 *
 * Recognized text never leaves the phone. Never log it.
 */
import { requireOptionalNativeModule } from 'expo';

export interface OcrRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface OcrLine {
  text: string;
  /** ML Kit line confidence, 0–1. */
  confidence: number;
  frame: OcrRect;
}

/** An ML Kit text block: lines that ML Kit grouped together (roughly a paragraph). */
export interface OcrRegion {
  frame: OcrRect;
  lines: OcrLine[];
}

/** One recognized page. Frames are pixels of the upright image, `width` × `height`. */
export interface OcrPageResult {
  width: number;
  height: number;
  blocks: OcrRegion[];
}

/** Error codes the native module rejects with; messages never contain document text. */
export type LocalOcrErrorCode =
  | 'ERR_IMAGE_UNREADABLE'
  | 'ERR_PDF_UNREADABLE'
  | 'ERR_PDF_PASSWORD'
  | 'ERR_PAGE_RANGE'
  | 'ERR_OCR_FAILED'
  | 'ERR_ROTATION';

export interface LocalOcrModule {
  /** Draws a known string and reads it back on this phone (readiness). */
  selfTest(): Promise<boolean>;
  /** `rotation` is the user's extra clockwise turn; EXIF orientation is applied natively. */
  recognizeImage(uri: string, rotation: 0 | 90 | 180 | 270): Promise<OcrPageResult>;
  pdfPageCount(uri: string): Promise<number>;
  /** Renders a 1-based PDF page in memory and recognizes it. */
  recognizePdfPage(uri: string, page: number): Promise<OcrPageResult>;
}

export function getLocalOcr(): LocalOcrModule | null {
  return requireOptionalNativeModule<LocalOcrModule>('LocalOcr');
}
