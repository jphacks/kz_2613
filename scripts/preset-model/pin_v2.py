"""分担のモデルの版2 を固定し直す (scripts/windows/preset-model-v2.json の revision と各ファイルの SHA-256)。

Hugging Face の YOSHI0209/recooplay-preset-model-v2 を更新したら (モデルカードの修正だけでも版が変わる)、これを実行してから
コミットする。更新しないと、配布物の作成 (package.ps1) と CI が SHA-256 の照合で止まる。

    pip install huggingface_hub
    python scripts/preset-model/pin_v2.py            # 最新の版に固定する
    python scripts/preset-model/pin_v2.py <版の40桁>  # 指定した版に固定する
"""
import hashlib
import json
import os
import sys

from huggingface_hub import HfApi, hf_hub_download

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
PATH = os.path.join(ROOT, "scripts", "windows", "preset-model-v2.json")


def main():
    m = json.load(open(PATH, encoding="utf-8"))
    rev = sys.argv[1] if len(sys.argv) > 1 else HfApi().model_info(m["repo"]).sha
    for name, info in m["files"].items():
        p = hf_hub_download(m["repo"], name, revision=rev)
        info["sha256"] = hashlib.sha256(open(p, "rb").read()).hexdigest()
        info["size"] = os.path.getsize(p)
    old, m["revision"] = m["revision"], rev
    with open(PATH, "w", encoding="utf-8", newline="\n") as f:
        json.dump(m, f, ensure_ascii=False, indent=2)
        f.write("\n")
    print(f"固定した版: {old[:7]} → {rev[:7]}（{PATH}）")


if __name__ == "__main__":
    main()
