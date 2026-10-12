"""Turn Wikipedia parquet dumps (wikimedia/wikipedia 20231101.tl and .simple) into one-passage-per-line text
for prune_vocab.py. Public reference text only; no document content.

  .venv/Scripts/python scripts/corpus_from_wiki.py checkpoints/corpus/wiki_tl.parquet checkpoints/corpus/tl.txt --max-chars 60000000
"""
import argparse

import pyarrow.parquet as pq


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("src")
    ap.add_argument("dst")
    ap.add_argument("--max-chars", type=int, default=60_000_000)
    a = ap.parse_args()
    total = 0
    if a.src.endswith(".json"):  # CUAD v1 (SQuAD format, CC BY 4.0): English commercial contracts
        import json
        data = json.load(open(a.src, encoding="utf-8"))["data"]
        with open(a.dst, "w", encoding="utf-8") as out:
            for doc in data:
                for par in doc["paragraphs"]:
                    for line in par["context"].split("\n"):
                        line = " ".join(line.split())
                        if len(line) >= 20:
                            out.write(line + "\n")
                            total += len(line)
        print(a.dst, total)
        return
    with open(a.dst, "w", encoding="utf-8") as out:
        for batch in pq.ParquetFile(a.src).iter_batches(columns=["text"], batch_size=2000):
            for text in batch.column(0).to_pylist():
                for para in text.split("\n"):
                    para = " ".join(para.split())
                    if len(para) >= 40:
                        out.write(para + "\n")
                        total += len(para)
                if total >= a.max_chars:
                    print(a.dst, total)
                    return
    print(a.dst, total)


if __name__ == "__main__":
    main()
