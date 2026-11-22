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
import re
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


# スマホ版の文字の最小。幅360pxのスマホ（本文欄294px）では図が0.91倍に縮むので、13pxだと11.8pxになる。
# 録画の図（幅329px を本文欄の99.8%に並べる）はさらに0.89倍に縮むので、14.1pxにして12.5px以上を保つ（check_text_size.py）。
PHONE_MIN_FONT = 14.1


def phone_min_font(body):
    """スマホ版の図の、PHONE_MIN_FONT より小さい文字を引き上げる。字幅を固定した文字（textLength）と、
    見出しの舞台（入れ子の <svg>。吹き出しは飾りで、大きさは head_play.py が確かめる）は除く。"""
    def bump(m):
        tag = m.group(0)
        if "textLength" in tag:
            return tag
        return re.sub(r'font-size="([\d.]+)"',
                      lambda f: f'font-size="{max(float(f.group(1)), PHONE_MIN_FONT):g}"', tag)
    parts = re.split(r"(<svg x=.*?</svg>)", body, flags=re.S)
    return "".join(p if p.startswith("<svg x=") else re.sub(r"<text [^>]*>", bump, p) for p in parts)


def svg(w, h, body, t, title, extra_css="", phone=None):
    import vector  # 循環 import を避けるためここで読む
    if phone if phone is not None else (w <= PHONE_W + 10 or w == MID_W):
        body = phone_min_font(body)
    faces = font_faces()
    return vector.vectorize(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w}" height="{h}" role="img">'
            f'<title>{title}</title><defs>'
            '<filter id="glow" x="-30%" y="-30%" width="160%" height="160%">'
            '<feGaussianBlur stdDeviation="1.6"/></filter>'  # にじみだけ。元の図形は vector.split_glow が上に重ねる
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
    else:  # 開始の旗（再生ボタンの形は、動画への誘導と紛らわしいので使わない）
        out.append(f'<path d="M{x + 18} {y + 44}V{y + 12}" stroke="{w}" stroke-width="4" stroke-linecap="round"/>'
                   f'<path d="M{x + 20} {y + 13}c6-4 11 3 17 0s9-2 9-2v17s-3-1-9 2-11-4-17 0z" fill="{w}"/>')
    return "".join(out)


# 図はGitHubの本文欄と同じ幅で描き、READMEでは幅を指定せず原寸で表示する（PCは838px、幅390pxのスマホは324px）。
# 図の文字の大きさが、そのまま画面上の大きさになる。本文は16px、図の文字は13px以上にする。
PC_W = 838
PHONE_W = 324
# 中間の版（タブレット・狭いPC。本文欄555〜808px）。幅620で描き、本文欄の幅いっぱい（0.895〜1.30倍）に表示する
# （scripts/readme/markup.py の MID）。縮んでも12.5px以上になるよう、文字はスマホ版と同じく14.1px以上にする。
MID_W = 620

STEPS = [("qr", "スマホでQR参加", "ブラウザで読み取るだけ。", "P1のスマホはPCリモコンに"),
         ("list", "ゲームを選ぶ", "インストール済みから選択。", "操作とキーを自動で読み取り"),
         ("split", "AIが操作を分担", "独自AIが2〜4人へ配分。", "担当を確かめて起動"),
         ("play", "開始ボタンでプレイ", "ホストが「分担操作開始」。", "各スマホが担当の操作画面に")]


def flow(t, narrow=False):
    """遊ぶまでの4ステップ（PC版）。"""
    if narrow:
        return flow_phone(t)
    W, H, gap = PC_W, 196, 26
    cw = (W - 3 * gap) / 4
    b = []
    for i, (kind, title, d1, d2) in enumerate(STEPS):
        name = ORDER[i]
        c = CHARS[name]["body"]
        x = i * (cw + gap)
        b += [f'<rect x="{x + 1}" y="1" width="{cw - 2}" height="{H - 2}" rx="16" fill="{t["panel"]}" stroke="{t["line"]}"/>',
              f'<circle cx="{x + 24}" cy="24" r="13" fill="{c}"/>',
              text(x + 24, 30, str(i + 1), 16, "#FFFFFF" if name != "green" else "#103B10", cls="disp", weight=400, anchor="middle"),
              text(x + 44, 29, f"STEP {i + 1}", 13, t["muted"], cls="mono", weight=700),
              char(name, x + cw / 2 - 54, 40, .46, t, delay=i * .4),
              f'<g transform="translate({x + cw / 2 + 8} {54}) scale(.66)">{icon(kind, 0, 0, c, t)}</g>',
              text(x + cw / 2, 128, title, 16, t["ink"], weight=900, anchor="middle"),
              text(x + cw / 2, 154, d1, 13, t["muted"], weight=700, anchor="middle"),
              text(x + cw / 2, 174, d2, 13, t["muted"], weight=700, anchor="middle")]
        if i < 3:
            ax = x + cw + gap / 2
            b.append(f'<path d="M{ax - 5} 82l7 7-7 7" fill="none" stroke="url(#brand)" stroke-width="4" '
                     'stroke-linecap="round" stroke-linejoin="round"/>')
    return svg(W, H + 24, "".join(b), t, "遊ぶまでの4ステップ：スマホでQR参加、ゲームを選ぶ、AIが操作を分担、開始ボタンでプレイ")


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
              text(x + 44, y + 29, f"STEP {i + 1}", 13, t["muted"], cls="mono", weight=700),
              char(name, x + cw / 2 - 54, y + 42, .5, t, delay=i * .4),
              f'<g transform="translate({x + cw / 2 + 8} {y + 58}) scale(.7)">{icon(kind, 0, 0, c, t)}</g>',
              text(x + cw / 2, y + ch - 18, title, 15, t["ink"], weight=900, anchor="middle")]
    H = 2 * ch + gap
    return svg(W, H + 24, "".join(b), t, "遊ぶまでの4ステップ：スマホでQR参加、ゲームを選ぶ、AIが操作を分担、開始ボタンでプレイ")


# ---------- 分担AIの流れ ----------
# 利用者の判断で、この図は形を変えずに使い続ける（2026-11-20）。
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
    # 枠いっぱいの見出しは、Windows（Yu Gothic UI）で測った幅に textLength で固定する。Android の Noto Sans JP や
    # macOS・iPhone のヒラギノは仮名が広く、そのままでは枠から最大15pxはみ出すため（check_text_fit.mjs、2026-11-22）。
    # Windows では見た目が変わらず、字幅の広い端末では字を少し詰めて枠に収める。
    layers = [(150, "多言語エンコーダ（MiniLM・約40MB）", "操作名 → 384次元の意味ベクトル", 278),
              (236, "分担判断（2層Transformer・約410KB）", "教師あり＋伏せたキーを当てる学習", 294)]
    for (y, l1, l2, l1w) in layers:
        b += [f'<rect x="{x + 30}" y="{y}" width="{pw - 60}" height="66" rx="14" fill="url(#brand)" opacity=".14"/>',
              f'<rect x="{x + 30}" y="{y}" width="{pw - 60}" height="66" rx="14" fill="none" stroke="url(#brand)" stroke-width="2"/>',
              text(cx, y + 28, l1, 17, t["ink"], weight=900, anchor="middle", length=l1w),
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
          text(cx, 423, "Rustでオフライン推論・約80ms", 16, "#2E2B48", weight=900, anchor="middle", length=199)]
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
    # 利用者の判断で形を変えない図なので、スマホ版の文字の引き上げ（phone_min_font）もしない
    return svg(W, y, "".join(b), t, "分担AIの流れ：ゲームのファイルから操作を検出し、MiniLMと2層Transformerで推論して、3人のスマホ画面へ配分する",
               phone=False)


# ---------- 区切りとフッター ----------
def footer(t, narrow=False):
    W, H = (PHONE_W, 272) if narrow else (PC_W, 230)
    cx = W / 2
    b = [f'<rect width="{W}" height="{H}" rx="22" fill="url(#bg)"/>',
         f'<clipPath id="card"><rect width="{W}" height="{H}" rx="22"/></clipPath><g clip-path="url(#card)">',
         dots(18, 18, 7, 5, 13, 2.6, t["dot"]),
         f'<g transform="translate({W} {H}) scale(-1 -1)">{dots(18, 18, 7, 5, 13, 2.6, t["dot2"])}</g></g>']
    if narrow:
        b += [text(cx, 52, "さあ、みんなで遊ぼう！", 28, t["ink"], cls="hand", weight=400, anchor="middle"),
              text(cx, 80, "PCのゲームはそのままに、", 14, t["muted"], cls="rnd", weight=700, anchor="middle"),
              text(cx, 100, "友達と集まったその場で協力プレイ", 14, t["muted"], cls="rnd", weight=700, anchor="middle")]
        top, gap, s = 116, 62, .5
    else:
        b += [text(cx, 58, "さあ、みんなで遊ぼう！", 36, t["ink"], cls="hand", weight=400, anchor="middle"),
              text(cx, 88, "PCのゲームはそのままに、友達と集まったその場で協力プレイ", 15, t["muted"], cls="rnd", weight=700, anchor="middle")]
        top, gap, s = 102, 84, .5
    x0 = cx - 1.5 * gap - 50 * s
    for i, n in enumerate(ORDER):
        b.append(char(n, x0 + i * gap, top, s, t, delay=i * .3))
        b.append(f'<ellipse cx="{x0 + i * gap + 50 * s:.1f}" cy="{top + 63}" rx="18" ry="3.5" fill="{t["shadow"]}" opacity=".12"/>')
    # まだ一般公開（リリース）していないことを、締めの気分を壊さない札で伝える
    label, note = "COMING SOON", "一般公開に向けて準備中です"
    lw = len(label) * 10.6  # 13px・太字・字間2の英大文字の幅の見積もり
    ph = 34
    if narrow:  # 幅が狭いので、札は「COMING SOON」だけにして、説明はその下に置く
        pw = 34 + lw + 16
        px, py = cx - pw / 2, top + 76
        b.append(text(cx, py + ph + 24, note, 14, t["ink"], cls="rnd", weight=700, anchor="middle"))
    else:
        pw = 34 + lw + 18 + len(note) * 14 + 22
        px, py = cx - pw / 2, top + 78
        b += [f'<rect x="{px + 34 + lw + 8:.1f}" y="{py + 9}" width="1.5" height="{ph - 18}" fill="{t["line"]}"/>',
              text(px + 34 + lw + 18, py + 22.5, note, 14, t["ink"], cls="rnd", weight=700)]
    b = b[:-2 if not narrow else -1] + [
        f'<rect x="{px:.1f}" y="{py}" width="{pw:.1f}" height="{ph}" rx="{ph / 2}" fill="{t["chip"]}" stroke="url(#brand)" stroke-width="1.6"/>',
        f'<circle class="pulse" cx="{px + 20:.1f}" cy="{py + ph / 2}" r="4.5" fill="#22C4FA"/>',
        text(px + 34, py + 22, label, 13, "url(#brand)", cls="gh", weight=800, extra=' letter-spacing="2"')] + b[-2 if not narrow else -1:]
    return svg(W, H, "".join(b), t, "さあ、みんなで遊ぼう！（COMING SOON：一般公開に向けて準備中です）")


# ---------- 分けて操作するイメージ ----------
def split_demo(t, narrow=False):
    """3台のスマホ（P1移動・P2視点・P3アクション）が、1台の画面の1人のキャラクターを順番に動かす。
    P1でキャラクターが歩き、P2で視点（景色）が回り、P3でジャンプしてブロックを壊す。7秒で1周。"""
    D = 7
    if narrow:
        W, H = PHONE_W, 398
        mx, my, mw, mh = 12, 4, 300, 176
        ps, ptop = .58, 252
        pcx = [W / 2 - 108, W / 2, W / 2 + 108]
        hub = (W / 2, my + mh + 30)
    else:
        W, H = PC_W, 300
        mx, my, mw, mh = 372, 8, 452, 240
        ps, ptop = .74, 66
        pcx = [62, 182, 302]
        hub = (mx - 4, my + mh / 2)
    ix, iy, iw, ih = mx + 10, my + 10, mw - 20, mh - 20
    LH = 150
    k = ih / LH
    LW = iw / k
    x0, walk = .16 * LW, .22 * LW
    bx = .74 * LW
    pan = bx - (x0 + walk + 34)
    css = []

    def anim(cls, frames, ease="linear", origin=None):
        style = f"transform-box:fill-box;transform-origin:{origin};" if origin else ""
        css.append(kf(f"k-{cls}", frames) + f".{cls}{{{style}animation:k-{cls} {D}s {ease} infinite}}")

    def kf(name, frames, prop="transform"):
        return f"@keyframes {name}{{" + "".join(f"{p:g}%{{{prop}:{v}}}" for p, v in frames) + "}"

    def opac(cls, frames):
        css.append(kf(f"k-{cls}", frames, "opacity") + f".{cls}{{animation:k-{cls} {D}s linear infinite}}")

    # --- 画面の中（高さ150の座標で描き、画面に合わせて拡大する）
    sc = []
    sc.append(f'<rect x="0" y="0" width="{LW:.1f}" height="{LH}" fill="#8EE3FF"/>')
    clouds = "".join(f'<rect x="{cx_:.1f}" y="{cy_}" width="{w_}" height="10" rx="5" fill="#FFFFFF" opacity=".9"/>'
                     for cx_, cy_, w_ in ((.12 * LW, 22, 40), (.18 * LW, 15, 26), (.55 * LW, 30, 46), (.95 * LW, 18, 34),
                                          (1.3 * LW, 26, 40)))
    hills = "".join(f'<ellipse cx="{hx:.1f}" cy="118" rx="{hr}" ry="{hr * .5}" fill="#7FD08A"/>'
                    for hx, hr in ((.3 * LW, 46), (.85 * LW, 60), (1.35 * LW, 50)))
    sc.append(f'<g class="far">{clouds}{hills}</g>')
    tiles = "".join(f'<rect x="{-40 + i * 22}" y="124" width="22" height="26" fill="#8B5A2B"/>'
                    f'<rect x="{-40 + i * 22}" y="118" width="22" height="8" fill="#5DBB3F"/>'
                    f'<rect x="{-40 + i * 22}" y="118" width="22" height="32" fill="none" stroke="#00000022"/>'
                    for i in range(int((LW + pan + 80) / 22) + 2))
    block = (f'<g class="blk"><g class="shake"><rect x="{bx:.1f}" y="92" width="26" height="26" fill="#8B5A2B" stroke="#00000033"/>'
             f'<rect x="{bx:.1f}" y="92" width="26" height="8" fill="#5DBB3F"/></g></g>')
    bits = "".join(f'<rect class="bit{j}" x="{bx + 9:.1f}" y="100" width="7" height="7" fill="{c_}"/>'
                   for j, c_ in enumerate(("#8B5A2B", "#5DBB3F", "#8B5A2B", "#6E4522")))
    sc.append(f'<g class="near">{tiles}{block}{bits}</g>')
    gx = x0 - 10
    guy = (f'<rect x="{gx + 2}" y="82" width="16" height="14" fill="#F2C9A0"/><rect x="{gx + 2}" y="82" width="16" height="5" fill="#4A2F1B"/>'
           f'<rect x="{gx + 11}" y="88" width="3" height="3" fill="#2B2B6B"/>'
           f'<rect x="{gx}" y="96" width="20" height="14" fill="#22B8C9"/>'
           f'<rect x="{gx + 2}" y="110" width="7" height="8" fill="#3B3BA8"/><rect x="{gx + 11}" y="110" width="7" height="8" fill="#3B3BA8"/>'
           f'<rect class="arm" x="{gx + 14}" y="97" width="12" height="5" fill="#F2C9A0"/>')
    sc.append(f'<g class="gx"><g class="gy">{guy}</g></g>')
    scene = (f'<clipPath id="scr"><rect x="{ix}" y="{iy}" width="{iw}" height="{ih}" rx="6"/></clipPath>'
             f'<g clip-path="url(#scr)"><g class="fade"><g transform="translate({ix} {iy}) scale({k:.4f})">{"".join(sc)}</g></g>'
             f'<rect x="{ix + 8}" y="{iy + 8}" width="74" height="24" rx="12" fill="#FFFFFF" opacity=".92"/>'
             + text(ix + 45, iy + 25, "1キャラ", 13, "#2E2B48", weight=900, anchor="middle") + "</g>")

    # 動き：P1 歩く(6-30) → P2 視点(36-60) → P3 ジャンプして壊す(64-86) → 戻す(90-100)
    gxs = [(0, "translateX(0px)"), (8, "translateX(0px)"), (28, f"translateX({walk:.1f}px)"), (93, f"translateX({walk:.1f}px)"),
           (94, "translateX(0px)"), (100, "translateX(0px)")]
    anim("gx", gxs)
    hop = [(0, "translateY(0px)"), (8, "translateY(0px)")]
    for j in range(8):
        a = 8 + j * 2.5
        hop += [(a + 1.25, "translateY(-3px)"), (a + 2.5, "translateY(0px)")]
    hop += [(64, "translateY(0px)"), (67, "translateY(-24px)"), (70, "translateY(-24px)"), (73, "translateY(0px)"),
            (100, "translateY(0px)")]
    anim("gy", hop)
    anim("arm", [(0, "rotate(0deg)"), (66, "rotate(0deg)"), (68, "rotate(-50deg)"), (70, "rotate(20deg)"), (72, "rotate(-40deg)"),
                 (74, "rotate(0deg)"), (100, "rotate(0deg)")], origin="0% 50%")
    anim("near", [(0, "translateX(0px)"), (38, "translateX(0px)"), (56, f"translateX({-pan:.1f}px)"),
                  (93, f"translateX({-pan:.1f}px)"), (94, "translateX(0px)"), (100, "translateX(0px)")])
    anim("far", [(0, "translateX(0px)"), (38, "translateX(0px)"), (56, f"translateX({-pan * .45:.1f}px)"),
                 (93, f"translateX({-pan * .45:.1f}px)"), (94, "translateX(0px)"), (100, "translateX(0px)")])
    anim("shake", [(0, "translateX(0px)"), (69, "translateX(0px)"), (70, "translateX(-2px)"), (71, "translateX(2px)"),
                   (72, "translateX(-2px)"), (73, "translateX(0px)"), (100, "translateX(0px)")])
    anim("blk", [(0, "scale(1)"), (73, "scale(1)"), (76, "scale(0)"), (93.9, "scale(0)"), (94, "scale(1)"), (100, "scale(1)")],
         origin="50% 50%")
    for j, (dx, dy) in enumerate(((-16, -26), (14, -30), (-10, 12), (18, 8))):
        anim(f"bit{j}", [(0, "translate(0px,0px) scale(0)"), (73, "translate(0px,0px) scale(0)"), (74, "translate(0px,0px) scale(1)"),
                         (84, f"translate({dx}px,{dy}px) scale(.4)"), (85, "translate(0px,0px) scale(0)"),
                         (100, "translate(0px,0px) scale(0)")], origin="50% 50%")
    opac("fade", [(0, 1), (90, 1), (93, 0), (95, 0), (99, 1), (100, 1)])

    # --- 3台のスマホ
    phones, lines = [], []
    active = [(5, 31), (35, 61), (63, 87)]
    for i, name in enumerate(("blue", "green", "purple")):
        c = CHARS[name]["body"]
        e = CHARS[name]["eye"]
        cx = pcx[i]
        a, z = active[i]
        if narrow:
            path = f"M{cx} {ptop - 6}C{cx} {ptop - 30} {hub[0]} {hub[1] + 22} {hub[0]} {hub[1]}"
        else:
            path = f"M{cx} {ptop - 6}C{cx} {ptop - 50} {hub[0] - 70} {hub[1]} {hub[0]} {hub[1]}"
        lines.append(f'<path d="{path}" fill="none" stroke="{c}" stroke-width="3" stroke-linecap="round" class="ln{i}"/>')
        css.append(kf(f"k-ln{i}", [(0, .2), (a - 1, .2), (a, 1), (z, 1), (z + 1, .2), (100, .2)], "opacity")
                   + f".ln{i}{{stroke-dasharray:6 7;animation:k-ln{i} {D}s linear infinite,flow 1.1s linear infinite}}")
        anim(f"ph{i}", [(0, "translateY(0px)"), (a, "translateY(0px)"), (a + 2, "translateY(-6px)"), (a + 4, "translateY(0px)"),
                        (100, "translateY(0px)")])
        eyes = f'<circle cx="40" cy="33" r="4" fill="{e}"/><circle cx="60" cy="33" r="4" fill="{e}"/>'
        if i == 0:
            ui = (f'<circle cx="50" cy="88" r="24" fill="none" stroke="{e}" stroke-width="3.5"/>'
                  f'<circle class="knob" cx="50" cy="88" r="11" fill="{e}"/>')
            anim("knob", [(0, "translateX(0px)"), (7, "translateX(0px)"), (9, "translateX(11px)"), (28, "translateX(11px)"),
                          (30, "translateX(0px)"), (100, "translateX(0px)")])
        elif i == 1:
            ui = (f'<rect x="24" y="58" width="52" height="60" rx="9" fill="none" stroke="{e}" stroke-width="3.5"/>'
                  f'<circle class="drag" cx="58" cy="88" r="8" fill="{e}"/>')
            anim("drag", [(0, "translateX(0px)"), (37, "translateX(0px)"), (56, "translateX(-18px)"), (58, "translateX(-18px)"),
                          (60, "translateX(0px)"), (100, "translateX(0px)")])
        else:
            ui = (f'<circle class="btna" cx="38" cy="74" r="13" fill="{e}"/>'
                  f'<circle cx="64" cy="104" r="11" fill="none" stroke="{e}" stroke-width="3.5"/>')
            anim("btna", [(0, "scale(1)"), (65, "scale(1)"), (66.5, "scale(.75)"), (68, "scale(1)"), (70, "scale(1)"),
                          (71.5, "scale(.75)"), (73, "scale(1)"), (100, "scale(1)")], origin="50% 50%")
        phones.append(f'<g transform="translate({cx - 50 * ps:.1f} {ptop}) scale({ps})"><g class="ph{i}">'
                      f'<path d="{BODY}" fill="{c}" stroke="{t["outline"]}" stroke-width="1.6"/>'
                      f'<rect x="14" y="16" width="72" height="117" rx="11" fill="{t["screen"]}"/>'
                      f'<g filter="url(#glow)">{eyes}{ui}</g></g></g>')
    labels = []
    roles = (("P1", "移動"), ("P2", "視点"), ("P3", "アクション"))
    ly = ptop + 150 * ps + 22
    for i, (pl, role) in enumerate(roles):
        c = CHARS[("blue", "green", "purple")[i]]["body"]
        c = c if i != 1 else "#2FB52E"
        labels.append(text(pcx[i], ly, pl, 14, c, weight=900, anchor="middle")
                      + text(pcx[i], ly + 20, role, 14, t["ink"], weight=800, anchor="middle"))

    stand = (f'<rect x="{mx + mw / 2 - 16}" y="{my + mh}" width="32" height="16" fill="{t["line"]}"/>'
             f'<rect x="{mx + mw / 2 - 50}" y="{my + mh + 14}" width="100" height="8" rx="4" fill="{t["line"]}"/>')
    monitor = f'<rect x="{mx}" y="{my}" width="{mw}" height="{mh}" rx="14" fill="{t["outline"]}"/>'
    body = "".join(lines) + stand + monitor + scene + "".join(phones) + "".join(labels)
    return svg(W, H, body, t, "3台のスマホで1人のキャラクターを分けて操作する様子：P1の移動でキャラクターが歩き、"
               "P2の視点で景色が回り、P3のアクションでジャンプしてブロックを壊す", "".join(css))


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


def head_banner(num, jp, en, name, t, narrow=False, mid=False):
    W, H, body = head_parts(num, jp, en, t, narrow, mid)
    return svg(W, H, body, t, jp)


# 中間の版の見出しで、見出しの文字に使える幅（右の舞台の、何も描かれない左端の帯までの幅。head_play.py と合わせる）
MID_HEAD_AVAIL = 311


def head_parts(num, jp, en, t, narrow=False, mid=False):
    """案D：見出しそのものを画像にする。番号だけ表示用の書体にし、英字ラベルと見出しはGitHub本体と同じ
    フォント指定（閲覧者の端末の標準フォント）で描く。
    スマホ版はPC版と同じ文字の大きさのまま幅360で描き、番号とラベルの下に見出しを置いて折り返す。"""
    if narrow:
        lines = wrap(jp, 27, PHONE_W - 4)
        W, H = PHONE_W, 50 + 36 * len(lines)
        b = [text(0, 42, num, 42, "url(#brand)", cls="disp", weight=400, length=44),
             text(58, 34, en, 13, t["muted"], cls="gh", weight=600, extra=' letter-spacing="3"')]
        # 行頭の全角括弧は字下げに見えるので、半文字ぶん左へ寄せる
        b += [text(-13.5 if line[0] in "（「" else 0, 80 + 36 * k, line, 27, t["ink"], cls="gh", weight=600)
              for k, line in enumerate(lines)]
    elif mid:
        # PC版と同じ並び（番号の右に英字ラベルと見出し）。右に舞台を置くので、長い見出しは2行に折り返す
        lines = wrap(jp, 27, MID_HEAD_AVAIL)
        W, H = MID_W, 68 + 36 * (len(lines) - 1)
        b = [text(0, 52, num, 42, "url(#brand)", cls="disp", weight=400, length=44),
             text(60, 26, en, 13, t["muted"], cls="gh", weight=600, extra=' letter-spacing="3"')]
        b += [text(58 - (13.5 if k and line[0] in "（「" else 0), 55 + 36 * k, line, 27, t["ink"], cls="gh", weight=600)
              for k, line in enumerate(lines)]
    else:
        W, H = 840, 68
        b = [text(0, 52, num, 42, "url(#brand)", cls="disp", weight=400, length=44),
             text(60, 26, en, 13, t["muted"], cls="gh", weight=600, extra=' letter-spacing="3"'),
             text(58, 55, jp, 27, t["ink"], cls="gh", weight=600, length=fit(jp, 27, W - 58 - 8))]
    return W, H, "".join(b)


# 目次の項目（番号＋項目名）。番号と項目名の間で折り返さないよう1枚の画像にする。
# 項目名はGitHub本体と同じフォント指定・リンクの色で、本文と同じ16pxの原寸で表示する。
TOC = [("01", "背景"), ("02", "製品説明"), ("03", "特長"), ("04", "解決出来ること"), ("05", "試遊での反応"),
       ("06", "今後の展望"), ("07", "注力したこと"), ("08", "技術仕様書"), ("09", "システム構成"),
       ("10", "活用した技術"), ("11", "独自技術")]
LINK = {"light": "#0969DA", "dark": "#4493F8"}


TOC_EN = {num: en for num, _, en in HEADS}
# 目次は表を使わず、左右1組の画像を本文欄の幅の49%ずつで並べる（表は幅いっぱいに広がらず中央に浮くため）。
# PCは幅410、スマホは幅158で描き、どちらも本文欄の49%に縮めて表示すると項目名が約16pxになる。
# 中間の版は幅304（MID_W の49%）で描き、本文欄の49%で表示する（0.895〜1.30倍）。
TOC_W = {False: 410, True: 158, "mid": 304}


def toc_item(num, label, mode, narrow=False, mid=False):
    t = THEMES[mode]
    W = TOC_W["mid" if mid else narrow]
    b = [text(0, 23, num, 21, "url(#brand)", cls="disp", weight=400, length=23),
         text(29, 21, label, 16, LINK[mode], cls="gh", weight=400)]
    if not narrow:
        b.append(text(W - 14, 20, TOC_EN[num], 13, t["muted"], cls="gh", weight=600, anchor="end",
                      extra=' letter-spacing="1.5" opacity=".75"'))
    b.append(f'<rect x="29" y="30" width="{W - 43}" height="1" fill="{t["line"]}"/>')
    return svg(W, 34, "".join(b), t, f"{num} {label}")


# ---------- 大見出し（製品概要・開発技術） ----------
PARTS = [("1", "製品概要", "PRODUCT", "01", "07"), ("2", "開発技術", "TECHNOLOGY", "08", "11")]


def part_banner(part, jp, en, first, last, t, narrow=False, mid=False):
    """大見出し。項目の見出し（番号＋英字ラベル）と同じ書体の組み方で、背景の帯と大きな番号で格上に見せる。
    中間の版はPC版と同じ組み方で、幅だけ MID_W にする。"""
    W, H = (PHONE_W, 96) if narrow else (MID_W if mid else PC_W, 104)
    b = [f'<rect width="{W}" height="{H}" rx="18" fill="url(#bg)"/>',
         f'<clipPath id="card"><rect width="{W}" height="{H}" rx="18"/></clipPath><g clip-path="url(#card)">',
         f'<g transform="translate({W if narrow else W - 230} {H}) scale(-1 -1)">{dots(14, 14, 8, 5, 12, 2.4, t["dot2"])}</g>',
         f'<rect width="7" height="{H}" fill="url(#brand)"/></g>',
         f'<rect x="{66 if narrow else 80}" y="22" width="1.5" height="{H - 44}" fill="{t["line"]}"/>']
    if narrow:
        b += [text(20, 34, "PART", 13, t["muted"], cls="gh", weight=600, extra=' letter-spacing="1"'),
              text(24, 80, part, 48, "url(#brand)", cls="disp", weight=400),
              text(82, 34, en, 13, t["muted"], cls="gh", weight=600, extra=' letter-spacing="3"'),
              text(82, 70, jp, 30, t["ink"], cls="gh", weight=700),
              text(W - 18, 34, f"{first}–{last}", 15, "url(#brand)", cls="disp", weight=400, anchor="end",
                   extra=' letter-spacing="1"')]
    else:
        b += [text(32, 40, "PART", 13, t["muted"], cls="gh", weight=600, extra=' letter-spacing="3"'),
              text(32, 86, part, 52, "url(#brand)", cls="disp", weight=400),
              text(100, 40, en, 13, t["muted"], cls="gh", weight=600, extra=' letter-spacing="4"'),
              text(100, 78, jp, 34, t["ink"], cls="gh", weight=700),
              text(W - 32, 40, "SECTIONS", 13, t["muted"], cls="gh", weight=600, anchor="end",
                   extra=' letter-spacing="3"'),
              text(W - 32, 80, f"{first} – {last}", 32, "url(#brand)", cls="disp", weight=400, anchor="end",
                   extra=' letter-spacing="1"')]
    return svg(W, H, "".join(b), t, jp)


def section_head(jp, en, W, t, ls=4):
    """冒頭の節の見出し（目次・受賞結果）。番号を付けず、細い線と4色の点で控えめに区切る。
    4色の点の右端は、目次の列の右端（画像の右14pxの余白）にそろえる。線が短くなりすぎるときは点だけにする。"""
    ex = 24 * len(jp) + 12
    b = [text(0, 31, jp, 24, t["ink"], cls="gh", weight=700),
         text(ex, 30, en, 13, t["muted"], cls="gh", weight=600, extra=f' letter-spacing="{ls}"')]
    x0, x1 = ex + round(len(en) * 8.06 + (len(en) - 1) * ls) + 20, W - 67
    if x1 - x0 >= 24:
        b.append(f'<rect x="{x0}" y="24.5" width="{x1 - x0}" height="1.5" rx=".75" fill="{t["line"]}"/>')
    b += [f'<circle cx="{x1 + 10 + i * 13}" cy="25.25" r="4" fill="{CHARS[n]["body"]}"/>' for i, n in enumerate(ORDER)]
    return "".join(b)


def toc_title(t, narrow=False, mid=False):
    """目次の見出し。"""
    W = PHONE_W if narrow else MID_W if mid else PC_W
    return svg(W, 40, section_head("目次", "CONTENTS", W, t), t, "目次")


def video_cta(t, narrow=False, mid=False):
    """サムネイルの下に置く、紹介動画への誘導。押せることが分かるよう、枠・再生の印・矢印を付ける。"""
    W, H = (PHONE_W if narrow else MID_W if mid else PC_W, 60)
    red = "#FF2D55"
    b = [f'<rect x=".75" y=".75" width="{W - 1.5}" height="{H - 1.5}" rx="12" fill="none" stroke="{t["line"]}" stroke-width="1.5"/>',
         f'<circle cx="34" cy="{H / 2}" r="17" fill="{red}"/>',
         f'<path d="M29 {H / 2 - 7.5}L41 {H / 2}L29 {H / 2 + 7.5}Z" fill="#FFFFFF" stroke="#FFFFFF" stroke-width="2" stroke-linejoin="round"/>',
         text(64, 27, "プロダクト紹介動画を見る", 16, t["ink"], cls="gh", weight=700),
         text(64, 46, "YouTubeで再生します", 13, t["muted"], cls="gh", weight=600),
         f'<path d="M{W - 28} {H / 2 - 7}l7 7-7 7" fill="none" stroke="{t["muted"]}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>']
    return svg(W, H, "".join(b), t, "プロダクト紹介動画を見る（YouTube）")


def toc_part(part, jp, en, mode, narrow=False, mid=False):
    """目次の列の見出し。大見出しと同じ PART 番号・英字ラベルで、どちらの列かを示す。"""
    t = THEMES[mode]
    W = TOC_W["mid" if mid else narrow]
    b = [text(0, 15, f"PART {part}", 13, "url(#brand)", cls="gh", weight=700, extra=' letter-spacing="2"'),
         text(0, 41, jp, 19, t["ink"], cls="gh", weight=700)]
    if not narrow:
        b.append(text(W - 14, 41, en, 13, t["muted"], cls="gh", weight=600, anchor="end",
                      extra=' letter-spacing="3"'))
    b.append(f'<rect y="50" width="{W - 14}" height="3" rx="1.5" fill="url(#brand)"/>')
    return svg(W, 62, "".join(b), t, f"{jp}（{en}）")


# ---------- 受賞結果 ----------
AWARDS = [
    ("Hack Day", "金沢会場", [("gold", "Hack Day Audience Award", None),
                             ("blue", "Award Day Finalist", None)]),
    ("Award Day", None, [("silver", "審査委員特別賞", None),
                        ("purple", "Innovator認定", None),
                        ("red", "合同会社DMM.com賞", None)]),
]
# 受賞結果の図は awards_play.py で描く（ここのデータは文字だけのREADMEで使う）


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    files = {}
    for mode, t in THEMES.items():
        for kind, draw in (("split", split_demo), ("flow", flow), ("pipeline", pipeline), ("footer", footer)):
            files[f"{kind}-{mode}.svg"] = draw(t)
            files[f"{kind}-narrow-{mode}.svg"] = draw(t, narrow=True)
    for i, (num, jp, en) in enumerate(HEADS):
        name = ORDER[i % 4]
        for mode, t in THEMES.items():
            files[f"heads/head-{num}-{mode}.svg"] = head_banner(num, jp, en, name, t)
            files[f"heads/head-{num}-narrow-{mode}.svg"] = head_banner(num, jp, en, name, t, narrow=True)
    for num, label in TOC:
        for mode in THEMES:
            files[f"heads/toc-{num}-{mode}.svg"] = toc_item(num, label, mode)
            files[f"heads/toc-{num}-mid-{mode}.svg"] = toc_item(num, label, mode, mid=True)
            files[f"heads/toc-{num}-narrow-{mode}.svg"] = toc_item(num, label, mode, narrow=True)
    for part, jp, en, first, last in PARTS:
        for mode, t in THEMES.items():
            files[f"heads/part-{part}-{mode}.svg"] = part_banner(part, jp, en, first, last, t)
            files[f"heads/part-{part}-mid-{mode}.svg"] = part_banner(part, jp, en, first, last, t, mid=True)
            files[f"heads/part-{part}-narrow-{mode}.svg"] = part_banner(part, jp, en, first, last, t, narrow=True)
            files[f"heads/toc-part-{part}-{mode}.svg"] = toc_part(part, jp, en, mode)
            files[f"heads/toc-part-{part}-mid-{mode}.svg"] = toc_part(part, jp, en, mode, mid=True)
            files[f"heads/toc-part-{part}-narrow-{mode}.svg"] = toc_part(part, jp, en, mode, narrow=True)
    for mode, t in THEMES.items():
        files[f"heads/toc-title-{mode}.svg"] = toc_title(t)
        files[f"heads/toc-title-mid-{mode}.svg"] = toc_title(t, mid=True)
        files[f"heads/toc-title-narrow-{mode}.svg"] = toc_title(t, narrow=True)
        files[f"video-cta-{mode}.svg"] = video_cta(t)
        files[f"video-cta-mid-{mode}.svg"] = video_cta(t, mid=True)
        files[f"video-cta-narrow-{mode}.svg"] = video_cta(t, narrow=True)
    (OUT / "heads").mkdir(exist_ok=True)
    for name, body in files.items():
        (OUT / name).write_text(body + "\n", encoding="utf-8", newline="\n")
    print(f"wrote {len(files)} files to {OUT}")


if __name__ == "__main__":
    main()
