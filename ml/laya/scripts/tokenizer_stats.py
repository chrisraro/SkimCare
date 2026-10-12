"""Tokens-per-word for English / Filipino / Taglish under the multilingual (mmBERT) and English (ModernBERT)
Laya tokenizers. Sentences are invented contract-style text (no real documents).

  .venv/Scripts/python scripts/tokenizer_stats.py [--data data/train.jsonl]
"""
import argparse
import json
import os
import re
from collections import defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
CK = os.path.join(HERE, "..", "checkpoints")
SAMPLES = {
    "en": [
        "The Client shall pay the total fee of PHP 45,000 within fifteen (15) days after delivery of the final files.",
        "Either party may terminate this Agreement by giving thirty (30) days prior written notice to the other party.",
        "A late payment penalty of two percent (2%) per month shall be charged on any unpaid balance.",
        "All intellectual property rights in the deliverables shall transfer to the Client upon full payment.",
    ],
    "fil": [
        "Ang Kliyente ay magbabayad ng kabuuang halaga na PHP 45,000 sa loob ng labinlimang (15) araw matapos maihatid ang mga file.",
        "Maaaring wakasan ng alinmang partido ang kasunduang ito sa pamamagitan ng nakasulat na abiso tatlumpung (30) araw bago nito.",
        "May multang dalawang porsiyento (2%) bawat buwan sa anumang hindi pa nababayarang balanse.",
        "Ang lahat ng karapatan sa mga gawa ay mapupunta sa Kliyente kapag buo nang nabayaran.",
    ],
    "taglish": [
        "Ang downpayment ay PHP 10,000, due upon signing ng contract, at ang balance ay babayaran after delivery.",
        "Kung ma-late ang bayad, may penalty na PHP 500 per week hanggang ma-settle ang account.",
        "Pwedeng mag-request ang Client ng up to three revisions bago i-finalize ang design.",
        "Ang Developer ang may-ari ng source code hangga't hindi pa fully paid ang project.",
    ],
}
WORD = re.compile(r"\S+")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", nargs="*", default=[])
    a = ap.parse_args()
    from tokenizers import Tokenizer
    toks = {"multilingual (mmBERT, 256k)": Tokenizer.from_file(os.path.join(CK, "base-multilingual", "tokenizer", "tokenizer.json")),
            "english (ModernBERT, 50k)": Tokenizer.from_file(os.path.join(CK, "base-english-tokenizer", "tokenizer.json"))}
    texts = defaultdict(list)
    for k, v in SAMPLES.items():
        texts["sample:" + k] += v
    for p in a.data:
        for line in open(p, encoding="utf-8"):
            if line.strip():
                r = json.loads(line)
                texts["data:" + r.get("lang", "?")].append(r["text"])
    out = {}
    for name, tok in toks.items():
        for lang, ts in sorted(texts.items()):
            words = sum(len(WORD.findall(t)) for t in ts)
            ntok = sum(len(tok.encode(t, add_special_tokens=False).ids) for t in ts)
            out.setdefault(name, {})[lang] = {"texts": len(ts), "words": words, "tokens": ntok, "tokens_per_word": round(ntok / max(1, words), 2)}
    ex = SAMPLES["fil"][1]
    out["example_fil_multilingual"] = toks["multilingual (mmBERT, 256k)"].encode(ex, add_special_tokens=False).tokens
    out["example_fil_english"] = toks["english (ModernBERT, 50k)"].encode(ex, add_special_tokens=False).tokens
    print(json.dumps(out, indent=1, ensure_ascii=False))


if __name__ == "__main__":
    main()
