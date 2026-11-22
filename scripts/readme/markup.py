"""READMEの画像を、画面幅とGitHubの外観（ライト・ダーク）に合わせて差し替えるための <picture> を書く。

    python scripts/readme/markup.py migrate [ファイル…]   # 書きやすい旧形式の <picture> を、下の新形式に書き換える
    python scripts/readme/markup.py rebuild [ファイル…]   # 新形式を組み直す（段階の版 *-compact-*・*-mid-* を足した後など）
    python scripts/readme/markup.py check [ファイル…]     # <picture> が新形式の決まりを守っているか確かめる

ファイルを省くと、README.md と、README の図を並べて説明する docs/readme-design.md を扱う。

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
   → その画面幅の版がない図は、スマホ版を原寸（px 指定）で表示する。

## 新形式

図1つを、版ごとに別の <picture> にして隙間なく並べる。各 <picture> の最初の <source> は、その版を
使わない画面で、幅0・高さ0の透明な画像（HIDE）に差し替えて消すためのもの（外観の条件を含まないので、
GitHub に書き換えられない）。2つ目の <source> は外観の条件だけを持つ。

- 版の段階は TIERS（スマホ版・小さい中間の版・中間の版・PC版）。本文欄の幅で区切り、画面幅に直してある。
- スマホ版と中間の版2つは本文欄の幅いっぱい（% 指定の図は同じ %）に表示する。図にその段階の版
  （スマホ版の名前の -narrow- を -compact- か -mid- にしたファイル）がなければ、1つ下の段階の版を原寸で置く。
- アニメーションWebP を含む版は、OS で「視差効果を減らす」を選んだ閲覧者向けの静止画（*-still.webp）の
  版を別に並べる（prefers-reduced-motion も外観の条件と同じ <source> に書けないため）。

代替テキストは最初の <picture> にだけ付け、ほかは alt="" にする（読み上げが重ならないように）。
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
FILES = ["README.md", "docs/readme-design.md"]
HIDE_PATH = "assets/readme/hide.svg"
BASE = ""  # 扱っているファイルから見たリポジトリの根（docs/ の中なら "../"）。main が設定する
WIDE_MIN = 1266   # PC版を使う最小の画面幅（スクロールバーがあっても本文欄が 809px 以上。13px の文字が12.5px以上）
# 版の段階。名前 → (ファイル名の印, 描いた幅, 使う画面幅の区間)。区間は本文欄の幅で決め、画面幅に直した。
# 本文欄は 〜543px で「画面幅−81」、544〜767px で「−113」、768〜1011px で「−377」、
# 1012〜1279px で「−457」、1300px 以上で 838（2026-11-22、スクロールバーのある Chrome の実測。スクロールバーのないスマホ・Mac は15px広い）。
#   narrow ：本文欄 〜399px（スマホの縦向き）
#   compact：本文欄 400〜554px（iPad の縦向き、スマホの横向き、画面を半分に分けたPC）
#   mid    ：本文欄 555〜808px（iPad の横向き、狭いPC）
#   wide   ：本文欄 809px〜
# narrow・compact・mid は本文欄の幅いっぱい（幅を % で指定した図は同じ %）に表示する。倍率はおおむね 0.85〜1.3倍。
# 図にその段階の版（ファイル名の -narrow- を印に替えたファイル）がなければ、1つ下の段階の版を原寸で置く。
INF = 10 ** 6
TIERS = {
    "narrow": ("-narrow-", 324, ((0, 480),)),
    "compact": ("-compact-", 460, ((481, 667), (768, 931))),
    "mid": ("-mid-", 620, ((668, 767), (932, WIDE_MIN - 1))),
    "wide": ("", 838, ((WIDE_MIN, INF),)),
}
ORDER = list(TIERS)
DARK = "(prefers-color-scheme: dark)"
MOTION = {"anim": "(prefers-reduced-motion: reduce)", "still": "(prefers-reduced-motion: no-preference)"}


def media_of(intervals):
    """画面幅の区間の並びを media の条件（カンマ区切りは「または」）にする。"""
    out = []
    for a, b in intervals:
        if a <= 0:
            out.append(f"(max-width: {b}px)")
        elif b >= INF:
            out.append(f"(min-width: {a}px)")
        else:
            out.append(f"(min-width: {a}px) and (max-width: {b}px)")
    return ", ".join(out)


def complement(intervals):
    """区間の並びの補集合（0〜INF の中で）。"""
    out, x = [], 0
    for a, b in sorted(intervals):
        if a > x:
            out.append((x, a - 1))
        x = max(x, b + 1)
    if x < INF:
        out.append((x, INF))
    return out


def still(src):
    return src[:-5] + "-still.webp" if src.endswith(".webp") else src


def picture(hide, light, dark, attrs, alt):
    s = f'<picture><source media="{hide}" srcset="{BASE}{HIDE_PATH}" width="0" height="0">'
    if dark != light:
        s += f'<source media="{DARK}" srcset="{dark}">'
    return s + f'<img src="{light}"{attrs} alt="{alt}"></picture>'


def versions(intervals, light, dark, attrs, alt):
    """1つの版（画面幅の区間）の <picture>。WebP なら動く版と静止画の版の2つ。"""
    hide = media_of(complement(intervals))
    if not light.endswith(".webp"):
        return [picture(hide, light, dark, attrs, alt)]
    return [picture(f"{MOTION['anim']}, {hide}", light, dark, attrs, alt),
            picture(f"{MOTION['still']}, {hide}", still(light), still(dark), attrs, "")]


def intrinsic_width(src):
    """原寸の表示幅（CSS px）。SVG は width 属性、WebP は2倍の画素で書き出してあるので半分。"""
    p = ROOT / src[len(BASE):]
    if src.endswith(".svg"):
        return float(re.search(r'<svg[^>]* width="([\d.]+)"', p.read_text(encoding="utf-8")).group(1))
    from PIL import Image
    return Image.open(p).size[0] / 2


PIECE_UNIT = 111.5 / 33.8  # recordings/pieces.py の narrow の unit（1% あたりの図の座標）


def tier_of(src, tier):
    """スマホ版の画像に対応する、段階 tier の版の名前。ファイルがなければ None。"""
    if tier == "narrow":
        return src
    m = src.replace("-narrow-", TIERS[tier][0])
    return m if m != src and (ROOT / m[len(BASE):]).exists() else None


# 本文欄いっぱいに広げず、どの段階も原寸で置く図。作品名は GitHub の h1（32px）と同じ大きさに見せるので拡大しない
# （各段階の版の幅は、その段階の本文欄のいちばん狭い幅に近づけてある。scripts/readme/title.py）
NATIVE = ("assets/readme/title-",)


def figure(nl, nd, wl, wd, alt, width=None, align=None):
    a = f' align="{align}"' if align else ""
    native = nl[len(BASE):].startswith(NATIVE)
    have = {"narrow": (nl, nd), "wide": (wl, wd)}
    for tier in ("compact", "mid"):
        l, d = tier_of(nl, tier), tier_of(nd, tier)
        if l and d:
            have[tier] = (l, d)
    groups = {}  # (light, dark, 属性) → 画面幅の区間。同じ表示の段階は1つの <picture> にまとめる
    for i, tier in enumerate(ORDER):
        if tier in have:
            (l, d), size = have[tier], ""
            if tier != "wide" and not native:
                size = f' width="{width or "100%"}"'
            elif width:
                size = f' width="{width}"'
        else:  # この段階の版がない：1つ下の段階の版を原寸で置く
            low = next(t for t in reversed(ORDER[:i]) if t in have)
            l, d = have[low]
            if width is None:
                size = ""
            else:
                pct = float(width.rstrip("%"))
                px = pct * PIECE_UNIT if "/pieces/" in l else intrinsic_width(l)
                size = f' width="{px:.2f}"'
        # スマホ版・PC版は、ほかの段階と同じ表示でもまとめない（collapse が図の始まりと PC 版を見分けるため）
        key = (l, d, size + a, tier if tier in ("narrow", "wide") else "")
        groups.setdefault(key, []).extend(TIERS[tier][2])
    pics = []
    for (l, d, attrs, _), intervals in groups.items():
        pics += versions(intervals, l, d, attrs, alt if not pics else "")
    # 2つ目以降の代替テキストは空にする（静止画の版も含む）
    return pics[0] + "".join(re.sub(r' alt="[^"]*"', ' alt=""', p) for p in pics[1:])


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


FENCE = re.compile(r"(?ms)^```.*?^```")


def outside_fences(text, fn):
    """コードブロック（```〜```）の外だけに fn を当てる。説明用の例は書き換えない。"""
    out, last = [], 0
    for m in FENCE.finditer(text):
        out += [fn(text[last:m.start()]), m.group(0)]
        last = m.end()
    return "".join(out + [fn(text[last:])])


def migrate(text):
    return outside_fences(text, lambda t: OLD.sub(convert, t))


NEW_PIC = re.compile(r'<picture><source media="([^"]+)" srcset="[^"]*hide\.svg" width="0" height="0">'
                     r'(?:<source media="\(prefers-color-scheme: dark\)" srcset="([^"]+)">)?<img ([^>]*)></picture>')


WIDE_HIDE = media_of(complement(TIERS["wide"][2]))


def collapse(text):
    """新形式を、図1つにつき旧形式の <picture> 1つに戻す（読むだけの道具向け。text_readme.py が使う）。"""
    def group(m):
        pics = [(media, dark, img) for media, dark, img in NEW_PIC.findall(m.group(0))]
        first, wide = pics[0], next(p for p in pics if p[0] in (WIDE_HIDE, f"{MOTION['anim']}, {WIDE_HIDE}"))
        nl, wl = attr(first[2], "src"), attr(wide[2], "src")
        nd, wd = first[1] or nl, wide[1] or wl
        attrs = "".join(f' {k}="{attr(wide[2], k)}"' for k in ("width", "align") if attr(wide[2], k))
        return ('<picture><source media="(max-width: 700px) and (prefers-color-scheme: dark)" '
                f'srcset="{nd}"><source media="(max-width: 700px)" srcset="{nl}">'
                f'<source media="{DARK}" srcset="{wd}"><img src="{wl}"{attrs} alt="{attr(first[2], "alt")}"></picture>')
    # 図の始まり（スマホ版の <picture>）。以前の形式（PC版の下限だけ・中間の版つき・% 指定）も読めるようにしておく
    first = media_of(complement(TIERS["narrow"][2]))
    heads = (first, "(min-width: 513px)", "(min-width: 1266px)", "(min-width: 668px) and (max-width: 767px), (min-width: 932px)",
             "(min-width: 420px)")
    starts = "|".join(re.escape(r) for h in heads for r in (h, f"{MOTION['anim']}, {h}"))
    one = NEW_PIC.pattern
    head = rf'<picture><source media="(?:{starts})"'
    text = re.sub(rf'{head}[^>]*>(?:(?!</picture>).)*</picture>(?:(?!{head}){one})*',
                  lambda m: group(m) if NEW_PIC.match(m.group(0)) else m.group(0), text)
    return text


def rebuild(text):
    """新形式をいったん旧形式に戻して組み直す。段階の版（*-compact-*・*-mid-*）を足したり消したりした後に使う。"""
    return outside_fences(text, lambda t: OLD.sub(convert, collapse(t)))


def check(text, here=ROOT):
    text = FENCE.sub(lambda m: "\n" * m.group(0).count("\n"), text)  # 説明用の例は調べない（行番号は保つ）
    errors = []
    for m in re.finditer(r"<picture>(.*?)</picture>", text, re.S):
        p = m.group(1)
        line = text.count("\n", 0, m.start()) + 1
        sources = re.findall(r"<source ([^>]*)>", p)
        if not sources:
            errors.append(f"{line}: <source> がない")
            continue
        first = sources[0]
        if attr(first, "srcset") != BASE + HIDE_PATH or attr(first, "width") != "0" or attr(first, "height") != "0":
            errors.append(f"{line}: 最初の <source> が、使わない画面で消すための HIDE（幅0・高さ0）になっていない")
        if "prefers-color-scheme" in (attr(first, "media") or ""):
            errors.append(f"{line}: 消すための <source> に外観の条件がある（GitHub に書き換えられる）")
        for s in sources[1:]:
            if "prefers-color-scheme" in (attr(s, "media") or "") and attr(s, "media") != DARK:
                errors.append(f"{line}: 外観の <source> にほかの条件がある：{attr(s, 'media')}")
        for src in re.findall(r'(?:srcset|src)="([^"]+)"', p):
            if not src.startswith("http") and not (here / src).exists():
                errors.append(f"{line}: ファイルがない：{src}")
            for mark, _, _ in list(TIERS.values())[1:3]:
                other = src.replace("-narrow-", mark)
                if other != src and not src.startswith("http") and (here / other).exists() and other not in text:
                    errors.append(f"{line}: {mark.strip('-')} の版があるのに使っていない（markup.py rebuild で組み直す）：{other}")
    return errors


def main():
    global BASE
    cmd = sys.argv[1] if len(sys.argv) > 1 else "check"
    bad = False
    for name in sys.argv[2:] or FILES:
        path = ROOT / name
        BASE = "../" * (len(Path(name).parts) - 1)
        text = path.read_text(encoding="utf-8")
        if cmd in ("migrate", "rebuild"):
            new = migrate(text) if cmd == "migrate" else rebuild(text)
            path.write_text(new, encoding="utf-8", newline="\n")
            print(f"{name}: {'migrated' if new != text else 'no change'}")
        errors = check(path.read_text(encoding="utf-8"), path.parent)
        for e in errors:
            print(f"NG {name}:{e}")
        bad |= bool(errors)
        if not errors:
            print(f"PASS: {name} の <picture> はすべて新形式")
    if bad:
        sys.exit(1)


if __name__ == "__main__":
    main()
