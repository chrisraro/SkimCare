"""Write golden test vectors for the JS runtime: input text (+context) -> state -> token ids -> logits -> label.

Produced with predict.Predictor (tokenizers + onnxruntime CPU, i.e. the reference app path) for the
shipped variant, plus fp32 logits for reference. Texts are invented.

  .venv/Scripts/python scripts/make_golden.py --export exports/laya-v1 --variant q4 --out golden/laya-v1.golden.json
"""
import argparse
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from predict import Predictor  # noqa: E402
from triage_common import make_state  # noqa: E402

CASES = [
    {"text": "The total fee is PHP 18,000, payable in two equal installments.", "context": None, "note": "English, amount"},
    {"text": "Maaaring wakasan ng alinmang partido ang kasunduang ito sa pamamagitan ng nakasulat na abiso tatlumpung (30) araw bago nito.",
     "context": None, "note": "Filipino, termination/notice"},
    {"text": "Kung ma-late ang bayad, may penalty na ₱500 per week hanggang ma-settle ang balance.", "context": None,
     "note": "Taglish, late fee, peso sign"},
    {"text": "The balance is due within  seven (7)\n days after the Client approves the final design.",
     "context": "…the Client shall pay a down payment of PHP 10,000 upon signing.", "note": "context + whitespace normalisation"},
    {"text": "SIGNED this 3rd day of March at Quezon City. — “Señora Dela Peña” 🙂", "context": None,
     "note": "heading/signature, curly quotes, ñ, emoji (byte fallback)"},
]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--export", required=True)
    ap.add_argument("--variant", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--threshold", type=float, default=None, help="override the spec threshold (release value)")
    a = ap.parse_args()
    pr = Predictor(a.export, a.variant, threads=1, threshold=a.threshold)
    ref = Predictor(a.export, "fp32", threads=1)
    out = {"model_file": pr.spec["models"][a.variant]["file"], "variant": a.variant, "temperature": pr.temperature,
           "threshold": pr.threshold, "labels": pr.labels, "head_ids": pr.spec["head_ids"], "cases": []}
    for c in CASES:
        state = make_state(c["text"], c["context"], pr.spec.get("use_context", False))
        res = pr.predict(c["text"], c["context"])
        r32 = ref.predict(c["text"], c["context"])
        n_head = len(pr.spec["head_ids"])
        out["cases"].append({
            "note": c["note"], "text": c["text"], "context": c["context"], "state": state,
            "state_ids": res["input_ids"][n_head:-1],
            "input_ids": res["input_ids"],
            "logits": [round(v, 5) for v in res["logits"]],
            "logits_fp32": [round(v, 5) for v in r32["logits"]],
            "probabilities": [round(res["probabilities"][l], 6) for l in pr.labels],
            "label": res["label"], "confidence": round(res["confidence"], 6), "accepted": res["accepted"],
        })
        print(c["note"], "->", res["label"], round(res["confidence"], 3), len(res["input_ids"]), "tokens")
    os.makedirs(os.path.dirname(os.path.abspath(a.out)), exist_ok=True)
    with open(a.out, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)


if __name__ == "__main__":
    main()
