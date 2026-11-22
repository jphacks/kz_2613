"""録画の切り絵（pieces/*.webp）から、動きを止めた1コマの静止画（*-still.webp）を書き出す。

OS で「視差効果を減らす」（prefers-reduced-motion: reduce）を選んだ閲覧者には、README の <picture> が
アニメーションWebP の代わりにこの静止画を出す（scripts/readme/markup.py）。アニメーションWebP は
<img> の中では止められないため。

止める時刻は録画の長さに対する割合で、同じ録画を切り分けた枠どうしで同じ瞬間になるようにする。
操作の様子が分かる瞬間（スティックを倒している・ボタンの枠を選んでいる 等）を選んである。

    python scripts/readme/recordings/stills.py
"""
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[3]
PIECES = ROOT / "assets" / "readme" / "pieces"
# 図の名前と枠の名前の末尾 → 録画の長さに対する割合
AT = {
    ("controllers", None): 1 / 6,   # P1 がスティックを倒し、P2 がドラッグしている
    ("focus", "wide-2a"): 1 / 3,    # 01：リモコンのパッドに触れている
    ("focus", "narrow-1a"): 1 / 3,
    ("focus", "wide-2b"): 1 / 6,    # 02：ボタンの枠を選んで、大きさを変えるつまみが出ている
    ("focus", "narrow-3a"): 1 / 6,
}


def fraction(path):
    name, mode, _theme, cell = path.stem.split("-")
    return AT.get((name, f"{mode}-{cell}"), AT.get((name, None)))


def durations(path):
    """各コマの表示時間（ms）。Pillow はこの WebP のコマの長さを 0 と返すので、ANMF チャンクを直接読む。"""
    b = path.read_bytes()
    out, i = [], 12
    while i < len(b):
        kind, size = b[i:i + 4], int.from_bytes(b[i + 4:i + 8], "little")
        if kind == b"ANMF":
            out.append(int.from_bytes(b[i + 20:i + 23], "little"))
        i += 8 + size + (size & 1)
    return out


def main():
    n = 0
    for p in sorted(PIECES.glob("*.webp")):
        if p.stem.endswith("-still"):
            continue
        f = fraction(p)
        assert f is not None, f"止める時刻が決まっていない：{p.name}"
        im = Image.open(p)
        durations_ = durations(p)
        assert len(durations_) == im.n_frames, p.name
        target, t, k = f * sum(durations_), 0, 0
        while k + 1 < len(durations_) and t + durations_[k] <= target:
            t += durations_[k]
            k += 1
        im.seek(k)
        im.convert("RGBA").save(p.with_name(p.stem + "-still.webp"), "WEBP", quality=80, method=6)
        n += 1
    print(f"wrote {n} stills to {PIECES}")


if __name__ == "__main__":
    main()
