"""README の画像（SVG）の文字が、GitHub上で何pxで表示されるかを見積もる。

GitHub の本文欄の幅は、画面幅ごとに実測した値を使う（COLUMNS。本文は16px）。本文欄は画面幅どおりには
変わらない（右の欄が下へ回る幅がある）ので、PC・タブレット・スマホの代表的な画面幅をすべて調べる。
README の <picture>（scripts/readme/markup.py の新形式）から、その画面幅で表示される版を選び、
表示幅 ÷ 画像の幅 で文字を縮めた大きさを出す。
飾り（区切りの帯）を除き、MIN_PX より小さい文字があれば一覧にして終了コード1を返す。

    python scripts/readme/check_text_size.py
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
# 名前 → (本文欄の幅, 画面の幅)。2026-11-22 に Chrome（スクロールバーのある Windows）で GitHub のリポジトリのページを
# 開いて測った本文欄の幅。<source> の min-width・max-width は画面の幅と比べる。
# 430px 以下はスクロールバーのないスマホの値（スクロールバーがあると15px狭い）。
# PC版（1266px〜）・中間の版（668〜767px と 932〜1265px）・スマホ版のそれぞれの代表と、版の境目の両側を調べる。
COLUMNS = {
    "PC 1440": (838, 1440), "PC 1300": (838, 1300), "PC 1266（PC版の下限）": (809, 1266),
    "1265（中間の版の上限）": (808, 1265), "1194（iPad Pro 11 横）": (737, 1194), "1180（iPad Air 横）": (723, 1180),
    "1133（iPad mini 横）": (676, 1133), "1100": (643, 1100), "1024（iPad 横）": (567, 1024), "1012": (555, 1012),
    "1011": (634, 1011), "932（中間の版の下限）": (555, 932), "931": (554, 931), "834（iPad 縦）": (457, 834),
    "768": (391, 768), "767（中間の版の上限）": (654, 767), "744（iPad mini 縦）": (631, 744), "700": (587, 700),
    "668（中間の版の下限）": (555, 668), "667": (554, 667), "600": (487, 600), "430": (364, 430),
    "420": (354, 420), "390（iPhone）": (324, 390), "360（Android）": (294, 360),
}
MIN_PX = 12.5
DECOR = ("assets/readme/scenes/",)  # 区切りの帯。文字は吹き出しの飾りだけ
# 利用者の判断で形を変えずに使う図（2026-11-20）。大きさは表示するが、検査の対象から外す
FIXED = ("assets/readme/pipeline-",)


def svg_info(path):
    s = (ROOT / path).read_text(encoding="utf-8")
    # 録画入りの図の文字の枠（recordings/pieces.py）は、元の図の viewBox を切り出しているので原点が0でない
    width = float(re.search(r'viewBox="[-\d.]+ [-\d.]+ ([\d.]+) ', s).group(1))
    # 見出しの横の舞台（入れ子の svg）は区切りの帯と同じ飾りとして除く。吹き出しの大きさは head_play.py が確かめる
    s = re.sub(r"<svg x=.*?</svg>", "", s, flags=re.S)
    sizes = []
    for m in re.finditer(r'<text[^>]*font-size="([\d.]+)"[^>]*>([^<]*)</text>', s):
        sizes.append((float(m.group(1)), m.group(2)))
    return width, sizes


def matches(media, screen):
    """media の条件（カンマ区切りは「または」）が、画面幅 screen・動きを減らさない設定で成り立つか。"""
    def one(q):
        ok = True
        for feat, val in re.findall(r"\(([a-z-]+):\s*([^)]+)\)", q):
            if feat == "min-width":
                ok &= screen >= int(val.rstrip("px"))
            elif feat == "max-width":
                ok &= screen <= int(val.rstrip("px"))
            elif feat == "prefers-reduced-motion":
                ok &= val == "no-preference"
            elif feat == "prefers-color-scheme":
                ok &= val == "light"
        return ok
    return any(one(q) for q in media.split(","))


def pick(block, screen):
    """picture 要素が画面幅 screen（ライト）で表示する画像を返す。使わない画面で消す版（HIDE）なら None。"""
    for media, src in re.findall(r'<source media="([^"]+)" srcset="([^"]+)"', block):
        if matches(media, screen):
            return None if src.endswith("/hide.svg") else src
    return re.search(r'<img src="([^"]+)"', block).group(1)


def main():
    readme = (ROOT / "README.md").read_text(encoding="utf-8")
    blocks = re.findall(r"<picture>.*?</picture>", readme, re.S)
    rest = re.sub(r"<picture>.*?</picture>", "", readme, flags=re.S)
    blocks += re.findall(r"<img [^>]*>", rest)
    bad = []
    for name, (col, screen) in COLUMNS.items():
        print(f"== {name}（本文欄 {col}px、本文16px）")
        for block in blocks:
            src = pick(block, screen)
            if src is None:
                continue
            # 録画を焼き込んだ図（recordings/bake.py）は、元のSVGの文字で確かめる
            if src.endswith(".webp") and (ROOT / src[:-5]).with_suffix(".svg").exists():
                src = src[:-5] + ".svg"
            if not src.endswith(".svg") or src.startswith("http"):
                continue
            w_attr = re.search(r'<img[^>]*\swidth="([\d.]+)(%?)"', block)
            h_attr = re.search(r'<img[^>]*\sheight="([\d.]+)"', block)
            width, sizes = svg_info(src)
            if not sizes:
                continue
            if w_attr and w_attr.group(2) == "%":
                shown = col * float(w_attr.group(1)) / 100
            elif w_attr:
                shown = min(float(w_attr.group(1)), col)
            elif h_attr:
                continue  # 高さ指定の小さな印
            else:
                shown = min(width, col)
            k = shown / width
            small = min(sizes)[0] * k
            print(f"  {src:60s} 倍率{k:.2f}  最小{small:5.1f}px  最大{max(sizes)[0] * k:5.1f}px")
            if small < MIN_PX and not src.startswith(DECOR + FIXED):
                worst = sorted({t for sz, t in sizes if sz * k < MIN_PX})[:3]
                bad.append(f"{name} {src}: {small:.1f}px {worst}")
    if bad:
        print("\n小さすぎる文字：\n  " + "\n  ".join(bad))
        sys.exit(1)
    print(f"\nPASS: 飾りを除くすべての画像の文字が {MIN_PX}px 以上")


if __name__ == "__main__":
    main()
