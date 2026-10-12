"""Package one exported variant as the app's release files, with size / SHA-256 / MD5.

  .venv/Scripts/python scripts/package_release.py --export exports/v3-wc400 --checkpoint checkpoints/triage-v3-wc400 \
      --variant q4 --name laya-v1 --threshold 0.85 --out exports/release-laya-v1

Writes <name>.<variant>.onnx, <name>.tokenizer.json (minified), <name>.tokenizer_config.json,
<name>.spec.json (triage_spec.json with the release file names) and release_manifest.json.
"""
import argparse
import hashlib
import json
import os
import shutil


def digest(path):
    h256, hmd5 = hashlib.sha256(), hashlib.md5()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h256.update(chunk)
            hmd5.update(chunk)
    return {"fileName": os.path.basename(path), "sizeBytes": os.path.getsize(path), "sha256": h256.hexdigest(), "md5": hmd5.hexdigest()}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--export", required=True)
    ap.add_argument("--checkpoint", required=True, help="for tokenizer/tokenizer_config.json")
    ap.add_argument("--variant", required=True)
    ap.add_argument("--name", default="laya-v1")
    ap.add_argument("--threshold", type=float, required=True)
    ap.add_argument("--out", required=True)
    a = ap.parse_args()
    os.makedirs(a.out, exist_ok=True)
    spec = json.load(open(os.path.join(a.export, "triage_spec.json"), encoding="utf-8"))
    model_dst = os.path.join(a.out, "%s.%s.onnx" % (a.name, a.variant))
    shutil.copyfile(os.path.join(a.export, spec["models"][a.variant]["file"]), model_dst)
    tj = json.load(open(os.path.join(a.export, spec["tokenizer_file"]), encoding="utf-8"))
    tok_dst = os.path.join(a.out, "%s.tokenizer.json" % a.name)
    with open(tok_dst, "w", encoding="utf-8", newline="\n") as f:
        json.dump(tj, f, ensure_ascii=False, separators=(",", ":"))
    cfg = json.load(open(os.path.join(a.checkpoint, "tokenizer", "tokenizer_config.json"), encoding="utf-8"))
    cfg_dst = os.path.join(a.out, "%s.tokenizer_config.json" % a.name)
    with open(cfg_dst, "w", encoding="utf-8", newline="\n") as f:
        json.dump(cfg, f, ensure_ascii=False, indent=1)
    spec.update({"threshold": a.threshold, "tokenizer_file": os.path.basename(tok_dst), "tokenizer_config_file": os.path.basename(cfg_dst),
                 "model_file": os.path.basename(model_dst), "variant": a.variant, "release": a.name})
    spec["models"] = {a.variant: {"file": os.path.basename(model_dst)}}
    spec_dst = os.path.join(a.out, "%s.spec.json" % a.name)
    with open(spec_dst, "w", encoding="utf-8", newline="\n") as f:
        json.dump(spec, f, indent=1)
    # triage_spec.json alias so predict.Predictor / check_golden.mjs can read the release dir directly
    shutil.copyfile(spec_dst, os.path.join(a.out, "triage_spec.json"))
    manifest = {"model": digest(model_dst), "tokenizer": digest(tok_dst), "tokenizerConfig": digest(cfg_dst), "spec": digest(spec_dst)}
    with open(os.path.join(a.out, "release_manifest.json"), "w") as f:
        json.dump(manifest, f, indent=1)
    print(json.dumps(manifest, indent=1))


if __name__ == "__main__":
    main()
