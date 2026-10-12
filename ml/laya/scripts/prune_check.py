"""How often does a pruned tokenizer give the same tokens as the full one on text it never saw?

  .venv/Scripts/python scripts/prune_check.py --full checkpoints/base-multilingual/tokenizer/tokenizer.json \
      --pruned exports/vocab-m300 --jsonl data/eval.jsonl --heldout-parquet checkpoints/corpus/wiki_tl.parquet
"""
import argparse
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from triage_common import make_state  # noqa: E402


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--full", required=True)
    ap.add_argument("--pruned", nargs="+", required=True)
    ap.add_argument("--jsonl", nargs="*", default=[])
    ap.add_argument("--heldout-parquet", help="wiki parquet; paragraphs AFTER the first 60M chars (not in the prune corpus)")
    ap.add_argument("--heldout-n", type=int, default=3000)
    a = ap.parse_args()
    from tokenizers import Tokenizer
    full = Tokenizer.from_file(a.full)
    sets = {}
    for p in a.jsonl:
        rows = [json.loads(l) for l in open(p, encoding="utf-8") if l.strip()]
        sets[os.path.basename(p)] = [make_state(r["text"], r.get("context")) for r in rows]
    if a.heldout_parquet:
        import pyarrow.parquet as pq
        seen, out = 0, []
        for b in pq.ParquetFile(a.heldout_parquet).iter_batches(columns=["text"], batch_size=2000):
            for t in b.column(0).to_pylist():
                for para in t.split("\n"):
                    para = " ".join(para.split())
                    if len(para) >= 40:
                        seen += len(para)
                        if seen > 60_000_000 and len(out) < a.heldout_n:
                            out.append(para)
            if len(out) >= a.heldout_n:
                break
        sets["heldout_wiki_tl"] = out
    res = {}
    for pdir in a.pruned:
        keep = json.load(open(os.path.join(pdir, "keep_ids.json")))
        o2n = {o: n for n, o in enumerate(keep)}
        pr = Tokenizer.from_file(os.path.join(pdir, "tokenizer.json"))
        r = {"kept": len(keep)}
        for name, texts in sets.items():
            same, nf, np_ = 0, 0, 0
            for t in texts:
                f = full.encode(t, add_special_tokens=False).ids
                p = pr.encode(t, add_special_tokens=False).ids
                same += [o2n.get(i, -1) for i in f] == p
                nf += len(f)
                np_ += len(p)
            r[name] = {"n": len(texts), "identical": round(same / max(1, len(texts)), 4), "token_inflation": round(np_ / max(1, nf), 4)}
        res[os.path.basename(pdir)] = r
    print(json.dumps(res, indent=1))


if __name__ == "__main__":
    main()
