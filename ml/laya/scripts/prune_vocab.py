"""Prune the 256k mmBERT/Gemma BPE vocabulary to the tokens English + Filipino text actually uses.

The token embedding is 256000 x 768 = 196.6M of laya-multilingual's ~322M parameters, and the
tokenizer.json is 34 MB. Contracts in English, Filipino and Taglish use a small fraction.

Keep set K = special/added tokens + the 256 byte-fallback tokens + every token produced when the
full tokenizer encodes the corpus (training data + the question head + EN/FIL reference text),
then closed under BPE merge ancestry (if a token is kept, both halves of every merge producing it
are kept). Merges are kept iff both halves and the result are kept.

Why this is safe: for any text whose *full-vocab* tokenization uses only kept tokens, every merge
the full tokenizer applied produced an ancestor of a kept token, so the pruned tokenizer applies
the same merges in the same order and returns the same tokens (re-numbered). Text that needed a
dropped token is split into smaller kept pieces or byte-fallback tokens: never <unk>, slightly
different input. evaluate.py measures the effect.

Outputs (in --out): tokenizer.json (pruned, emits NEW ids), keep_ids.json (new id i <- old id
keep[i]), prune_report.json.
"""
import argparse
import glob
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))


def iter_corpus(paths, max_chars):
    total = 0
    for p in paths:
        if p.endswith(".jsonl"):
            with open(p, encoding="utf-8") as f:
                for line in f:
                    if line.strip():
                        r = json.loads(line)
                        for k in ("text", "context"):
                            if r.get(k):
                                yield r[k]
        else:
            with open(p, encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if line:
                        total += len(line)
                        yield line
                        if max_chars and total > max_chars:
                            break


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--tokenizer", required=True, help="full tokenizer.json")
    ap.add_argument("--corpus", nargs="+", required=True, help="text files (one passage per line) and/or *.jsonl data files; globs ok")
    ap.add_argument("--min-count", type=int, default=1)
    ap.add_argument("--max-chars-per-file", type=int, default=0)
    ap.add_argument("--out", required=True)
    a = ap.parse_args()
    from tokenizers import Tokenizer
    from triage_common import QUESTION

    with open(a.tokenizer, encoding="utf-8") as f:
        tj = json.load(f)
    tok = Tokenizer.from_str(json.dumps(tj))
    vocab = tj["model"]["vocab"]
    id2tok = {i: t for t, i in vocab.items()}
    counts = {}
    paths = [p for g in a.corpus for p in sorted(glob.glob(g))]
    n_texts, n_chars = 0, 0
    head_text = [QUESTION["instructions"], "choice question: " + QUESTION["instructions"]] + \
        [" %s: %s" % (k, v) for k, v in QUESTION["criteria"].items()]
    batch = []

    def flush(weight=1):
        for enc in tok.encode_batch(batch, add_special_tokens=False):
            for i in enc.ids:
                counts[i] = counts.get(i, 0) + weight
        batch.clear()

    # the question head and our own data (*.jsonl) are always kept, whatever --min-count says
    always = 10 ** 9
    for group, weight in ((head_text + [t for p in paths if p.endswith(".jsonl") for t in iter_corpus([p], 0)], always),
                          ([p for p in paths if not p.endswith(".jsonl")], 1)):
        stream = group if weight == always else iter_corpus(group, a.max_chars_per_file)
        for text in stream:
            batch.append(text)
            n_texts += 1
            n_chars += len(text)
            if len(batch) >= 2000:
                flush(weight)
        flush(weight)
    keep = {i for i, c in counts.items() if c >= a.min_count}
    keep |= {t["id"] for t in tj["added_tokens"]}
    # byte-fallback pieces (a few, e.g. <0x09>, do not exist because the byte has its own token; same for the full vocab)
    keep |= {vocab["<0x%02X>" % b] for b in range(256) if "<0x%02X>" % b in vocab}
    # every single character below U+2000 (Latin incl. ñ/accents, Greek, ...) plus general punctuation and
    # currency signs (₱ U+20B1), bare or with the word-start marker, so unseen letters stay real tokens
    def small_char(c):
        return ord(c) < 0x2000 or 0x2000 <= ord(c) <= 0x20CF
    keep |= {i for t, i in vocab.items()
             if (len(t) == 1 and small_char(t)) or (len(t) == 2 and t[0] == "▁" and small_char(t[1]))}
    # merge ancestry closure
    merges = tj["model"]["merges"]
    pairs = [tuple(m.split(" ", 1)) if isinstance(m, str) else tuple(m) for m in merges]
    producers = {}
    for x, y in pairs:
        producers.setdefault(x + y, []).append((x, y))
    stack = [id2tok[i] for i in keep]
    keep_tok = set(stack)
    while stack:
        t = stack.pop()
        for x, y in producers.get(t, ()):
            for part in (x, y):
                if part not in keep_tok and part in vocab:
                    keep_tok.add(part)
                    stack.append(part)
    keep_ids = sorted(vocab[t] for t in keep_tok if t in vocab)
    old2new = {o: n for n, o in enumerate(keep_ids)}
    new_vocab = {id2tok[o]: n for o, n in old2new.items()}
    new_merges = [m for m, (x, y) in zip(merges, pairs) if x in keep_tok and y in keep_tok and (x + y) in keep_tok]
    tj2 = dict(tj)
    tj2["model"] = dict(tj["model"], vocab=new_vocab, merges=new_merges)
    tj2["added_tokens"] = [dict(t, id=old2new[t["id"]]) for t in tj["added_tokens"]]
    pp = json.loads(json.dumps(tj.get("post_processor")))
    if pp and "special_tokens" in pp:
        for v in pp["special_tokens"].values():
            v["ids"] = [old2new[i] for i in v["ids"]]
    tj2["post_processor"] = pp
    os.makedirs(a.out, exist_ok=True)
    out_tok = os.path.join(a.out, "tokenizer.json")
    with open(out_tok, "w", encoding="utf-8") as f:
        json.dump(tj2, f, ensure_ascii=False, separators=(",", ":"))
    with open(os.path.join(a.out, "keep_ids.json"), "w") as f:
        json.dump(keep_ids, f)
    # self-check: on the corpus, pruned ids == remapped full ids for texts that only used kept tokens
    tok2 = Tokenizer.from_file(out_tok)
    jsonl = [p for p in paths if p.endswith(".jsonl")]
    # with --min-count 1 every corpus text must tokenize identically; otherwise only the always-kept data must
    if a.min_count > 1:
        sample = head_text + list(iter_corpus(jsonl, 0))
    else:
        sample = head_text + [t for _, t in zip(range(20000), iter_corpus(paths, a.max_chars_per_file))]
    same = sum(tok2.encode(t, add_special_tokens=False).ids == [old2new[i] for i in tok.encode(t, add_special_tokens=False).ids]
               for t in sample)
    rep = {"corpus_files": paths, "texts": n_texts, "chars": n_chars, "observed_tokens": len(counts),
           "kept_tokens": len(keep_ids), "full_vocab": len(vocab), "merges_full": len(merges), "merges_kept": len(new_merges),
           "tokenizer_json_bytes": os.path.getsize(out_tok), "identical_tokenization_on_corpus_sample": "%d/%d" % (same, len(sample))}
    with open(os.path.join(a.out, "prune_report.json"), "w") as f:
        json.dump(rep, f, indent=2)
    print(json.dumps(rep, indent=2))
    if same != len(sample):
        raise SystemExit("pruned tokenizer disagrees with the full tokenizer on corpus text")


if __name__ == "__main__":
    main()
