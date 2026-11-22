"""項目の見出しの右側で、スマホ型のキャラクターが見出しの内容を演じる版の見出しを生成する。

product_scenes.py の場面（幅560・高さ100の舞台）を縮めて、見出しの文字の右側に置く。背景の色は付けない。
PCは見出しの文字の基準線に舞台の地面をそろえ、見出しの文字にかからない右側に置く。
スマホは横に空きがないので、番号の行の上に幅いっぱいの舞台を置く。
舞台の左右の端は溶けるように消し、出入りするキャラクターが見出しの文字に重ならないようにする。

    python scripts/readme/head_play.py
"""
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import build_art as art  # noqa: E402
import product_scenes as ps  # noqa: E402
import scenes  # noqa: E402

OUT = art.OUT / "heads"
PC_SCALE = .57  # 一番長い見出し（01）の右の空きに収まる大きさ
# 中間の版の舞台の大きさ。縮めて（0.895倍）表示しても吹き出しの文字が12.5px以上になる（12×2.0×0.6×0.895≒12.9px）
MID_SCALE = .6
MID_EDGE = .17  # 舞台の左端のこの割合には何も描かれない（stage の説明）。見出しの文字はここまで使える
MID_SHIFT = 36  # 舞台の右端の帯（約24%）にも何も描かれないので、図の右端からはみ出させて見出しの幅を広げる
PC_W = 840  # 項目の見出しの幅（build_art.head_parts）
BASE = 55  # PC版の見出しの文字の基準線
BUBBLE = 2.0  # 縮めて表示するので、吹き出しの文字を大きくしておく（12px×2.0×0.57≒13.7px）
SEP = 44  # 区切りの線から見出しまでの間
FIRST = {"01", "08"}  # 大見出しの直後の項目には区切りの線を付けない


# 見出しの番号 → 場面。見出しごとに、その内容をスマホたちが演じる。
PLAY = {"01": ps.alone, "02": ps.together, "03": ps.join, "04": ps.genres, "05": ps.playtest, "06": ps.remote,
        "07": ps.remocon, "08": ps.hotspot, "09": ps.lanes, "10": ps.build, "11": ps.assign}


def stage(sc, x, y, k):
    """場面を (x, y) に縮尺 k で置き、舞台の矩形で切り抜く。

    以前は左右の端に GitHub の背景色（ライト #FFFFFF、ダーク #0D1117）のグラデーションを重ねて溶かしていたが、
    GitHub の Dark dimmed など背景色の違うテーマで暗い四角に見えた。全場面を0.2秒ごとに描いて確かめると、
    動きは舞台の横幅の約19〜76%に収まり、端の帯には何も描かれないので、重ねるのをやめた（2026-11-22）。"""
    w, h = scenes.W * k, scenes.H * k
    defs = f'<clipPath id="stage"><rect x="{x}" y="{y - 20}" width="{w}" height="{h + 40}"/></clipPath>'
    return (f'<defs>{defs}</defs><g clip-path="url(#stage)"><svg x="{x:.1f}" y="{y:.1f}" width="{w:.1f}" height="{h:.1f}" '
            f'viewBox="0 0 {scenes.W} {scenes.H}" overflow="visible">{"".join(sc.svg)}</svg></g>')


# 小さい中間の版の舞台。番号と英字ラベルの行の右に置き、地面を番号の基準線にそろえる（0.85倍でも吹き出しが12.5px以上：
# 12×2.0×0.62×0.85≒12.6px）
COMPACT_SCALE = .62


def play_head(num, jp, en, make, t, narrow=False, mid=False, compact=False):
    scenes.BUBBLE = BUBBLE
    sc, title, desc = make()
    if compact:
        k = COMPACT_SCALE
        W, H, body = art.head_parts(num, jp, en, t, compact=True)
        x = art.COMPACT_STAGE_X
        assert x + scenes.W * k * .76 <= art.COMPACT_W - 10  # 動きのある範囲は図の中に収まる
        top = max(0, round(scenes.G * k - 42))  # 舞台の地面を番号の基準線（y=42）にそろえ、上にはみ出す分だけ下げる
        body = stage(sc, x, 42 + top - scenes.G * k, k) + f'<g transform="translate(0 {top})">{body}</g>'
        H += top
    elif mid:
        # PC版と同じく見出しの右に舞台を置き、地面を見出しの最後の行の基準線にそろえる
        k = MID_SCALE
        W, H, body = art.head_parts(num, jp, en, t, mid=True)
        x = art.MID_W - scenes.W * k + MID_SHIFT
        assert x + scenes.W * k * .76 <= art.MID_W - 20  # 動きのある範囲（横幅の約19〜76%）は図の中に収まる
        assert round(x + scenes.W * k * MID_EDGE - 58 - 8) == art.MID_HEAD_AVAIL
        body = stage(sc, x, BASE + (H - 68) - scenes.G * k, k) + body
    elif narrow:
        k = art.PHONE_W / scenes.W
        top = round(scenes.G * k) - 4  # 舞台の地面を、番号の行の少し上に置く
        W, H, body = art.head_parts(num, jp, en, t, narrow=True)
        body = stage(sc, 0, 0, k) + f'<g transform="translate(0 {top})">{body}</g>'
        H += top
    else:
        k = PC_SCALE
        W, H, body = art.head_parts(num, jp, en, t)
        # 舞台は見出しの文字より先（下）に描く
        body = stage(sc, PC_W - scenes.W * k, BASE - scenes.G * k, k) + body
    if num not in FIRST:
        # 前の項目との区切り：目次・受賞結果の見出しと同じ、細い線と4色の点。少し間を空けてから見出しを置く
        x1 = W - 67
        sep = (f'<rect x="0" y="8.25" width="{x1}" height="1.5" rx=".75" fill="{t["line"]}"/>'
               + "".join(f'<circle cx="{x1 + 10 + i * 13}" cy="9" r="4" fill="{art.CHARS[n]["body"]}"/>' for i, n in enumerate(art.ORDER)))
        body = sep + f'<g transform="translate(0 {SEP})">{body}</g>'
        H += SEP
    return art.svg(W, H, body, t, f"{jp}（{title}：{desc}）", scenes.COMMON + "".join(sc.css))


def main():
    # 場面の吹き出しの文字は12〜15px。縮めて表示しても、図の文字の下限（12.5px）を下回らないようにする
    assert 12 * BUBBLE * min(PC_SCALE, art.PHONE_W / scenes.W, MID_SCALE * .895, COMPACT_SCALE * .845) >= 12.5
    n = 0
    for num, jp, en in art.HEADS:
        for mode, t in art.THEMES.items():
            for suffix, narrow, mid, compact in (("", False, False, False), ("-mid", False, True, False),
                                                 ("-compact", False, False, True), ("-narrow", True, False, False)):
                svg = play_head(num, jp, en, PLAY[num], t, narrow, mid, compact)
                ET.fromstring(svg)  # 属性の重複などがあると GitHub で画像が表示されないので、XMLとして読めることを確かめる
                (OUT / f"play-{num}{suffix}-{mode}.svg").write_text(svg + "\n", encoding="utf-8", newline="\n")
                n += 1
    print(f"wrote {n} files to {OUT}")


if __name__ == "__main__":
    main()
