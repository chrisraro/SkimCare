"""Evaluate the triage model on data/eval.jsonl (or any JSONL with {"text","label",...}).

Two back ends, same metrics:
  --checkpoint DIR   PyTorch, the trained checkpoint (reference)
  --export DIR       ONNX through predict.Predictor, i.e. exactly what the app runs (fp32/int8/pruned)

Reports accuracy, macro-F1, per-label P/R/F1, confusion matrix, per-language breakdown, and the
app-critical TERM RECALL (gold label != none and predicted != none): a term triaged as "none" is
silently dropped. Then the confidence-threshold trade-off: blocks under the threshold go to Qwen,
so for each threshold we report coverage (share Laya answers), accuracy on what Laya answers,
and how many real terms Laya *confidently* calls "none" (the only ones lost with fallback).

  .venv/Scripts/python scripts/evaluate.py --checkpoint checkpoints/triage-v1 --data data/eval.jsonl --out runs/eval_v1.json
  .venv/Scripts/python scripts/evaluate.py --export exports/triage-v1 --variant int8 --data data/eval.jsonl
"""
import argparse
import json
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from triage_common import LABELS, NONE_INDEX, metrics, read_jsonl, softmax_np  # noqa: E402

THRESHOLDS = [0.0, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.85, 0.9, 0.95, 0.97, 0.99]


def torch_logits(ckpt, rows, max_len=None):
    import torch
    from train import predict_logits
    from triage_common import build_head_const, load_checkpoint
    model, tok, cfg = load_checkpoint(ckpt)
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    model.to(device)
    tri = cfg.get("skimcare_triage", {})
    head = build_head_const(tok, max_len or cfg["max_len"], cfg.get("head_max_len", 256), tri.get("head_style", "full"))
    temp = float(tri.get("temperature", cfg["temperature"][0]))
    return predict_logits(model, tok, head, rows, device, amp=False, use_context=tri.get("use_context", True)), temp


def onnx_logits(export_dir, variant, rows, threads=None):
    from predict import Predictor
    pr = Predictor(export_dir, variant, threads=threads)
    res = pr.predict_many([(r["text"], r.get("context")) for r in rows])
    return np.stack([lg for _, lg in res]), pr.temperature


def tradeoff(probs, y):
    conf, pred = probs.max(-1), probs.argmax(-1)
    term = y != NONE_INDEX
    rows = []
    for t in THRESHOLDS:
        acc_mask = conf >= t
        n_acc = int(acc_mask.sum())
        rows.append({
            "threshold": t,
            "coverage": round(float(acc_mask.mean()), 4),
            "accuracy_on_accepted": round(float((pred[acc_mask] == y[acc_mask]).mean()), 4) if n_acc else None,
            "terms_confidently_called_none": int((acc_mask & term & (pred == NONE_INDEX)).sum()),
            "term_recall_if_fallback_perfect": round(float(1 - (acc_mask & term & (pred == NONE_INDEX)).sum() / max(1, term.sum())), 4),
            "sent_to_qwen": int((~acc_mask).sum()),
        })
    # "none-only" policy: accept any term label; only a "none" verdict needs confidence >= t
    none_only = []
    for t in THRESHOLDS:
        acc_mask = (pred != NONE_INDEX) | (conf >= t)
        none_only.append({
            "threshold": t, "coverage": round(float(acc_mask.mean()), 4),
            "accuracy_on_accepted": round(float((pred[acc_mask] == y[acc_mask]).mean()), 4) if acc_mask.any() else None,
            "terms_confidently_called_none": int((acc_mask & term & (pred == NONE_INDEX)).sum()),
        })
    return rows, none_only


def ece(probs, y, bins=15):
    conf, pred = probs.max(-1), probs.argmax(-1)
    correct = (pred == y).astype(float)
    edges = np.linspace(0, 1, bins + 1)
    e = 0.0
    for i, (lo, hi) in enumerate(zip(edges[:-1], edges[1:])):
        sel = (conf >= lo if i == 0 else conf > lo) & (conf <= hi)
        if sel.any():
            e += sel.mean() * abs(conf[sel].mean() - correct[sel].mean())
    return round(float(e), 4)


def report(rows, logits, temp):
    y = np.array([LABELS.index(r["label"]) for r in rows])
    probs = softmax_np(logits, temp)
    pred = probs.argmax(-1)
    alt = [[LABELS.index(l) for l in r["labels"] if l in LABELS] if isinstance(r.get("labels"), list) else None for r in rows]
    strict = None
    if any(a for a in alt):
        # rows that accept several types (eval): a prediction in `labels` is correct, so it becomes the gold
        strict = metrics(y, pred)
        y = np.array([p if a and p in a else t for t, p, a in zip(y, pred, alt)])
    m = metrics(y, pred, alt if any(a for a in alt) else None)
    if strict is not None:
        m["scoring"] = "lenient: prediction counts as correct when it is in the row's `labels`"
        m["strict_first_label"] = {k: strict[k] for k in ("accuracy", "macro_f1", "term_recall")}
    m["temperature"] = temp
    m["ece"] = ece(probs, y)
    by_lang = {}
    for lang in sorted(set(r.get("lang", "?") for r in rows)):
        sel = np.array([r.get("lang", "?") == lang for r in rows])
        mm = metrics(y[sel], pred[sel])
        by_lang[lang] = {k: mm[k] for k in ("n", "accuracy", "macro_f1", "term_recall", "terms_lost_as_none")}
    m["by_lang"] = by_lang
    m["threshold_tradeoff"], m["threshold_tradeoff_none_only"] = tradeoff(probs, y)
    return m, probs


def print_report(m):
    print("n=%d accuracy=%.4f macro_f1=%.4f TERM_RECALL=%.4f (terms lost as none: %d) term_precision=%.4f ece=%.4f T=%.2f"
          % (m["n"], m["accuracy"], m["macro_f1"], m["term_recall"], m["terms_lost_as_none"], m["term_precision"], m["ece"], m["temperature"]))
    if "accuracy_any_valid_label" in m:
        print("accuracy counting any valid label: %.4f" % m["accuracy_any_valid_label"])
    print("%-18s %6s %6s %6s %5s" % ("label", "P", "R", "F1", "n"))
    for k, v in m["per_label"].items():
        print("%-18s %6.3f %6.3f %6.3f %5d" % (k, v["precision"], v["recall"], v["f1"], v["support"]))
    print("by language:", json.dumps(m["by_lang"]))
    print("confusion (rows=gold, cols=pred, order=%s):" % ",".join(l[:6] for l in LABELS))
    for k, row in zip(LABELS, m["confusion"]):
        print("  %-18s %s" % (k, " ".join("%4d" % v for v in row)))
    print("threshold | coverage | acc on accepted | terms confidently 'none' | to Qwen")
    for r in m["threshold_tradeoff"]:
        print("  %.2f    |  %.3f   |  %s  |  %d  |  %d" % (r["threshold"], r["coverage"], r["accuracy_on_accepted"],
                                                     r["terms_confidently_called_none"], r["sent_to_qwen"]))


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    src = ap.add_mutually_exclusive_group(required=True)
    src.add_argument("--checkpoint")
    src.add_argument("--export")
    ap.add_argument("--variant", default="int8")
    ap.add_argument("--data", default=os.path.join(os.path.dirname(__file__), "..", "data", "eval.jsonl"))
    ap.add_argument("--out")
    a = ap.parse_args()
    rows = read_jsonl(a.data)
    if a.checkpoint:
        logits, temp = torch_logits(a.checkpoint, rows)
    else:
        logits, temp = onnx_logits(a.export, a.variant, rows)
    m, probs = report(rows, logits, temp)
    print_report(m)
    if a.out:
        os.makedirs(os.path.dirname(os.path.abspath(a.out)), exist_ok=True)
        with open(a.out, "w", encoding="utf-8") as f:
            json.dump(m, f, indent=2)
        np.save(os.path.splitext(a.out)[0] + "_logits.npy", logits)


if __name__ == "__main__":
    main()
