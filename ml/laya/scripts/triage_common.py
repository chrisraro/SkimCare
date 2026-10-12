"""Shared definitions for the SkimCare Laya triage model (pass 1: block -> term type).

Everything that decides what the model sees lives here, so train.py, evaluate.py,
predict.py and export_onnx.py cannot disagree. INFERENCE_SPEC.md documents the same
contract for the JavaScript runtime; tests/golden vectors pin it.

Input encoding is the official Laya one (laya.common.build_sequence, laya==0.4.4):
    [CLS] "choice question: <instructions>" [SEP] [MASK] opt0 [MASK] opt1 ... [SEP] <state> [SEP]
Each option is scored at its own [MASK]; softmax over the 12 options. Because the question
and the options never change, the head (everything up to and including the second [SEP]) is
a constant token prefix, and the marker positions are constants.
"""
from __future__ import annotations

import json
import os
import random
import re
from dataclasses import dataclass
from typing import Dict, List, Optional, Sequence

import numpy as np

# Order matters: option slot i <-> LABELS[i]. Same order as the task definition
# (FindingType in src/domain/schema.ts, then "none").
LABELS: List[str] = [
    "payment_condition", "payment_amount", "due_date", "late_fee", "deliverables", "revisions",
    "ownership", "termination", "notice_period", "party", "other", "none",
]
NONE_INDEX = LABELS.index("none")

# Option descriptions: the same wording as the Qwen triage prompt (src/ai/llm/prompt.ts),
# so both engines are asked the same question.
CRITERIA: Dict[str, str] = {
    "payment_condition": "what must happen before a payment is made",
    "payment_amount": "an amount of money or price",
    "due_date": "when a payment or task is due",
    "late_fee": "a fee or penalty for being late or missing a payment",
    "deliverables": "what must be delivered or done",
    "revisions": "how many changes are allowed",
    "ownership": "who owns something, or when it transfers",
    "termination": "how the agreement can end, or what happens if it ends early",
    "notice_period": "how much notice must be given",
    "party": "who the parties are",
    "other": "any other obligation or rule",
    "none": "not a term (a title, a signature line, a note to the reader)",
}
INSTRUCTIONS = "Which type of term is this block of text from an agreement?"
QUESTION = {"type": "choice", "instructions": INSTRUCTIONS, "criteria": {k: CRITERIA[k] for k in LABELS}}
# "short" head: option = bare label (no description). ~3x fewer head tokens -> ~2x faster per block.
QUESTION_SHORT = {"type": "choice", "instructions": "Contract term type?", "criteria": list(LABELS)}
HEAD_STYLES = {"full": QUESTION, "short": QUESTION_SHORT}

# Whitespace characters collapsed to one ASCII space before tokenizing. Listed explicitly
# (not \s) so Python and JavaScript agree exactly.
_WS = "\t\n\u000b\u000c\r \u0085\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff"
WS_RE = re.compile("[%s]+" % _WS)
MAX_LEN_DEFAULT = 320  # tokens in the whole sequence (head ~170 + block); see MODEL_NOTES.md


def normalize_block(text: str) -> str:
    """The only text pre-processing: collapse whitespace runs to one space, trim, drop <mask>."""
    return WS_RE.sub(" ", text.replace("<mask>", " ")).strip(" ")


CONTEXT_SEP = " || earlier text: "


def make_state(text: str, context: Optional[str] = None, use_context: bool = True) -> str:
    """The Laya `state` string for one block.

    Block first, so the block is never the part cut by truncation; then, only when the app sent
    context (the previous block's last <=200 chars, present only when needsContext(text) is true),
    CONTEXT_SEP + context. Both halves go through normalize_block.
    """
    s = normalize_block(text)
    if use_context and context and normalize_block(context):
        s = s + CONTEXT_SEP + normalize_block(context)
    return s


def state_text(rec: Dict, use_context: bool = True) -> str:
    return make_state(rec["text"], rec.get("context"), use_context)


# --------------------------------------------------------------------------------- io
def read_jsonl(path: str) -> List[Dict]:
    rows = []
    with open(path, encoding="utf-8") as f:
        for i, line in enumerate(f):
            line = line.strip()
            if not line:
                continue
            r = json.loads(line)
            if r.get("label") not in LABELS:
                raise ValueError("%s:%d unknown label %r" % (path, i + 1, r.get("label")))
            if not str(r.get("text", "")).strip():
                raise ValueError("%s:%d empty text" % (path, i + 1))
            rows.append(r)
    return rows


def seed_all(seed: int) -> None:
    import torch
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    torch.cuda.manual_seed_all(seed)


# --------------------------------------------------------------------------------- encoding
@dataclass
class Head:
    ids: List[int]
    markers: List[int]
    max_len: int
    sep_id: int
    pad_id: int

    @property
    def room(self) -> int:
        return max(0, self.max_len - len(self.ids) - 1)


def laya_internal_question(style: str = "full"):
    from laya.agent import Agent
    question = HEAD_STYLES[style]
    Agent._check_question("t", question)
    q = Agent._to_internal(question)
    q.pop("option_order", None)
    return q


def build_head_const(tok, max_len: int, head_max_len: int = 256, style: str = "full") -> Head:
    from laya.common import build_head
    ids, markers, stats = build_head(tok, laya_internal_question(style), head_max_len)
    if stats["options_distinct"] != len(LABELS) or stats["tokens_per_option"] is not None or len(markers) != len(LABELS):
        raise RuntimeError("options were truncated by head_max_len: %r" % (stats,))
    return Head(ids=list(ids), markers=list(markers), max_len=max_len, sep_id=tok.sep_token_id, pad_id=tok.pad_token_id)


def encode_state(tok, text: str) -> List[int]:
    return tok(text, add_special_tokens=False)["input_ids"]


def encode(tok, head: Head, text: str) -> List[int]:
    """Full input ids for one block; identical to laya.common.build_sequence (asserted in tests)."""
    st = encode_state(tok, text)[: head.room]
    return head.ids + st + [head.sep_id]


def collate(seqs: Sequence[List[int]], pad_id: int):
    import torch
    L = max(len(s) for s in seqs)
    ids = torch.full((len(seqs), L), pad_id, dtype=torch.long)
    att = torch.zeros((len(seqs), L), dtype=torch.long)
    for i, s in enumerate(seqs):
        ids[i, : len(s)] = torch.tensor(s)
        att[i, : len(s)] = 1
    return ids, att


# --------------------------------------------------------------------------------- model
def load_checkpoint(model_dir: str):
    """(model, tok, cfg) from a Laya checkpoint dir (official layout), fp32 on CPU."""
    from laya.train import load_checkpoint as _lc
    return _lc(model_dir)


def forward_logits(model, head: Head, ids, att):
    """Logits [B, 12] for a batch whose head is the constant prefix (markers are constants)."""
    import torch
    B = ids.size(0)
    mpos = torch.tensor([head.markers] * B, dtype=torch.long, device=ids.device)
    mmask = torch.ones((B, len(head.markers)), dtype=torch.bool, device=ids.device)
    qtype = torch.zeros((B,), dtype=torch.long, device=ids.device)  # choice
    logits, _act = model(ids, att, mpos, mmask, qtype)
    return logits.float()


def softmax_np(z: np.ndarray, temperature: float = 1.0) -> np.ndarray:
    z = np.asarray(z, dtype=np.float64) / temperature
    z = z - z.max(axis=-1, keepdims=True)
    e = np.exp(z)
    return e / e.sum(axis=-1, keepdims=True)


# --------------------------------------------------------------------------------- metrics
def metrics(y_true: Sequence[int], y_pred: Sequence[int], alt: Optional[Sequence[Optional[Sequence[int]]]] = None) -> Dict:
    y_true, y_pred = np.asarray(y_true), np.asarray(y_pred)
    K = len(LABELS)
    cm = np.zeros((K, K), dtype=int)
    for t, p in zip(y_true, y_pred):
        cm[t, p] += 1
    per = {}
    f1s = []
    for k in range(K):
        tp = cm[k, k]
        fp = cm[:, k].sum() - tp
        fn = cm[k, :].sum() - tp
        support = int(cm[k, :].sum())
        p = tp / (tp + fp) if tp + fp else 0.0
        r = tp / (tp + fn) if tp + fn else 0.0
        f1 = 2 * p * r / (p + r) if p + r else 0.0
        per[LABELS[k]] = {"precision": round(float(p), 4), "recall": round(float(r), 4), "f1": round(float(f1), 4), "support": support}
        if support > 0:
            f1s.append(f1)
    is_term_true = y_true != NONE_INDEX
    is_term_pred = y_pred != NONE_INDEX
    out = {
        "n": int(len(y_true)),
        "accuracy": round(float((y_true == y_pred).mean()) if len(y_true) else float("nan"), 4),
        "macro_f1": round(float(np.mean(f1s)) if f1s else 0.0, 4),
        # The number that matters for the app: a term triaged as "none" is silently lost.
        "term_recall": round(float(is_term_pred[is_term_true].mean()) if is_term_true.any() else float("nan"), 4),
        "term_precision": round(float(is_term_true[is_term_pred].mean()) if is_term_pred.any() else float("nan"), 4),
        "terms_lost_as_none": int((is_term_true & ~is_term_pred).sum()),
        "per_label": per,
        "confusion": cm.tolist(),
    }
    if alt is not None:
        ok = [p in (a if a else [t]) for t, p, a in zip(y_true, y_pred, alt)]
        out["accuracy_any_valid_label"] = round(float(np.mean(ok)) if ok else float("nan"), 4)
    return out


# --------------------------------------------------------------------------------- vocabulary pruning
def apply_pruned_vocab(model, tok, prune_dir: str):
    """Swap in a pruned vocabulary (prune_vocab.py output): embedding rows keep_ids, and a fast tokenizer
    built from the pruned tokenizer.json with the same special tokens. Returns (model, tok, keep_ids)."""
    import torch
    from transformers import PreTrainedTokenizerFast
    with open(os.path.join(prune_dir, "keep_ids.json")) as f:
        keep_ids = json.load(f)
    emb = model.encoder.embeddings.tok_embeddings
    new = torch.nn.Embedding(len(keep_ids), emb.embedding_dim, padding_idx=0)
    new.weight.data.copy_(emb.weight.data[torch.tensor(keep_ids, dtype=torch.long)])
    new.weight.requires_grad_(emb.weight.requires_grad)
    model.encoder.embeddings.tok_embeddings = new
    model.encoder.config.vocab_size = len(keep_ids)
    specials = {k: getattr(tok, k) for k in ("bos_token", "eos_token", "unk_token", "pad_token", "mask_token", "cls_token", "sep_token")}
    tok2 = PreTrainedTokenizerFast(tokenizer_file=os.path.join(prune_dir, "tokenizer.json"), **specials)
    tok2.model_max_length = tok.model_max_length
    return model, tok2, keep_ids
