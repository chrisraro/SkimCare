"""Build a TINY placeholder dataset from tests/fixtures/contracts.ts, only to smoke-test the pipeline.

NOT training data: ~100 blocks, and these same blocks are the app's evaluation fixtures.
Written to ml/laya/data/placeholder/ (git-ignored). Never commit it, never report numbers
from it as model quality.

Each tagged fixture line becomes {"text", "label" (first tag), "labels" (all tags), "lang",
"source"}; untagged lines become label "none".
"""
import argparse
import hashlib
import json
import os
import re

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
SRC = os.path.join(ROOT, "tests", "fixtures", "contracts.ts")
OUT = os.path.join(os.path.dirname(__file__), "..", "data", "placeholder")

STR = r"""'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)\""""
TAGGED = re.compile(r"^\s*\[\s*(?:%s)\s*,\s*(.*)\]\s*,?\s*$" % STR)
PLAIN = re.compile(r"^\s*(?:%s)\s*,?\s*$" % STR)
SEED = re.compile(r"^\s*(?:service|installment|injection)\(.*?'([a-z]+-\d+)'|^\s*id:\s*'([^']+)'")
LANG = re.compile(r"^\s*language:\s*'([a-z]+)'")


def unescape(s):
    return s.encode("utf-8").decode("unicode_escape").encode("latin-1").decode("utf-8") if "\\" in s else s


def parse():
    rows, cid, lang = [], None, "en"
    with open(SRC, encoding="utf-8") as f:
        lines = f.read().split("const SEEDS", 1)[1].splitlines()
    for line in lines:
        m = SEED.match(line)
        if m:
            cid, lang = m.group(1) or m.group(2), "en"
            continue
        m = LANG.match(line)
        if m:
            lang = {"mixed": "taglish"}.get(m.group(1), m.group(1))
            for r in rows:
                if r["source"].startswith("fixture:%s:" % cid):
                    r["lang"] = lang
            continue
        m = TAGGED.match(line)
        if m and cid:
            text = unescape(m.group(1) or m.group(2) or "")
            tags = [t for t in re.findall(r"'([A-Za-z_]+)'", m.group(3)) if t != "INJECTION"]
            label = tags[0] if tags else "none"
            rows.append({"text": text, "label": label, "labels": tags or ["none"], "lang": lang,
                         "source": "fixture:%s:%d" % (cid, len(rows))})
            continue
        m = PLAIN.match(line)
        if m and cid and (m.group(1) or m.group(2)):
            text = unescape(m.group(1) or m.group(2))
            rows.append({"text": text, "label": "none", "labels": ["none"], "lang": lang, "source": "fixture:%s:%d" % (cid, len(rows))})
    return rows


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=OUT)
    a = ap.parse_args()
    rows = parse()
    os.makedirs(a.out, exist_ok=True)
    split = {"train": [], "dev": [], "eval": []}
    for r in rows:
        cid = r["source"].split(":")[1]
        h = int(hashlib.sha1(cid.encode()).hexdigest(), 16) % 10
        split["train" if h < 6 else "dev" if h < 8 else "eval"].append(r)
    for k, v in split.items():
        with open(os.path.join(a.out, k + ".jsonl"), "w", encoding="utf-8") as f:
            for r in v:
                f.write(json.dumps(r, ensure_ascii=False) + "\n")
        print(k, len(v))
    print("PLACEHOLDER ONLY - smoke test, not training data")


if __name__ == "__main__":
    main()
