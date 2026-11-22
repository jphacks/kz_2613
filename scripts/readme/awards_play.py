"""READMEの受賞結果を、キャラクターが演じるカードにする案を生成する（比較用）。

止まっているあいだは、見出しが目次の見出しとまったく同じ形（見出し＋英字ラベル＋細い線＋4色の点）に見える。
少したつと4色の点がキャラクターに変わって飛び出し、カードの中の文字や線の上で劇を演じ、最後は元の点に戻る。
受賞の印は役割の4色とブランドのグラデーションで塗ったタイルにし、どのキャラクターがどの賞を受け取るかを色で示す。

    python scripts/readme/awards_play.py
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import build_art as art  # noqa: E402
import scenes  # noqa: E402
import vector  # noqa: E402
from scenes import IN, IO, OUT_  # noqa: E402

OUT = art.OUT / "awards-options"
PAD = 22  # 見出しの線の上にキャラクターが立てるよう、上に空ける
CH = 34  # キャラクターの高さ
K = CH / 149
HALF = 50 * K
MARK = "#FF8A00"

# ---------- 受賞 ----------
AWARDS = [
    dict(key="aud", group="hack", name="Hack Day Audience Award", icon="crowd", color="brand"),
    dict(key="fin", group="hack", name="Award Day Finalist", icon="flag", color="blue"),
    dict(key="sp", group="award", name="審査委員特別賞", icon="star", color="green"),
    dict(key="inn", group="award", name="Innovator認定", icon="bulb", color="purple"),
    dict(key="dmm", group="award", name="合同会社DMM.com賞", icon="trophy", color="red"),
]
ALT = ("JPHACKS 2026 受賞結果。Hack Day（金沢会場）：Hack Day Audience Award、Award Day Finalist。"
       "Award Day：審査委員特別賞、Innovator認定、合同会社DMM.com賞")
ICONS = {
    "crowd": '<circle cx="12" cy="8" r="3.2"/><path d="M6.2 19.5c0-3.6 2.6-6.2 5.8-6.2s5.8 2.6 5.8 6.2"/>'
             '<circle cx="4.8" cy="10.2" r="2.2"/><path d="M1.2 18.6c0-2.6 1.5-4.5 3.6-4.7"/>'
             '<circle cx="19.2" cy="10.2" r="2.2"/><path d="M22.8 18.6c0-2.6-1.5-4.5-3.6-4.7"/>',
    "flag": '<path d="M6 21V3.5"/><path d="M6 4.5h12l-2.6 4 2.6 4H6"/>',
    "star": '<path d="M12 3.2l2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.5l-5.2 2.8 1-5.8-4.3-4.1 5.9-.8z"/>',
    "bulb": '<path d="M9.2 18h5.6M10.2 21h3.6"/><path d="M12 3a6 6 0 0 0-3.6 10.8c.7.6 1.1 1.4 1.1 2.2v.2h5v-.2'
            'c0-.8.4-1.6 1.1-2.2A6 6 0 0 0 12 3z"/>',
    "trophy": '<path d="M7.5 3.8h9v5.7a4.5 4.5 0 0 1-9 0z"/><path d="M7.5 6H4.4c0 2.6 1.4 4.1 3.4 4.4M16.5 6h3.1'
              'c0 2.6-1.4 4.1-3.4 4.4"/><path d="M12 14.2v4M8.4 20.6h7.2"/>',
}


def icon(kind, cx, cy, size, color, sw=2.1):
    k = size / 24
    return (f'<g transform="translate({cx - size / 2:.2f} {cy - size / 2:.2f}) scale({k:.4f})" fill="none" '
            f'stroke="{color}" stroke-width="{sw}" stroke-linecap="round" stroke-linejoin="round">{ICONS[kind]}</g>')


def tile_color(a):
    return "url(#brand)" if a["color"] == "brand" else art.CHARS[a["color"]]["body"]


def tile(a, cx, cy, s=30):
    ink = "#103B10" if a["color"] == "green" else "#FFFFFF"
    return (f'<rect x="{cx - s / 2:.1f}" y="{cy - s / 2:.1f}" width="{s}" height="{s}" rx="{s * .28:.1f}" fill="{tile_color(a)}"/>'
            + icon(a["icon"], cx, cy, s * .62, ink))


def tw(s, size=16):
    """GitHub本体のフォントで描いた文字列の幅の見積もり。"""
    return sum(vector.width(c, size, "gh", 700) if c.isascii() else size for c in s)


# ---------- 時間軸 ----------
class Clock:
    def __init__(self, D):
        self.D = D

    def p(self, s):
        return round(max(0, min(100, s / self.D * 100)), 3)


def kf(name, frames, prop="transform"):
    return scenes.kf(name, frames, prop)


class Actor:
    """キャラクター1体。時刻は秒、位置は画像の中の絶対座標（x、足の高さ y）。最初は隠れている（大きさ0）。"""

    def __init__(self, ck, cid, name, x, y):
        self.ck, self.cid, self.name = ck, cid, name
        self.t, self.x, self.y = 0.0, x, y
        self.keys = {}
        self.faces = []  # (種類, [(始め秒, 終わり秒)])
        self.key(0, sx=0, sy=0)

    def key(self, t, x=None, y=None, r=0, sx=1, sy=1, ease=IO, xe=None):
        self.keys[round(t, 3)] = scenes.Key(self.ck.p(t), round(self.x if x is None else x, 1),
                                            round(self.y if y is None else y, 1), r, sx, sy, ease, xe)
        return self

    def put(self, t, **kw):
        self.key(t, **kw)
        self.t = t
        return self

    def wait(self, t):
        return self.put(t)

    def appear(self, t):
        """点からふくらんで出てくる。"""
        self.key(t, sx=0, sy=0, ease=OUT_)
        self.key(t + .18, sx=1.25, sy=.8)
        self.key(t + .32, sx=.9, sy=1.12)
        return self.put(t + .45)

    def vanish(self, t):
        """縮んで点に戻る。"""
        self.key(t, ease=IN)
        self.key(t + .14, sx=1.18, sy=.84, ease=IN)
        return self.put(t + .3, sx=0, sy=0)

    def walk(self, t1, x, step=11, h=3, lean=0):
        t0, x0, n = self.t, self.x, max(2, round(abs(x - self.x) / step))
        for i in range(n):
            a, m = t0 + (t1 - t0) * i / n, t0 + (t1 - t0) * (i + .5) / n
            self.key(a, x0 + (x - x0) * i / n, self.y, lean, 1.05, .94, OUT_, "linear")
            self.key(m, x0 + (x - x0) * (i + .5) / n, self.y - h, lean, .97, 1.05, IN, "linear")
        self.x = x
        return self.put(t1, r=0)

    def run(self, t1, x):
        return self.walk(t1, x, step=17, h=4, lean=9 if x > self.x else -9)

    def hop(self, t1, x, y, h=12):
        t0, x0, y0 = self.t, self.x, self.y
        d = t1 - t0
        self.key(t0 + d * .18, sx=1.14, sy=.84, ease=OUT_, xe="linear")
        top = min(y0, y) - h
        self.key(t0 + d * .55, (x0 + x) / 2, top, 0, .92, 1.1, IN, "linear")
        self.x, self.y = x, y
        self.key(t0 + d * .86, sx=1.16, sy=.82, ease=OUT_)
        return self.put(t1)

    def hops(self, t1, points, h=12):
        """points（(x, y) の列）を順に跳んでいく。"""
        d = (t1 - self.t) / len(points)
        for x, y in points:
            self.hop(self.t + d, x, y, h)
        return self

    def jump(self, t1, h=10):
        t0, d = self.t, t1 - self.t
        self.key(t0 + d * .2, sx=1.12, sy=.86, ease=OUT_)
        self.key(t0 + d * .55, y=self.y - h, sx=.94, sy=1.08, ease=IN)
        self.key(t0 + d * .85, sx=1.1, sy=.88, ease=OUT_)
        return self.put(t1)

    def lean(self, t1, r, sx=1, sy=1):
        return self.put(t1, r=r, sx=sx, sy=sy)

    def shake(self, t1, r=6, n=4, sx=1, sy=1):
        t0 = self.t
        for i in range(n):
            self.key(t0 + (t1 - t0) * (i + .5) / n, r=r if i % 2 else -r, sx=sx, sy=sy)
        return self.put(t1, sx=sx, sy=sy)

    def bow(self, t1, n=1):
        t0 = self.t
        for i in range(n):
            a = t0 + (t1 - t0) * i / n
            self.key(a + (t1 - t0) / n * .4, r=-26)
        return self.put(t1)

    def face(self, kind, t0, t1):
        self.faces.append((kind, [(t0, t1)]))
        return self

    # 描画
    def render(self, t):
        ck, cid = self.ck, self.cid
        D = ck.D
        keys = [self.keys[k] for k in sorted(self.keys)]
        if keys[-1].p < 100:
            k1 = keys[-1]
            keys.append(scenes.Key(100, k1.x, k1.y, k1.r, k1.sx, k1.sy, k1.ease, k1.xe))
        mx = [(k.p, f"translateX({k.x}px)", k.xe) for k in keys]
        my = [(k.p, f"translateY({k.y}px)", k.ease) for k in keys]
        ps = [(k.p, f"rotate({k.r}deg) scale({k.sx},{k.sy})", k.ease) for k in keys]
        run = f"{D}s linear infinite"
        css = [kf(f"x-{cid}", mx), kf(f"y-{cid}", my), kf(f"p-{cid}", ps),
               f".x-{cid}{{animation:x-{cid} {run}}}.y-{cid}{{animation:y-{cid} {run}}}"
               f".p-{cid}{{transform:scale(0);animation:p-{cid} {run};transform-box:fill-box;transform-origin:50% 100%}}"]
        # 顔：指定のない時間は、ふだんの顔
        spans = sorted((ck.p(a), ck.p(b), i) for i, (_, on) in enumerate(self.faces) for a, b in on)
        layers = []
        normal, cur = [], 0
        for a, b, _ in spans:
            if a > cur:
                normal.append((cur, a))
            cur = max(cur, b)
        if cur < 100:
            normal.append((cur, 100))
        layers.append((self.layer("normal"), f"{cid}-n", normal))
        for i, (kind, on) in enumerate(self.faces):
            layers.append((self.layer(kind), f"{cid}-f{i}", [(ck.p(a), ck.p(b)) for a, b in on]))
        faces = ""
        for svg, cls, on in layers:
            faces += f'<g class="{cls}">{svg}</g>'
            css.append(scenes.show(cls, D, on))
        body = (f'<g transform="translate({-50 * K:.2f} {-149 * K:.2f}) scale({K:.4f})">'
                f'<path d="{art.BODY}" fill="{art.CHARS[self.name]["body"]}" stroke="{t["outline"]}" stroke-width="2"/>'
                f'<rect x="14" y="16" width="72" height="117" rx="11" fill="{t["screen"]}"/>{faces}</g>')
        svg = f'<g class="actor"><g class="x-{cid}"><g class="y-{cid}"><g class="p-{cid}">{body}</g></g></g></g>'
        return svg, "".join(css)

    def layer(self, kind):
        if kind.startswith("icon:"):
            e = art.CHARS[self.name]["eye"]
            return f'<g filter="url(#glow)">{icon(kind[5:], 50, 76, 62, e, 2.3)}</g>'
        return scenes.layer(kind, self.name)


class Stage:
    """1枚の図。背景の部品（body）、キャラクター、小道具（吹き出し・記号）を集めてSVGにする。"""

    def __init__(self, W, H, D, t):
        self.W, self.H, self.t, self.ck = W, H, t, Clock(D)
        self.back, self.front, self.css, self.actors = [], [], [], []

    def actor(self, name, x, y):
        a = Actor(self.ck, f"{name[0]}{len(self.actors)}", name, x, y)
        self.actors.append(a)
        return a

    def anim(self, cls, frames, prop="transform", origin="50% 50%", base=None):
        """frames：(秒, 値[, 緩急])。0秒と終わりは最初・最後の値で補う。"""
        D = self.ck.D
        fr = sorted(frames, key=lambda f: f[0])
        out = [(0, fr[0][1])] + [(self.ck.p(f[0]), *f[1:]) for f in fr] + [(100, fr[-1][1])]
        rule = f"animation:k-{cls} {D}s linear infinite"
        if prop == "transform":
            rule += f";transform-box:fill-box;transform-origin:{origin}"
        if base is not None:
            rule += f";{prop}:{base}"
        self.css.append(kf(f"k-{cls}", out, prop) + f".{cls}{{{rule}}}")

    def pop(self, cls, a, b):
        """a〜b秒のあいだ、ふくらんで出てしぼんで消える。"""
        self.anim(cls, [(0, "scale(0)"), (a, "scale(0)", OUT_), (a + .25, "scale(1.15)", IO), (a + .4, "scale(1)"),
                        (b - .15, "scale(1)", IN), (b, "scale(0)")], origin="50% 100%", base="scale(0)")

    def mark(self, x, y, s, a, b, size=18, fill=MARK):
        cls = f"m{len(self.css)}"
        edge = f' stroke="{self.t["chip"] if self.t is art.THEMES["dark"] else "#FFFFFF"}" stroke-width="3.5" paint-order="stroke" stroke-linejoin="round"'
        self.front.append(f'<g class="{cls}">{art.text(x, y, s, size, fill, cls="rnd", weight=800, anchor="middle", extra=edge)}</g>')
        self.pop(cls, a, b)

    def say(self, x, y, s, a, b, size=13, dx=0):
        """吹き出し。(x, y) はしっぽの先。dx だけ吹き出しを横にずらす。"""
        cls = f"b{len(self.css)}"
        w = sum(size * (.62 if c.isascii() else 1.0) for c in s) + 18
        h = size + 11
        bx = min(max(x + dx, w / 2 + 2), self.W - w / 2 - 2)
        self.front.append(
            f'<g class="{cls}"><rect x="{bx - w / 2:.1f}" y="{y - h - 6}" width="{w:.1f}" height="{h}" rx="{h / 2}" '
            f'fill="#FFFFFF" stroke="#D5DAE3" stroke-width="1.5"/>'
            f'<path d="M{x - 4.5} {y - 7}L{x} {y}L{x + 4.5} {y - 7}" fill="#FFFFFF" stroke="#D5DAE3" stroke-width="1.5" stroke-linejoin="round"/>'
            f'<rect x="{x - 5.5}" y="{y - 9}" width="11" height="3" fill="#FFFFFF"/>'
            f'{art.text(bx, y - 6 - h / 2 + size * .36, s, size, "#2E2B48", cls="rnd", weight=800, anchor="middle")}</g>')
        self.pop(cls, a, b)

    def sparkle(self, cx, cy, a, r=16, n=6, color=scenes.GOLD):
        """a秒に、(cx, cy) から星が飛び散る。"""
        import math
        for i in range(n):
            ang = -math.pi / 2 + i * 2 * math.pi / n
            cls = f"s{len(self.css)}"
            dx, dy = math.cos(ang) * r, math.sin(ang) * r
            self.front.append(f'<g class="{cls}">{art.star(cx, cy, 4, color)}</g>')
            self.anim(cls, [(0, "translate(0px,0px) scale(0)"), (a, "translate(0px,0px) scale(0)", OUT_),
                            (a + .35, f"translate({dx:.1f}px,{dy:.1f}px) scale(1)", IN),
                            (a + .7, f"translate({dx * 1.3:.1f}px,{dy * 1.3:.1f}px) scale(0)")], base="scale(0)")

    def pulse(self, cls, t0, k=1.25):
        """小道具が a秒にぽんと弾む。"""
        return [(t0, "scale(1)", OUT_), (t0 + .15, f"scale({k})", IO), (t0 + .32, "scale(.94)"), (t0 + .45, "scale(1)")]

    def svg(self, title=ALT):
        acts, css = [], []
        for a in self.actors:
            s, c = a.render(self.t)
            acts.append(s)
            css.append(c)
        style = ("".join(self.css) + "".join(css)
                 + "@media (prefers-reduced-motion:reduce){*{animation:none!important}.actor,.fx{display:none}}")
        body = "".join(self.back) + "".join(acts) + "".join(self.front)
        return art.svg(self.W, self.H, body, self.t, title, scenes.COMMON + style)


# ---------- 見出し（目次と同じ形） ----------
def heading(st, W, ls, y0=PAD):
    """目次の見出し（build_art.section_head）と同じ形。4色の点は、キャラクターの出入りに合わせて動かせるよう別に描く。
    返り値：(線の始まり, 線の終わり, 線の上端の高さ, 点の中心の x の列, 点の中心の高さ)"""
    t = st.t
    jp, en = "受賞結果", "JPHACKS 2026"
    ex = 24 * len(jp) + 12
    st.back += [f'<g transform="translate(0 {y0})">',
                art.text(0, 31, jp, 24, t["ink"], cls="gh", weight=700),
                art.text(ex, 30, en, 13, t["muted"], cls="gh", weight=600, extra=f' letter-spacing="{ls}"')]
    x0, x1 = ex + round(len(en) * 8.06 + (len(en) - 1) * ls) + 20, W - 67
    st.back.append(f'<rect x="{x0}" y="24.5" width="{x1 - x0}" height="1.5" rx=".75" fill="{t["line"]}"/></g>')
    xs = [x1 + 10 + i * 13 for i in range(4)]
    return x0, x1, y0 + 24.5, xs, y0 + 25.25


def dots(st, xs, cy, out_at, back_at):
    """4色の点。out_at[i] 秒にはじけてキャラクターになり、back_at[i] 秒に戻る。out_at に入っていない点は動かない。"""
    for i, n in enumerate(art.ORDER):
        cls = f"dot{i}"
        st.back.append(f'<circle class="{cls}" cx="{xs[i]}" cy="{cy}" r="4" fill="{art.CHARS[n]["body"]}"/>')
        if i >= len(out_at):
            continue
        a, b = out_at[i], back_at[i]
        st.anim(cls, [(a, "scale(1)", OUT_), (a + .12, "scale(1.6)", IN), (a + .22, "scale(0)"),
                      (b + .15, "scale(0)", OUT_), (b + .32, "scale(1.5)", IO), (b + .48, "scale(1)")])


def row(st, a, x, cy, size=16):
    """受賞1件の行：タイル＋賞の名前。名前の右端の x を返す。"""
    st.back.append(f'<g class="tile-{a["key"]}">{tile(a, x + 15, cy)}</g>')
    st.back.append(art.text(x + 44, cy + 5.5, a["name"], size, st.t["ink"], cls="gh", weight=700))
    return x + 44 + tw(a["name"], size)


def label(st, x, y, en, sub=None, sub_x=None):
    """組の見出し（英字ラベル）。sub_x を省くと、会場名をラベルのすぐ右に置く。"""
    t = st.t
    st.back.append(art.text(x, y, en, 13, t["muted"], cls="gh", weight=700, extra=' letter-spacing="3"'))
    if sub and sub_x is None:
        st.back.append(art.text(x + len(en) * 8.06 + (len(en) - 1) * 3 + 14, y, sub, 13, t["muted"], cls="gh", weight=600))
    elif sub:
        st.back.append(art.text(sub_x, y, sub, 13, t["muted"], cls="gh", weight=600, anchor="end"))


def card(st, x, y, w, h):
    st.back.append(f'<rect x="{x + .75}" y="{y + .75}" width="{w - 1.5}" height="{h - 1.5}" rx="14" fill="none" '
                   f'stroke="{st.t["line"]}" stroke-width="1.5"/>')


def line(st, x0, x1, y):
    st.back.append(f'<rect x="{x0}" y="{y}" width="{x1 - x0}" height="1" fill="{st.t["line"]}"/>')


OPTIONS = {}


def option(key, title, story):
    def deco(f):
        OPTIONS[key] = (title, story, f)
        return f
    return deco
# ---------- 物語 ----------
# 事実に沿った筋：私たちは3人のチーム。Hack Day（金沢）で観客賞＝Hack Day の勝者になり、決勝進出＝Award Day への切符を
# 手にして、新幹線で東京へ行き、Award Day で3つの賞を受けた。
# 見出しの4色の点のうち、青・緑・紫の3つがチームのキャラクターになる。赤は点のまま見出しに残る。
# Hack Day の2つ（勝者・切符）はチームのものなのでグラデーション、Award Day の3つの賞は受け取るキャラクターの色にする。
# キャラクターの画面は、手にしたものを順に映す：王冠（勝者）→ 切符 → それぞれの賞。
# 決勝進出では、3人分の切符が1枚ずつ届き、灰色だった金沢→東京の路線が光って開通することで「資格を得た」ことを表す。
# 移動は、路線図の上を走る小さな新幹線。乗り込むと、窓が乗ったキャラクターの色で光る。
# セリフは使わず、「!」「♪」などの記号だけにする。
ICONS["crown"] = '<path d="M3.6 8.6l4.5 3.7L12 5.6l3.9 6.7 4.5-3.7-1.8 9.2H5.4z"/><path d="M5.6 20.6h12.8"/>'
ICONS["ticket"] = ('<path d="M3 6.6h18v3.1a2.3 2.3 0 0 0 0 4.6v3.1H3v-3.1a2.3 2.3 0 0 0 0-4.6z"/>'
                   '<path d="M14.6 7.8v1.4M14.6 11.3v1.4M14.6 14.8v1.4"/>')
COLORS = {"aud": ("crown", "brand"), "fin": ("ticket", "brand"), "sp": ("star", "green"), "inn": ("bulb", "purple"),
          "dmm": ("trophy", "blue")}
for _a in AWARDS:
    _a["icon"], _a["color"] = COLORS[_a["key"]]
TEAM = ["blue", "green", "purple"]  # 新幹線では青が先頭
MINE = {"green": "sp", "purple": "inn", "blue": "dmm"}
PAGE = {"light": "#FFFFFF", "dark": "#0D1117"}
WIN = {"purple": 12, "green": 26, "blue": 40}  # 新幹線の窓の位置（後ろの端から）
TRAIN_LEN = 74


def smooth(u):
    return u * u * (3 - 2 * u)


def mode_of(t):
    return "dark" if t is art.THEMES["dark"] else "light"


def grad(st, x0, y0, x1, y1):
    gid = f"g{len(st.back)}"
    st.back.append(f'<defs><linearGradient id="{gid}" gradientUnits="userSpaceOnUse" x1="{x0}" y1="{y0}" x2="{x1}" y2="{y1}">'
                   '<stop offset="0" stop-color="#C03BFF"/><stop offset=".55" stop-color="#6F86FF"/>'
                   '<stop offset="1" stop-color="#22C4FA"/></linearGradient></defs>')
    return f"url(#{gid})"


class Geo:
    def __init__(self, **kw):
        self.__dict__.update(kw)

    def top(self, cy):  # 文字の上（乗れる高さ）
        return cy + 5.5 - 12

    def feet(self, cy):  # 文字の横（基準線）
        return cy + 6.5


def fly(st, art_svg, t0, t1, p0, p1, peak=-30, n=10):
    """小道具（(0,0) を中心に描いたもの）を、t0〜t1秒に p0 から p1 へ放物線で飛ばす。飛んでいるあいだだけ見える。"""
    cls = f"fly{len(st.css)}"
    (x0, y0), (x1, y1) = p0, p1
    fr = [(t0 - .01, f"translate({x0}px,{y0}px) scale(0)"), (t0, f"translate({x0}px,{y0}px) scale(.4)")]
    for k in range(1, n + 1):
        u = k / n
        x, y = x0 + (x1 - x0) * u, y0 + (y1 - y0) * u + peak * 4 * u * (1 - u)
        s = .4 + .7 * min(1, u * 2.5) - .25 * max(0, u - .8) / .2
        fr.append((t0 + (t1 - t0) * u, f"translate({x:.1f}px,{y:.1f}px) scale({s:.2f}) rotate({-14 * (1 - u):.0f}deg)"))
    fr += [(t1 + .1, f"translate({x1}px,{y1}px) scale(0)")]
    st.front.append(f'<g class="fx"><g class="{cls}">{art_svg}</g></g>')
    st.anim(cls, fr, origin="50% 50%", base="scale(0)")


def ticket_art():
    """手に入れる切符（ブランドのグラデーション、白い星と切り取り線）。"""
    return ('<path d="M-15-9H15V-3.2A3.2 3.2 0 0 0 15 3.2V9H-15V3.2A3.2 3.2 0 0 0-15-3.2Z" fill="url(#brand)" '
            'stroke="#FFFFFF" stroke-width="1.2"/>' + art.star(-4, 0, 5, "#FFFFFF")
            + '<path d="M7-6.5v2.6M7-1.3v2.6M7 3.9v2.6" stroke="#FFFFFF" stroke-width="1.4" stroke-linecap="round"/>')


def train_icon(t):
    """路線図を走る小さな新幹線（縦向き、先頭は下）。3つの窓は、乗ったキャラクターの色で光る。"""
    dark = t is art.THEMES["dark"]
    body = "#E8EDF5" if dark else "#FFFFFF"
    edge = "#8A95A8" if dark else "#A9B3C3"
    out = (f'<path d="M-12 7Q-12 0-5 0H5Q12 0 12 7V50Q12 66 0 74Q-12 66-12 50Z" fill="{body}" stroke="{edge}" stroke-width="1.5"/>'
           '<rect x="7" y="4" width="3" height="52" rx="1.5" fill="url(#brand)"/>'
           '<path d="M-6 56H6L3 63H-3Z" fill="#1C2333"/>')
    for n, y in WIN.items():
        out += (f'<rect x="-6" y="{y - 4.5}" width="10" height="9" rx="3" fill="#1C2333"/>'
                f'<rect class="win-{n}" x="-6" y="{y - 4.5}" width="10" height="9" rx="3" fill="{art.CHARS[n]["body"]}"/>')
    return out


def setup(t, narrow, H, D):
    W = art.PHONE_W if narrow else art.PC_W
    st = Stage(W, H, D, t)
    x0, x1, ry, xs, dy = heading(st, W, 2 if narrow else 4)
    if x1 - x0 < 24:  # スマホでは線が短すぎて描かれない（目次の見出しと同じ）
        st.back[-1] = "</g>"
    return st, Geo(W=W, cw=W - 14, narrow=narrow, x0=x0, ry=ry, xs=xs, dy=dy, CT=78)


def rows(st, g, L, R):
    A = {a["key"]: a for a in AWARDS}
    g.e = {}
    for k, x, cy in (("aud", L, g.r1), ("fin", L, g.r2), ("sp", R, g.q1), ("inn", R, g.q2), ("dmm", R, g.q3)):
        g.e[k] = row(st, A[k], x, cy)
    g.L, g.R = L, R
    g.qy = {"sp": g.q1, "inn": g.q2, "dmm": g.q3}
    g.spots = {n: (g.e[k] + 20, g.feet(g.qy[k])) for n, k in MINE.items()}
    g.tiles = {"aud": (L + 15, g.r1), "fin": (L + 15, g.r2), "sp": (R + 15, g.q1), "inn": (R + 15, g.q2),
               "dmm": (R + 15, g.q3)}


def station(st, x, y, color, cls=""):
    c = f' class="{cls}"' if cls else ""
    st.back.append(f'<circle{c} cx="{x}" cy="{y}" r="6.5" fill="{PAGE[mode_of(st.t)]}" stroke="{color}" stroke-width="3"/>')


def lock(st, shape, ring, t_on, u0, u1, horizontal):
    """路線の「未開通」：灰色の線（と東京駅の灰色の輪）を重ね、u0〜u1秒に金沢側から消して、路線を開通させる。"""
    gray = st.t["line"]
    st.front.insert(0, f'<g class="fx"><g class="lockO"><g class="lockS">{shape(gray)}</g></g>'
                       f'<g class="lockT">{ring(gray)}</g></g>')
    st.anim("lockO", [(t_on, 0), (t_on + .4, 1), (u1, 1), (u1 + .01, 0)], prop="opacity", base="0")
    st.anim("lockT", [(t_on, 0), (t_on + .4, 1), (u1 - .1, 1), (u1 + .25, 0)], prop="opacity", base="0")
    st.anim("lockS", [(u0, "scale(1,1)", IO), (u1, "scale(0,1)" if horizontal else "scale(1,0)"), (u1 + .02, "scale(1,1)")],
            origin="100% 50%" if horizontal else "50% 100%")


def hackday_and_ticket(st, g, c, hit, tb):
    """Hack Day の勝者：王冠のタイルが光り、3体の画面に王冠が映る。
    決勝進出：タイルが大きく光り、3人分の切符が1枚ずつ飛んできて、それぞれの画面の王冠が切符に変わる。
    返り値：切符を掲げ終わる時刻と、各キャラクターが切符を受け取った時刻。"""
    st.anim("tile-aud", st.pulse("tile-aud", hit, 1.4))
    st.sparkle(*g.tiles["aud"], hit + .02, 22, 8)
    got = {}
    for i, n in enumerate(TEAM):
        c[n].wait(hit + .05 + i * .06).jump(hit + .6 + i * .06, 10).jump(hit + 1.25 + i * .06, 12)
    st.mark(g.aud[1], g.top(g.r1) - CH - 6, "♪", hit + .2, hit + 1.6)
    c["blue"].wait(tb).hop(tb + .5, g.e["fin"] + 20, g.feet(g.r2), 10)
    st.anim("tile-fin", [(tb + .55, "scale(1)", OUT_), (tb + .75, "scale(1.5)", IO), (tb + 1.0, "scale(1.3)"),
                         (tb + 2.2, "scale(1.3)", IO), (tb + 2.45, "scale(1)")])
    st.sparkle(*g.tiles["fin"], tb + .6, 22, 8)
    for k, n in enumerate(TEAM):
        a = c[n]
        t0 = tb + .9 + k * .4
        fly(st, ticket_art(), t0, t0 + .6, g.tiles["fin"], (a.x, a.y - CH * .62), peak=-36)
        got[n] = t0 + .6
        c[n].face("icon:crown", hit + .05, got[n])
        a.wait(t0 + .55).put(t0 + .67, sx=1.15, sy=.85).jump(t0 + 1.15, 12)
        st.sparkle(a.x, a.y - CH * .62, t0 + .6, 14, 5, art.CHARS[n]["body"])
    tj = tb + .9 + 2 * .4 + 1.3
    for n in TEAM:
        c[n].wait(tj).jump(tj + .55, 14)
    st.mark(g.e["fin"] + 46, g.feet(g.r2) - CH - 6, "!", tj, tj + .9, 20, "#22C4FA")
    return tj + .55, got


TENSE = 1.3  # 発表直前のドキドキの分だけ、受賞以降を後ろへずらす


def award_part(st, g, c, T, arrive, got, outs):
    """Award Day：3体がそれぞれの賞の横へ行き、発表を待ってドキドキする（冷や汗で震え、3つのタイルが順に点滅する）。
    1つずつ発表され、受け取ると画面にその賞が映る。画面は、新幹線を降りたらふつうの顔に戻っている。"""
    A = {a["key"]: a for a in AWARDS}
    for n, (a, b, pts) in arrive.items():
        c[n].wait(a).hops(b, pts, h=12)
        c[n].face("icon:ticket", got[n], outs[n])
    R0 = T + 1.3
    times = {"green": R0 + 1.9, "purple": R0 + 2.6, "blue": R0 + 3.3}
    # ドキドキ：小刻みに震え、冷や汗。タイルは発表の順に2周点滅する
    for k, n in enumerate(TEAM):
        a = c[n]
        a.face("worried", R0, times[n])
        a.wait(R0 + k * .05).shake(R0 + 1.7, 3.5, 12, 1.03, .97)
        a.put(R0 + 1.75)
        x, y = a.x, a.y
        cls = f"sw-{n}"
        st.front.append(f'<g class="fx"><g class="{cls}">{scenes.sweat(x + 11, y - CH + 4, "")}</g></g>')
        st.anim(cls, [(R0 + .2, 0), (R0 + .3, 1), (times[n] - .05, 1), (times[n] + .05, 0)], prop="opacity", base="0")
    order = ["sp", "inn", "dmm"]
    flick = {k: [] for k in order}
    for j in range(6):
        t0 = R0 + .15 + j * .24
        flick[order[j % 3]] += [(t0, "scale(1)", OUT_), (t0 + .1, "scale(1.18)", IN), (t0 + .22, "scale(1)")]
    for n, at in times.items():
        key = MINE[n]
        frames = flick[key] + [(at, "scale(1)", OUT_), (at + .15, "scale(1.4)", IO), (at + .32, "scale(.94)"),
                               (at + .45, "scale(1)")]
        st.anim(f"tile-{key}", frames)
        st.sparkle(*g.tiles[key], at + .05, 18, 6, art.CHARS[n]["body"])
        c[n].face("icon:" + A[key]["icon"], at + .1, T + 6.2 + TENSE)
        c[n].wait(at).jump(at + .55, 12)
    for i, n in enumerate(TEAM):
        c[n].wait(T + 4.4 + TENSE + i * .08).jump(T + 4.95 + TENSE + i * .08, 10).jump(T + 5.55 + TENSE + i * .08, 13)
    sx, sy = g.spots["purple"]
    st.mark(sx + 34, sy - CH - 10, "♪", T + 4.5 + TENSE, T + 5.9 + TENSE)


def finish(st, g, c, T, back):
    """見出しへ戻って並び、そろって跳ねてから、1体ずつ点に戻る。赤の点は最後まで動かない。"""
    for i, n in enumerate(TEAM):
        c[n].wait(T + 6.4 + i * .3).hops(T + 8.4 + i * .3, back[n], h=16)
    tj = T + 9.4
    for n in TEAM:
        c[n].wait(tj).jump(tj + .55, 12)
    back_at = [tj + 1.0 + i * .4 for i in range(3)]
    for i, n in enumerate(TEAM):
        c[n].wait(back_at[i]).vanish(back_at[i])
    dots(st, g.xs, g.dy, [3.5 + i * .14 for i in range(3)], back_at)
    return back_at[-1] + 1.1


def make_team(st, g):
    c = {n: st.actor(n, g.xs[i], g.ry) for i, n in enumerate(TEAM)}
    for i, n in enumerate(TEAM):
        c[n].appear(3.5 + i * .14)
    return c


def ride(st, g, c, board, pos, t_in, t_out, layer, get_win_pos):
    """新幹線に乗る：窓の位置へ跳び込んで消え、窓がその色で光る。t_out に窓から飛び出す。
    pos(s)：その時刻の新幹線の位置。get_win_pos(n, s)：その時刻の窓の位置 (x, y)。返り値：各キャラクターが降りた時刻。"""
    outs = {}
    for k, n in enumerate(TEAM):
        a, b = c[n], board[n]
        x, y = get_win_pos(n, b + .45)
        a.wait(b).hop(b + .45, x, y, 14)
        a.key(b + .55, sx=0, sy=0, ease=IN).put(b + .56, sx=0, sy=0)
        out = t_out + k * .22
        st.anim(f"win-{n}", [(b + .5, 0), (b + .6, 1), (out + .05, 1), (out + .15, 0)], prop="opacity", base="0")
        x, y = get_win_pos(n, out)
        a.key(out - .01, x, y, 0, 0, 0)
        a.x, a.y, a.t = x, y, out - .01
        a.key(out, sx=0, sy=0, ease=OUT_).key(out + .15, sx=1.2, sy=.85).put(out + .3)
        outs[n] = out
    return outs


SCENE = 3.3  # プレゼンと展示の場面の長さ（秒）


def booth_art(st, bx, fy):
    """プレゼンの画面（スライドが2枚切り替わる）と、展示のブース（机とゲームを映したモニター）。"""
    t = st.t
    dark = t is art.THEMES["dark"]
    panel = "#1B1F2C" if dark else "#FFFFFF"
    edge = "#8A95A8" if dark else "#A9B3C3"
    soft = "#3A4255" if dark else "#D8DEE8"
    board = (f'<rect x="{bx - 1.5}" y="{fy - 9}" width="3" height="9" fill="{edge}"/>'
             f'<rect x="{bx - 9}" y="{fy - 2}" width="18" height="2" rx="1" fill="{edge}"/>'
             f'<rect x="{bx - 23}" y="{fy - 36}" width="46" height="28" rx="3.5" fill="{panel}" stroke="{edge}" stroke-width="1.5"/>'
             f'<g class="sl1"><rect x="{bx - 17}" y="{fy - 31}" width="22" height="3.5" rx="1.75" fill="url(#brand)"/>'
             f'<rect x="{bx - 17}" y="{fy - 24}" width="30" height="2.5" rx="1.25" fill="{soft}"/>'
             f'<rect x="{bx - 17}" y="{fy - 19}" width="24" height="2.5" rx="1.25" fill="{soft}"/></g>'
             f'<g class="sl2">' + "".join(
                 f'<rect class="bar{i}" x="{bx - 14 + i * 10}" y="{fy - 13 - h}" width="7" height="{h}" rx="1.5" '
                 f'fill="{art.CHARS[n]["body"]}"/>' for i, (n, h) in enumerate((("purple", 6), ("green", 10), ("blue", 15))))
             + f'<rect x="{bx - 17}" y="{fy - 13}" width="34" height="1.2" fill="{soft}"/></g>')
    booth = (f'<rect x="{bx - 26}" y="{fy - 15}" width="52" height="3.5" rx="1.75" fill="{edge}"/>'
             f'<rect x="{bx - 22}" y="{fy - 12}" width="3" height="12" fill="{edge}"/>'
             f'<rect x="{bx + 19}" y="{fy - 12}" width="3" height="12" fill="{edge}"/>'
             f'<rect x="{bx - 2}" y="{fy - 19}" width="4" height="4" fill="{edge}"/>'
             f'<rect x="{bx - 16}" y="{fy - 37}" width="32" height="19" rx="2.5" fill="#1C2333" stroke="{edge}" stroke-width="1.2"/>'
             f'<rect x="{bx - 13}" y="{fy - 24}" width="26" height="2" fill="url(#brand)"/>'
             f'<g class="hero"><rect x="{bx - 9}" y="{fy - 30}" width="4" height="6" rx="1" fill="#FF9F1C"/></g>')
    st.front.append(f'<g class="fx"><g class="board">{board}</g><g class="booth">{booth}</g></g>')


def scene(st, c, P0, bx, fy, spots):
    """東京で降りたあと、Award Day のプレゼンと展示をする（約3.3秒、セリフなし）。
    プレゼン：画面が立ち上がり、青が画面を指して説明する。スライドが棒グラフに変わると、緑と紫がうなずく。
    展示：画面がブースに変わり、緑と紫が遊んで見せ（モニターの中の主人公が跳ねる）、見に来た人の「!」が上がる。"""
    pop = lambda a, b: [(a, "scale(0)", OUT_), (a + .2, "scale(1.12)", IO), (a + .32, "scale(1)"),  # noqa: E731
                        (b - .15, "scale(1)", IN), (b, "scale(0)")]
    booth_art(st, bx, fy)
    E0 = P0 + 1.65
    st.anim("board", pop(P0, E0), origin="50% 100%", base="scale(0)")
    st.anim("booth", pop(E0, P0 + SCENE), origin="50% 100%", base="scale(0)")
    st.anim("sl1", [(P0, 1), (P0 + .8, 1), (P0 + .82, 0)], prop="opacity", base="1")
    st.anim("sl2", [(P0, 0), (P0 + .8, 0), (P0 + .82, 1)], prop="opacity", base="0")
    for i in range(3):
        st.anim(f"bar{i}", [(P0 + .82 + i * .1, "scale(1,0)", OUT_), (P0 + 1.1 + i * .1, "scale(1,1)")],
                origin="50% 100%", base="scale(1,0)")
    hero = []
    for k in range(3):
        a = E0 + .25 + k * .4
        hero += [(a, "translate(0px,0px)", OUT_), (a + .18, f"translate({3 + k * 4}px,-6px)", IN), (a + .36, f"translate({6 + k * 4}px,0px)")]
    hero.append((E0 + 1.6, "translate(0px,0px)"))
    st.anim("hero", hero)
    blue, green, purple = c["blue"], c["green"], c["purple"]
    blue.wait(P0 + .3).lean(P0 + .45, 14).lean(P0 + .7, 0).wait(P0 + .95).lean(P0 + 1.1, 14).lean(P0 + 1.35, 0)
    for n, d in (("green", 0), ("purple", .1)):
        c[n].wait(P0 + 1.15 + d).lean(P0 + 1.3 + d, 12).lean(P0 + 1.5 + d, 0)
    st.sparkle(bx, fy - 40, P0 + 1.35, 16, 5)
    for k, n in enumerate(("green", "purple")):
        a = c[n]
        for j in range(3):
            s0 = E0 + .2 + j * .42 + k * .21
            a.wait(s0).put(s0 + .1, sx=1.1, sy=.88).put(s0 + .2, y=a.y - 6).put(s0 + .32, y=a.y)
    blue.wait(E0 + .3).shake(E0 + 1.2, 8, 4)
    st.mark(bx + 30, fy - 34, "!", E0 + .5, E0 + 1.4, 18)
    st.mark(bx + 42, fy - 22, "!", E0 + .8, E0 + 1.5, 15)
    return P0 + SCENE + .1


@option("2", "路線図と新幹線",
        "カードを金沢と東京を結ぶ路線図にする。青・緑・紫の3体がチーム（赤は点のまま見出しに残る）。"
        "3体が観客賞の文字に乗ると王冠が光り、画面に王冠が映る（Hack Day の勝者）。決勝進出では、3人分の切符が1枚ずつ飛んできて"
        "画面の王冠が切符に変わり、灰色だった路線が金沢から東京まで光って開通する。3体は小さな新幹線に乗り込み"
        "（窓がそれぞれの色で光る）、路線を走って東京駅へ。それぞれの賞を受け取ると、画面の切符がその賞に変わる。"
        "最後は見出しへ戻って並び、そろって跳ねてから、1体ずつ点に戻る。")
def option_2(t, narrow=False):
    return route_narrow(t) if narrow else route_pc(t)


def route_pc(t):
    H = 78 + 206
    unlock0 = 13.6
    t_in, t_dep, t_arr = unlock0 + 1.0, unlock0 + 3.0, unlock0 + 5.2
    P0 = t_arr + 1.55
    TA = P0 + SCENE + .1
    D = round(TA + TENSE + 12.3, 2)
    st, g = setup(t, False, H, D)
    CT, cw = g.CT, g.cw
    card(st, 0, CT, cw, H - CT)
    RL = CT + 26
    L, R = 24, 452
    for x, name, en in ((L, "金沢", "HACK DAY"), (R, "東京", "AWARD DAY")):
        st.back.append(art.text(x, CT + 56, name, 16, t["ink"], cls="gh", weight=700))
        st.back.append(art.text(x + 44, CT + 55, en, 13, t["muted"], cls="gh", weight=700, extra=' letter-spacing="3"'))
    x1 = cw - 24
    st.back.append(f'<rect x="{L}" y="{RL - 1.5}" width="{x1 - L}" height="3" rx="1.5" fill="{grad(st, L, 0, x1, 0)}"/>')
    station(st, L + 8, RL, "#C03BFF")
    station(st, R + 8, RL, "#4F9CFC", "st-tokyo")
    st.back.append(f'<rect x="425" y="{CT + 44}" width="1" height="{H - CT - 66}" fill="{t["line"]}"/>')
    g.r1, g.r2 = CT + 92, CT + 136
    g.q1, g.q2, g.q3 = CT + 92, CT + 136, CT + 180
    rows(st, g, L, R)
    g.aud = [L + 28 + i * 44 for i in range(3)]
    rl = RL - 1.5
    lock(st, lambda c_: f'<rect x="{L}" y="{RL - 1.5}" width="{x1 - L}" height="3" rx="1.5" fill="{c_}"/>',
         lambda c_: f'<circle cx="{R + 8}" cy="{RL}" r="6.5" fill="{PAGE[mode_of(t)]}" stroke="{c_}" stroke-width="3"/>',
         3.7, unlock0, unlock0 + .9, True)
    st.anim("st-tokyo", [(unlock0 + .85, "scale(1)", OUT_), (unlock0 + 1.05, "scale(1.6)", IO), (unlock0 + 1.3, "scale(1)")])
    st.sparkle(R + 8, RL, unlock0 + .9, 18, 6, "#22C4FA")
    c = make_team(st, g)
    # 見出しの線の上を駆けて Hack Day へ。紫は止まりきれずに緑にぶつかる
    line_x = [g.x0 + 12 + i * 23 for i in range(3)]
    c["blue"].wait(4.5).run(5.9, line_x[0])
    c["green"].wait(4.6).run(6.0, line_x[1])
    c["purple"].wait(4.75).run(6.05, line_x[2] - 5).shake(6.35, 8, 2, 1.1, .88)
    c["green"].wait(6.05).lean(6.17, -12).lean(6.4, 0)
    st.mark(line_x[2] - 2, g.ry - CH - 4, "!", 6.05, 6.7)
    for i, n in enumerate(TEAM):
        c[n].wait(6.8 + i * .15).hops(7.9 + i * .15, [(line_x[i] - 40, rl), (g.aud[i], g.top(g.r1))], h=16)
    tj, got = hackday_and_ticket(st, g, c, 8.35, 10.3)
    # 新幹線：左から金沢駅に入り、3体が乗ると路線を走って東京駅へ。降ろしたあとは路線の先へ走り去る
    k = 1.3  # PCでは少し大きく描く
    Lt = TRAIN_LEN * k
    X0, X1, X2, X3 = -Lt - 10, L + 22, R + 22, x1 - Lt - 6
    t_leave = t_arr + 1.0

    def pos(s):
        if s <= t_in:
            return X0
        if s <= t_in + .8:
            u = (s - t_in) / .8
            return X0 + (X1 - X0) * (1 - (1 - u) ** 2)
        if s <= t_dep:
            return X1
        if s <= t_arr:
            return X1 + (X2 - X1) * smooth((s - t_dep) / (t_arr - t_dep))
        if s <= t_leave:
            return X2
        if s <= t_leave + .9:
            return X2 + (X3 - X2) * ((s - t_leave) / .9) ** 2
        return X3
    frames = [(s / 10, f"translate({pos(s / 10):.1f}px,0px)") for s in range(int(t_in * 10) - 1, int((t_leave + 1.0) * 10))]
    st.front.append(f'<g class="fx"><g class="trainO"><g class="train"><g transform="translate(0 {rl - 1}) rotate(-90) scale({k})">'
                    f'{train_icon(t)}</g></g></g></g>')
    st.anim("train", frames, base=f"translate({X0}px,0px)")
    st.anim("trainO", [(t_in, 0), (t_in + .3, 1), (t_leave + .5, 1), (t_leave + .9, 0)], prop="opacity", base="0")
    board = {"blue": t_in + 1.0, "green": t_in + 1.3, "purple": t_in + 1.6}
    outs = ride(st, g, c, board, pos, t_in, t_arr + .25, None,
         lambda n, s: (pos(s) + WIN[n] * k, rl))
    st.mark(X1 + Lt + 12, rl - 26, "♪", t_dep - .4, t_dep + .3)
    # 東京：Innovator認定の右の空いた所で、プレゼンと展示をする
    fy = g.feet(g.q2)
    bx = 772
    pos_s = {"blue": 718, "green": 686, "purple": 654}
    for k, n in enumerate(TEAM):
        out = t_arr + .25 + k * .22
        c[n].wait(out + .35).hops(P0 - .15 + k * .05 - .1, [(560 + k * 14, g.top(g.q1)), (pos_s[n], fy)], h=12)
    scene(st, c, P0, bx, fy, pos_s)
    sp, inn, dmm = g.spots["green"], g.spots["purple"], g.spots["blue"]
    arrive = {"blue": (TA, TA + .9, [dmm]),
              "green": (TA + .1, TA + .9, [sp]),
              "purple": (TA + .2, TA + .9, [inn])}
    award_part(st, g, c, TA, arrive, got, outs)
    back = {n: [(g.xs[i] - 70, rl), (g.xs[i], g.ry)] for i, n in enumerate(TEAM)}
    back["green"] = [(680, rl), (g.xs[1], g.ry)]
    back["purple"] = [(g.e["inn"] - 20, g.top(g.q1)), (700, rl), (g.xs[2], g.ry)]
    back["blue"] = [(g.e["dmm"] - 20, g.top(g.q2)), (660, g.top(g.q1)), (720, rl), (g.xs[0], g.ry)]
    end = finish(st, g, c, TA + TENSE, back)
    assert end <= D + .01, end
    return st.svg()


def route_narrow(t):
    unlock0 = 13.3
    t_in, t_dep, t_arr = unlock0 + 1.1, unlock0 + 3.1, unlock0 + 5.2
    P0 = t_arr + 1.3
    TA = P0 + SCENE + .1
    D = round(TA + TENSE + 12.3, 2)
    CT = 78
    LX = 24
    S1, S2 = CT + 30, CT + 196
    H = S2 + 164
    st, g = setup(t, True, H, D)
    cw = g.cw
    card(st, 0, CT, cw, H - CT)
    X0 = 44
    for y, name, en in ((S1, "金沢", "HACK DAY"), (S2, "東京", "AWARD DAY")):
        st.back.append(art.text(X0, y + 6, name, 16, t["ink"], cls="gh", weight=700))
        st.back.append(art.text(X0 + 44, y + 5, en, 13, t["muted"], cls="gh", weight=700, extra=' letter-spacing="3"'))
    y_last = H - 24
    st.back.append(f'<rect x="{LX - 1.5}" y="{S1}" width="3" height="{y_last - S1}" rx="1.5" fill="{grad(st, 0, S1, 0, y_last)}"/>')
    station(st, LX, S1, "#C03BFF")
    station(st, LX, S2, "#4F9CFC", "st-tokyo")
    g.r1, g.r2 = S1 + 44, S1 + 88
    g.q1, g.q2, g.q3 = S2 + 44, S2 + 88, S2 + 132
    rows(st, g, X0, X0)
    g.aud = [X0 + 52 + i * 38 for i in range(3)]
    lock(st, lambda c_: f'<rect x="{LX - 1.5}" y="{S1}" width="3" height="{y_last - S1}" rx="1.5" fill="{c_}"/>',
         lambda c_: f'<circle cx="{LX}" cy="{S2}" r="6.5" fill="{PAGE[mode_of(t)]}" stroke="{c_}" stroke-width="3"/>',
         3.7, unlock0, unlock0 + 1.0, False)
    st.anim("st-tokyo", [(unlock0 + .7, "scale(1)", OUT_), (unlock0 + .9, "scale(1.6)", IO), (unlock0 + 1.15, "scale(1)")])
    st.sparkle(LX, S2, unlock0 + .75, 18, 6, "#22C4FA")
    c = make_team(st, g)
    # 観客賞の文字の右端に跳び乗り、文字の上を歩いて並ぶ
    for i, n in enumerate(TEAM):
        c[n].wait(4.6 + i * .18).hop(5.4 + i * .18, 262 - i * 6, g.top(g.r1), 18).walk(7.0 + i * .22, g.aud[i])
    tj, got = hackday_and_ticket(st, g, c, 8.3, 10.2)
    # 新幹線：上から金沢駅に入り、3体が乗ると路線を下って東京駅へ。降ろしたあとは路線の先へ走り去る
    y_top = S1 + 8
    y_end = S2 - 50
    y_far = y_last - 74
    t_leave = t_arr + 1.0

    def pos(s):
        if s <= t_in:
            return y_top - 30
        if s <= t_in + .5:
            return y_top - 30 + 30 * (1 - (1 - (s - t_in) / .5) ** 2)
        if s <= t_dep:
            return y_top
        if s <= t_arr:
            return y_top + (y_end - y_top) * smooth((s - t_dep) / (t_arr - t_dep))
        if s <= t_leave:
            return y_end
        if s <= t_leave + 1.2:
            return y_end + (y_far - y_end) * ((s - t_leave) / 1.2) ** 2
        return y_far
    frames = [(s / 10, f"translate(0px,{pos(s / 10):.1f}px)") for s in range(int(t_in * 10) - 1, int((t_leave + 1.3) * 10))]
    st.front.append(f'<g class="fx"><g class="trainO"><g class="train"><g transform="translate({LX} 0)">{train_icon(t)}</g></g></g></g>')
    st.anim("train", frames, base=f"translate(0px,{y_top - 30}px)")
    st.anim("trainO", [(t_in, 0), (t_in + .4, 1), (t_leave + .8, 1), (t_leave + 1.25, 0)], prop="opacity", base="0")
    board = {"blue": t_in + .7, "green": t_in + 1.0, "purple": t_in + 1.3}
    outs = ride(st, g, c, board, pos, t_in, t_arr + .25, None, lambda n, s: (LX, pos(s) + WIN[n] + 12))
    # 東京：Innovator認定の文字の上に並び、その右の空いた所でプレゼンと展示をする
    fy = g.top(g.q2)
    bx = 262
    pos_s = {"blue": 186, "green": 156, "purple": 126}
    for k, n in enumerate(TEAM):
        out = t_arr + .25 + k * .22
        c[n].wait(out + .35).hops(P0 - .1, [(pos_s[n] - 20, g.top(g.q1)), (pos_s[n], fy)], h=12)
    scene(st, c, P0, bx, g.feet(g.q2), pos_s)
    sp, inn, dmm = g.spots["green"], g.spots["purple"], g.spots["blue"]
    arrive = {"blue": (TA, TA + 1.0, [dmm]),
              "green": (TA + .1, TA + .9, [sp]),
              "purple": (TA + .2, TA + .9, [inn])}
    award_part(st, g, c, TA, arrive, got, outs)
    back = {}
    for k, n in enumerate(TEAM):
        x = 240 + k * 20
        back[n] = [(x - 30, g.top(g.q1)), (x - 50, g.top(g.r2)), (x - 10, g.top(g.r1)), (g.xs[k], g.ry)]
    end = finish(st, g, c, TA + TENSE, back)
    assert end <= D + .01, end
    return st.svg()


def main():
    import xml.etree.ElementTree as ET
    OUT.mkdir(parents=True, exist_ok=True)
    only = sys.argv[1:]
    for key, (_, _, make) in OPTIONS.items():
        if only and key not in only:
            continue
        for mode, t in art.THEMES.items():
            for narrow in (False, True):
                svg = make(t, narrow)
                ET.fromstring(svg)
                name = f"awards-{key}{'-narrow' if narrow else ''}-{mode}.svg"
                (OUT / name).write_text(svg + "\n", encoding="utf-8", newline="\n")
    print("wrote", OUT)


if __name__ == "__main__":
    main()
