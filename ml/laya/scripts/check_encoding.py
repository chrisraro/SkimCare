"""Assert triage_common.encode == the official laya path (Agent._to_internal + laya.common.build_sequence),
and that the official laya Agent gives the same probabilities as forward_logits + temperature.

  .venv/Scripts/python scripts/check_encoding.py --checkpoint checkpoints/triage-v3-wc150 --data data/dev.jsonl
"""
import argparse
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from triage_common import (HEAD_STYLES, LABELS, build_head_const, collate, encode, forward_logits,  # noqa: E402
                           laya_internal_question, load_checkpoint, make_state, read_jsonl, softmax_np)

HERE = os.path.dirname(os.path.abspath(__file__))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--checkpoint", default=os.path.join(HERE, "..", "checkpoints", "base-multilingual"))
    ap.add_argument("--data", default=os.path.join(HERE, "..", "data", "dev.jsonl"))
    a = ap.parse_args()
    import torch
    from laya.common import build_sequence
    model, tok, cfg = load_checkpoint(a.checkpoint)
    model.eval()
    tri = cfg.get("skimcare_triage", {})
    style = tri.get("head_style", "full")
    max_len, hml = cfg["max_len"], cfg.get("head_max_len", 256)
    head = build_head_const(tok, max_len, hml, style)
    print("head style %s: %d tokens, markers %s, room %d" % (style, len(head.ids), head.markers, head.room))
    q = laya_internal_question(style)
    rows = read_jsonl(a.data)
    states = [make_state(r["text"], r.get("context"), tri.get("use_context", True)) for r in rows]
    states += [make_state("x " * 400), make_state("  Ang   bayad\n\tay <mask> PHP 5,000. ")]
    for s in states:
        mine = encode(tok, head, s)
        ref, markers = build_sequence(tok, s, q, max_len, hml)
        assert mine == ref, (s, mine[:20], ref[:20])
        assert markers == head.markers
    print("encode == laya.common.build_sequence on %d states" % len(states))
    from laya import load
    agent = load(a.checkpoint, device="cpu")
    T = float(tri.get("temperature", cfg["temperature"][0]))
    worst = 0.0
    for s in states[:20]:
        res = agent.predict(s, {"t": HEAD_STYLES[style]})
        official = np.array([res["answers"]["t"]["probabilities"][k] for k in LABELS])
        with torch.no_grad():
            lg = forward_logits(model, head, *collate([encode(tok, head, s)], head.pad_id))[0].numpy()
        worst = max(worst, float(np.abs(softmax_np(lg, T) - official).max()))
    print("official laya Agent vs ours (T=%.2f): max |dp| = %.4f over 20 states (Agent rounds to 4 dp)" % (T, worst))


if __name__ == "__main__":
    main()
