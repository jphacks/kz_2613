"""READMEの録画入りの図（controllers・focus）を、文字のSVGと録画のWebPの「切り絵」に分ける。

図を1本のWebPにすると、文字までラスタになってぼやける。そこで図を横の段（行）と縦の枠（列）に切り、
文字だけの枠はSVG（元の図の viewBox を切り出したベクター）、スマホ画面の枠はアニメーションWebPにして、
READMEでは <img width="〇%" align="absbottom"> を隙間なく並べて1枚の図に見せる。

- 枠の幅は親の幅に対する割合なので、GitHub上のどの横幅でも同じ比率で縮み、段と段の継ぎ目もずれない。
- align="absbottom"（vertical-align: bottom）にすると、画像の下に文字の下がり分の隙間ができない。
- PC版（wide）とスマホ版（narrow, 700px以下）は <picture> の source で差し替えるが、width 属性は共通になる。
  そのため両方の版で、各段の枠の幅の並び（SLOTS）をそろえる。片方の版に要らない段は、高さがほぼ0の
  blank.svg を入れて消す（その段は行の高さ＝約24pxの空きになるので、もともと空きのある所に置く）。
- 枠の合計は99.8%。100%ちょうどだと、ブラウザの丸めで最後の枠が次の行へ落ちることがある。
- ブラウザは画像の左右の端を画素にそろえて描くので、端の位置と幅が違う枠どうしでは、中ほどの線が
  1画素ほどずれる。段をまたぐ縦の線（focus のカードの枠線）は、どの段でも同じ区切りの枠に入れる。
  逆に、隣り合う枠の境目は両側で同じ画素になるので、文字が境目をまたいでもずれない
  （focus の narrow の説明文は、wide の3列に合わせて2つの枠に分けている）。
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
ART = ROOT / "assets" / "readme"
OUT = ART / "pieces"
BLANK = "assets/readme/pieces/blank.svg"
TOTAL = 99.8

# 各段の枠の幅（%）。両方の版で共通。
SLOTS = {
    "controllers": [[99.8], [33.8, 66.0], [33.8, 66.0], [33.8, 66.0]],
    "focus": [[33.8, 33.0, 33.0], [33.8, 33.0, 33.0], [33.8, 33.0, 33.0], [99.8]],
}

# 版ごとの切り方。unit は 1% あたりの図の座標（図の幅 ＝ unit × 99.8）。
# rows は段ごとに (上端, 下端, 各枠の種類)（図の座標。showcase.py は中身を translate(0 10) で下げているので、その分を足した値） または None（この版では使わない段）。
# 枠の境目は、どちらの版でも文字やスマホにかからない「すき間」に来るようにしてある
# （wide は 838 幅の図で x≈283.8 と 560.9、narrow はスマホの右端 111.5 が 33.8% に来る）。
# q は WebP の画素数の決め方（cells の説明を参照）。wide の q=2 は図の座標の約2.4倍の画素になる。
LAYOUT = {
    "controllers": {
        "wide": dict(unit=838 / TOTAL, q=2, rows=[
            (0, 78, ["svg"]),               # 見出し・説明・区切りの線
            (78, 125, ["svg", "svg"]),      # P1 | P2・P3 の担当名
            (125, 503, ["webp", "webp"]),   # P1 | P2・P3 のスマホ画面
            (503, 612, ["svg", "svg"]),     # P1 | P2・P3 の説明
        ]),
        "narrow": dict(unit=111.5 / 33.8, rows=[
            (0, 98, ["svg"]),
            (98, 307, ["webp", "svg"]),     # P1 のスマホ | 説明
            (307, 516.4, ["webp", "svg"]),  # P2
            (516.4, 745, ["webp", "svg"]),  # P3
        ]),
    },
    "focus": {
        "wide": dict(unit=838 / TOTAL, q=2, rows=[
            (0, 64, ["svg", "svg", "svg"]),      # カードの上（01 | 02 | 03）
            (64, 372, ["webp", "webp", "svg"]),  # 01 のスマホ | 02 のスマホ | 03 の数値
            (372, 473, ["svg", "svg", "svg"]),   # カードの下（説明）。下の余白は次の段（1行分の空き）が受け持つので詰める
            None,                                # narrow の 03 のカード（図の下の空きになる）
        ]),
        "narrow": dict(unit=111.5 / 33.8, rows=[
            (0, 206, ["webp", "svg", "svg"]),    # 01 のスマホ | 説明（2つに分ける）
            None,                                # wide の中段（01 と 02 の間の空きになる）
            (221, 428, ["webp", "svg", "svg"]),  # 02 のスマホ | 説明（2つに分ける）
            (428, 795, ["svg"]),                 # 03 のカード
        ]),
    },
}

MODES = {"wide": "", "narrow": "narrow-", "compact": "compact-", "mid": "mid-"}
THEMES = ["light", "dark"]
# 中間の版2つ（scripts/readme/markup.py の版の段階）の図の幅。showcase.py は、中間の版のスマホ画面をスマホ版と同じ大きさ・
# 並びで描くので、録画の枠はスマホ版の WebP をそのまま使い、文字の枠だけを中間の版の図から切り出す。
TIER_W = {"compact": 460, "mid": 620}


def _rec_y(name, mode):
    """図の中の最初の録画（スマホ画面）の上端。"""
    s = (ART / f"{name}-{MODES[mode]}light.svg").read_text(encoding="utf-8")
    return float(re.search(r'<image [^>]*y="([\d.]+)"[^>]*data-recording=', s).group(1))


def _svg_h(name, mode):
    s = (ART / f"{name}-{MODES[mode]}light.svg").read_text(encoding="utf-8")
    return float(re.search(r'<svg[^>]* height="([\d.]+)"', s).group(1))


def spec_of(name, mode):
    """版の切り方。中間の版2つは、スマホ版の段を、スマホ画面の上下の位置の差（dy）だけずらして作る。
    段の数と、各段の枠の種類はスマホ版と同じ。最後の段（文字だけ）の下端は図の下端にする。"""
    if mode in LAYOUT[name]:
        return LAYOUT[name][mode]
    base = LAYOUT[name]["narrow"]
    dy = _rec_y(name, mode) - _rec_y(name, "narrow")
    rows = []
    for k, row in enumerate(base["rows"]):
        if row is None:
            rows.append(None)
            continue
        y0, y1, kinds = row
        y0 = 0 if k == 0 else y0 + dy
        y1 = y1 + dy
        if k == len(base["rows"]) - 1 and "webp" not in kinds:
            y1 = _svg_h(name, mode)
        rows.append((y0, y1, kinds))
    return dict(unit=TIER_W[mode] / TOTAL, rows=rows)


def slots_of(name, mode):
    """各段の枠の幅（%）。PC版・スマホ版は SLOTS。中間の版2つは、スマホ画面の枠をスマホ版と同じ図の座標の幅
    （33.8% × スマホ版の unit）にし、残りを文字の枠で分ける。"""
    if mode in ("wide", "narrow"):
        return SLOTS[name]
    phone_w = SLOTS[name][1][0] * LAYOUT[name]["narrow"]["unit"]
    p = round(phone_w / spec_of(name, mode)["unit"], 3)
    out = []
    for slots in SLOTS[name]:
        if len(slots) == 1:
            out.append([TOTAL])
        else:
            rest = round((TOTAL - p) / (len(slots) - 1), 3)
            out.append([p] + [rest] * (len(slots) - 1))
    return out


def cells(name, mode):
    """(段, 列, 種類, x, y, w, h, px) を図の座標で返す。None の段は返さない。px は WebP の (幅, 高さ) の画素数。

    同じ段の枠は、表示したときの高さがぴったり同じでないと、段の継ぎ目に1px弱の切れ目が出る
    （カードの枠線で見える）。表示の高さは「枠の幅% × 画像の 高さ/幅」なので、WebP の画素数を
    枠の幅%に比例させ（wide は 1% あたり q×10 画素、段の WebP が1枚なら約2倍の画素）、
    段の高さ h もその画素数から逆算して、SVG の viewBox にも同じ h を使う。
    """
    spec = spec_of(name, mode)
    u = spec["unit"]
    q = spec.get("q")
    out = []
    for r, (slots, row) in enumerate(zip(slots_of(name, mode), spec["rows"])):
        if row is None:
            continue
        y0, y1, kinds = row
        assert len(kinds) == len(slots), (name, mode, r)
        webps = [c for c, k in enumerate(kinds) if k == "webp"]
        h = y1 - y0
        px = {}
        if webps:
            if q is None:
                assert len(webps) == 1, "WebP が2枚以上の段は q を決める"
                wpx = {webps[0]: round(slots[webps[0]] * u * 2)}
            else:
                wpx = {c: round(slots[c] * 10) * q for c in webps}
            c0 = webps[0]
            hpx = round(h * wpx[c0] / (slots[c0] * u))
            h = hpx * slots[c0] * u / wpx[c0]
            px = {c: (wpx[c], hpx) for c in webps}
        x = 0.0
        for c, (pct, kind) in enumerate(zip(slots, kinds)):
            out.append((r, c, kind, x, y0, pct * u, h, px.get(c)))
            x += pct * u
    return out


def piece_name(name, mode, theme, r, c, kind):
    if kind == "webp" and mode in TIER_W:  # 中間の版の録画の枠は、スマホ版の WebP をそのまま使う
        mode = "narrow"
    return f"{name}-{mode}-{theme}-{r + 1}{'abc'[c]}.{kind}"


def write_svg_pieces(name, mode, theme):
    """元の図のSVGから、文字の枠を viewBox の切り出しで書く。録画の静止画（<image>）は外す。"""
    src = (ART / f"{name}-{MODES[mode]}{theme}.svg").read_text(encoding="utf-8")
    body = re.sub(r'<image [^>]*data-recording="[^"]*"[^>]*/>', "", src)
    assert "<image" not in body, "録画以外の画像が残っている"
    written = []
    for r, c, kind, x, y, w, h, _ in cells(name, mode):
        if kind != "svg":
            continue
        svg = re.sub(r'<svg([^>]*?) viewBox="[^"]*" width="[^"]*" height="[^"]*"',
                     lambda m: f'<svg{m.group(1)} viewBox="{x:.2f} {y:.2f} {w:.2f} {h:.2f}" width="{w:.2f}" height="{h:.2f}"',
                     body, count=1)
        assert svg != body
        p = OUT / piece_name(name, mode, theme, r, c, kind)
        p.write_text(svg, encoding="utf-8", newline="\n")
        written.append(p)
    return written


def html(name, alt):
    """READMEに入れる <p>…</p>。1つ目の画像に図全体の代替テキストを付ける。

    枠1つを、版の段階（scripts/readme/markup.py の TIERS）ごとの <picture> にして並べる。段階ごとに枠の幅（%）が
    違ってよい（中間の版2つはスマホ画面の枠が細い）。その段階で使わない段（None）の枠は出さない
    （その段は1行分の空きになるので、もともと空きのある所に置いてある）。markup.py rebuild はこの段落を組み直さない。"""
    sys.path.insert(0, str(ROOT / "scripts" / "readme"))
    import markup
    lines = []
    first = True
    for r in range(len(SLOTS[name])):
        pics = []
        for c in range(len(SLOTS[name][r])):
            groups = {}
            for tier, (_, _, intervals) in markup.TIERS.items():
                row = spec_of(name, tier)["rows"][r]
                if row is None:
                    continue
                pct = slots_of(name, tier)[r][c]
                src = {th: f"assets/readme/pieces/{piece_name(name, tier, th, r, c, row[2][c])}" for th in THEMES}
                key = (src["light"], src["dark"], f' width="{pct:g}%" align="absbottom"', tier in ("narrow", "wide"))
                groups.setdefault(key, []).extend(intervals)
            for (light, dark, attrs, _), intervals in groups.items():
                for p in markup.versions(intervals, light, dark, attrs, alt if first else ""):
                    pics.append(p if first else re.sub(r' alt="[^"]*"', ' alt=""', p))
                    first = False
        lines.append("".join(pics))
    return "<p>" + "<br>\n".join(lines) + "</p>"


def write_blank():
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "blank.svg").write_text(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1" width="1000" height="1"/>\n', encoding="utf-8", newline="\n")


if __name__ == "__main__":
    for n in sys.argv[1:] or SLOTS:
        print(html(n, "（代替テキスト）"))
