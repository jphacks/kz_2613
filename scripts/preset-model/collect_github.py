"""GitHub から、ゲームの操作定義のファイル (Unity の .inputactions・Godot の project.godot) を集める。
学習データ作りのときだけネットを使う (配布物のホストはオフラインのまま)。集めたファイルは Git の対象外の data/local/ に置き、
リポジトリにはコミットしない (取得元の一覧と注釈だけを残す)。

    python scripts/preset-model/collect_github.py [--per-kind 2500]

検索は gh コマンド (ログイン済み) を使う。コード検索は 1 分に 10 回・1 回の検索で最大 1000 件なので、ファイルの大きさで区切る。
"""

import argparse
import json
import os
import subprocess
import time
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
OUT = os.path.join(ROOT, "data", "local", "preset-model", "github")
KINDS = {
    "inputactions": ("extension:inputactions", [(0, 1500), (1500, 3000), (3000, 6000), (6000, 12000), (12000, 25000), (25000, 60000)]),
    "godot": ('filename:project.godot "[input]"', [(0, 1500), (1500, 2500), (2500, 4000), (4000, 6000), (6000, 10000), (10000, 40000)]),
}
# パッケージのキャッシュ・サンプル・テンプレートは除く
SKIP = ("library/packagecache", "samples~", "/packages/com.unity", "packagecache/", "/addons/", "/demo/", "/demos/", "/examples/",
        "/test/", "/tests/")


def search(q, page):
    r = subprocess.run(["gh", "api", "-X", "GET", "search/code", "-f", f"q={q}", "-f", "per_page=100", "-f", f"page={page}"],
                       capture_output=True, text=True, encoding="utf-8")
    if r.returncode != 0:
        return None, r.stderr.strip()[:200]
    return json.loads(r.stdout), None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--per-kind", type=int, default=2500)
    args = ap.parse_args()
    os.makedirs(OUT, exist_ok=True)
    idx_path = os.path.join(OUT, "index.json")
    index = json.load(open(idx_path, encoding="utf-8")) if os.path.exists(idx_path) else {}
    for kind, (query, buckets) in KINDS.items():
        os.makedirs(os.path.join(OUT, kind), exist_ok=True)
        have = sum(1 for v in index.values() if v["kind"] == kind)
        for lo, hi in buckets:
            if have >= args.per_kind:
                break
            for page in range(1, 11):
                if have >= args.per_kind:
                    break
                res, err = search(f"{query} size:{lo}..{hi}", page)
                time.sleep(6.5)  # 1 分に 10 回まで
                if res is None:
                    print(f"  検索の失敗 ({kind} {lo}..{hi} p{page}): {err}", flush=True)
                    if "rate limit" in (err or "").lower():
                        time.sleep(60)
                        continue
                    break
                items = res.get("items", [])
                todo = []
                for it in items:
                    sha, path, repo = it["sha"], it["path"], it["repository"]["full_name"]
                    if sha in index or any(s in ("/" + path.lower()) for s in SKIP):
                        continue
                    ref = urllib.parse.parse_qs(urllib.parse.urlparse(it["url"]).query).get("ref", ["HEAD"])[0]
                    todo.append((sha, path, repo, ref))

                def fetch(t):
                    sha, path, repo, ref = t
                    raw = f"https://raw.githubusercontent.com/{repo}/{ref}/{urllib.parse.quote(path)}"
                    try:
                        return t, urllib.request.urlopen(raw, timeout=20).read()
                    except Exception:  # noqa: BLE001
                        return t, None

                with ThreadPoolExecutor(16) as pool:
                    for (sha, path, repo, ref), body in pool.map(fetch, todo):
                        if body is None or len(body) > 400_000:
                            continue
                        ext = "inputactions" if kind == "inputactions" else "godot"
                        with open(os.path.join(OUT, kind, f"{sha}.{ext}"), "wb") as f:
                            f.write(body)
                        index[sha] = {"kind": kind, "repo": repo, "path": path, "ref": ref}
                        have += 1
                print(f"{kind} {lo}..{hi} p{page}: {len(items)} 件 → 集めた {have} 件", flush=True)
                json.dump(index, open(idx_path, "w", encoding="utf-8"), ensure_ascii=False, indent=0)
                if len(items) < 100:
                    break
    print("合計", {k: sum(1 for v in index.values() if v["kind"] == k) for k in KINDS})


if __name__ == "__main__":
    main()
