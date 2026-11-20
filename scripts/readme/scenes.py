"""README用の小さなアニメーション（4色のキャラクターが遊ぶ場面）を生成する。

build_art.py の部品（キャラクターの形・顔・フォントの埋め込み）を使い、
assets/readme/scenes/ に場面ごとのSVGと一覧（README.md）を書き出す。
背景は透明で、ライト・ダークのどちらのテーマにも置ける。

動きは「移動（位置）」「姿勢（回転・伸び縮み）」「影」の3層に分け、同じ時間軸のキーフレームで動かす。
着地でつぶれ、跳ぶと伸びる（スクワッシュ＆ストレッチ）、動く前のため（予備動作）を入れている。

    python scripts/readme/scenes.py
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import build_art as art  # noqa: E402

OUT = art.OUT / "scenes"
W, H, G, S = 560, 100, 94, 0.36  # 幅・高さ・地面・キャラクターの大きさ
K = S * art.FIT
HW = round(50 * K, 1)  # 体の半分の幅。寝転ぶときはこの分だけ持ち上げる
T = art.THEMES["light"]
GOLD, WOOD, MARK = "#F5B400", "#C98B4F", "#FF8A00"
IN, OUT_, IO = "cubic-bezier(.55,0,1,.45)", "cubic-bezier(0,.55,.45,1)", "cubic-bezier(.45,0,.55,1)"

# ---------- 顔とキャラクター ----------


def layer(kind, name):
    """顔の差し替え。キャラクターの原寸（100x150）の座標で描く。"""
    e = art.CHARS[name]["eye"]
    line = f'fill="none" stroke="{e}" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round"'
    if kind == "normal":
        eyes, mouth = art.face(name)
        return f'<g filter="url(#glow)" transform="translate(0 6)"><g class="eyes">{eyes}</g>{mouth}</g>'
    if kind == "back":  # 背中（画面の裏とカメラ）
        return (f'<rect x="14" y="16" width="72" height="117" rx="11" fill="{art.CHARS[name]["body"]}"/>'
                '<rect x="14" y="16" width="72" height="117" rx="11" fill="#000" opacity=".22"/>'
                '<rect x="22" y="24" width="26" height="26" rx="8" fill="#1C1C22"/>'
                '<circle cx="35" cy="37" r="6.5" fill="#3A3F52"/><circle cx="33" cy="35" r="2" fill="#8C93AA"/>')
    faces = {
        "sleep": f'<path d="M26 52q8 7 16 0M58 52q8 7 16 0" {line}/>',
        "surprised": (f'<circle cx="35" cy="47" r="9" {line}/><circle cx="65" cy="47" r="9" {line}/>'
                      f'<ellipse cx="50" cy="70" rx="5" ry="6.5" {line}/>'),
        "dizzy": f'<path d="M28 40l13 13M41 40l-13 13M59 40l13 13M72 40l-13 13M41 70q4-5 9 0t9 0" {line}/>',
        "happy": f'<path d="M27 52q8-11 16 0M57 52q8-11 16 0M40 63q10 11 20 0" {line}/>',
        "strain": f'<path d="M27 42l14 6-14 6M73 42l-14 6 14 6M41 68h18" {line}/>',
        "worried": f'<path d="M27 44l14 6M73 44l-14 6" {line}/><circle cx="35" cy="54" r="4" fill="{e}"/>'
                   f'<circle cx="65" cy="54" r="4" fill="{e}"/><path d="M42 72q8-6 16 0" {line}/>',
    }
    return f'<g filter="url(#glow)">{faces[kind]}</g>'


def body(name, layers):
    faces = "".join(f'<g class="{cls}">{layer(kind, name)}</g>' if cls else layer(kind, name) for kind, cls in layers)
    return (f'<g transform="translate({-50 * K:.2f} {-149 * K:.2f}) scale({K:.4f})">'
            f'<path d="{art.BODY}" fill="{art.CHARS[name]["body"]}" stroke="{T["outline"]}" stroke-width="1.6"/>'
            f'<rect x="14" y="16" width="72" height="117" rx="11" fill="{T["screen"]}"/>{faces}</g>')


# ---------- キーフレーム ----------


def kf(name, frames, prop="transform"):
    """frames は (%, 値) または (%, 値, 次への緩急)。"""
    parts = []
    for f in frames:
        ease = f";animation-timing-function:{f[2]}" if len(f) > 2 and f[2] else ""
        parts.append(f"{f[0]:g}%{{{prop}:{f[1]}{ease}}}")
    return f"@keyframes {name}{{{''.join(parts)}}}"


class Key:
    """1コマの状態：位置(x, y)、回転r、横縦の伸び(sx, sy)、次のコマへの緩急（xe は横移動だけの緩急）。"""

    def __init__(self, p, x, y=0, r=0, sx=1, sy=1, ease=IO, xe=None):
        self.p, self.x, self.y, self.r, self.sx, self.sy, self.ease = p, x, y, r, sx, sy, ease
        self.xe = xe or ease


def key(p, x, y=0, r=0, sx=1, sy=1, ease=IO):
    return Key(p, x, y, r, sx, sy, ease)


def lie(p, x, r, ease=IO):
    """寝転んだ姿勢（r=±90）。地面に乗るよう体の半分の幅だけ持ち上げる。"""
    return Key(p, x, -HW, r, 1, 1, ease)


def steps(p0, p1, x0, x1, n, h=6, lean=0, squash=.1):
    """p0〜p1(%) に x0→x1 へ n 歩はねる。着地でつぶれ、空中で伸びる。"""
    out = []
    for i in range(n):
        a = p0 + (p1 - p0) * i / n
        m = p0 + (p1 - p0) * (i + .5) / n
        xa = x0 + (x1 - x0) * i / n
        xm = x0 + (x1 - x0) * (i + .5) / n
        out.append(Key(round(a, 2), round(xa, 1), 0, lean, 1 + squash * .6, 1 - squash, OUT_, "linear"))
        out.append(Key(round(m, 2), round(xm, 1), -h, lean, 1 - squash * .3, 1 + squash * .5, IN, "linear"))
    out.append(Key(p1, x1, 0, lean, 1 + squash * .6, 1 - squash, OUT_))
    return out


def actor(cid, name, keys, dur, layers=(("normal", ""),), x0=0, delay=0, shadow=True):
    """keys に沿って動くキャラクター。(x0, G) を原点にする。"""
    keys = sorted(keys, key=lambda k: k.p)
    if keys[0].p > 0:
        k0 = keys[0]
        keys.insert(0, Key(0, k0.x, k0.y, k0.r, k0.sx, k0.sy, k0.ease, k0.xe))
    if keys[-1].p < 100:
        k1 = keys[-1]
        keys.append(Key(100, k1.x, k1.y, k1.r, k1.sx, k1.sy, k1.ease, k1.xe))
    mx = [(k.p, f"translateX({k.x}px)", k.xe) for k in keys]
    my = [(k.p, f"translateY({k.y}px)", k.ease) for k in keys]
    ps = [(k.p, f"rotate({k.r}deg) scale({k.sx},{k.sy})", k.ease) for k in keys]
    sh = [(k.p, f"scale({max(.35, 1 + k.y / 45):.2f})", k.ease) for k in keys]
    run = lambda n: f"animation:{n} {dur}s linear {delay}s infinite"  # noqa: E731
    css = [kf(f"x-{cid}", mx), kf(f"y-{cid}", my), kf(f"p-{cid}", ps),
           f".x-{cid}{{{run(f'x-{cid}')}}}", f".y-{cid}{{{run(f'y-{cid}')}}}",
           f".p-{cid}{{{run(f'p-{cid}')};transform-box:fill-box;transform-origin:50% 100%}}"]
    out = f'<g transform="translate({x0} {G})"><g class="x-{cid}">'
    if shadow:
        css += [kf(f"s-{cid}", sh), f".s-{cid}{{{run(f's-{cid}')};transform-box:fill-box;transform-origin:50% 50%}}"]
        out += f'<ellipse class="s-{cid}" cx="0" cy="1.5" rx="{HW + 1}" ry="2.6" fill="#000" opacity=".13"/>'
    out += f'<g class="y-{cid}"><g class="p-{cid}">{body(name, layers)}</g></g></g></g>'
    return out, css


def show(cls, dur, on):
    """on の範囲（%）だけ表示する。"""
    f = {0: 1 if any(a <= 0 for a, _ in on) else 0}
    for a, b in on:
        if a > 0:
            f[round(a - .3, 2)] = 0
            f[a] = 1
        if b < 100:
            f[b] = 1
            f[round(b + .3, 2)] = 0
    f[100] = 1 if any(b >= 100 for _, b in on) else 0
    return (kf(f"k-{cls}", sorted(f.items()), "opacity")
            + f".{cls}{{opacity:{f[0]};animation:k-{cls} {dur}s linear infinite}}")


def pop(cls, dur, a, b):
    """a〜b(%) の間、ふくらんで出て、しぼんで消える（吹き出し・記号用）。"""
    frames = [(0, "scale(0)"), (a, "scale(0)", OUT_), (a + 2.5, "scale(1.12)", IO), (a + 4, "scale(1)"),
              (b - 1.5, "scale(1)", IN), (b, "scale(0)"), (100, "scale(0)")]
    return (kf(f"k-{cls}", frames)
            + f".{cls}{{animation:k-{cls} {dur}s linear infinite;transform-box:fill-box;transform-origin:50% 100%}}")


BUBBLE = 1.0  # 吹き出しと記号の大きさの倍率。スマホ版の帯は縮んで表示されるので大きくする


def bubble(x, y, s, cls, size=14):
    """吹き出し（白地・ライトでもダークでも読める）。(x, y) はしっぽの先。舞台の外へ出ないよう左右を寄せる。"""
    size *= BUBBLE
    w = sum(size * (0.62 if c.isascii() else 1.0) for c in s) + 18
    h = size + 12
    bx = min(max(x, w / 2 + 4), W - w / 2 - 4)
    return (f'<g class="{cls}"><rect x="{bx - w / 2:.1f}" y="{y - h - 6}" width="{w:.1f}" height="{h}" rx="{h / 2}" '
            f'fill="#FFFFFF" stroke="#D5DAE3" stroke-width="1.5"/>'
            f'<path d="M{x - 5} {y - 7}L{x} {y}L{x + 5} {y - 7}" fill="#FFFFFF" stroke="#D5DAE3" stroke-width="1.5" stroke-linejoin="round"/>'
            f'<rect x="{x - 6}" y="{y - 9}" width="12" height="3" fill="#FFFFFF"/>'
            f'{art.text(bx, y - 6 - h / 2 + size * .36, s, size, "#2E2B48", cls="rnd", weight=800, anchor="middle")}</g>')


def mark(x, y, s, cls, size=22, fill=MARK):
    size *= BUBBLE
    edge = ' stroke="#FFFFFF" stroke-width="4" paint-order="stroke" stroke-linejoin="round"'
    return f'<g class="{cls}">{art.text(x, y, s, size, fill, cls="rnd", weight=800, anchor="middle", extra=edge)}</g>'


def dust(cx, cy, cls, dur, at):
    """at(%) で足もとに土ぼこりが広がる。"""
    css = (kf(f"k-{cls}", [(0, "scale(.2)"), (at, "scale(.3)", OUT_), (at + 8, "scale(1.5)"), (100, "scale(1.5)")])
           + kf(f"k-{cls}o", [(0, 0), (at, 0), (at + 1, .9), (at + 8, 0), (100, 0)], "opacity")
           + f".{cls}{{animation:k-{cls} {dur}s linear infinite,k-{cls}o {dur}s linear infinite;"
             "transform-box:fill-box;transform-origin:50% 100%}")
    svg = (f'<g class="{cls}"><circle cx="{cx - 11}" cy="{cy - 3}" r="4" fill="#BFC5D2"/><circle cx="{cx}" cy="{cy - 6}" r="5.5" fill="#CDD2DD"/>'
           f'<circle cx="{cx + 11}" cy="{cy - 3}" r="4" fill="#BFC5D2"/></g>')
    return svg, css


def stars(cx, cy, cls):
    s = "".join(art.star(cx + dx, cy + dy, 4.2, GOLD) for dx, dy in ((-11, 0), (11, 0), (0, -5)))
    return f'<g class="{cls}"><g class="spin" style="transform-box:fill-box;transform-origin:50% 50%">{s}</g></g>'


def sweat(x, y, cls):
    """汗のしずく。表示中は少しずつ垂れて薄くなる。"""
    return (f'<g class="{cls}"><g class="drip"><path d="M{x} {y}q-4 6 0 8q4-2 0-8z" fill="#7FD3FF" stroke="#4BA9DA" stroke-width="1"/></g></g>')


COMMON = ("@keyframes spin{to{transform:rotate(360deg)}}.spin{animation:spin 1.1s linear infinite}"
          "@keyframes drip{0%{transform:translateY(0);opacity:1}100%{transform:translateY(8px);opacity:0}}"
          ".drip{animation:drip .8s ease-in infinite}"
          "@media (prefers-reduced-motion:reduce){*{animation:none!important}}")


class Scene:
    def __init__(self, dur):
        self.dur, self.svg, self.css = dur, [], []

    def add(self, pair):
        svg, css = pair
        self.svg.append(svg)
        self.css += css if isinstance(css, list) else [css]

    def raw(self, svg="", css=""):
        if svg:
            self.svg.append(svg)
        if css:
            self.css.append(css)


# ---------- 場面 ----------


def daruma():
    D = 8
    sc = Scene(D)
    # 3人は鬼が数えるあいだにそっと進み、振り向いたら止まる
    for cid, name, x0, freeze in (("db", "blue", 40, key(40, 150, 0, -7, 1, 1)), ("dg", "green", 88, key(40, 150, -3, 5, 1.02, .98))):
        ks = [key(0, 0, 0, 0, 1, 1), key(4, 0, 0, 0, 1.06, .92, OUT_)] + steps(5, 38, 0, 150, 7, 5, 6, .08)
        ks += [freeze, key(72, 150, 0, freeze.r), key(75, 150, 0, 0, 1.05, .94)]
        ks += steps(76, 94, 150, 0, 5, 4, -5, .06) + [key(97, 0, 0, 0)]
        sc.add(actor(cid, name, ks, D, x0=x0))
    # 紫はふらついて前に倒れる
    ks = [key(0, 0), key(4, 0, 0, 0, 1.06, .92, OUT_)] + steps(5, 38, 0, 150, 7, 5, 6, .08)
    ks += [key(40, 150, 0, 4), key(46, 150, 0, -6), key(50, 150, 0, 8), key(53, 150, 0, -11), key(56, 150, 0, 15, ease=IN),
           lie(60, 158, 90, OUT_), lie(62, 156, 86), lie(64, 157, 90), lie(73, 157, 90), key(76, 150, -8, 0, .95, 1.06, IN),
           key(78, 150, 0, 0, 1.08, .9)]
    ks += steps(79, 95, 150, 0, 5, 4, -5, .06) + [key(98, 0)]
    sc.add(actor("dp", "purple", ks, D, (("normal", "dp-n"), ("worried", "dp-w"), ("dizzy", "dp-d")), x0=136))
    sc.raw(css=show("dp-n", D, [(0, 45), (76, 100)]) + show("dp-w", D, [(45, 59)]) + show("dp-d", D, [(59, 76)]))
    sc.add(dust(136 + 172, G, "dp-dust", D, 60))
    # 鬼（赤）：背中を向けて数え、くるっと振り向く
    oni = [key(0, 0), key(37, 0, 0, 0, 1.05, .94, OUT_), key(40, 0, -10, 0, .2, 1.05, IN), key(42, 0, 0, 0, 1.08, .92, OUT_),
           key(44, 0, 0, 0), key(70, 0, 0, 0, 1.05, .94, OUT_), key(72, 0, -8, 0, .2, 1.05, IN), key(74, 0, 0, 0, 1.06, .93), key(76, 0)]
    sc.add(actor("oni", "red", oni, D, (("back", "oni-b"), ("normal", "oni-f"), ("happy", "oni-h")), x0=500))
    sc.raw(css=show("oni-b", D, [(0, 40), (72, 100)]) + show("oni-f", D, [(40, 62)]) + show("oni-h", D, [(62, 72)]))
    sc.raw(bubble(500, 42, "だるまさんが", "s1", 13) + bubble(500, 42, "ころんだ！", "s2", 15) + bubble(500, 42, "みーつけた！", "s3", 14),
           pop("s1", D, 4, 27) + pop("s2", D, 28, 42) + pop("s3", D, 62, 74))
    return sc, "だるまさんがころんだ", "鬼が数えるあいだに3人が忍び足。振り向いたら固まるけれど、紫がこらえきれずに転んで見つかる。"


def chase():
    D = 6
    sc = Scene(D)
    g = [key(0, -40)] + steps(0, 42, -40, 250, 9, 7, 10, .1)
    g += [key(44, 262, -4, 30, ease=IN), lie(47, 286, 90, OUT_), lie(49, 284, 84), lie(51, 285, 90), lie(68, 285, 90),
          key(71, 270, -10, 0, .95, 1.08, IN), key(73, 270, 0, 0, 1.08, .9)]
    g += steps(74, 100, 270, 620, 7, 7, 10, .1)
    sc.add(actor("cg", "green", g, D, (("normal", "cg-n"), ("surprised", "cg-s"), ("dizzy", "cg-d"))))
    sc.raw(css=show("cg-n", D, [(0, 43), (71, 100)]) + show("cg-s", D, [(43, 48)]) + show("cg-d", D, [(48, 71)]))
    b = [key(0, -120)] + steps(0, 48, -120, 230, 10, 7, 10, .1)
    b += [key(50, 248, 0, 8, 1.1, .88, OUT_), key(53, 290, -38, 160, ease=IO), key(56, 330, -20, 330, ease=IN),
          Key(58.5, 342, -HW, 450, 1, 1, OUT_), Key(60.5, 344, -HW, 444), Key(62, 343, -HW, 450), Key(70, 343, -HW, 450),
          key(73, 352, -10, 360, .95, 1.08, IN), key(75, 352, 0, 360, 1.08, .9)]
    b += [Key(k.p, k.x, k.y, 360 + k.r, k.sx, k.sy, k.ease, k.xe) for k in steps(76, 100, 352, 680, 7, 7, 10, .1)]
    sc.add(actor("cb", "blue", b, D, (("normal", "cb-n"), ("surprised", "cb-s"), ("dizzy", "cb-d"))))
    sc.raw(css=show("cb-n", D, [(0, 47), (74, 100)]) + show("cb-s", D, [(47, 57)]) + show("cb-d", D, [(57, 74)]))
    sc.add(dust(300, G, "c-d1", D, 47))
    sc.add(dust(366, G, "c-d2", D, 58.5))
    sc.raw(stars(296, G - 40, "c-st") + stars(356, G - 40, "c-st2"),
           show("c-st", D, [(49, 67.5)]) + show("c-st2", D, [(59, 72)]))
    # 吹き出しは青の頭上を一緒に動く
    sc.raw(f'<g class="cb-sayw">{bubble(0, 42, "まてまてー！", "cb-say", 13)}</g>',
           kf("k-cbs", [(0, "translateX(-120px)"), (48, "translateX(230px)"), (100, "translateX(230px)")])
           + ".cb-sayw{animation:k-cbs 6s linear infinite}" + pop("cb-say", D, 14, 40))
    return sc, "おいかけっこ", "逃げる緑がつまずいて転び、勢いのついた青も宙返りして転ぶ。起き上がったら、またおいかけっこ。"


def train():
    D = 9
    sc = Scene(D)
    names = ["blue", "green", "purple", "red"]
    for i, name in enumerate(names):
        lag = i * D / 72  # 跳ねる位相を4分の1歩ずつずらす
        x = -40 - i * 36 - 760 * lag / D
        ks = steps(0, 100, x, x + 760, 18, 5, 6, .08)
        face = (("normal", ""),) if i == 0 else (("happy", ""),)
        sc.add(actor(f"t{i}", name, ks, D, face, delay=-lag))
    # 縄の輪（4人の腰まわり）と、先頭から出る湯気
    rope_keys = [(0, "translateX(-40px)"), (100, "translateX(720px)")]
    sc.raw(f'<g class="trr"><rect x="-128" y="{G - 30}" width="150" height="12" rx="6" fill="none" stroke="{GOLD}" stroke-width="2.6"/>'
           + "".join(f'<circle class="stm" style="animation-delay:{-k * .3:.2f}s" cx="2" cy="{G - 50}" r="5" fill="#CDD2DD"/>' for k in range(3))
           + "</g>",
           kf("k-trr", rope_keys) + ".trr{animation:k-trr 9s linear infinite}"
           + kf("k-stm", [(0, "translate(0px,0px) scale(.4)"), (100, "translate(-18px,-20px) scale(1.5)")])
           + kf("k-stmo", [(0, .9), (100, 0)], "opacity")
           + ".stm{animation:k-stm .9s ease-out infinite,k-stmo .9s ease-out infinite;transform-box:fill-box;transform-origin:50% 50%}")
    sc.raw(f'<g class="tsw">{bubble(-20, 44, "しゅっしゅっぽっぽ", "tsay", 12)}</g>',
           pop("tsay", D, 30, 62) + kf("k-tsw", rope_keys) + ".tsw{animation:k-tsw 9s linear infinite}")
    return sc, "電車ごっこ", "4人が縄の輪に入って、ぴょこぴょこ跳ねながら横切っていく。"


def rope():
    D = 1.5
    sc = Scene(D)
    for cid, name, x0 in (("jb", "blue", 258), ("jr", "red", 302)):
        ks = [key(0, 0, -22, 0, .94, 1.08, IN), key(30, 0, 0, 0, 1.12, .86, OUT_), key(42, 0, 0, 0, 1, 1),
              key(78, 0, 0, 0, 1.1, .88, OUT_), key(100, 0, -22, 0, .94, 1.08)]
        sc.add(actor(cid, name, ks, D, (("happy", ""),), x0=x0))
    for cid, name, x0, a in (("tl", "green", 166, -7), ("tr", "purple", 394, 7)):
        ks = [key(0, 0, 0, a), key(50, 0, 0, -a), key(100, 0, 0, a)]
        sc.add(actor(cid, name, ks, D, x0=x0))
    # 縄は下を回るとき体の前、上を回るとき体の後ろを通る
    path = f'<path d="M182 74A98 22 0 0 0 378 74" fill="none" stroke="{GOLD}" stroke-width="2.8" stroke-linecap="round"/>'
    sc.svg.insert(0, f'<g class="rope rope-back">{path}</g>')
    sc.raw(f'<g class="rope rope-front">{path}</g>',
           kf("k-rope", [(0, "scaleY(1)", IO), (50, "scaleY(-1.05)", IO), (100, "scaleY(1)")])
           + kf("k-rf", [(0, 1), (24.9, 1), (25, 0), (74.9, 0), (75, 1), (100, 1)], "opacity")
           + kf("k-rb", [(0, 0), (24.9, 0), (25, 1), (74.9, 1), (75, 0), (100, 0)], "opacity")
           + ".rope{transform-box:view-box;transform-origin:280px 74px}"
           + ".rope-front{animation:k-rope 1.5s linear infinite,k-rf 1.5s linear infinite}"
           + ".rope-back{animation:k-rope 1.5s linear infinite,k-rb 1.5s linear infinite}")
    return sc, "なわとび", "緑と紫が回す縄を、青と赤が息を合わせて跳ぶ。"


def domino():
    D = 7
    sc = Scene(D)
    names = ["blue", "green", "purple", "red"]
    for i, name in enumerate(names):
        hit = 12 + i * 4.5
        ang = 90 if i == 3 else 38
        up = 74
        if i == 3:
            ks = [key(0, 0), key(hit, 0, 0, 0, ease=IN), key(hit + 3, 0, 0, 30, ease=IN), lie(hit + 6, 22, 90, OUT_),
                  lie(hit + 7.5, 21, 86), lie(hit + 9, 22, 90), lie(up, 22, 90)]
        else:
            ks = [key(0, 0), key(hit, 0, 0, 0, ease=IN), key(hit + 4, 4, 0, ang + 4, ease=OUT_), key(hit + 5.5, 4, 0, ang - 3),
                  key(hit + 7, 4, 0, ang), key(up, 4, 0, ang)]
        ks += [key(up + 3, 0, -2, 0, 1.08, .9, OUT_), key(up + 6, 0, -16, 0, .92, 1.1, IN), key(up + 9, 0, 0, 0, 1.1, .88, OUT_),
               key(up + 12, 0, 0, 0)]
        sc.add(actor(f"do{i}", name, ks, D, (("normal", f"do{i}n"), ("surprised", f"do{i}s"), ("happy", f"do{i}h")), x0=210 + i * 40))
        sc.raw(css=show(f"do{i}n", D, [(0, hit - .5)]) + show(f"do{i}s", D, [(hit - .5, up + 2)]) + show(f"do{i}h", D, [(up + 2, 100)]))
    sc.add(dust(210 + 3 * 40 + 22, G, "do-dust", D, 12 + 3 * 4.5 + 6))
    # 転がってくるボール
    sc.raw(f'<g class="dbxo"><g class="dbx"><g class="dbr"><circle cx="0" cy="{G - 7}" r="7" fill="#FFD23F" stroke="#E08E0B" stroke-width="1.6"/>'
           f'<path d="M-7 {G - 7}h14M0 {G - 14}v14" stroke="#E08E0B" stroke-width="1.4"/></g></g></g>',
           kf("k-dbx", [(0, "translate(40px,0px)", OUT_), (12, "translate(186px,0px)", OUT_), (16, "translate(170px,0px)"),
                        (62, "translate(170px,0px)", IN), (70, "translate(40px,0px)"), (100, "translate(40px,0px)")])
           + kf("k-dbr", [(0, "rotate(0deg)", OUT_), (12, "rotate(600deg)", OUT_), (16, "rotate(560deg)"), (62, "rotate(560deg)", IN),
                          (70, "rotate(0deg)"), (100, "rotate(0deg)")])
           + ".dbx{animation:k-dbx 7s linear infinite}.dbr{animation:k-dbr 7s linear infinite;transform-box:fill-box;transform-origin:50% 50%}"
           + show("dbxo", D, [(0, 68)]))
    sc.raw(mark(210, 40, "！", "do-m"), pop("do-m", D, 11, 20))
    sc.raw(bubble(270, 40, "せーの！", "do-say", 14), pop("do-say", D, 72, 84))
    return sc, "ドミノ倒し", "転がってきたボールに当たり、順番にパタパタ倒れる。最後は「せーの」でいっせいに起き上がる。"


def hide():
    D = 9
    sc = Scene(D)

    def bush(x):
        return (f'<g><path d="M{x - 42} {G}c-6-12 4-24 16-20c0-14 22-20 30-6c8-10 28-4 26 10c12-2 18 10 12 16z" '
                f'fill="#5DBB63" stroke="#3E8E47" stroke-width="2" stroke-linejoin="round"/>'
                f'<path d="M{x - 18} {G - 20}q4-6 10-6M{x + 10} {G - 26}q5-4 10-2" fill="none" stroke="#8EDB8C" stroke-width="2.4" stroke-linecap="round"/></g>')

    hiders = (("hb", "blue", 196, 36), ("hg", "green", 326, 52), ("hp", "purple", 456, 68))
    inner = []
    for cid, name, x0, a in hiders:
        if cid == "hp":
            ks = [key(0, 0, 50), key(a, 0, 50, ease=OUT_), key(a + 3, 0, -4, -10), key(a + 6, 0, -4, 10, ease=IN), key(a + 9, 0, 50),
                  key(78, 0, 50, ease=OUT_), key(81, 0, -18, 0, .92, 1.12, IN), key(84, 0, 0, 0, 1.12, .88, OUT_), key(86, 0, 0, 0),
                  key(94, 0, 0, ease=IN), key(98, 0, 50)]
            layers = (("normal", "hp-n"), ("surprised", "hp-s"))
            sc.raw(css=show("hp-n", D, [(0, 79), (96, 100)]) + show("hp-s", D, [(79, 96)]))
        else:
            ks = [key(0, 0, 50), key(a, 0, 50, ease=OUT_), key(a + 2.5, 0, -4, -12), key(a + 4.5, 0, -4, 0), key(a + 6.5, 0, -4, 12, ease=IN),
                  key(a + 9, 0, 50)]
            layers = (("normal", ""),)
        svg, css = actor(cid, name, ks, D, layers, x0=x0, shadow=False)
        inner.append(svg)
        sc.css += css
    sc.raw(f'<clipPath id="ground"><rect x="0" y="0" width="{W}" height="{G}"/></clipPath><g clip-path="url(#ground)">{"".join(inner)}</g>')
    sc.raw("".join(bush(x) for _, _, x, _ in hiders))
    seek = [key(0, 0), key(30, 0, 0, 0, 1.06, .93, OUT_), key(31.5, 0, -8, 0, .2, 1.05, IN), key(33, 0, 0, 0, 1.06, .93), key(35, 0),
            key(40, 0, 0, -8), key(48, 0, 0, 8), key(56, 0, 0, -8), key(64, 0, 0, 8), key(72, 0, 0, 0)]
    seek += steps(73, 79, 0, 26, 2, 4, 5, .08) + [key(80, 26), key(96, 26, ease=IN)] + steps(96, 100, 26, 0, 1, 3, 0, .05)
    sc.add(actor("sk", "red", seek, D, (("back", "sk-b"), ("normal", "sk-f"), ("happy", "sk-h")), x0=66))
    sc.raw(css=show("sk-b", D, [(0, 31.5)]) + show("sk-f", D, [(31.5, 80)]) + show("sk-h", D, [(80, 100)]))
    sc.raw(bubble(66, 42, "いーち、にー…", "hs1", 12) + mark(66, 40, "？", "hs2", 24) + bubble(92, 42, "みーつけた！", "hs3", 13),
           pop("hs1", D, 3, 29) + pop("hs2", D, 38, 72) + pop("hs3", D, 81, 95))
    return sc, "かくれんぼ", "鬼が数えるあいだに茂みへ。順番にそっと顔を出し、最後の紫が見つかって飛び上がる。"


def volley():
    D = 2.6
    sc = Scene(D)
    blue = [key(0, 0, -14, 0, .92, 1.1, IN), key(8, 0, 0, 0, 1.1, .88, OUT_), key(14, 0), key(84, 0),
            key(92, 0, 0, 0, 1.12, .86, OUT_), key(100, 0, -14, 0, .92, 1.1)]
    red = [key(0, 0), key(34, 0), key(42, 0, 0, 0, 1.12, .86, OUT_), key(50, 0, -14, 0, .92, 1.1, IN),
           key(58, 0, 0, 0, 1.1, .88, OUT_), key(64, 0)]
    sc.add(actor("vb", "blue", blue, D, x0=172))
    sc.add(actor("vr", "red", red, D, x0=388))
    for cid, name, x0, d in (("vg", "green", 70, 0), ("vp", "purple", 490, -.35)):
        ks = steps(0, 100, 0, 0, 4, 9, 0, .1)
        sc.add(actor(cid, name, ks, D, (("happy", ""),), x0=x0, delay=d))
    sc.raw(f'<ellipse class="vbs" cx="172" cy="{G + 1.5}" rx="6" ry="1.8" fill="#000" opacity=".12"/>'
           f'<g class="bx"><g class="by"><g class="br"><circle cx="172" cy="24" r="7.5" fill="#FFD23F" stroke="#E08E0B" stroke-width="1.6"/>'
           '<path d="M164.5 24q7.5-6 15 0M172 16.5v15" fill="none" stroke="#E08E0B" stroke-width="1.4"/></g></g></g>',
           kf("k-bx", [(0, "translateX(0px)"), (50, "translateX(216px)"), (100, "translateX(0px)")])
           + ".bx,.vbs{animation:k-bx 2.6s linear infinite}"
           + kf("k-by", [(0, "translateY(0px)", OUT_), (25, "translateY(-12px)", IN), (50, "translateY(0px)", OUT_),
                         (75, "translateY(-12px)", IN), (100, "translateY(0px)")])
           + ".by{animation:k-by 2.6s linear infinite}"
           + ".br{animation:spin .8s linear infinite;transform-box:fill-box;transform-origin:50% 50%}")
    return sc, "ボールのパス", "青と赤がジャンプしてボールを打ち合い、緑と紫が跳びはねて応援する。"


def seesaw():
    D = 3.2
    sc = Scene(D)
    sc.raw(f'<path d="M266 {G}L280 78L294 {G}Z" fill="#8A8F9E" stroke="#6B7080" stroke-width="1.5" stroke-linejoin="round"/>')
    for cid, name, x0, d in (("sg", "green", 92, 0), ("sp", "purple", 468, -.4)):
        sc.add(actor(cid, name, steps(0, 100, 0, 0, 4, 8, 0, .1), D, (("happy", ""),), x0=x0, delay=d))
    riders = []
    for cid, name, x, low in (("rb", "blue", 196, 0), ("rr", "red", 364, 50)):
        # 自分の側が下がりきったら、ぽんと跳ねる
        ks = [key((low + 0) % 100, 0, 0, 0, 1.1, .88, OUT_), key((low + 12) % 100, 0, -16, 0, .94, 1.08, IN),
              key((low + 24) % 100, 0, 0, 0, 1.04, .96), key((low + 50) % 100, 0)]
        svg, css = actor(cid, name, ks, D, (("happy", ""),), x0=0, shadow=False)
        riders.append(f'<g transform="translate({x} {75 - G})">{svg}</g>')
        sc.css += css
    sc.raw(f'<g class="saw"><rect x="176" y="75" width="208" height="6" rx="3" fill="{WOOD}" stroke="#A36D38" stroke-width="1"/>'
           f'<g class="unsaw-l">{riders[0]}</g><g class="unsaw-r">{riders[1]}</g></g>',
           kf("k-saw", [(0, "rotate(-8.5deg)", IO), (50, "rotate(8.5deg)", IO), (100, "rotate(-8.5deg)")])
           + ".saw{animation:k-saw 3.2s linear infinite;transform-box:view-box;transform-origin:280px 78px}"
           + kf("k-uns", [(0, "rotate(8.5deg)", IO), (50, "rotate(-8.5deg)", IO), (100, "rotate(8.5deg)")])
           + ".unsaw-l,.unsaw-r{animation:k-uns 3.2s linear infinite;transform-box:fill-box;transform-origin:50% 100%}")
    return sc, "シーソー", "青と赤がギッタンバッコン。下がった側でぽんと跳ね、まわりで緑と紫がはしゃぐ。"


def tug():
    D = 7
    sc = Scene(D)
    sway = [(0, 0), (8, -6), (14, 5), (22, -9), (28, 3), (36, -12), (42, -2), (50, -14), (56, -10), (62, -18)]
    team = []
    for cid, name, x0, side in (("ub", "blue", 176, -1), ("ug", "green", 214, -1), ("up", "purple", 346, 1), ("ur", "red", 384, 1)):
        lean = 16 * side
        ks = [key(p, x, 0, lean + (2 if i % 2 else -2) * side, 1.03, .97) for i, (p, x) in enumerate(sway)]
        if side < 0:  # 勝って、しりもち
            ks += [key(64, -30, 0, -40, ease=IN), Key(68, -40, -HW, -90, 1, 1, OUT_), Key(70, -42, -HW, -86), Key(72, -41, -HW, -90)]
        else:  # 負けて、前のめりに飛び込む
            ks += [key(64, -24, -6, -20, ease=IO), key(66, -46, -16, -60, ease=IN), Key(70, -66, -HW, -90, 1, 1, OUT_),
                   Key(72, -64, -HW, -86), Key(74, -65, -HW, -90)]
        last = ks[-1]
        ks += [Key(88, last.x, -HW, -90, 1, 1, IN), key(92, last.x / 2, -10, 0, .95, 1.06, IN), key(95, 0, 0, lean, 1.06, .94), key(100, 0, 0, lean, 1.03, .97)]
        faces = (("strain", f"{cid}-n"), ("happy" if side < 0 else "dizzy", f"{cid}-a"))
        team.append((cid, name, ks, faces, x0))
        sc.raw(css=show(f"{cid}-n", D, [(0, 66), (92, 100)]) + show(f"{cid}-a", D, [(66, 92)]))
    rope_ = [(p, f"translateX({x}px)", IO) for p, x in sway] + [(64, "translateX(-30px)", IN), (70, "translateX(-46px)"),
                                                                 (88, "translateX(-46px)", IO), (95, "translateX(0px)"), (100, "translateX(0px)")]
    sc.raw(f'<g class="ropex"><path d="M150 {G - 22}H410" stroke="{WOOD}" stroke-width="3.2" stroke-linecap="round"/>'
           f'<path d="M275 {G - 22}h10l-5 11z" fill="#FF3B3B"/></g>',
           kf("k-ropex", rope_) + ".ropex{animation:k-ropex 7s linear infinite}")
    for cid, name, ks, faces, x0 in team:
        sc.add(actor(cid, name, ks, D, faces, x0=x0))
    sc.add(dust(330, G, "tg-dust", D, 69))
    sc.raw(sweat(376, G - 50, "tg-sw") + sweat(414, G - 48, "tg-sw2"), show("tg-sw", D, [(20, 60)]) + show("tg-sw2", D, [(30, 62)]))
    return sc, "綱引き", "踏んばって引っぱり合い、勢いあまって全員そろってひっくり返る。"


def nap():
    D = 9
    sc = Scene(D)
    p = [Key(0, 0, -HW, -90), Key(50, 0, -HW, -90, 1, 1, OUT_), key(52, 0, -30, 0, .9, 1.14, IN), key(55, 0, 0, 0, 1.14, .86, OUT_),
         key(57, 0, 0, 0), key(70, 0, 0, 0), key(73, 0, 0, 0, 1.04, 1.06), key(76, 0, 0, 0, 1, 1, IN), Key(80, 0, -HW, -90, 1, 1), Key(100, 0, -HW, -90)]
    sc.add(actor("np", "purple", p, D, (("sleep", "np-s"), ("surprised", "np-w"), ("sleep", "np-y")), x0=380))
    sc.raw(css=show("np-s", D, [(0, 50), (80, 100)]) + show("np-w", D, [(50, 70)]) + show("np-y", D, [(70, 80)]))
    b = [key(0, 60)] + steps(4, 44, 60, 304, 8, 9, -6, .06)
    b += [key(46, 306, 0, 18, 1.02, .98, IN), key(48, 310, 0, 24), key(50, 306, 0, 0, 1.08, .92, OUT_), key(52, 296, -14, -12, .92, 1.1, IN),
          key(55, 286, 0, -8, 1.1, .9, OUT_)]
    b += steps(56, 72, 286, -70, 6, 7, -12, .1) + [key(84, -70)] + steps(84, 100, -70, 60, 5, 5, 6, .08)
    sc.add(actor("nb", "blue", b, D, (("normal", "nb-n"), ("surprised", "nb-s"))))
    sc.raw(css=show("nb-n", D, [(0, 50), (74, 100)]) + show("nb-s", D, [(50, 74)]))
    sc.raw(mark(380, 34, "！", "np-x", 26) + "".join(sweat(300 - k * 40, 44, f"nsw{k}") for k in range(3)),
           pop("np-x", D, 50, 64) + "".join(show(f"nsw{k}", D, [(56 + k * 4, 62 + k * 4)]) for k in range(3)))
    for i in range(3):
        c = f"z{i}"
        sc.raw(f'<g class="np-zz"><g class="{c}">{art.text(392, 70, "Z", 12 + i * 2, "#7C8BFF", cls="rnd", weight=800)}</g></g>',
               kf(f"k-{c}", [(0, "translate(0px,0px) scale(.6)"), (100, "translate(16px,-30px) scale(1.25)")])
               + kf(f"k-{c}o", [(0, 0), (25, 1), (100, 0)], "opacity")
               + f".{c}{{animation:k-{c} 2.1s ease-out {-i * .7:.2f}s infinite,k-{c}o 2.1s ease-out {-i * .7:.2f}s infinite;"
                 "transform-box:fill-box;transform-origin:50% 50%}")
    sc.raw(css=show("np-zz", D, [(0, 48), (82, 100)]))
    sc.raw(bubble(380, 44, "ふわぁ…", "np-yawn", 13), pop("np-yawn", D, 70, 79))
    return sc, "おひるね", "眠る紫に青が忍び足で近づいてつつくと、紫が飛び起きて青は大あわてで逃げる。紫はあくびをして、また眠る。"


SCENES = [daruma, chase, train, rope, domino, hide, volley, seesaw, tug, nap]


# ---------- 帯 ----------
# 場面は帯の中央の舞台に置き、両端に向かって溶けるように消える。帯の色は半透明なので、
# ライト・ダークのどちらの背景にもなじむ。幅の広い版（README本文用）と狭い版（スマホ用）を作る。
BH = 120  # 帯の高さ
SPARK = "M0-7Q1-1 7 0Q1 1 0 7Q-1 1-7 0Q-1-1 0-7Z"
BAND_CSS = ("@keyframes tw{0%,100%{transform:scale(.35);opacity:.25}50%{transform:scale(1);opacity:1}}"
            ".tw{animation:tw 2.6s ease-in-out infinite;transform-box:fill-box;transform-origin:50% 50%}")


def halftone(x0, y0, cols, rows, gap, color, flip=False):
    """網点。内側（場面の側）へ向かって小さくなる。"""
    out = []
    for j in range(rows):
        for i in range(cols):
            t = i / max(cols - 1, 1)
            r = 3.1 * (1 - t) + .5
            x = x0 - i * gap if flip else x0 + i * gap
            out.append(f'<circle cx="{x:.1f}" cy="{y0 + j * gap:.1f}" r="{r:.2f}" fill="{color}"/>')
    return f'<g opacity=".38">{"".join(out)}</g>'


def band(sc, accent, wide=True):
    bw = 960 if wide else 600
    ox = (bw - W) / 2
    y0, y1 = 12, BH - 12
    a = art.CHARS[accent]["body"]
    defs = (f'<linearGradient id="bandfill" x1="0" y1="0" x2="{bw}" y2="0" gradientUnits="userSpaceOnUse">'
            '<stop offset="0" stop-color="#C03BFF" stop-opacity="0"/><stop offset=".2" stop-color="#C03BFF" stop-opacity=".11"/>'
            '<stop offset=".5" stop-color="#6F86FF" stop-opacity=".13"/><stop offset=".8" stop-color="#22C4FA" stop-opacity=".11"/>'
            '<stop offset="1" stop-color="#22C4FA" stop-opacity="0"/></linearGradient>'
            f'<linearGradient id="bandline" x1="0" y1="0" x2="{bw}" y2="0" gradientUnits="userSpaceOnUse">'
            '<stop offset="0" stop-color="#C03BFF" stop-opacity="0"/><stop offset=".22" stop-color="#C03BFF" stop-opacity=".55"/>'
            '<stop offset=".5" stop-color="#6F86FF" stop-opacity=".6"/><stop offset=".78" stop-color="#22C4FA" stop-opacity=".55"/>'
            '<stop offset="1" stop-color="#22C4FA" stop-opacity="0"/></linearGradient>'
            f'<linearGradient id="stagefade" x1="{ox - 6}" y1="0" x2="{ox + W + 6}" y2="0" gradientUnits="userSpaceOnUse">'
            '<stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".09" stop-color="#fff"/>'
            '<stop offset=".91" stop-color="#fff"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>'
            f'<mask id="stage" maskUnits="userSpaceOnUse" x="0" y="0" width="{bw}" height="{BH}">'
            f'<rect width="{bw}" height="{BH}" fill="url(#stagefade)"/></mask>')
    deco = [f'<defs>{defs}</defs>',
            f'<rect x="0" y="{y0}" width="{bw}" height="{y1 - y0}" fill="url(#bandfill)"/>',
            f'<path d="M0 {y0 + 5}H{bw}M0 {y1 - 5}H{bw}" stroke="url(#bandline)" stroke-width="1.6" '
            'stroke-dasharray="7 6" stroke-linecap="round" fill="none"/>']
    if wide:
        deco += [halftone(26, y0 + 20, 9, 5, 13, a), halftone(bw - 26, y0 + 20, 9, 5, 13, "#22C4FA", flip=True)]
        sparks = [(150, 34, GOLD, 0), (118, 82, a, -.9), (812, 30, GOLD, -1.6), (846, 80, a, -.4), (178, 62, "#22C4FA", -2)]
    else:
        deco += [halftone(14, y0 + 22, 4, 5, 11, a), halftone(bw - 14, y0 + 22, 4, 5, 11, "#22C4FA", flip=True)]
        sparks = [(64, 30, GOLD, 0), (538, 32, GOLD, -1.3)]
    # 位置は外側の g に持たせる（アニメーションの transform が位置を上書きしないように）
    deco += [f'<g transform="translate({x} {y})"><path class="tw" style="animation-delay:{d}s" d="{SPARK}" fill="{c}"/></g>'
             for x, y, c, d in sparks]
    # 足もと（場面の G）が帯の下の縫い目に乗るように置く
    stage = (f'<g mask="url(#stage)"><svg x="{ox}" y="{y1 - 5 - G}" width="{W}" height="{H}" '
             f'viewBox="0 0 {W} {H}" overflow="visible">{"".join(sc.svg)}</svg></g>')
    return bw, "".join(deco) + stage


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    rows = []
    global BUBBLE
    for i, make in enumerate(SCENES, 1):
        accent = art.ORDER[(i - 1) % 4]
        base = f"scene-{i:02d}-{make.__name__}"
        for suffix, wide in (("", True), ("-narrow", False)):
            BUBBLE = 1.0 if wide else 1.7
            sc, title, desc = make()
            bw, body = band(sc, accent, wide)
            svg = art.svg(bw, BH, body, T, f"{title}：{desc}", COMMON + BAND_CSS + "".join(sc.css))
            (OUT / f"{base}{suffix}.svg").write_text(svg + "\n", encoding="utf-8", newline="\n")
        rows.append((i, title, desc, base, sc.dur))
    lines = ["# キャラクターのアニメーション", "",
             "製品READMEの各項目の終わりに区切りの帯として1つずつ置いている、4色のキャラクターが遊ぶ小さなアニメーションです。"
             "帯の色は半透明で、ライト・ダークのどちらの背景にもなじみます。幅700px以下の画面では `-narrow` の版を使います。"
             "OSで視差効果を減らす設定にしている閲覧者には、動きが止まります。", "",
             "生成：`python scripts/readme/scenes.py`", ""]
    for i, title, desc, base, dur in rows:
        lines += [f"## {i}. {title}", "", f"{desc}（{dur:g}秒で1周）", "",
                  "<picture>", f'  <source media="(max-width: 700px)" srcset="{base}-narrow.svg">',
                  f'  <img src="{base}.svg" width="100%" alt="{title}：{desc}">', "</picture>", ""]
    (OUT / "README.md").write_text("\n".join(lines), encoding="utf-8", newline="\n")
    print(f"wrote {len(rows)} scenes to {OUT}")


if __name__ == "__main__":
    main()
