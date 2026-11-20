"""README用のSVG素材を生成する（fontTools が必要）。

4色のスマホ型キャラクター（P1青・P2緑・P3紫・P4赤）を描き、ライト・ダーク両方の版を
assets/readme/ に書き出す。README の <picture> が GitHub のテーマに合わせて切り替える。

<img> で表示したSVGは外部のフォントを読めないため、ヒーローと締めの文字は使う字だけに
絞ったフォント（OFL）をSVGに埋め込む。フォントは google/fonts の固定した版から取得し、
data/local/readme-fonts/ に置いて再利用する。

    python scripts/readme/build_art.py
"""
import base64
import io
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "assets" / "readme"
FONT_CACHE = ROOT / "data" / "local" / "readme-fonts"
GOOGLE_FONTS = "https://raw.githubusercontent.com/google/fonts/5bd87dfc525c8a0d1d8529d3684716e00c3fc59a/ofl/"
# (クラス名, 太さ) → フォントファイル。rnd は丸ゴシック、hand は手書き風。
EMBED = {
    ("rnd", 700): ("RcRounded", "mplusrounded1c/MPLUSRounded1c-Bold.ttf"),
    ("rnd", 800): ("RcRounded", "mplusrounded1c/MPLUSRounded1c-ExtraBold.ttf"),
    ("hand", 400): ("RcHand", "yuseimagic/YuseiMagic-Regular.ttf"),
}
USED = {}  # 描画中の図で、埋め込むフォントごとに使った文字

# アプリの colors.css と同じキャラクター色。目は少し明るい発光色にする。
CHARS = {
    "blue": {"body": "#24C2FA", "eye": "#19F6FF"},
    "green": {"body": "#5EFF5D", "eye": "#86FF55"},
    "purple": {"body": "#CB00EA", "eye": "#DC45FF"},
    "red": {"body": "#FF1D00", "eye": "#FF4A3D"},
}
ORDER = ["blue", "green", "purple", "red"]

THEMES = {
    "light": {
        "bg1": "#E8FAFF", "bg2": "#FFF5DC", "panel": "#FFFFFF", "panel2": "#F6F9FC",
        "ink": "#2E2B48", "muted": "#625E72", "line": "#D8DEE8", "dot": "#9FDDF2",
        "dot2": "#F7B8D8", "stripe": "#FFE84A", "screen": "#0B0C10", "outline": "#3A3A3A",
        "chip": "#FFFFFF", "code": "#F1F4F9", "shadow": "#1B1530",
    },
    "dark": {
        "bg1": "#141827", "bg2": "#231B35", "panel": "#1B1F2C", "panel2": "#202535",
        "ink": "#EEF1F7", "muted": "#AEB4C2", "line": "#343B4E", "dot": "#24506A",
        "dot2": "#5A2F52", "stripe": "#C9B42C", "screen": "#05060A", "outline": "#0A0A0A",
        "chip": "#262B3B", "code": "#151925", "shadow": "#000000",
    },
}

FONTS = """
.jp{font-family:'Hiragino Sans','Hiragino Kaku Gothic ProN','Yu Gothic UI','Yu Gothic','Meiryo','Noto Sans JP','Noto Sans CJK JP',sans-serif}
.disp{font-family:Impact,Haettenschweiler,'Anton','Arial Narrow Bold','Arial Black',sans-serif}
.gh{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','Noto Sans',Helvetica,Arial,sans-serif}
.rnd{font-family:RcRounded,'Hiragino Maru Gothic ProN','Yu Gothic UI','Noto Sans JP',sans-serif}
.hand{font-family:RcHand,'Hiragino Maru Gothic ProN','Yu Gothic UI','Noto Sans JP',sans-serif}
.mono{font-family:ui-monospace,SFMono-Regular,'Cascadia Mono',Consolas,'Liberation Mono',monospace}
"""

MOTION = """
@keyframes bob{0%,100%{transform:translateY(0)}50%{transform:translateY(-5px)}}
@keyframes blink{0%,90%,100%{transform:scaleY(1)}94%{transform:scaleY(.12)}}
@keyframes flow{to{stroke-dashoffset:-28}}
@keyframes pulse{0%,100%{opacity:.55}50%{opacity:1}}
.bob{animation:bob 2.6s ease-in-out infinite}
.eyes{transform-box:fill-box;transform-origin:center;animation:blink 4.8s infinite}
.flow{stroke-dasharray:6 8;animation:flow 1.1s linear infinite}
.pulse{animation:pulse 2.4s ease-in-out infinite}
@media (prefers-reduced-motion:reduce){.bob,.eyes,.flow,.pulse{animation:none}}
"""

# 原画（apps/web/public/assets/characters/）に合わせた縦長で、四辺がくびれた枠。原寸は100x150。
BODY = ("M12 4C38 12 62 12 88 4C97 1 103 8 101 18C95 55 95 95 101 132"
        "C103 142 97 149 88 146C62 138 38 138 12 146C3 149-3 142-1 132"
        "C5 95 5 55-1 18C-3 8 3 1 12 4Z")
FIT = 124 / 150  # 配置計算は高さ124の枠で行う


def face(name):
    e = CHARS[name]["eye"]
    if name == "blue":
        return (f'<circle cx="37" cy="46" r="8.5" fill="{e}"/><circle cx="63" cy="46" r="8.5" fill="{e}"/>',
                f'<path d="M45 56l5 5 5-5" fill="none" stroke="{e}" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/>')
    if name == "green":
        return (f'<rect x="29" y="37" width="15" height="14" rx="2.5" fill="{e}"/><rect x="56" y="37" width="15" height="14" rx="2.5" fill="{e}"/>',
                f'<rect x="44" y="56" width="12" height="5" rx="2.5" fill="{e}"/>')
    if name == "purple":
        return (f'<rect x="25" y="45" width="19" height="7" rx="3.5" fill="{e}"/><rect x="56" y="45" width="19" height="7" rx="3.5" fill="{e}"/>',
                f'<path d="M50 53l-5.5 9h11z" fill="{e}"/>')
    return (f'<rect x="25" y="43" width="20" height="7" rx="3.5" fill="{e}" transform="rotate(28 35 46.5)"/>'
            f'<rect x="55" y="43" width="20" height="7" rx="3.5" fill="{e}" transform="rotate(-28 65 46.5)"/>',
            f'<path d="M50 52l-5 8h10z" fill="{e}"/>')


def char(name, x, y, s=1.0, t=None, delay=0.0, animate=True):
    """スマホ型キャラクター1体。配置上の大きさは約83x124（s=1）。(x, y) は幅100の枠の左上。"""
    t = t or THEMES["light"]
    eyes, mouth = face(name)
    bob = f' class="bob" style="animation-delay:{delay:.2f}s"' if animate else ""
    blink = f' class="eyes" style="animation-delay:{delay * 1.7:.2f}s"' if animate else ""
    return (f'<g transform="translate({x + 50 * s * (1 - FIT):.1f} {y:.1f}) scale({s * FIT:.4f})"><g{bob}>'
            f'<path d="{BODY}" fill="{CHARS[name]["body"]}" stroke="{t["outline"]}" stroke-width="1.4"/>'
            f'<rect x="14" y="16" width="72" height="117" rx="11" fill="{t["screen"]}"/>'
            f'<g filter="url(#glow)" transform="translate(0 6)"><g{blink}>{eyes}</g>{mouth}</g></g></g>')


def font_faces():
    """USED に集めた文字だけを含むフォントを @font-face として返し、USED を空にする。"""
    from fontTools import subset
    from fontTools.ttLib import TTFont
    css = []
    for (cls, weight), chars in sorted(USED.items()):
        family, path = EMBED[(cls, weight)]
        local = FONT_CACHE / Path(path).name
        if not local.exists():
            FONT_CACHE.mkdir(parents=True, exist_ok=True)
            urllib.request.urlretrieve(GOOGLE_FONTS + path, local)
        font = TTFont(local, recalcTimestamp=False)  # 生成のたびに中身が変わらないよう、更新日時を元のまま保つ
        opts = subset.Options()
        opts.flavor = "woff"
        opts.name_IDs = ["*"]  # 著作権とライセンスの表記を残す
        opts.hinting = False
        sub = subset.Subsetter(opts)
        sub.populate(text="".join(sorted(chars)))
        sub.subset(font)
        buf = io.BytesIO()
        font.flavor = "woff"
        font.save(buf)
        data = base64.b64encode(buf.getvalue()).decode()
        css.append(f"@font-face{{font-family:{family};font-weight:{weight};"
                   f"src:url(data:font/woff;base64,{data}) format('woff')}}")
    USED.clear()
    return "".join(css)


def svg(w, h, body, t, title, extra_css=""):
    faces = font_faces()
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w}" height="{h}" role="img">'
            f'<title>{title}</title><defs>'
            '<filter id="glow" x="-30%" y="-30%" width="160%" height="160%">'
            '<feGaussianBlur stdDeviation="1.6" result="b"/><feMerge><feMergeNode in="b"/>'
            '<feMergeNode in="SourceGraphic"/></feMerge></filter>'
            '<linearGradient id="brand" x1="0" y1="0" x2="1" y2="0">'
            '<stop offset="0" stop-color="#C03BFF"/><stop offset=".55" stop-color="#6F86FF"/>'
            '<stop offset="1" stop-color="#22C4FA"/></linearGradient>'
            f'<linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="{t["bg1"]}"/>'
            f'<stop offset="1" stop-color="{t["bg2"]}"/></linearGradient>'
            f'<style>{faces}{FONTS}{MOTION}{extra_css}</style></defs>{body}</svg>')


def text(x, y, s, size, fill, cls="jp", weight=700, anchor="start", length=None, extra=""):
    if cls in ("rnd", "hand"):
        key = (cls, 400 if cls == "hand" else (800 if weight >= 800 else 700))
        USED.setdefault(key, set()).update(s)
    fit = f' textLength="{length}" lengthAdjust="spacingAndGlyphs"' if length else ""
    return (f'<text x="{x}" y="{y}" class="{cls}" font-size="{size}" font-weight="{weight}" '
            f'fill="{fill}" text-anchor="{anchor}"{fit}{extra}>{s}</text>')


def dots(x0, y0, cols, rows, gap, r, fill, fade=True):
    out = []
    for j in range(rows):
        for i in range(cols):
            o = 1 - (i + j) / (cols + rows) if fade else 1
            if o > 0.08:
                out.append(f'<circle cx="{x0 + i * gap}" cy="{y0 + j * gap}" r="{r}" fill="{fill}" opacity="{o:.2f}"/>')
    return "".join(out)


def star(cx, cy, r, fill, opacity=1.0):
    import math
    pts = []
    for k in range(10):
        rad = r if k % 2 == 0 else r * 0.45
        a = -math.pi / 2 + k * math.pi / 5
        pts.append(f"{cx + rad * math.cos(a):.1f},{cy + rad * math.sin(a):.1f}")
    return f'<polygon points="{" ".join(pts)}" fill="{fill}" opacity="{opacity}"/>'


# ---------- ヒーロー ----------
def hero(t, narrow=False):
    """narrow=True はスマホ幅向け。右側の画面とキャラクターを文字の下へ回す。"""
    W, H = (640, 880) if narrow else (1280, 460)
    b = [f'<rect width="{W}" height="{H}" rx="28" fill="url(#bg)"/>',
         f'<clipPath id="card"><rect width="{W}" height="{H}" rx="28"/></clipPath><g clip-path="url(#card)">',
         dots(26, 26, 14, 9, 16, 3.2, t["dot"]),
         f'<g transform="translate({W} {H}) scale(-1 -1)">{dots(26, 26, 12, 7, 16, 3, t["dot2"])}</g>',
         f'<path d="M{W - 130} -20L{W + 20} 130V170L{W - 170} -20Z M{W - 70} -20L{W + 20} 70V96L{W - 96} -20Z" fill="{t["stripe"]}" opacity=".8"/>',
         star(W - 48, 470 if narrow else 214, 16, t["stripe"], .9), star(W - 580, 60, 12, t["dot"], .8),
         star(40 if narrow else 745, 520 if narrow else 420, 9, t["dot2"], .9),
         "</g>"]
    # 左：ロゴ文字とキャッチコピー
    b += [f'<rect x="64" y="50" width="436" height="38" rx="19" fill="{t["chip"]}" stroke="{t["line"]}"/>',
          star(88, 69, 9, "#FFB800"),
          text(106, 76, "JPHACKS 2026　審査委員特別賞・Innovator認定", 17, t["ink"], cls="rnd", weight=700, length=376),
          text(70, 124, "リコープレイ", 20, t["muted"], cls="rnd", weight=700),
          text(76, 236, "Re:Cooplay", 124, t["shadow"], cls="disp", weight=900, length=560),
          text(68, 228, "Re:Cooplay", 124, "url(#brand)", cls="disp", weight=900, length=560,
               extra=f' stroke="{t["panel"]}" stroke-width="7" paint-order="stroke" stroke-linejoin="round"'),
          text(68, 300, "ゲームはそのまま。", 42, t["ink"], cls="rnd", weight=800, length=378),
          f'<rect x="289" y="333" width="172" height="20" rx="4" fill="{t["stripe"]}" opacity=".9"/>',
          text(68, 352, "1キャラを、", 42, t["ink"], cls="rnd", weight=800, length=221),
          text(291, 352, "みんなで", 42, t["ink"], cls="rnd", weight=800, length=168),
          text(461, 352, "操作。", 42, t["ink"], cls="rnd", weight=800, length=126),
          text(70, 404, "既存のPCゲームに、スマホで協力プレイを後付けする", 21, t["muted"], cls="rnd", weight=700, length=504)]
    # 右：1台の画面と4体のキャラクター
    b.append('<g transform="translate(-685 410)">' if narrow else "<g>")
    mx, my, mw, mh = 830, 34, 340, 176
    b += [f'<rect x="{mx + mw / 2 - 20}" y="{my + mh}" width="40" height="26" fill="{t["line"]}"/>',
          f'<rect x="{mx + mw / 2 - 60}" y="{my + mh + 22}" width="120" height="10" rx="5" fill="{t["line"]}"/>',
          f'<rect x="{mx}" y="{my}" width="{mw}" height="{mh}" rx="16" fill="{t["outline"]}"/>',
          f'<clipPath id="scr"><rect x="{mx + 10}" y="{my + 10}" width="{mw - 20}" height="{mh - 20}" rx="8"/></clipPath>',
          f'<g clip-path="url(#scr)"><rect x="{mx}" y="{my}" width="{mw}" height="{mh}" fill="#8EE3FF"/>',
          f'<circle cx="{mx + 290}" cy="{my + 46}" r="18" fill="#FFF3A6"/>',
          f'<rect x="{mx + 40}" y="{my + 40}" width="70" height="16" rx="8" fill="#FFFFFF" opacity=".85"/>',
          f'<rect x="{mx + 70}" y="{my + 30}" width="54" height="16" rx="8" fill="#FFFFFF" opacity=".85"/>']
    for i in range(11):  # 草ブロックの地面
        gx = mx + 10 + i * 30
        b.append(f'<rect x="{gx}" y="{my + 130}" width="30" height="40" fill="#8B5A2B"/>'
                 f'<rect x="{gx}" y="{my + 124}" width="30" height="12" fill="#5DBB3F"/>'
                 f'<rect x="{gx}" y="{my + 124}" width="30" height="46" fill="none" stroke="#00000022"/>')
    b += [f'<rect x="{mx + 236}" y="{my + 94}" width="30" height="30" fill="#8B5A2B" stroke="#00000033"/>',
          f'<rect x="{mx + 236}" y="{my + 94}" width="30" height="9" fill="#5DBB3F"/>']
    hx, hy = mx + mw / 2 - 18, my + 68  # 1人のキャラクター
    b += [f'<g class="bob" style="animation-duration:1.3s">'
          f'<circle cx="{hx + 18}" cy="{hy + 28}" r="34" fill="none" stroke="#FFFFFF" stroke-width="3" stroke-dasharray="5 5" class="pulse"/>'
          f'<rect x="{hx + 6}" y="{hy}" width="24" height="22" fill="#F2C9A0"/><rect x="{hx + 6}" y="{hy}" width="24" height="8" fill="#4A2F1B"/>'
          f'<rect x="{hx + 11}" y="{hy + 11}" width="4" height="4" fill="#2B2B6B"/><rect x="{hx + 21}" y="{hy + 11}" width="4" height="4" fill="#2B2B6B"/>'
          f'<rect x="{hx + 4}" y="{hy + 22}" width="28" height="22" fill="#22B8C9"/>'
          f'<rect x="{hx + 6}" y="{hy + 44}" width="11" height="12" fill="#3B3BA8"/><rect x="{hx + 19}" y="{hy + 44}" width="11" height="12" fill="#3B3BA8"/></g>',
          f'<rect x="{mx + 18}" y="{my + 18}" width="78" height="26" rx="13" fill="#FFFFFF" opacity=".92"/>',
          text(mx + 57, my + 37, "1キャラ", 15, "#2E2B48", cls="rnd", weight=800, anchor="middle"),
          "</g>"]
    cx0, gap, cy, s = 846, 100, 318, 0.78
    tip = (mx + mw / 2, my + mh + 32)
    for i, name in enumerate(ORDER):
        x = cx0 + i * gap
        c = CHARS[name]["body"]
        sx = x + 50 * s
        b.append(f'<path d="M{sx:.0f} {cy - 30}C{sx:.0f} {cy - 62} {tip[0]:.0f} {tip[1] + 40:.0f} {tip[0]:.0f} {tip[1]:.0f}" '
                 f'fill="none" stroke="{c}" stroke-width="3.5" stroke-linecap="round" class="flow" '
                 f'style="animation-delay:{i * .2:.1f}s"/>')
    for i, name in enumerate(ORDER):
        x = cx0 + i * gap
        c = CHARS[name]["body"]
        sx = x + 50 * s
        b += [f'<rect x="{sx - 20:.0f}" y="{cy - 30}" width="40" height="22" rx="11" fill="{c}"/>',
              text(sx, cy - 13, f"P{i + 1}", 15, "#FFFFFF" if name != "green" else "#103B10",
                   cls="rnd", weight=800, anchor="middle"),
              char(name, x, cy, s, t, delay=i * .35)]
    b.append(text(cx0 + 1.5 * gap + 50 * s, 446, "スマホ2〜4台で、1人分の操作を分け合う", 17, t["muted"],
                  cls="rnd", weight=700, anchor="middle"))
    b.append("</g>")
    return svg(W, H, "".join(b), t, "Re:Cooplay — ゲームはそのまま。1キャラをみんなで操作。")


# ---------- 遊ぶまでの流れ ----------
def icon(kind, x, y, c, t):
    s = 56
    out = [f'<rect x="{x}" y="{y}" width="{s}" height="{s}" rx="14" fill="{c}"/>']
    w = "#FFFFFF" if kind != "list" else "#103B10"
    if kind == "qr":
        for (qx, qy) in [(8, 8), (32, 8), (8, 32)]:
            out.append(f'<rect x="{x + qx}" y="{y + qy}" width="16" height="16" rx="2" fill="none" stroke="{w}" stroke-width="3"/>'
                       f'<rect x="{x + qx + 5}" y="{y + qy + 5}" width="6" height="6" fill="{w}"/>')
        for (qx, qy) in [(34, 34), (42, 42), (34, 44), (44, 33)]:
            out.append(f'<rect x="{x + qx}" y="{y + qy}" width="6" height="6" fill="{w}"/>')
    elif kind == "list":
        for k in range(3):
            out.append(f'<rect x="{x + 11}" y="{y + 13 + k * 12}" width="7" height="7" rx="2" fill="{w}"/>'
                       f'<rect x="{x + 22}" y="{y + 14 + k * 12}" width="{24 - k * 5}" height="5" rx="2.5" fill="{w}"/>')
    elif kind == "split":
        cxy = (x + 28, y + 28)
        for k, n in enumerate(["blue", "green", "#FFFFFF"]):
            import math
            a0, a1 = -math.pi / 2 + k * 2 * math.pi / 3, -math.pi / 2 + (k + 1) * 2 * math.pi / 3
            p0 = (cxy[0] + 18 * math.cos(a0), cxy[1] + 18 * math.sin(a0))
            p1 = (cxy[0] + 18 * math.cos(a1), cxy[1] + 18 * math.sin(a1))
            fill = CHARS[n]["body"] if n in CHARS else n
            out.append(f'<path d="M{cxy[0]} {cxy[1]}L{p0[0]:.1f} {p0[1]:.1f}A18 18 0 0 1 {p1[0]:.1f} {p1[1]:.1f}Z" '
                       f'fill="{fill}" stroke="{c}" stroke-width="2"/>')
    else:
        out.append(f'<path d="M{x + 21} {y + 15}L{x + 43} {y + 28}L{x + 21} {y + 41}Z" fill="{w}" stroke="{w}" stroke-width="3" stroke-linejoin="round"/>')
    return "".join(out)


STEPS = [("qr", "スマホでQR参加", "ブラウザで読み取るだけ。", "P1のスマホはPCリモコンに"),
         ("list", "ゲームを選ぶ", "インストール済みから選択。", "操作とキーを自動で読み取り"),
         ("split", "AIが操作を分担", "独自AIが2〜4人へ配分。", "担当を確かめて起動"),
         ("play", "開始ボタンでプレイ", "ホストが「分担操作開始」。", "各スマホが担当の操作画面に")]


def flow(t, narrow=False):
    if narrow:
        return flow_phone(t)
    W, H = 1280, 290
    steps = STEPS
    cw, x0 = 272, 20
    gap = 51.3
    b = []
    for i, (kind, title, d1, d2) in enumerate(steps):
        name = ORDER[i]
        c = CHARS[name]["body"]
        x = x0 + i * (cw + gap)
        b.append("<g>")
        b += [f'<rect x="{x}" y="10" width="{cw}" height="270" rx="22" fill="{t["panel"]}" stroke="{t["line"]}"/>',
              f'<circle cx="{x + 36}" cy="44" r="18" fill="{c}"/>',
              text(x + 36, 51, str(i + 1), 20, "#FFFFFF" if name != "green" else "#103B10", cls="disp", weight=400, anchor="middle"),
              text(x + 64, 51, f"STEP {i + 1}", 16, t["muted"], cls="mono", weight=700),
              char(name, x + cw / 2 - 74, 76, .74, t, delay=i * .4),
              icon(kind, x + cw / 2 + 14, 104, c, t),
              text(x + cw / 2, 210, title, 25, t["ink"], weight=900, anchor="middle"),
              text(x + cw / 2, 241, d1, 16.5, t["muted"], weight=700, anchor="middle"),
              text(x + cw / 2, 265, d2, 16.5, t["muted"], weight=700, anchor="middle")]
        b.append("</g>")
        if i < 3:
            ax = x + cw + gap / 2
            b.append(f'<path d="M{ax - 9} 128l12 12-12 12" fill="none" stroke="url(#brand)" stroke-width="5" '
                     'stroke-linecap="round" stroke-linejoin="round"/>')
    return svg(W, H, "".join(b), t, "遊ぶまでの4ステップ：スマホでQR参加、ゲームを選ぶ、AIが操作を分担、開始ボタンでプレイ")


# スマホ版の図は、幅390pxのスマホでGitHubの本文欄と同じ幅（324px）で描き、READMEでは原寸で表示する。
# 本文（16px）との文字の比がPC版と同じになる。これより狭いスマホでは少し縮む。
PHONE_W = 324


def flow_phone(t):
    """遊ぶまでの4ステップ（スマホ版）。2×2の小さなカードにし、説明文は直前の本文に任せる。"""
    W, gap, ch = PHONE_W, 10, 146
    cw = (W - gap) / 2
    b = []
    for i, (kind, title, _, _) in enumerate(STEPS):
        name = ORDER[i]
        c = CHARS[name]["body"]
        x, y = (i % 2) * (cw + gap), (i // 2) * (ch + gap)
        b += [f'<rect x="{x + 1}" y="{y + 1}" width="{cw - 2}" height="{ch - 2}" rx="16" fill="{t["panel"]}" stroke="{t["line"]}"/>',
              f'<circle cx="{x + 24}" cy="{y + 24}" r="13" fill="{c}"/>',
              text(x + 24, y + 30, str(i + 1), 16, "#FFFFFF" if name != "green" else "#103B10", cls="disp", weight=400, anchor="middle"),
              text(x + 44, y + 29, f"STEP {i + 1}", 12, t["muted"], cls="mono", weight=700),
              char(name, x + cw / 2 - 54, y + 42, .5, t, delay=i * .4),
              f'<g transform="translate({x + cw / 2 + 8} {y + 58}) scale(.7)">{icon(kind, 0, 0, c, t)}</g>',
              text(x + cw / 2, y + ch - 18, title, 15, t["ink"], weight=900, anchor="middle")]
    H = 2 * ch + gap
    return svg(W, H, "".join(b), t, "遊ぶまでの4ステップ：スマホでQR参加、ゲームを選ぶ、AIが操作を分担、開始ボタンでプレイ")


# ---------- 分担AIの流れ ----------
def pipeline(t, narrow=False):
    if narrow:
        return pipeline_phone(t)
    PH = 450  # 1枚の高さ
    W, H = 1280, PH + 20
    pw, x0 = 372, 20
    xs = [x0, x0 + pw + 52, x0 + 2 * (pw + 52)]

    def at(i):
        return "<g>"

    blue, green, purple = (CHARS[n]["body"] for n in ("blue", "green", "purple"))
    b = []
    heads = [("①", "ゲームのファイルから自動検出", "設定・データを19系統で解析"),
             ("②", "分担AIが意味と関係を推論", "MiniLM＋独自の2層Transformer"),
             ("③", "スマホ画面へ自動で配分", "3人プレイの例")]
    for i, (n, h1, h2) in enumerate(heads):
        x = xs[i]
        b += [at(i), f'<rect x="{x}" y="10" width="{pw}" height="{PH}" rx="22" fill="{t["panel"]}" stroke="{t["line"]}"/>',
              text(x + 24, 52, n, 26, "url(#brand)", weight=900),
              text(x + 58, 50, h1, 20, t["ink"], weight=900),
              text(x + 58, 76, h2, 16, t["muted"], weight=700), "</g>"]
        if i < 2:
            ax = x + pw + 26
            b.append(f'<path d="M{ax - 14} {PH / 2 + 10}H{ax + 8}M{ax} {PH / 2 + 1}l9 9-9 9" fill="none" stroke="url(#brand)" '
                     'stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>')
    # ① キー割り当て
    rows = [("MoveForward", "W", blue), ("MoveBack", "S", blue), ("MoveLeft", "A", blue), ("MoveRight", "D", blue),
            ("Jump", "Space", blue), ("Look", "Mouse", green), ("Fire", "MouseL", purple), ("Aim", "MouseR", purple),
            ("Reload", "R", purple), ("WeaponNext", "Wheel", purple)]
    x = xs[0]
    b.append(at(0))
    b.append(f'<rect x="{x + 22}" y="96" width="{pw - 44}" height="{len(rows) * 32 + 16}" rx="12" fill="{t["code"]}"/>')
    for k, (act, key, c) in enumerate(rows):
        y = 124 + k * 32
        b += [f'<circle cx="{x + 42}" cy="{y - 5}" r="5" fill="{c}"/>',
              text(x + 56, y, act, 16, t["ink"], cls="mono", weight=600),
              f'<rect x="{x + pw - 128}" y="{y - 19}" width="86" height="24" rx="6" fill="{t["panel"]}" stroke="{t["line"]}"/>',
              text(x + pw - 85, y - 2, key, 14, t["ink"], cls="mono", weight=700, anchor="middle")]
    b.append("</g>")
    # ② モデル
    b.append(at(1))
    x = xs[1]
    cx = x + pw / 2
    toks = ["IA_Jump", "+attack", "前進", "Look"]
    for k, tk in enumerate(toks):
        tx = x + 40 + k * 76
        b += [f'<rect x="{tx}" y="100" width="68" height="28" rx="14" fill="{t["code"]}" stroke="{t["line"]}"/>',
              text(tx + 34, 119, tk, 14, t["ink"], cls="mono", weight=700, anchor="middle")]
    layers = [(150, "多言語エンコーダ（MiniLM・約40MB）", "操作名 → 384次元の意味ベクトル"),
              (236, "分担判断（2層Transformer・約410KB）", "教師あり＋伏せたキーを当てる学習")]
    for (y, l1, l2) in layers:
        b += [f'<rect x="{x + 30}" y="{y}" width="{pw - 60}" height="66" rx="14" fill="url(#brand)" opacity=".14"/>',
              f'<rect x="{x + 30}" y="{y}" width="{pw - 60}" height="66" rx="14" fill="none" stroke="url(#brand)" stroke-width="2"/>',
              text(cx, y + 28, l1, 17, t["ink"], weight=900, anchor="middle"),
              text(cx, y + 52, l2, 15, t["muted"], weight=700, anchor="middle")]
    for k in range(5):  # 層をつなぐ線
        lx = x + 70 + k * 58
        b.append(f'<path d="M{lx} 216V236" stroke="url(#brand)" stroke-width="2.5" class="flow" style="animation-delay:{k * .15:.2f}s"/>')
    outs = [("カテゴリ", "6種"), ("同じ人か", "確率"), ("方向軸", "縦・横")]
    for k, (o1, o2) in enumerate(outs):
        ox = x + 30 + k * 108
        b += [f'<rect x="{ox}" y="324" width="96" height="58" rx="12" fill="{t["code"]}" stroke="{t["line"]}"/>',
              text(ox + 48, 349, o1, 16, t["ink"], weight=800, anchor="middle"),
              text(ox + 48, 372, o2, 15, t["muted"], weight=700, anchor="middle")]
    b += [f'<rect x="{cx - 120}" y="400" width="240" height="34" rx="17" fill="{t["stripe"]}" opacity=".9"/>',
          text(cx, 423, "Rustでオフライン推論・約80ms", 16, "#2E2B48", weight=900, anchor="middle")]
    b.append(text(cx, PH, "※14操作のゲームで2〜4人分の分担を作る時間", 13, t["muted"], weight=600, anchor="middle"))
    b.append("</g>")
    # ③ 3人の画面
    b.append(at(2))
    x = xs[2]
    players = [("blue", "P1", "移動", "8方向スティック（WASD）", "＋ Space"),
               ("green", "P2", "視点", "ドラッグパッド（Mouse）", "感度調整つき"),
               ("purple", "P3", "アクション", "左右クリック・R キー", "＋ ホイール上下")]
    for k, (name, p, role, l1, l2) in enumerate(players):
        y = 100 + k * 116
        c = CHARS[name]["body"]
        b += [f'<rect x="{x + 22}" y="{y}" width="{pw - 44}" height="102" rx="16" fill="{t["panel2"]}" stroke="{c}" stroke-width="2"/>',
              char(name, x + 36, y + 13, .62, t, delay=k * .4),
              f'<rect x="{x + 112}" y="{y + 16}" width="38" height="22" rx="11" fill="{c}"/>',
              text(x + 131, y + 32, p, 14, "#FFFFFF" if name != "green" else "#103B10", weight=900, anchor="middle"),
              text(x + 160, y + 33, role, 19, t["ink"], weight=900),
              text(x + 112, y + 65, l1, 16, t["ink"], weight=700),
              text(x + 112, y + 88, l2, 15, t["muted"], weight=700)]
    b.append("</g>")
    return svg(W, H, "".join(b), t, "分担AIの流れ：ゲームのファイルから操作を検出し、MiniLMと2層Transformerで推論して、3人のスマホ画面へ配分する")


def chip(x, y, s, t, color=None, mono=True, size=12.5):
    """小さな札。幅は文字数から見積もる。戻り値は (svg, 幅)。"""
    w = sum(size * (0.62 if c.isascii() else 1.0) for c in s) + 16
    green = CHARS["green"]["body"]
    ink = t["ink"] if not color else ("#103B10" if color == green else "#FFFFFF")
    return (f'<rect x="{x}" y="{y}" width="{w:.1f}" height="22" rx="11" fill="{color or t["code"]}" stroke="{color or t["line"]}"/>'
            + text(x + w / 2, y + 15.5, s, size, ink, cls="mono" if mono else "jp", weight=700, anchor="middle"), w)


def pipeline_phone(t):
    """分担AIの流れ（スマホ版）。3段の要点だけを縦に並べ、詳しい説明は下の本文に任せる。"""
    W = PHONE_W
    blue, green, purple = (CHARS[n]["body"] for n in ("blue", "green", "purple"))
    rows = [("①", "ゲームのファイルから自動検出", "19系統の設定・データを解析"),
            ("②", "分担AIが意味と関係を推論", "MiniLM＋独自の2層Transformer"),
            ("③", "スマホ画面へ自動で配分", "Rustでオフライン推論・約80ms")]
    b, y = [], 0
    for i, (n, h1, h2) in enumerate(rows):
        rh = 118
        b += [f'<rect x="1" y="{y + 1}" width="{W - 2}" height="{rh - 2}" rx="16" fill="{t["panel"]}" stroke="{t["line"]}"/>',
              text(14, y + 30, n, 20, "url(#brand)", weight=900),
              text(40, y + 29, h1, 16, t["ink"], weight=900),
              text(40, y + 50, h2, 12.5, t["muted"], weight=700)]
        cx, cy = 14, y + 66
        if i == 0:
            for label, c in (("W", blue), ("A", blue), ("S", blue), ("D", blue), ("Space", blue), ("Mouse", green),
                             ("MouseL", purple), ("R", purple), ("Wheel", purple)):
                svg_, w = chip(cx, cy, label, t, c)
                if cx + w > W - 12:
                    cx, cy = 14, cy + 26
                    svg_, w = chip(cx, cy, label, t, c)
                b.append(svg_)
                cx += w + 6
        elif i == 1:
            for label in ("操作名", "→ 意味ベクトル", "→ 分担"):
                svg_, w = chip(cx, cy, label, t, None, mono=False)
                b.append(svg_)
                cx += w + 6
        else:
            for k, (name, p, role) in enumerate((("blue", "P1", "移動"), ("green", "P2", "視点"), ("purple", "P3", "アクション"))):
                px = 14 + k * (W - 20) / 3
                b += [char(name, px - 6, cy - 6, .3, t, delay=k * .4),
                      text(px + 26, cy + 12, p, 12, CHARS[name]["body"] if name != "green" else "#2FB52E", weight=900),
                      text(px + 26, cy + 30, role, 13, t["ink"], weight=800)]
        y += rh
        if i < 2:
            b.append(f'<path d="M{W / 2 - 8} {y + 4}l8 8 8-8" fill="none" stroke="url(#brand)" stroke-width="4" '
                     'stroke-linecap="round" stroke-linejoin="round"/>')
            y += 18
    return svg(W, y, "".join(b), t, "分担AIの流れ：ゲームのファイルから操作を検出し、MiniLMと2層Transformerで推論して、3人のスマホ画面へ配分する")


# ---------- 区切りとフッター ----------
def footer(t):
    W, H = 1280, 250
    b = [f'<rect width="{W}" height="{H}" rx="28" fill="url(#bg)"/>',
         '<clipPath id="card"><rect width="1280" height="250" rx="28"/></clipPath><g clip-path="url(#card)">',
         dots(24, 24, 10, 6, 16, 3, t["dot"]),
         f'<g transform="translate(1280 250) scale(-1 -1)">{dots(24, 24, 10, 6, 16, 3, t["dot2"])}</g></g>',
         text(640, 94, "さあ、みんなで遊ぼう！", 46, t["ink"], cls="hand", weight=400, anchor="middle"),
         text(640, 130, "PCのゲームはそのままに、友達と集まったその場で協力プレイ", 18, t["muted"], cls="rnd", weight=700, anchor="middle")]
    for i, n in enumerate(ORDER):
        b.append(char(n, 440 + i * 110, 150, .62, t, delay=i * .3))
        b.append(f'<ellipse cx="{440 + i * 110 + 31}" cy="234" rx="26" ry="5" fill="{t["shadow"]}" opacity=".12"/>')
    return svg(W, H, "".join(b), t, "さあ、みんなで遊ぼう！")


def avatar(name):
    t = THEMES["light"]
    return svg(100, 124, char(name, 0, 0, 1, t), t, f"Re:Cooplayのキャラクター（{name}）")


# ---------- 見出し ----------
# 帯のあとに続く項目の見出し。番号・英字ラベル・キャラクターで、帯が項目の区切りであることを示す。
HEADS = [
    ("01", "背景(製品開発のきっかけ、課題等）", "BACKGROUND"),
    ("02", "製品説明（具体的な製品の説明）", "PRODUCT"),
    ("03", "特長", "FEATURES"),
    ("04", "解決出来ること", "SOLUTION"),
    ("05", "試遊での反応", "PLAYTEST"),
    ("06", "今後の展望", "FUTURE"),
    ("07", "注力したこと（こだわり等）", "FOCUS"),
    ("08", "技術仕様書", "SPECS"),
    ("09", "システム構成", "ARCHITECTURE"),
    ("10", "活用した技術", "TECH STACK"),
    ("11", "独自技術", "ORIGINAL TECH"),
]


def fit(s, size, avail):
    """全角1字=size、半角=0.6size として幅を見積もり、はみ出すなら textLength で縮める。"""
    w = sum(size * (0.6 if c.isascii() else 1.0) for c in s)
    return avail if w > avail else None


def wrap(s, size, avail):
    """見出しを avail に収まるよう折り返す。2行に収まるなら、読点のあと・括弧の前を優先し、
    なければ行の長さが釣り合う位置で切る。行頭に句読点・閉じ括弧・小書きの仮名が来ないようにする。"""
    def width(x):
        return sum(size * (0.6 if c.isascii() else 1.0) for c in x)
    if width(s) <= avail:
        return [s]
    ok = [i for i in range(1, len(s)) if width(s[:i]) <= avail and width(s[i:]) <= avail
          and s[i] not in "、。）)ーぁぃぅぇぉっゃゅょ" and s[i - 1] not in "（("]
    good = [i for i in ok if s[i - 1] in "、）)" or s[i] in "（("]
    if good:
        i = good[-1]
    elif ok:
        i = max(ok, key=lambda k: min(width(s[:k]), width(s[k:])))
    else:  # 2行に収まらないときは、入るだけ詰めて次の行へ送る
        i = max(k for k in range(1, len(s)) if width(s[:k]) <= avail)
        return [s[:i]] + wrap(s[i:], size, avail)
    return [s[:i], s[i:]]


def head_banner(num, jp, en, name, t, narrow=False):
    """案D：見出しそのものを画像にする。番号だけ表示用の書体にし、英字ラベルと見出しはGitHub本体と同じ
    フォント指定（閲覧者の端末の標準フォント）で描く。
    スマホ版はPC版と同じ文字の大きさのまま幅360で描き、番号とラベルの下に見出しを置いて折り返す。"""
    if narrow:
        lines = wrap(jp, 27, PHONE_W - 4)
        W, H = PHONE_W, 50 + 36 * len(lines)
        b = [text(0, 42, num, 42, "url(#brand)", cls="disp", weight=400, length=44),
             text(58, 34, en, 12, t["muted"], cls="gh", weight=600, extra=' letter-spacing="3"')]
        # 行頭の全角括弧は字下げに見えるので、半文字ぶん左へ寄せる
        b += [text(-13.5 if line[0] in "（「" else 0, 80 + 36 * k, line, 27, t["ink"], cls="gh", weight=600)
              for k, line in enumerate(lines)]
    else:
        W, H = 840, 68
        b = [text(0, 52, num, 42, "url(#brand)", cls="disp", weight=400, length=44),
             text(60, 26, en, 12, t["muted"], cls="gh", weight=600, extra=' letter-spacing="3"'),
             text(58, 55, jp, 27, t["ink"], cls="gh", weight=600, length=fit(jp, 27, W - 58 - 8))]
    return svg(W, H, "".join(b), t, jp)


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    files = {}
    for mode, t in THEMES.items():
        for kind, draw in (("hero", hero), ("flow", flow), ("pipeline", pipeline)):
            files[f"{kind}-{mode}.svg"] = draw(t)
            files[f"{kind}-narrow-{mode}.svg"] = draw(t, narrow=True)
        files[f"footer-{mode}.svg"] = footer(t)
    for n in ORDER:
        files[f"char-{n}.svg"] = avatar(n)
    for i, (num, jp, en) in enumerate(HEADS):
        name = ORDER[i % 4]
        for mode, t in THEMES.items():
            files[f"heads/head-{num}-{mode}.svg"] = head_banner(num, jp, en, name, t)
            files[f"heads/head-{num}-narrow-{mode}.svg"] = head_banner(num, jp, en, name, t, narrow=True)
    (OUT / "heads").mkdir(exist_ok=True)
    for name, body in files.items():
        (OUT / name).write_text(body + "\n", encoding="utf-8", newline="\n")
    print(f"wrote {len(files)} files to {OUT}")


if __name__ == "__main__":
    main()
