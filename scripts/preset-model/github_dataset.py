"""collect_github.py で集めたファイルを、学習データの形 (data/local/preset-model/github-games.json) にする。
    python scripts/preset-model/github_dataset.py
- Unity の .inputactions: 「操作マップ/操作名」を ID にする。2DVector などの複合入力は上下左右の部分ごとの操作に分ける。
  マウスの移動は視点 (mouseDelta)、ホイールは wheel。ゲームパッドだけの割り当てはキーなし
- Godot の project.godot: build_dataset.godot_project
- 操作名とキーの組が同じもの (テンプレートの使い回し) は 1 件にまとめる。操作が 4 つ未満のものは除く
出力も data/local/ (Git の対象外) に置く。
"""

import hashlib
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import build_dataset as bd  # noqa: E402

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
SRC = os.path.join(ROOT, "data", "local", "preset-model", "github")
OUT = os.path.join(ROOT, "data", "local", "preset-model", "github-games.json")


def unity_key(path):
    p = (path or "").replace("\\/", "/")
    if p.startswith("<Mouse>/") or p.startswith("<Pointer>/"):
        tail = p.split("/", 1)[1].lower()
        return {"leftbutton": "MOUSE_L", "rightbutton": "MOUSE_R", "press": "MOUSE_L"}.get(tail)
    if p.startswith("<Keyboard>/"):
        return bd.key_id(p)
    return None


def inputactions(text):
    """Unity Input System の JSON → 操作の一覧"""
    text = text.lstrip("﻿")
    d = json.loads(text)
    acts = []
    for m in d.get("maps", []):
        mname = m.get("name") or "Map"
        binds = m.get("bindings", [])
        for a in m.get("actions", []):
            name = a.get("name") or ""
            aid = f"{mname}/{name}"
            bs = [b for b in binds if b.get("action") == name]
            paths = [(b.get("path") or "").replace("\\/", "/") for b in bs]
            if any(p.startswith(("<Mouse>/delta", "<Pointer>/delta")) for p in paths):
                acts.append({"id": aid, "label": name, "type": "mouseDelta"})
                continue
            if any(p.startswith(("<Mouse>/scroll", "<Pointer>/scroll")) for p in paths) and not any(unity_key(p) for p in paths):
                acts.append({"id": aid, "label": name, "type": "wheel"})
                continue
            parts = [b for b in bs if b.get("isPartOfComposite") and unity_key(b.get("path"))]
            if parts:
                seen = set()
                for b in parts:
                    part = (b.get("name") or "part").strip()
                    if part in seen:
                        continue
                    seen.add(part)
                    acts.append({"id": f"{aid}.{part}", "label": f"{name} {part}", "type": "button", "default": unity_key(b.get("path"))})
                continue
            key = next((unity_key(p) for p in paths if unity_key(p)), None)
            x = {"id": aid, "label": name, "type": "button"}
            if key:
                x["default"] = key
            acts.append(x)
    return acts


def main():
    index = json.load(open(os.path.join(SRC, "index.json"), encoding="utf-8"))
    games, sigs, bad, small, dup = [], set(), 0, 0, 0
    for sha, meta in sorted(index.items()):
        ext = "inputactions" if meta["kind"] == "inputactions" else "godot"
        path = os.path.join(SRC, meta["kind"], f"{sha}.{ext}")
        try:
            if ext == "inputactions":
                acts = inputactions(bd.read_text(path))
            else:
                _name, acts = bd.godot_project(path)
                # Godot の組み込みの ui_* は画面の操作 (残すが重複の判定には使わない)
        except Exception:  # noqa: BLE001
            bad += 1
            continue
        acts = [a for a in acts if a.get("id")]
        if len(acts) < 4:
            small += 1
            continue
        sig = hashlib.sha1(json.dumps(sorted((a["id"].lower(), a.get("default") or "") for a in acts)).encode()).hexdigest()
        if sig in sigs:
            dup += 1
            continue
        sigs.add(sig)
        games.append({"game": "gh-" + sha[:10], "name": f"{meta['repo']}:{meta['path']}", "kind": meta["kind"],
                      "source": f"GitHub {meta['repo']} ({meta['path']})", "actions": acts[:200]})
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    json.dump({"games": games}, open(OUT, "w", encoding="utf-8"), ensure_ascii=False)
    n_act = sum(len(g["actions"]) for g in games)
    print(f"使えるもの {len(games)} 件 (操作 {n_act} 件) / 読めない {bad}・操作が少ない {small}・重複 {dup}")
    for k in ("inputactions", "godot"):
        gs = [g for g in games if g["kind"] == k]
        print(f"  {k}: {len(gs)} 件、キーあり {sum(1 for g in gs for a in g['actions'] if a.get('default'))} 操作")


if __name__ == "__main__":
    main()
