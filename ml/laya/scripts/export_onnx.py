"""Export the fine-tuned triage checkpoint to a single ONNX graph + INT8, for onnxruntime-web / -react-native.

Graph: (input_ids int64 [batch, seq], attention_mask int64 [batch, seq]) -> logits float32 [batch, 12].
The question head is a constant token prefix, so the 12 option-marker positions and qtype=choice are
baked into the graph as constants; the act/escalate head is dropped (Laya documents it carries no
signal, issue #185). Encoder + decision head are otherwise the official laya.common.DecisionModel
(the official laya-ts export splits them into encoder.onnx + head.onnx; one graph is simpler here).

Steps: [optional vocab pruning] -> torch.onnx.export (dynamo, opset 18, dynamic batch/seq) ->
verify vs PyTorch (batch 1 and padded batch 2, several lengths) -> onnxruntime dynamic INT8 ->
verify INT8 agreement on data -> CPU latency at 1 and 4 threads -> triage_spec.json + tokenizer.json.

  .venv/Scripts/python scripts/export_onnx.py --checkpoint checkpoints/triage-v1 --out exports/triage-v1 \
      [--prune exports/vocab-enfil]  --data data/eval.jsonl
"""
import argparse
import json
import os
import shutil
import sys
import time

import numpy as np
import torch

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from triage_common import CONTEXT_SEP, LABELS, build_head_const, collate, encode, forward_logits, load_checkpoint, make_state, read_jsonl  # noqa: E402


class TriageGraph(torch.nn.Module):
    def __init__(self, model, markers):
        super().__init__()
        self.model = model
        self.register_buffer("markers", torch.tensor(markers, dtype=torch.long), persistent=False)

    def forward(self, input_ids, attention_mask):
        B = input_ids.shape[0]
        mpos = self.markers.unsqueeze(0).expand(B, -1)
        mmask = torch.ones_like(mpos, dtype=torch.bool)
        qtype = torch.zeros_like(input_ids[:, 0])
        logits, _ = self.model(input_ids, attention_mask, mpos, mmask, qtype)
        return logits


def prune_model(model, keep_ids):
    emb = model.encoder.embeddings.tok_embeddings
    keep = torch.tensor(keep_ids, dtype=torch.long)
    new = torch.nn.Embedding(len(keep_ids), emb.embedding_dim, padding_idx=0)
    new.weight.data.copy_(emb.weight.data[keep])
    model.encoder.embeddings.tok_embeddings = new
    model.encoder.config.vocab_size = len(keep_ids)
    return model


def file_mb(p):
    s = os.path.getsize(p)
    d = p + ".data"
    if os.path.exists(d):
        s += os.path.getsize(d)
    return round(s / 2**20, 1)


def ort_session(path, threads):
    import onnxruntime as ort
    so = ort.SessionOptions()
    so.intra_op_num_threads = threads
    so.inter_op_num_threads = 1
    so.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
    return ort.InferenceSession(path, so, providers=["CPUExecutionProvider"])


def run(sess, seqs, pad_id):
    ids, att = collate(seqs, pad_id)
    return sess.run(["logits"], {"input_ids": ids.numpy(), "attention_mask": att.numpy()})[0]


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--checkpoint", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--prune", help="dir from prune_vocab.py (tokenizer.json + keep_ids.json)")
    ap.add_argument("--data", help="JSONL used for agreement + latency (eval set)")
    ap.add_argument("--opset", type=int, default=18)
    ap.add_argument("--threshold", type=float, default=0.0, help="confidence threshold written to the spec")
    ap.add_argument("--variants", nargs="+", default=["int8", "int8_all", "q4", "q8w"])
    ap.add_argument("--bench-n", type=int, default=40)
    a = ap.parse_args()
    os.makedirs(a.out, exist_ok=True)

    model, tok, cfg = load_checkpoint(a.checkpoint)
    model.eval().float()
    tri = cfg.get("skimcare_triage", {})
    head = build_head_const(tok, cfg["max_len"], cfg.get("head_max_len", 256), tri.get("head_style", "full"))
    temperature = float(tri.get("temperature", cfg["temperature"][0]))
    rows = read_jsonl(a.data) if a.data else []
    use_ctx = bool(tri.get("use_context", False))
    texts = [make_state(r["text"], r.get("context"), use_ctx) for r in rows] or ["The total fee is PHP 18,000.", "Ang bayad ay PHP 5,000 kada buwan."]

    # reference (full vocab) ids + logits in fp32
    full_seqs = [encode(tok, head, t) for t in texts]
    with torch.no_grad():
        ref = [forward_logits(model, head, *collate([s], head.pad_id)).numpy()[0] for s in full_seqs]
    ref = np.stack(ref)

    tokenizer_src = os.path.join(a.checkpoint, "tokenizer", "tokenizer.json")
    head_ids, remap = head.ids, None
    if a.prune:
        keep_ids = json.load(open(os.path.join(a.prune, "keep_ids.json")))
        remap = {o: n for n, o in enumerate(keep_ids)}
        model = prune_model(model, keep_ids)
        head_ids = [remap[i] for i in head.ids]
        tokenizer_src = os.path.join(a.prune, "tokenizer.json")
    from tokenizers import Tokenizer
    rt_tok = Tokenizer.from_file(tokenizer_src)
    sep_id = remap[head.sep_id] if remap else head.sep_id
    pad_id = remap[head.pad_id] if remap else head.pad_id
    room = head.max_len - len(head_ids) - 1

    def rt_ids(t):
        return head_ids + rt_tok.encode(t, add_special_tokens=False).ids[:room] + [sep_id]

    rt_seqs = [rt_ids(t) for t in texts]
    if remap:
        same = sum(1 for s, f in zip(rt_seqs, full_seqs) if s == [remap.get(i, -1) for i in f])
        print("pruned tokenizer: %d/%d blocks tokenize identically to the full vocab" % (same, len(texts)), flush=True)

    graph = TriageGraph(model, head.markers).eval()
    fp32 = os.path.join(a.out, "model.fp32.onnx")
    dummy = collate([rt_seqs[0], rt_seqs[min(1, len(rt_seqs) - 1)][:-3] or rt_seqs[0]], pad_id)
    B, S = torch.export.Dim("batch", min=1, max=64), torch.export.Dim("seq", min=len(head_ids) + 2, max=head.max_len)
    t0 = time.time()
    torch.onnx.export(graph, dummy, fp32, input_names=["input_ids", "attention_mask"], output_names=["logits"],
                      dynamic_shapes=({0: B, 1: S}, {0: B, 1: S}), opset_version=a.opset, dynamo=True,
                      external_data=False)
    print("exported %s in %.0fs" % (fp32, time.time() - t0), flush=True)

    # --- verify fp32 ONNX vs PyTorch (same, possibly pruned, model) on batch 1 and padded batch 2
    s1 = ort_session(fp32, 4)
    with torch.no_grad():
        tl = np.stack([forward_logits(model, head, *collate([s], pad_id)).numpy()[0] for s in rt_seqs[:50]])
    ol = np.stack([run(s1, [s], pad_id)[0] for s in rt_seqs[:50]])
    diff_b1 = float(np.abs(tl - ol).max())
    pair = rt_seqs[:2] if len(rt_seqs) > 1 else rt_seqs * 2
    ob2 = run(s1, pair, pad_id)
    diff_b2 = float(np.abs(ob2 - tl[: len(pair)]).max())
    print("fp32 ONNX vs torch: max |dlogit| batch1 %.2e, padded batch2 %.2e" % (diff_b1, diff_b2), flush=True)

    # --- quantized variants
    variants = quantize_variants(fp32, a.out, a.variants)

    # --- agreement on all data: full-vocab torch reference vs each ONNX variant (what the app runs)
    outs = {"fp32": np.stack([run(s1, [s], pad_id)[0] for s in rt_seqs])}
    for name, path in variants.items():
        sv = ort_session(path, 4)
        outs[name] = np.stack([run(sv, [s], pad_id)[0] for s in rt_seqs])
    agree = {"n": len(texts), "fp32_onnx_vs_torch_same_model": {"batch1_max_abs": diff_b1, "padded_batch2_max_abs": diff_b2}}
    alt = [[LABELS.index(l) for l in r.get("labels", [r["label"]])] for r in rows] if rows else None
    if alt:
        agree["acc_torch_fullvocab"] = round(float(np.mean([p in a_ for p, a_ in zip(ref.argmax(-1), alt)])), 4)
    for name, o in outs.items():
        agree[name] = {"argmax_agreement_vs_torch_fullvocab": round(float((o.argmax(-1) == ref.argmax(-1)).mean()), 4),
                       "max_abs_logit_diff_vs_torch_fullvocab": round(float(np.abs(o - ref).max()), 4),
                       "mean_abs_logit_diff_vs_torch_fullvocab": round(float(np.abs(o - ref).mean()), 4)}
        if alt:
            agree[name]["accuracy_any_valid_label"] = round(float(np.mean([p in a_ for p, a_ in zip(o.argmax(-1), alt)])), 4)
    print(json.dumps(agree, indent=2), flush=True)

    # --- latency: one block per call (what the app does), at the data's median and p95 length
    lens = sorted(len(s) for s in rt_seqs)
    pick = {"median": lens[len(lens) // 2], "p95": lens[min(len(lens) - 1, int(len(lens) * 0.95))]}
    bench = {}
    for name, path in [("fp32", fp32)] + list(variants.items()):
        for th in (1, 4):
            sess = ort_session(path, th)
            for lname, L in pick.items():
                seq = next(s for s in rt_seqs if len(s) == L)
                run(sess, [seq], pad_id)
                run(sess, [seq], pad_id)
                ts = []
                for _ in range(a.bench_n):
                    t = time.perf_counter()
                    run(sess, [seq], pad_id)
                    ts.append((time.perf_counter() - t) * 1000)
                bench["%s_t%d_%s(%dtok)" % (name, th, lname, L)] = {"p50_ms": round(float(np.median(ts)), 1),
                                                                    "p90_ms": round(float(np.percentile(ts, 90)), 1)}
    print(json.dumps(bench, indent=2), flush=True)

    shutil.copy(tokenizer_src, os.path.join(a.out, "tokenizer.json"))
    models = {"fp32": {"file": "model.fp32.onnx", "mb": file_mb(fp32)}}
    models.update({k: {"file": os.path.basename(v), "mb": file_mb(v)} for k, v in variants.items()})
    spec = {
        "format": "skimcare-laya-triage/1",
        "labels": LABELS,
        "none_label": "none",
        "head_ids": head_ids,
        "marker_pos": head.markers,
        "max_len": head.max_len,
        "room": room,
        "sep_id": sep_id,
        "pad_id": pad_id,
        "head_style": tri.get("head_style", "full"),
        "use_context": use_ctx,
        "context_sep": CONTEXT_SEP,
        "temperature": temperature,
        "threshold": a.threshold,
        "tokenizer_file": "tokenizer.json",
        "vocab_pruned": bool(a.prune) or int(model.encoder.config.vocab_size) < 256000,
        "vocab_size": int(model.encoder.config.vocab_size),
        "models": models,
        "onnx": {"opset": a.opset, "inputs": {"input_ids": "int64 [batch, seq]", "attention_mask": "int64 [batch, seq]"},
                 "outputs": {"logits": "float32 [batch, %d]" % len(LABELS)}},
        "source_checkpoint": os.path.basename(os.path.normpath(a.checkpoint)),
        "laya_version": tri.get("laya_version"),
    }
    with open(os.path.join(a.out, "triage_spec.json"), "w", encoding="utf-8") as f:
        json.dump(spec, f, indent=2)
    report = {"sizes_mb": {k: v["mb"] for k, v in models.items()}, "tokenizer_json_mb": file_mb(os.path.join(a.out, "tokenizer.json")),
              "agreement": agree, "latency_cpu": bench, "cpu": _cpu_name()}
    with open(os.path.join(a.out, "export_report.json"), "w") as f:
        json.dump(report, f, indent=2)
    print(json.dumps(report["sizes_mb"]), report["tokenizer_json_mb"], flush=True)


def module_groups(fp32_path):
    """MatMul/Gemm node name -> torch module path (from the dynamo exporter's name_scopes metadata)."""
    import ast
    import onnx
    m = onnx.load(fp32_path, load_external_data=False)
    out = {}
    for n in m.graph.node:
        if n.op_type in ("MatMul", "Gemm"):
            md = {p.key: p.value for p in n.metadata_props}
            try:
                scopes = ast.literal_eval(md.get("pkg.torch.onnx.name_scopes", "[]"))
            except Exception:
                scopes = []
            out[n.name] = scopes[-2] if len(scopes) >= 2 else ""
    return out


def quantize_variants(fp32, out_dir, names):
    """int8      : dynamic INT8 (per-channel weights, per-tensor uint8 activations) on MatMul + Gather, EXCEPT the
                   22 encoder mlp.Wo matmuls, which stay fp32 (their GeGLU inputs have activation outliers that
                   per-tensor dynamic quantization destroys: logit error x4 when they are included).
       int8_all  : the same with mlp.Wo quantized too (smallest INT8, least accurate).
       q4        : weight-only 4-bit (MatMulNBits, block 32, symmetric) on every MatMul with a constant weight,
                   activations stay fp32; embedding Gather INT8. Smallest file.
       q4a4      : q4 with accuracy_level=4 (MatMulNBits computes with int8-quantized activations per block: faster on CPU)
       q8w       : weight-only 8-bit MatMulNBits (block 32) + INT8 Gather: near-fp32 accuracy, ~int8 size."""
    import onnx
    from onnxruntime.quantization import QuantType, quantize_dynamic
    from onnxruntime.quantization.shape_inference import quant_pre_process
    pre = os.path.join(out_dir, "_pre.onnx")
    quant_pre_process(fp32, pre, skip_symbolic_shape=False)
    groups = module_groups(fp32)
    mlp_wo = [n for n, mod in groups.items() if mod.endswith("mlp.Wo")]
    out = {}
    for name in names:
        dst = os.path.join(out_dir, "model.%s.onnx" % name)
        if name in ("int8", "int8_all"):
            quantize_dynamic(pre, dst, weight_type=QuantType.QInt8, per_channel=True,
                             op_types_to_quantize=["MatMul", "Gemm", "Gather"],
                             nodes_to_exclude=mlp_wo if name == "int8" else [])
        elif name == "q4g":
            # 4-bit everywhere, including the token embedding (GatherBlockQuantized, blocks of 32 along hidden dim)
            from onnxruntime.quantization.matmul_nbits_quantizer import MatMulNBitsQuantizer
            q = MatMulNBitsQuantizer(onnx.load(pre), bits=4, block_size=32, is_symmetric=True,
                                     op_types_to_quantize=("MatMul", "Gather"), quant_axes=(("MatMul", 0), ("Gather", 1)))
            q.process()
            q.model.save_model_to_file(dst, use_external_data_format=False)
        elif name in ("q4", "q4a4", "q8w"):
            from onnxruntime.quantization.matmul_nbits_quantizer import MatMulNBitsQuantizer
            q = MatMulNBitsQuantizer(onnx.load(pre), bits=8 if name == "q8w" else 4, block_size=32, is_symmetric=True,
                                     accuracy_level=4 if name == "q4a4" else None)
            q.process()
            tmp = os.path.join(out_dir, "_nbits.onnx")
            q.model.save_model_to_file(tmp, use_external_data_format=False)
            quantize_dynamic(tmp, dst, weight_type=QuantType.QInt8, op_types_to_quantize=["Gather"])
            os.remove(tmp)
        else:
            raise SystemExit("unknown variant %s" % name)
        out[name] = dst
        print("quantized %s: %.1f MB" % (name, file_mb(dst)), flush=True)
    os.remove(pre)
    return out


def _cpu_name():
    import platform
    try:
        import subprocess
        out = subprocess.run(["powershell", "-NoProfile", "-Command", "(Get-CimInstance Win32_Processor).Name"],
                             capture_output=True, text=True, timeout=20).stdout.strip()
        return out or platform.processor()
    except Exception:
        return platform.processor()


if __name__ == "__main__":
    main()
