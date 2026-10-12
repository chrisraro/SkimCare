"""Dump {state, ids} for every row (Python `tokenizers`), for js/check_tokenizer_parity.mjs."""
import argparse
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from triage_common import make_state  # noqa: E402


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--tokenizer", required=True)
    ap.add_argument("--jsonl", nargs="+", required=True)
    ap.add_argument("--out", required=True)
    a = ap.parse_args()
    from tokenizers import Tokenizer
    tok = Tokenizer.from_file(a.tokenizer)
    n = 0
    with open(a.out, "w", encoding="utf-8") as f:
        for p in a.jsonl:
            for line in open(p, encoding="utf-8"):
                if line.strip():
                    r = json.loads(line)
                    for st in {make_state(r["text"], r.get("context")), r["text"]}:
                        f.write(json.dumps({"state": st, "ids": tok.encode(st, add_special_tokens=False).ids}, ensure_ascii=False) + "\n")
                        n += 1
    print(n, "states")


if __name__ == "__main__":
    main()
