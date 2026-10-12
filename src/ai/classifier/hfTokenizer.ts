/**
 * Tokenizer for the classifier: @huggingface/tokenizers (pure JS, no dependencies, ~37 KB
 * minified) reading the model's own tokenizer.json (laya-v1: Gemma-style BPE with byte
 * fallback, Metaspace "always"), so ids match the Python tokenizer the model was trained
 * with (golden vectors: tests/classifier.test.ts).
 *
 * Runs on Hermes: hermesc compiles the library (its regexes use \p{…} and lookbehind,
 * both supported). Hermes may lack TextDecoder, which the library constructs for its
 * decoders; we never decode, so a minimal UTF-8 TextDecoder is installed only if missing.
 */
import { Tokenizer } from '@huggingface/tokenizers';
import type { LayaTokenizer } from './laya';

/** Minimal UTF-8 TextDecoder for runtimes without one (decode is never used for classification). */
class Utf8Decoder {
  readonly encoding = 'utf-8';
  decode(input?: ArrayBufferView | ArrayBuffer): string {
    if (!input) return '';
    const bytes = input instanceof ArrayBuffer ? new Uint8Array(input) : new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
    let out = '';
    for (let i = 0; i < bytes.length; ) {
      const b = bytes[i]!;
      const len = b < 0x80 ? 1 : b >= 0xf0 ? 4 : b >= 0xe0 ? 3 : b >= 0xc0 ? 2 : 0;
      if (len === 0 || i + len > bytes.length) {
        out += '�';
        i++;
        continue;
      }
      let cp = len === 1 ? b : b & (0xff >> (len + 1));
      for (let k = 1; k < len; k++) cp = (cp << 6) | (bytes[i + k]! & 0x3f);
      out += String.fromCodePoint(cp);
      i += len;
    }
    return out;
  }
}

export function ensureTextDecoder(): void {
  const g = globalThis as { TextDecoder?: unknown };
  if (typeof g.TextDecoder === 'undefined') g.TextDecoder = Utf8Decoder;
}

/**
 * Builds the classifier's tokenizer from parsed tokenizer.json + tokenizer_config.json.
 * `encode` returns ids WITHOUT special tokens (INFERENCE_SPEC.md step 3); laya.ts adds the
 * head and the separator and does the truncation.
 */
export function createLayaTokenizer(tokenizerJson: object, tokenizerConfig: object = {}): LayaTokenizer {
  ensureTextDecoder();
  const tok = new Tokenizer(tokenizerJson, tokenizerConfig);
  return { encode: (text: string) => tok.encode(text, { add_special_tokens: false }).ids };
}
