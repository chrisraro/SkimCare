"""Reference triage predictor: exactly what the app does, step for step (see INFERENCE_SPEC.md).

  1. state =  make_state(text, context): normalize_block(text) [+ " || earlier text: " + normalize_block(context)]
  2. ids   =  spec.head_ids + tokenizer.encode(state, add_special_tokens=False)[:spec.room] + [spec.sep_id]
  3. ONNX  model(input_ids int64 [1,S], attention_mask int64 [1,S] all ones) -> logits float32 [1,12]
  4. p     =  softmax(logits / spec.temperature)  (float64 is fine; argmax is temperature-invariant)
  5. label =  spec.labels[argmax p];  confidence = max p
  6. accepted = confidence >= spec.threshold, else the app falls back to Qwen for this block.

Uses only `tokenizers` + `onnxruntime` + numpy: no torch, no laya, like the phone.

  python scripts/predict.py --export exports/triage-v1 --variant int8 "The total fee is PHP 18,000."
  python scripts/predict.py --export exports/triage-v1 --jsonl data/eval.jsonl --out preds.jsonl
"""
import argparse
import json
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from triage_common import make_state  # noqa: E402  (pure python; no torch import)


class Predictor:
    def __init__(self, export_dir, variant="int8", threads=None, threshold=None):
        import onnxruntime as ort
        from tokenizers import Tokenizer
        with open(os.path.join(export_dir, "triage_spec.json"), encoding="utf-8") as f:
            self.spec = json.load(f)
        self.tok = Tokenizer.from_file(os.path.join(export_dir, self.spec["tokenizer_file"]))
        so = ort.SessionOptions()
        if threads:
            so.intra_op_num_threads = threads
            so.inter_op_num_threads = 1
        so.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
        self.sess = ort.InferenceSession(os.path.join(export_dir, self.spec["models"][variant]["file"]), so,
                                         providers=["CPUExecutionProvider"])
        self.labels = self.spec["labels"]
        self.temperature = float(self.spec["temperature"])
        self.threshold = float(self.spec["threshold"] if threshold is None else threshold)
        self.room = self.spec["max_len"] - len(self.spec["head_ids"]) - 1

    def input_ids(self, text, context=None):
        state = make_state(text, context, self.spec.get("use_context", False))
        st = self.tok.encode(state, add_special_tokens=False).ids[: self.room]
        return self.spec["head_ids"] + st + [self.spec["sep_id"]]

    def logits(self, ids_batch):
        L = max(len(s) for s in ids_batch)
        ids = np.full((len(ids_batch), L), self.spec["pad_id"], dtype=np.int64)
        att = np.zeros((len(ids_batch), L), dtype=np.int64)
        for i, s in enumerate(ids_batch):
            ids[i, : len(s)] = s
            att[i, : len(s)] = 1
        return self.sess.run(["logits"], {"input_ids": ids, "attention_mask": att})[0]

    def finish(self, logits_row):
        z = np.asarray(logits_row, dtype=np.float64) / self.temperature
        p = np.exp(z - z.max())
        p /= p.sum()
        k = int(p.argmax())
        return {"label": self.labels[k], "confidence": float(p[k]), "accepted": bool(p[k] >= self.threshold),
                "probabilities": {lab: float(v) for lab, v in zip(self.labels, p)}}

    def predict(self, text, context=None):
        ids = self.input_ids(text, context)
        lg = self.logits([ids])[0]
        out = self.finish(lg)
        out.update({"input_ids": ids, "logits": [float(v) for v in lg]})
        return out

    def predict_many(self, items, batch=1):
        """items: [(text, context-or-None)]. batch=1 matches the app (one block at a time, no padding)."""
        res = []
        for i in range(0, len(items), batch):
            seqs = [self.input_ids(t, c) for t, c in items[i:i + batch]]
            for lg in self.logits(seqs):
                res.append((self.finish(lg), lg))
        return res


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--export", required=True)
    ap.add_argument("--variant", default="int8")
    ap.add_argument("--threshold", type=float, default=None)
    ap.add_argument("--jsonl")
    ap.add_argument("--out")
    ap.add_argument("text", nargs="*")
    a = ap.parse_args()
    pr = Predictor(a.export, a.variant, threshold=a.threshold)
    if a.jsonl:
        rows = [json.loads(l) for l in open(a.jsonl, encoding="utf-8") if l.strip()]
        res = pr.predict_many([(r["text"], r.get("context")) for r in rows])
        with open(a.out or os.devnull, "w", encoding="utf-8") as f:
            for r, (o, lg) in zip(rows, res):
                f.write(json.dumps({"text": r["text"], "gold": r.get("label"), **o, "logits": [float(v) for v in lg]}, ensure_ascii=False) + "\n")
        acc = np.mean([o["label"] == r.get("label") for r, (o, _) in zip(rows, res)])
        print("n=%d accuracy=%.4f" % (len(rows), acc))
    for t in a.text:
        o = pr.predict(t)
        print(json.dumps({"label": o["label"], "confidence": round(o["confidence"], 4), "accepted": o["accepted"],
                          "n_tokens": len(o["input_ids"])}, ensure_ascii=False))


if __name__ == "__main__":
    main()
