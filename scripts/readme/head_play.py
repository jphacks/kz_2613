"""区切りの帯をやめ、項目の見出しの右側でキャラクターが遊ぶ版の見出しを生成する（比較用の案）。

scenes.py の場面（幅560・高さ100の舞台）を縮めて、見出しの文字の右側に置く。背景の色は付けない。
PCは見出しの文字の基準線に舞台の地面をそろえ、見出しの文字にかからない右側に置く。
スマホは横に空きがないので、番号の行の上に幅いっぱいの舞台を置く。
舞台の左右の端は溶けるように消し、出入りするキャラクターが見出しの文字に重ならないようにする。

    python scripts/readme/head_play.py
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import build_art as art  # noqa: E402
import scenes  # noqa: E402
from scenes import IN, OUT_, Scene, actor, key, mark, pop  # noqa: E402

OUT = art.OUT / "heads"
PC_SCALE = .57  # 一番長い見出し（01）の右の空きに収まる大きさ
PC_W = 840  # 項目の見出しの幅（build_art.head_parts）
BASE = 55  # PC版の見出しの文字の基準線
BUBBLE = 2.0  # 縮めて表示するので、吹き出しの文字を大きくしておく（12px×2.0×0.57≒13.7px）


def wave():
    """4体が順にぴょんと跳ねてウェーブし、最後にそろって跳んで「♪」。"""
    D = 4.4
    sc = Scene(D)
    for i, name in enumerate(art.ORDER):
        a = 6 + i * 8
        ks = [key(0, 0), key(a, 0, 0, 0, 1.08, .9, OUT_), key(a + 4, 0, -22, 0, .92, 1.1, IN),
              key(a + 8, 0, 0, 0, 1.1, .88, OUT_), key(a + 11, 0, 0, 0),
              key(62, 0, 0, 0, 1.1, .88, OUT_), key(67, 0, -30, 0, .9, 1.12, IN), key(72, 0, 0, 0, 1.12, .86, OUT_),
              key(76, 0, 0, 0)]
        sc.add(actor(f"wv{i}", name, ks, D, (("normal", f"wv{i}n"), ("happy", f"wv{i}h")), x0=190 + i * 60))
        sc.raw(css=scenes.show(f"wv{i}n", D, [(0, 60), (90, 100)]) + scenes.show(f"wv{i}h", D, [(60, 90)]))
    sc.raw(mark(280, 30, "♪", "wv-m", 22) + mark(350, 24, "♪", "wv-m2", 18), pop("wv-m", D, 66, 88) + pop("wv-m2", D, 69, 88))
    return sc, "ウェーブ", "4体が順番に跳ねてウェーブし、最後はそろって跳ぶ。"


# 見出しの番号 → 場面。帯で使っていた10種に、ウェーブを足して11項目に1つずつ置く。
PLAY = {"01": scenes.daruma, "02": scenes.chase, "03": scenes.train, "04": scenes.rope, "05": scenes.seesaw,
        "06": scenes.tug, "07": scenes.hide, "08": scenes.volley, "09": scenes.domino, "10": wave, "11": scenes.nap}


def stage(sc, x, y, k, fade_l=.12, fade_r=.08):
    """場面を (x, y) に縮尺 k で置く。左右の端は溶けるように消す。"""
    w, h = scenes.W * k, scenes.H * k
    defs = (f'<linearGradient id="stagefade" x1="{x}" y1="0" x2="{x + w}" y2="0" gradientUnits="userSpaceOnUse">'
            f'<stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset="{fade_l}" stop-color="#fff"/>'
            f'<stop offset="{1 - fade_r}" stop-color="#fff"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>'
            f'<mask id="stage" maskUnits="userSpaceOnUse" x="{x}" y="{y - 20}" width="{w}" height="{h + 40}">'
            f'<rect x="{x}" y="{y - 20}" width="{w}" height="{h + 40}" fill="url(#stagefade)"/></mask>')
    return (f'<defs>{defs}</defs><g mask="url(#stage)"><svg x="{x:.1f}" y="{y:.1f}" width="{w:.1f}" height="{h:.1f}" '
            f'viewBox="0 0 {scenes.W} {scenes.H}" overflow="visible">{"".join(sc.svg)}</svg></g>')


def play_head(num, jp, en, make, t, narrow=False):
    scenes.BUBBLE = BUBBLE
    sc, title, desc = make()
    if narrow:
        k = art.PHONE_W / scenes.W
        top = round(scenes.G * k) - 4  # 舞台の地面を、番号の行の少し上に置く
        W, H, body = art.head_parts(num, jp, en, t, narrow=True)
        body = stage(sc, 0, 0, k, .06, .06) + f'<g transform="translate(0 {top})">{body}</g>'
        H += top
    else:
        k = PC_SCALE
        W, H, body = art.head_parts(num, jp, en, t)
        body += stage(sc, PC_W - scenes.W * k, BASE - scenes.G * k, k)
    return art.svg(W, H, body, t, f"{jp}（{title}：{desc}）", scenes.COMMON + "".join(sc.css))


def main():
    # 場面の吹き出しの文字は12〜15px。縮めて表示しても、図の文字の下限（12.5px）を下回らないようにする
    assert 12 * BUBBLE * min(PC_SCALE, art.PHONE_W / scenes.W) >= 12.5
    n = 0
    for num, jp, en in art.HEADS:
        for mode, t in art.THEMES.items():
            for suffix, narrow in (("", False), ("-narrow", True)):
                svg = play_head(num, jp, en, PLAY[num], t, narrow)
                (OUT / f"play-{num}{suffix}-{mode}.svg").write_text(svg + "\n", encoding="utf-8", newline="\n")
                n += 1
    print(f"wrote {n} files to {OUT}")


if __name__ == "__main__":
    main()
