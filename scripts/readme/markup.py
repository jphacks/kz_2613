"""READMEの画像を、画面幅とGitHubの外観（ライト・ダーク）に合わせて差し替えるための <picture> を書く。

    python scripts/readme/markup.py migrate   # 書きやすい旧形式の <picture> を、下の新形式に書き換える
    python scripts/readme/markup.py check     # README の <picture> が新形式の決まりを守っているか確かめる

## 旧形式（人が書きやすい形。migrate で新形式に変わる）

    <picture><source media="(max-width: 700px) and (prefers-color-scheme: dark)" srcset="X-narrow-dark.svg">
    <source media="(max-width: 700px)" srcset="X-narrow-light.svg">
    <source media="(prefers-color-scheme: dark)" srcset="X-dark.svg"><img src="X-light.svg" alt="…"></picture>

## 旧形式をそのまま使えない理由（2026-11-22 に実測）

1. GitHub は <picture> を <themed-picture> で包み、外観を「ライト」か「ダーク」に固定した利用者には、
   media に `prefers-color-scheme` を含む <source> の media を、丸ごと「常に成り立つ」か `not all` に
   書き換える。`(max-width: 700px) and (prefers-color-scheme: dark)` の幅の条件も消えるので、ダークに
   固定した利用者には、PC でもスマホ版の図が出ていた。
   → 外観の条件を書く <source> には、幅などほかの条件を書かない。
2. GitHub の本文欄の幅は、画面幅 1012〜1279px で 555〜823px、768〜1011px で 391〜634px と、画面幅
   どおりには変わらない（右の欄が下へ回る幅がある）。PC版（838px）の図は本文欄が 808px 未満だと
   13px の文字が 12.5px を下回る。→ PC版は画面幅 1266px 以上だけで使い、それより狭い画面はスマホ版にする。
3. 幅を % で指定した画像（目次・録画の図の切り絵）のスマホ版は、本文欄が広いと何倍にも拡大される。
   → 画面幅 420〜1265px では、スマホ版を原寸（px 指定）で表示する。

## 新形式

図1つを、版ごとに別の <picture> にして隙間なく並べる。各 <picture> の最初の <source> は、その版を
使わない画面で、幅0・高さ0の透明な画像（HIDE）に差し替えて消すためのもの（外観の条件を含まないので、
GitHub に書き換えられない）。2つ目の <source> は外観の条件だけを持つ。

- 幅の指定がない図：スマホ版（〜1265px）と PC版（1266px〜）の2つ。
- 幅を % で指定した図：スマホ版・伸縮（〜419px）、スマホ版・原寸（420〜1265px）、PC版（1266px〜）の3つ。
- アニメーションWebP を含む版は、OS で「視差効果を減らす」を選んだ閲覧者向けの静止画（*-still.webp）の
  版を別に並べる（prefers-reduced-motion も外観の条件と同じ <source> に書けないため）。

代替テキストは最初の <picture> にだけ付け、ほかは alt="" にする（読み上げが重ならないように）。
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
README = ROOT / "README.md"
HIDE = "assets/readme/hide.svg"
WIDE_MIN = 1266   # PC版を使う最小の画面幅（スクロールバーがあっても本文欄が 808px 以上。見出しの13pxが12.5px以上）
FIXED_MIN = 420   # スマホ版を原寸で並べる最小の画面幅（本文欄が 339px 以上で、約330px の段が収まる）
DARK = "(prefers-color-scheme: dark)"
RANGES = {
    "narrow": f"(min-width: {WIDE_MIN}px)",
    "wide": f"(max-width: {WIDE_MIN - 1}px)",
    "fluid": f"(min-width: {FIXED_MIN}px)",
    "fixed": f"(max-width: {FIXED_MIN - 1}px), (min-width: {WIDE_MIN}px)",
}
MOTION = {"anim": "(prefers-reduced-motion: reduce)", "still": "(prefers-reduced-motion: no-preference)"}


def still(src):
    return src[:-5] + "-still.webp" if src.endswith(".webp") else src


def picture(hide, light, dark, attrs, alt):
    s = f'<picture><source media="{hide}" srcset="{HIDE}" width="0" height="0">'
    if dark != light:
        s += f'<source media="{DARK}" srcset="{dark}">'
    return s + f'<img src="{light}"{attrs} alt="{alt}"></picture>'


def versions(rng, light, dark, attrs, alt):
    """1つの版（画面幅の範囲）の <picture>。WebP なら動く版と静止画の版の2つ。"""
    if not light.endswith(".webp"):
        return [picture(RANGES[rng], light, dark, attrs, alt)]
    return [picture(f"{MOTION['anim']}, {RANGES[rng]}", light, dark, attrs, alt),
            picture(f"{MOTION['still']}, {RANGES[rng]}", still(light), still(dark), attrs, "")]


def intrinsic_width(src):
    """スマホ版の原寸の表示幅（CSS px）。SVG は width 属性、WebP は2倍の画素で書き出してあるので半分。"""
    p = ROOT / src
    if src.endswith(".svg"):
        return float(re.search(r'<svg[^>]* width="([\d.]+)"', p.read_text(encoding="utf-8")).group(1))
    from PIL import Image
    return Image.open(p).size[0] / 2


PIECE_UNIT = 111.5 / 33.8  # recordings/pieces.py の narrow の unit（1% あたりの図の座標）


def figure(nl, nd, wl, wd, alt, width=None, align=None):
    a = f' align="{align}"' if align else ""
    if width is None:
        pics = versions("narrow", nl, nd, a, alt) + versions("wide", wl, wd, a, "")
    else:
        pct = float(width.rstrip("%"))
        blank = nl.endswith("pieces/blank.svg")
        px = pct * PIECE_UNIT if blank or "/pieces/" in nl else intrinsic_width(nl)
        pics = (versions("fluid", nl, nd, f' width="{width}"{a}', alt)
                + versions("fixed", nl, nd, f' width="{px:.2f}"{a}', "")
                + versions("wide", wl, wd, f' width="{width}"{a}', ""))
    # 2つ目以降の代替テキストは空にする（静止画の版も含む）
    out = [pics[0]] + [re.sub(r' alt="[^"]*"', ' alt=""', p) for p in pics[1:]]
    return "".join(out)


OLD = re.compile(r'<picture>\s*'
                 r'<source media="\(max-width: (\d+)px\) and \(prefers-color-scheme: dark\)" srcset="([^"]+)">\s*'
                 r'<source media="\(max-width: \1px\)" srcset="([^"]+)">\s*'
                 r'<source media="\(prefers-color-scheme: dark\)" srcset="([^"]+)">\s*'
                 r'<img ([^>]*)>\s*</picture>')


def attr(s, name):
    m = re.search(rf'\b{name}="([^"]*)"', s)
    return m.group(1) if m else None


def convert(m):
    _, nd, nl, wd, img = m.groups()
    return figure(nl, nd, attr(img, "src"), wd, attr(img, "alt") or "", attr(img, "width"), attr(img, "align"))


def migrate(text):
    # 複数行で書いた単独の図は、原寸のスマホ版が本文欄の中央に来るよう <p align="center"> で包む
    text = re.sub(r'(?m)^<picture>\n(?:  .*\n)+?</picture>$',
                  lambda m: '<p align="center">' + OLD.sub(convert, m.group(0)) + '</p>', text)
    return OLD.sub(convert, text)


def check(text):
    errors = []
    for m in re.finditer(r"<picture>(.*?)</picture>", text, re.S):
        p = m.group(1)
        line = text.count("\n", 0, m.start()) + 1
        sources = re.findall(r"<source ([^>]*)>", p)
        if not sources:
            errors.append(f"{line}: <source> がない")
            continue
        first = sources[0]
        if attr(first, "srcset") != HIDE or attr(first, "width") != "0" or attr(first, "height") != "0":
            errors.append(f"{line}: 最初の <source> が、使わない画面で消すための HIDE（幅0・高さ0）になっていない")
        if "prefers-color-scheme" in (attr(first, "media") or ""):
            errors.append(f"{line}: 消すための <source> に外観の条件がある（GitHub に書き換えられる）")
        for s in sources[1:]:
            if "prefers-color-scheme" in (attr(s, "media") or "") and attr(s, "media") != DARK:
                errors.append(f"{line}: 外観の <source> にほかの条件がある：{attr(s, 'media')}")
        for src in re.findall(r'(?:srcset|src)="([^"]+)"', p):
            if not src.startswith("http") and not (ROOT / src).exists():
                errors.append(f"{line}: ファイルがない：{src}")
    return errors


def main():
    cmd = sys.argv[1] if len(sys.argv) > 1 else "check"
    text = README.read_text(encoding="utf-8")
    if cmd == "migrate":
        new = migrate(text)
        README.write_text(new, encoding="utf-8", newline="\n")
        print("migrated" if new != text else "no change")
    errors = check(README.read_text(encoding="utf-8"))
    for e in errors:
        print("NG", e)
    if errors:
        sys.exit(1)
    print("PASS: README の <picture> はすべて新形式")


if __name__ == "__main__":
    main()
