"""Fine-tune laya-multilingual as SkimCare's block-type triage model (one 12-way `choice` question).

Faithful to the official recipe (laya==0.4.4, laya/train.py): same model class and checkpoint
layout, same sequence builder, same optimizer split (encoder lr 2.5e-5, head lr 1e-4, AdamW wd
0.01, grad clip 1.0, cosine to 1e-6), same losses (`soft-ce`, or `rlcd` = GRPO-style proper-scoring
term + CE). Additions for this task and this GPU (RTX 3060 6 GB):
  * class-weighted cross-entropy (imbalanced labels),
  * frozen token-embedding matrix (196M of 307M encoder params are the 256k-vocab embedding;
    freezing it saves ~2.4 GB of grads + Adam state and keeps vocabulary pruning exact),
  * bf16 autocast + gradient checkpointing (encoder and head) + micro-batch/accumulation,
  * early stopping on dev macro-F1, fixed seeds, temperature fitted on dev after training.

Usage:
  .venv/Scripts/python scripts/train.py --data-dir data --out checkpoints/triage-v1
  .venv/Scripts/python scripts/train.py --data-dir data/placeholder --out checkpoints/smoke --epochs 2   # smoke test
"""
import argparse
import json
import math
import os
import random
import sys
import time

import numpy as np
import torch

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from triage_common import (CONTEXT_SEP, LABELS, apply_pruned_vocab, MAX_LEN_DEFAULT, NONE_INDEX, INSTRUCTIONS, CRITERIA, build_head_const, collate,  # noqa: E402
                           encode, forward_logits, load_checkpoint, metrics, read_jsonl, seed_all, softmax_np, state_text)

HERE = os.path.dirname(os.path.abspath(__file__))
BASE = os.path.join(HERE, "..", "checkpoints", "base-multilingual")


def parse_args(argv=None):
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--model-dir", default=BASE)
    p.add_argument("--data-dir", default=os.path.join(HERE, "..", "data"))
    p.add_argument("--out", required=True)
    p.add_argument("--max-len", type=int, default=MAX_LEN_DEFAULT)
    p.add_argument("--epochs", type=int, default=6)
    p.add_argument("--micro-batch", type=int, default=8)
    p.add_argument("--grad-accum", type=int, default=4)
    p.add_argument("--encoder-lr", type=float, default=2.5e-5)
    p.add_argument("--head-lr", type=float, default=1e-4)
    p.add_argument("--min-lr", type=float, default=1e-6)
    p.add_argument("--warmup", type=float, default=0.06, help="fraction of updates with linear warmup")
    p.add_argument("--weight-decay", type=float, default=0.01)
    p.add_argument("--grad-clip", type=float, default=1.0)
    p.add_argument("--loss", choices=["ce", "rlcd"], default="ce")
    p.add_argument("--class-weight", choices=["none", "sqrt", "inverse"], default="sqrt")
    p.add_argument("--none-weight", type=float, default=1.0, help="extra multiplier on the 'none' class weight (<1 favours term recall)")
    p.add_argument("--label-smoothing", type=float, default=0.0)
    p.add_argument("--train-embeddings", action="store_true", help="also train the 256k x 768 embedding (needs >6 GB)")
    p.add_argument("--no-checkpointing", action="store_true")
    p.add_argument("--no-amp", action="store_true")
    p.add_argument("--evals-per-epoch", type=int, default=2)
    p.add_argument("--patience", type=int, default=4, help="dev evaluations without macro-F1 gain before stopping")
    p.add_argument("--seed", type=int, default=13)
    p.add_argument("--limit", type=int, default=0, help="debug: use only N train rows")
    p.add_argument("--prune", help="train on a pruned vocabulary (prune_vocab.py output dir); the saved checkpoint is pruned")
    p.add_argument("--no-context", action="store_true", help="ignore the optional `context` field")
    p.add_argument("--head-style", choices=["full", "short"], default="full", help="options with descriptions (full) or bare labels (short)")
    return p.parse_args(argv)


def class_weights(labels, mode, none_weight):
    counts = np.bincount(labels, minlength=len(LABELS)).astype(np.float64)
    w = np.ones(len(LABELS))
    present = counts > 0
    if mode != "none":
        inv = counts.sum() / (present.sum() * np.maximum(counts, 1))
        w = np.sqrt(inv) if mode == "sqrt" else inv
    w[~present] = 0.0
    w[NONE_INDEX] *= none_weight
    w = w / (w[present] * counts[present]).sum() * counts[present].sum()  # mean weight per example = 1
    return w


def length_report(tok, head, rows, name, use_context=True):
    lens = np.array([len(tok(state_text(r, use_context), add_special_tokens=False)["input_ids"]) for r in rows])
    q = np.percentile(lens, [50, 90, 95, 99, 100]).round(1).tolist() if len(lens) else []
    cut = int((lens > head.room).sum())
    print("[%s] block tokens p50/p90/p95/p99/max = %s; head = %d tokens; room = %d; truncated blocks = %d/%d"
          % (name, q, len(head.ids), head.room, cut, len(lens)), flush=True)
    return {"p50_p90_p95_p99_max": q, "head_tokens": len(head.ids), "room": head.room, "truncated": cut, "n": int(len(lens))}


@torch.no_grad()
def predict_logits(model, tok, head, rows, device, amp, bs=32, use_context=True):
    model.eval()
    seqs = [encode(tok, head, state_text(r, use_context)) for r in rows]
    order = np.argsort([len(s) for s in seqs])
    out = np.zeros((len(rows), len(LABELS)), dtype=np.float32)
    for i in range(0, len(order), bs):
        idx = order[i:i + bs]
        ids, att = collate([seqs[j] for j in idx], head.pad_id)
        with torch.autocast("cuda", dtype=torch.bfloat16, enabled=amp):
            lg = forward_logits(model, head, ids.to(device), att.to(device))
        out[idx] = lg.float().cpu().numpy()
    return out


def fit_temperature(logits, y):
    """Single temperature minimising dev NLL, searched on a grid inside Laya's runtime clamp [0.5, 5]."""
    best_t, best = 1.0, float("inf")
    for t in np.round(np.arange(0.5, 5.0001, 0.01), 2):
        p = softmax_np(logits, t)
        nll = -np.log(np.clip(p[np.arange(len(y)), y], 1e-12, 1)).mean()
        if nll < best:
            best_t, best = float(t), float(nll)
    return best_t, best


def main(argv=None):
    a = parse_args(argv)
    seed_all(a.seed)
    torch.backends.cudnn.benchmark = False
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    amp = device.type == "cuda" and not a.no_amp
    os.makedirs(a.out, exist_ok=True)

    train_rows = read_jsonl(os.path.join(a.data_dir, "train.jsonl"))
    dev_rows = read_jsonl(os.path.join(a.data_dir, "dev.jsonl"))
    if a.limit:
        train_rows = random.Random(a.seed).sample(train_rows, min(a.limit, len(train_rows)))
    model, tok, cfg = load_checkpoint(a.model_dir)
    if a.prune:
        model, tok, keep_ids = apply_pruned_vocab(model, tok, a.prune)
        print("pruned vocabulary: %d tokens (from %s)" % (len(keep_ids), a.prune), flush=True)
    head = build_head_const(tok, a.max_len, cfg.get("head_max_len", 256), a.head_style)
    use_ctx = not a.no_context
    log = {"args": vars(a), "lengths": {"train": length_report(tok, head, train_rows, "train", use_ctx),
                                        "dev": length_report(tok, head, dev_rows, "dev", use_ctx)}}

    y_train = np.array([LABELS.index(r["label"]) for r in train_rows])
    y_dev = np.array([LABELS.index(r["label"]) for r in dev_rows])
    cw = class_weights(y_train, a.class_weight, a.none_weight)
    print("train %d rows, dev %d rows; class counts %s" % (len(train_rows), len(dev_rows),
          dict(zip(LABELS, np.bincount(y_train, minlength=len(LABELS)).tolist()))), flush=True)
    print("class weights", {k: round(float(v), 3) for k, v in zip(LABELS, cw)}, flush=True)
    train_seqs = [encode(tok, head, state_text(r, use_ctx)) for r in train_rows]

    # --- memory plan for 6 GB
    if not a.train_embeddings:
        model.encoder.embeddings.tok_embeddings.weight.requires_grad_(False)
    checkpointing = not a.no_checkpointing
    if checkpointing:
        model.encoder.gradient_checkpointing_enable(gradient_checkpointing_kwargs={"use_reentrant": False})
    model.head_checkpointing = checkpointing
    model.to(device).train()

    enc_params = [p for n, p in model.named_parameters() if n.startswith("encoder.") and p.requires_grad]
    head_params = [p for n, p in model.named_parameters() if not n.startswith("encoder.") and p.requires_grad]
    print("trainable params: encoder %.1fM, head %.1fM (embedding %s)" % (
        sum(p.numel() for p in enc_params) / 1e6, sum(p.numel() for p in head_params) / 1e6,
        "trained" if a.train_embeddings else "frozen"), flush=True)
    opt = torch.optim.AdamW([{"params": enc_params, "lr": a.encoder_lr}, {"params": head_params, "lr": a.head_lr}],
                            weight_decay=a.weight_decay)
    steps_per_epoch = math.ceil(len(train_seqs) / a.micro_batch)
    updates_per_epoch = math.ceil(steps_per_epoch / a.grad_accum)
    total_updates = updates_per_epoch * a.epochs
    warm = max(1, int(total_updates * a.warmup))
    base_lrs = [g["lr"] for g in opt.param_groups]

    def set_lr(u):
        for g, lr0 in zip(opt.param_groups, base_lrs):
            if u < warm:
                g["lr"] = lr0 * (u + 1) / warm
            else:
                prog = (u - warm) / max(1, total_updates - warm)
                g["lr"] = a.min_lr + (lr0 - a.min_lr) * 0.5 * (1 + math.cos(math.pi * min(1.0, prog)))

    cw_t = torch.tensor(cw, dtype=torch.float32, device=device)
    from laya.train import rlcd_loss, soft_ce_loss, sigma_at

    def loss_fn(logits, y, epoch):
        K = logits.size(-1)
        target = torch.nn.functional.one_hot(y, K).float()
        if a.label_smoothing:
            target = target * (1 - a.label_smoothing) + a.label_smoothing / K
        logp = torch.log_softmax(logits, -1)
        w = cw_t[y]
        ce = -((target * logp).sum(-1) * w).sum() / w.sum().clamp_min(1e-6)
        if a.loss == "ce":
            return ce
        mask = torch.ones_like(logits, dtype=torch.bool)
        qtype = torch.zeros(len(y), dtype=torch.long, device=logits.device)
        sigma = sigma_at(epoch, a.epochs, 0.4, 0.1)
        pg = rlcd_loss(logits, target, mask, qtype, sigma, 4, 0.75, 1.0) - soft_ce_loss(logits, target, mask)
        return pg + ce

    best = {"macro_f1": -1.0}
    evals_since_best, update, t0 = 0, 0, time.time()
    eval_points = set(int(round(steps_per_epoch * (i + 1) / a.evals_per_epoch)) for i in range(a.evals_per_epoch))
    history = []
    stop = False
    if device.type == "cuda":
        torch.cuda.reset_peak_memory_stats()
    for epoch in range(a.epochs):
        order = list(range(len(train_seqs)))
        random.Random(a.seed + epoch).shuffle(order)
        opt.zero_grad(set_to_none=True)
        run_loss, n_loss = 0.0, 0
        for step in range(steps_per_epoch):
            idx = order[step * a.micro_batch:(step + 1) * a.micro_batch]
            ids, att = collate([train_seqs[i] for i in idx], head.pad_id)
            y = torch.tensor(y_train[idx], device=device)
            model.train()
            with torch.autocast("cuda", dtype=torch.bfloat16, enabled=amp):
                logits = forward_logits(model, head, ids.to(device), att.to(device))
            loss = loss_fn(logits.float(), y, epoch)
            win_start = (step // a.grad_accum) * a.grad_accum
            (loss / min(a.grad_accum, steps_per_epoch - win_start)).backward()
            run_loss += loss.item()
            n_loss += 1
            if (step + 1) % a.grad_accum == 0 or step + 1 == steps_per_epoch:
                set_lr(update)
                torch.nn.utils.clip_grad_norm_(enc_params + head_params, a.grad_clip)
                opt.step()
                opt.zero_grad(set_to_none=True)
                update += 1
            if (step + 1) in eval_points:
                dev_logits = predict_logits(model, tok, head, dev_rows, device, amp, use_context=use_ctx)
                m = metrics(y_dev, dev_logits.argmax(-1))
                rec = {"epoch": epoch + 1, "step": step + 1, "update": update, "train_loss": round(run_loss / max(1, n_loss), 4),
                       "dev_acc": m["accuracy"], "dev_macro_f1": m["macro_f1"], "dev_term_recall": m["term_recall"],
                       "elapsed_s": round(time.time() - t0, 1),
                       "peak_mem_gb": round(torch.cuda.max_memory_allocated() / 2**30, 2) if device.type == "cuda" else None}
                history.append(rec)
                print(json.dumps(rec), flush=True)
                run_loss, n_loss = 0.0, 0
                if m["macro_f1"] > best["macro_f1"]:
                    best = {"macro_f1": m["macro_f1"], "epoch": epoch + 1, "step": step + 1, "update": update, "dev": m}
                    evals_since_best = 0
                    torch.save({k: v.detach().cpu() for k, v in model.state_dict().items()}, os.path.join(a.out, "best_state.pt"))
                else:
                    evals_since_best += 1
                    if evals_since_best >= a.patience:
                        print("early stop: no dev macro-F1 gain in %d evaluations" % a.patience, flush=True)
                        stop = True
                        break
        if stop:
            break

    # --- restore best, fit temperature on dev, save in the official checkpoint layout
    model.load_state_dict(torch.load(os.path.join(a.out, "best_state.pt"), weights_only=True))
    os.remove(os.path.join(a.out, "best_state.pt"))
    model.encoder.gradient_checkpointing_disable()
    model.head_checkpointing = False
    dev_logits = predict_logits(model, tok, head, dev_rows, device, amp=False, use_context=use_ctx)
    temp, nll = fit_temperature(dev_logits, y_dev)
    from laya.train import save_checkpoint
    import laya
    cfg = dict(cfg)
    cfg.update({
        "max_len": a.max_len,
        "temperature": [temp, cfg.get("temperature", [1, 1, 1])[1], cfg.get("temperature", [1, 1, 1])[2]],
        "temperature_by_options": {},
        "model_name": "skimcare-triage",
        "fine_tuned": True,
        "skimcare_triage": {"vocab_pruned_from": a.prune and os.path.basename(os.path.normpath(a.prune)), "head_style": a.head_style, "use_context": use_ctx, "context_sep": CONTEXT_SEP, "labels": LABELS, "instructions": INSTRUCTIONS, "criteria": CRITERIA, "laya_version": laya.__version__,
                            "temperature": temp, "dev_nll_at_temperature": round(nll, 4), "best": {k: v for k, v in best.items() if k != "dev"}},
    })
    save_checkpoint(model.cpu(), tok, cfg, a.out)
    log.update({"history": history, "best": best, "temperature": temp, "class_weights": dict(zip(LABELS, cw.round(4).tolist()))})
    with open(os.path.join(a.out, "train_log.json"), "w", encoding="utf-8") as f:
        json.dump(log, f, indent=2)
    print("best dev macro-F1 %.4f (epoch %s step %s); temperature %.2f; saved %s" % (
        best["macro_f1"], best.get("epoch"), best.get("step"), temp, a.out), flush=True)


if __name__ == "__main__":
    main()
