/**
 * Tokenizer for the classifier: @huggingface/tokenizers (pure JS, no dependencies, ~37 KB
 * minified) reading the model's own tokenizer.json, so ids match the Python tokenizer
 * the model was trained with (golden vectors: tests/classifier.test.ts).
 *
 * The library has no truncation, so this adds the Rust tokenizers' behaviour for a text
 * pair: special tokens always fit, the block is kept from its start, and the context (the
 * previous block) gives way first and keeps its end (the part nearest the block).
 *
 * Runs on Hermes: hermesc compiles the library (its regexes use \p{…} and lookbehind,
 * both supported). Hermes may lack TextDecoder, which the library constructs for its
 * decoders; we never decode, so a minimal UTF-8 TextDecoder is installed only if missing.
 */
import { Tokenizer } from '@huggingface/tokenizers';
import type { EncodedInput, TextEncoderLike } from './laya';

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

interface PostProcessorLike {
  post_process(tokens: string[], pair?: string[] | null, addSpecialTokens?: boolean): { tokens: string[]; token_type_ids?: number[] };
}

/** Builds an encoder from parsed tokenizer.json (+ tokenizer_config.json). */
export function createHfEncoder(tokenizerJson: object, tokenizerConfig: object = {}): TextEncoderLike {
  ensureTextDecoder();
  const tok = new Tokenizer(tokenizerJson, tokenizerConfig);
  const post = tok.post_processor as unknown as PostProcessorLike | null;
  const unkId = (tok.model as unknown as { unk_token_id?: number } | null)?.unk_token_id ?? 0;

  const segment = (text: string) => tok.tokenize(text, { add_special_tokens: false });
  const assemble = (a: string[], b: string[] | null) => (post ? post.post_process(a, b, true) : { tokens: b ? [...a, ...b] : a });
  // Special tokens the template adds around one text / a pair (e.g. [CLS] a [SEP] / [CLS] a [SEP] b [SEP]).
  const specialsSingle = assemble(['a'], null).tokens.length - 1;
  const specialsPair = assemble(['a'], ['b']).tokens.length - 2;

  return {
    encode(text: string, pair: string | null, maxTokens: number): EncodedInput {
      let first = segment(text);
      let second = pair ? segment(pair) : null;
      if (second) {
        const room = maxTokens - specialsPair - first.length;
        second = room > 0 ? second.slice(Math.max(0, second.length - room)) : null;
        if (second && second.length === 0) second = null;
      }
      const specials = second ? specialsPair : specialsSingle;
      if (first.length + (second?.length ?? 0) + specials > maxTokens) first = first.slice(0, Math.max(0, maxTokens - specials - (second?.length ?? 0)));
      const out = assemble(first, second);
      const ids = out.tokens.map((t) => tok.token_to_id(t) ?? unkId);
      return { ids, mask: ids.map(() => 1), typeIds: out.token_type_ids ?? ids.map(() => 0) };
    },
  };
}
