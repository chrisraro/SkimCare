"""Sweep weight-only (MatMulNBits) quantization configs on an exported fp32 graph.

For each config: file size, argmax agreement / logit error vs the fp32 graph, and accuracy on --data
(lenient when rows carry `labels`). Configs mix 4-bit and 8-bit per module group (encoder, encoder
mlp.Wo, decision head); the embedding Gather is always INT8. (Dynamic INT8 with quantized
activations was tried first: quantizing the 22 encoder mlp.Wo matmuls drops fp32 agreement to
~0.83 because of GeGLU activation outliers; see MODEL_NOTES.md.)

  .venv/Scripts/python scripts/quant_sweep.py --export exports/v2s-m300 --data data/dev.jsonl
"""
import argparse
import json
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from export_onnx import module_groups  # noqa: E402
from predict import Predictor  # noqa: E402
from triage_common import LABELS  # noqa: E402


def nbits(src, dst, plan, block=32):
    """plan: list of (bits, node_names), applied in order; unlisted MatMuls stay fp32. Then INT8 Gather."""
    import onnx
    from onnxruntime.quantization import QuantType, quantize_dynamic
    from onnxruntime.quantization.matmul_nbits_quantizer import MatMulNBitsQuantizer
    model = onnx.load(src)
    for step in plan:
        bits, nodes = step[0], step[1]
        blk, sym = (step[2], step[3]) if len(step) > 2 else (block, True)
        if not nodes:
            continue
        # nodes_to_include is not honoured by this ORT version; exclude everything else instead
        others = [n.name for n in model.graph.node if n.op_type == "MatMul" and n.name not in set(nodes)]
        q = MatMulNBitsQuantizer(model, bits=bits, block_size=blk, is_symmetric=sym, nodes_to_exclude=others)
        q.process()
        model = q.model.model
    tmp = dst + ".tmp.onnx"
    onnx.save(model, tmp)
    quantize_dynamic(tmp, dst, weight_type=QuantType.QInt8, op_types_to_quantize=["Gather"])
    os.remove(tmp)


def plans(fp32, pre):
    import onnx
    groups = module_groups(fp32)
    pre_nodes = {n.name for n in onnx.load(pre, load_external_data=False).graph.node if n.op_type == "MatMul"}

    def g(pred):
        return [n for n, m in groups.items() if n in pre_nodes and pred(m)]
    head = g(lambda m: m.startswith("model.head") or m.startswith("model.scorer"))
    mlp_wo = g(lambda m: m.endswith("mlp.Wo"))
    enc = g(lambda m: m.startswith("model.encoder"))
    enc_rest = [n for n in enc if n not in mlp_wo]
    return {
        "q4_all": [(4, enc + head)],
        "q4_enc_q8_head": [(4, enc), (8, head)],
        "q4_enc_q8_mlpwo_head": [(4, enc_rest), (8, mlp_wo + head)],
        "q8_all": [(8, enc + head)],
        "q4_b16": [(4, enc + head, 16, True)],
        "q4_asym": [(4, enc + head, 32, False)],
        "q4_b16_asym": [(4, enc + head, 16, False)],
    }, {"enc": len(enc), "mlp_wo": len(mlp_wo), "head": len(head)}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--export", required=True)
    ap.add_argument("--data", required=True)
    ap.add_argument("--configs", nargs="*", default=None)
    a = ap.parse_args()
    from onnxruntime.quantization.shape_inference import quant_pre_process
    import onnxruntime as ort
    fp32 = os.path.join(a.export, "model.fp32.onnx")
    pre = os.path.join(a.export, "_pre.onnx")
    if not os.path.exists(pre):
        quant_pre_process(fp32, pre, skip_symbolic_shape=False)
    rows = [json.loads(l) for l in open(a.data, encoding="utf-8") if l.strip()]
    alt = [[LABELS.index(l) for l in r.get("labels", [r["label"]])] for r in rows]
    p = Predictor(a.export, "fp32", threads=4)
    seqs = [p.input_ids(r["text"], r.get("context")) for r in rows]
    ref = np.stack([p.logits([s])[0] for s in seqs])
    configs, sizes = plans(fp32, pre)
    if a.configs:
        configs = {k: v for k, v in configs.items() if k in a.configs}
    out = {"n": len(rows), "acc_fp32": round(float(np.mean([int(k) in s for k, s in zip(ref.argmax(-1), alt)])), 4), "groups": sizes}
    print("fp32 acc", out["acc_fp32"], sizes, flush=True)
    for name, plan in configs.items():
        dst = os.path.join(a.export, "model.%s.onnx" % name)
        nbits(pre, dst, plan)
        s = ort.InferenceSession(dst, providers=["CPUExecutionProvider"])
        lg = np.stack([s.run(["logits"], {"input_ids": np.array([q], dtype=np.int64),
                                          "attention_mask": np.ones((1, len(q)), dtype=np.int64)})[0][0] for q in seqs])
        out[name] = {"mb": round(os.path.getsize(dst) / 2**20, 1),
                     "argmax_agree_vs_fp32": round(float((lg.argmax(-1) == ref.argmax(-1)).mean()), 4),
                     "mean_abs_logit_diff": round(float(np.abs(lg - ref).mean()), 3),
                     "accuracy": round(float(np.mean([int(k) in s_ for k, s_ in zip(lg.argmax(-1), alt)])), 4)}
        print(name, out[name], flush=True)
    with open(os.path.join(a.export, "quant_sweep_%s.json" % os.path.splitext(os.path.basename(a.data))[0]), "w") as f:
        json.dump(out, f, indent=2)


if __name__ == "__main__":
    main()
