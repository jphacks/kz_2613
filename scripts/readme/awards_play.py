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
    """4色の点。out_at[i] 秒にはじけてキャラクターになり、back_at[i] 秒に戻る。"""
    for i, n in enumerate(art.ORDER):
        cls = f"dot{i}"
        st.back.append(f'<circle class="{cls}" cx="{xs[i]}" cy="{cy}" r="4" fill="{art.CHARS[n]["body"]}"/>')
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


# ---------- 物語の共通部分 ----------
# 事実に沿った筋：Hack Day（金沢）の勝者＝観客賞 → 決勝進出は Award Day への切符 → 新幹線で東京へ → Award Day で受賞。
# 赤はおっちょこちょい（作品名の見出しで「。」を蹴った赤と同じ役）。セリフは使わず、「!」「♪」「z」などの記号だけにする。
ICONS["crown"] = '<path d="M3.6 8.6l4.5 3.7L12 5.6l3.9 6.7 4.5-3.7-1.8 9.2H5.4z"/><path d="M5.6 20.6h12.8"/>'
ICONS["ticket"] = ('<path d="M3 6.6h18v3.1a2.3 2.3 0 0 0 0 4.6v3.1H3v-3.1a2.3 2.3 0 0 0 0-4.6z"/>'
                   '<path d="M14.6 7.8v1.4M14.6 11.3v1.4M14.6 14.8v1.4"/>')
AWARDS[0]["icon"] = "crown"
AWARDS[1]["icon"] = "ticket"
PAGE = {"light": "#FFFFFF", "dark": "#0D1117"}


def follow(a, t0, t1, fn, dx, step=.1):
    """t0〜t1秒のあいだ、fn(t)+dx の位置について動く（乗り物に乗っているとき）。"""
    n = max(1, round((t1 - t0) / step))
    for i in range(n + 1):
        t = t0 + (t1 - t0) * i / n
        a.key(t, fn(t) + dx, a.y, 0, 1, 1, "linear", "linear")
    a.x, a.t = fn(t1) + dx, t1
    return a


def grad(st, x0, x1):
    gid = f"g{len(st.back)}"
    st.back.append(f'<defs><linearGradient id="{gid}" gradientUnits="userSpaceOnUse" x1="{x0}" y1="0" x2="{x1}" y2="0">'
                   '<stop offset="0" stop-color="#C03BFF"/><stop offset=".55" stop-color="#6F86FF"/>'
                   '<stop offset="1" stop-color="#22C4FA"/></linearGradient></defs>')
    return f"url(#{gid})"


class Geo:
    """配置（座標）をまとめて持つ。"""

    def __init__(self, **kw):
        self.__dict__.update(kw)

    def top(self, cy):  # 文字の上（乗れる高さ）
        return cy + 5.5 - 12

    def feet(self, cy):  # 文字の横（基準線）
        return cy + 6.5


def setup(t, narrow, H, D):
    W = art.PHONE_W if narrow else art.PC_W
    st = Stage(W, H, D, t)
    x0, x1, ry, xs, dy = heading(st, W, 2 if narrow else 4)
    if x1 - x0 < 24:  # スマホでは線が短すぎて描かれない（目次の見出しと同じ）
        st.back[-1] = "</g>"
    return st, Geo(W=W, cw=W - 14, narrow=narrow, x0=x0, ry=ry, xs=xs, dy=dy, CT=78)


def awards_rows(st, g):
    A = {a["key"]: a for a in AWARDS}
    g.e = {}
    for k, x, cy in (("aud", g.L, g.r1), ("fin", g.L, g.r2), ("sp", g.R, g.q1), ("inn", g.R, g.q2), ("dmm", g.R, g.q3)):
        g.e[k] = row(st, A[k], x, cy)
    g.aud = [g.L + 28 + i * (36 if g.narrow else 40) for i in range(4)]
    g.fin = g.e["fin"] + 20
    g.spots = {"green": (g.e["sp"] + 20, g.feet(g.q1)), "purple": (g.e["inn"] + 20, g.feet(g.q2)),
               "red": (g.e["dmm"] + 20, g.feet(g.q3))}


def intro(st, c, g):
    """4色の点がキャラクターになり、Hack Day の観客賞の文字の上へ。PCは見出しの線の上を駆け、赤は止まりきれずにぶつかる。"""
    for i, n in enumerate(art.ORDER):
        c[n].appear(3.5 + i * .12)
    if g.narrow:
        for i, n in enumerate(art.ORDER):
            c[n].wait(4.6 + i * .15).hops(6.2 + i * .15, [(g.xs[i] - 20, g.hack_line), (g.aud[i], g.top(g.r1))], h=14)
        return 6.65
    line_x = [g.x0 + 12 + i * 23 for i in range(4)]
    for i, n in enumerate(art.ORDER[:3]):
        c[n].wait(4.5 + i * .08).run(5.9 + i * .1, line_x[i])
    c["red"].wait(4.75).run(6.0, line_x[3] - 5).shake(6.3, 8, 2, 1.1, .88)
    c["purple"].wait(6.0).lean(6.12, -14).lean(6.35, 0)
    c["green"].wait(6.08).lean(6.2, -10).lean(6.4, 0)
    st.mark(line_x[3] - 2, g.ry - CH - 4, "!", 6.0, 6.7)
    for i, n in enumerate(art.ORDER):
        c[n].wait(6.7 + i * .15).hops(7.8 + i * .15, [(line_x[i] - 30, g.hack_line), (g.aud[i], g.top(g.r1))], h=16)
    return 8.25


def hackday(st, c, g, t0, sleepy_until=None):
    """Hack Day の勝者（観客賞）。王冠のタイルが光り、みんなで跳ねて喜ぶ。そのあと青が Award Day への切符を受け取る。
    sleepy_until を渡すと、赤は喜び疲れて観客賞の文字の上で眠ってしまう。"""
    st.anim("tile-aud", st.pulse("tile-aud", t0, 1.35))
    st.sparkle(g.L + 15, g.r1, t0 + .05, 22, 8)
    for i, n in enumerate(art.ORDER):
        c[n].wait(t0 + .05 + i * .06).jump(t0 + .6 + i * .06, 10).jump(t0 + 1.25 + i * .06, 12)
        c[n].face("happy", t0, t0 + 1.8)
    st.mark(g.aud[1] + 20, g.top(g.r1) - CH - 6, "♪", t0 + .2, t0 + 1.6)
    # 切符：青が決勝進出の行へ跳び、画面に切符を映して掲げる
    tb = t0 + 1.8
    c["blue"].wait(tb).hop(tb + .5, g.fin, g.feet(g.r2), 10)
    st.anim("tile-fin", st.pulse("tile-fin", tb + .55, 1.35))
    st.sparkle(g.L + 15, g.r2, tb + .6, 18, 6, art.CHARS["blue"]["body"])
    c["blue"].jump(tb + 1.0, 9).shake(tb + 1.5, 9, 4)
    if sleepy_until:
        c["red"].face("sleep", t0 + 2.0, sleepy_until)
        st.mark(g.aud[3] + 16, g.top(g.r1) - CH + 2, "z", t0 + 2.3, sleepy_until - .1, 15, "#7FA8D9")
        st.mark(g.aud[3] + 25, g.top(g.r1) - CH - 9, "z", t0 + 2.7, sleepy_until - .1, 13, "#7FA8D9")
    return tb + .6  # 切符を受け取った時刻


def award_day(st, c, g, T, arrive, back):
    """Award Day：それぞれ自分の賞へ行き、受け取ると画面に賞が映る。喜んだあと見出しへ戻って点になる。
    arrive：名前 → (始め, 終わり, 経由点)。back：名前 → 見出しまでの経由点。返り値は1周の長さ。"""
    A = {a["key"]: a for a in AWARDS}
    for n, (a, b, pts) in arrive.items():
        c[n].wait(a).hops(b, pts, h=12)
    for n, key, at in (("green", "sp", T + 1.9), ("purple", "inn", T + 2.6), ("red", "dmm", T + 3.4)):
        st.anim(f"tile-{key}", st.pulse(f"tile-{key}", at, 1.35))
        cy = {"sp": g.q1, "inn": g.q2, "dmm": g.q3}[key]
        st.sparkle(g.R + 15, cy, at + .05, 18, 6, art.CHARS[n]["body"])
        c[n].face("icon:" + A[key]["icon"], at + .1, T + 6.0)
        c[n].wait(at).jump(at + .55, 10)
    c["red"].face("strain", T + 2.85, T + 3.4)
    c["red"].wait(T + 2.85).put(T + 3.35, sx=1.14, sy=.84)
    c["red"].jump(T + 4.0, 15)
    c["blue"].wait(T + 3.6).shake(T + 4.2, 10, 4)
    for i, n in enumerate(art.ORDER):
        c[n].wait(T + 4.4 + i * .07).jump(T + 4.95 + i * .07, 10).jump(T + 5.5 + i * .07, 12)
    st.mark(g.spots["purple"][0] + 34, g.spots["purple"][1] - CH - 10, "♪", T + 4.5, T + 5.8)
    for i, n in enumerate(art.ORDER):
        c[n].wait(T + 6.0 + i * .1).hops(T + 7.6 + i * .15, back[n], h=14)
    back_at = [T + 8.1 + i * .14 for i in range(4)]
    for i, n in enumerate(art.ORDER):
        c[n].wait(back_at[i]).vanish(back_at[i])
    dots(st, g.xs, g.dy, [3.5 + i * .12 for i in range(4)], back_at)
    return T + 9.0


def make_actors(st, g):
    return {n: st.actor(n, g.xs[i], g.ry) for i, n in enumerate(art.ORDER)}


def pc_back(g):
    """PC：Award Day の列から見出しの点へ戻る経由点。"""
    return {"blue": [(g.xs[0], g.ry)],
            "green": [(680, g.award_line), (g.xs[1], g.ry)],
            "purple": [(560, g.top(g.q1)), (720, g.award_line), (g.xs[2], g.ry)],
            "red": [(560, g.top(g.q2)), (700, g.award_line), (g.xs[3], g.ry)]}


def narrow_back(g, mid):
    """スマホ：下の段から、間の線（mid）と Hack Day の線を経て見出しの点へ戻る経由点。"""
    out = {}
    for i, n in enumerate(art.ORDER):
        pts = [] if n == "blue" else [(g.cw - 50 - i * 12, g.award_line)]
        out[n] = pts + [(g.cw - 44 - i * 12, mid), (g.xs[i] - 10, g.hack_line), (g.xs[i], g.ry)]
    return out


def columns(st, g, sub_l, sub_r):
    """PC：Hack Day と Award Day の2列の見出しと区切り。"""
    g.L, g.R = 24, 452
    label(st, g.L, g.CT + 30, "HACK DAY", sub_l, 398)
    line(st, g.L, 398, g.CT + 40)
    label(st, g.R, g.CT + 30, "AWARD DAY", sub_r, g.cw - 24)
    line(st, g.R, g.cw - 24, g.CT + 40)
    g.r1, g.r2 = g.CT + 70, g.CT + 114
    g.q1, g.q2, g.q3 = g.CT + 70, g.CT + 114, g.CT + 158
    g.hack_line = g.award_line = g.CT + 40


# ---------- 案1：新幹線 ----------
TRAIN_L, TRAIN_H = 150, 34


def shinkansen(st, t):
    """横から見た新幹線（進む向きは右）。窓は穴にして、乗ったキャラクターの顔が見えるようにする。"""
    L, Hh = TRAIN_L, TRAIN_H
    dark = t is art.THEMES["dark"]
    body = "#E8EDF5" if dark else "#FFFFFF"
    edge = "#8A95A8" if dark else "#A9B3C3"
    outer = (f"M8 0H{L - 54}C{L - 26} 0 {L - 6} 13 {L} {Hh - 7}Q{L + 1} {Hh} {L - 8} {Hh}H8Q0 {Hh} 0 {Hh - 8}V8Q0 0 8 0Z")
    holes = "".join(f"M{x + 4} 6h12a4 4 0 0 1 4 4v4a4 4 0 0 1-4 4h-12a4 4 0 0 1-4-4v-4a4 4 0 0 1 4-4z" for x in (16, 42, 68, 94))
    return (f'<path d="{outer}{holes}" fill="{body}" fill-rule="evenodd" stroke="{edge}" stroke-width="1.5"/>'
            f'<path d="M{L - 48} 7H{L - 30}L{L - 17} 17H{L - 48}Z" fill="#1C2333"/>'
            f'<rect x="3" y="{Hh - 12}" width="{L - 14}" height="3.5" rx="1.75" fill="url(#brand)"/>'
            f'<rect x="10" y="{Hh - 3}" width="{L - 30}" height="3" rx="1.5" fill="{edge}" opacity=".6"/>')


def rail(st, t, x0, x1, y, stations):
    fill = grad(st, x0, x1)
    sleepers = "".join(f'<rect x="{x}" y="{y + 3}" width="6" height="2" rx="1"/>' for x in range(int(x0) + 4, int(x1) - 6, 12))
    st.back.append(f'<g fill="{t["line"]}">{sleepers}</g><rect x="{x0}" y="{y - 1}" width="{x1 - x0}" height="2.5" rx="1.25" fill="{fill}"/>')
    for x, color in stations:
        st.back.append(f'<circle cx="{x}" cy="{y + .25}" r="5" fill="{PAGE["dark" if t is art.THEMES["dark"] else "light"]}" '
                       f'stroke="{color}" stroke-width="2.5"/>')


def ease_out(u):
    return 1 - (1 - u) ** 2


def smooth(u):
    return u * u * (3 - 2 * u)


@option("1", "新幹線で東京へ", "Hack Day（金沢）の勝者＝観客賞の王冠の上でみんなで喜び、青が決勝進出＝Award Day への切符を受け取る。"
        "線路に新幹線が入ってきて、3体は窓から顔を出す。喜び疲れて眠っていた赤は、発車に気づいて走り出した新幹線に飛び乗る。"
        "東京に着いたら、それぞれ Award Day の自分の賞へ。最後は見出しへ戻り、元の点になる。")
def option_1(t, narrow=False):
    H = 78 + (374 if narrow else 226)
    st, g = setup(t, narrow, H, 26)
    card(st, 0, g.CT, g.cw, H - g.CT)
    CT = g.CT
    if narrow:
        g.L = g.R = 20
        label(st, g.L, CT + 30, "HACK DAY", "金沢", g.cw - 20)
        line(st, g.L, g.cw - 20, CT + 40)
        g.r1, g.r2 = CT + 70, CT + 114
        TY = CT + 180
        label(st, g.R, CT + 218, "AWARD DAY", "東京", g.cw - 20)
        line(st, g.R, g.cw - 20, CT + 228)
        g.q1, g.q2, g.q3 = CT + 258, CT + 302, CT + 346
        g.hack_line, g.award_line = CT + 40, CT + 228
        rx0, rx1 = 20, g.cw - 20
        X1, X2 = 24, g.cw - TRAIN_L - 6
    else:
        columns(st, g, "金沢", "東京")
        st.back.append(f'<rect x="425" y="{CT + 22}" width="1" height="{140}" fill="{t["line"]}"/>')
        TY = CT + 206
        rx0, rx1 = 24, g.cw - 24
        X1, X2 = 40, 560
    rail(st, t, rx0, rx1, TY, [(rx0 + 10, "#C03BFF"), (rx1 - 10, "#22C4FA")])
    awards_rows(st, g)
    c = make_actors(st, g)
    t0 = intro(st, c, g)
    tk = hackday(st, c, g, t0 + .05, sleepy_until=14.3)
    # 新幹線：左から入って金沢に止まり、発車して東京に止まり、右へ去る
    ta, tb, td, te, tl, tm = 11.2, 12.4, 14.2, 16.6, 18.2, 19.2
    out_x = g.W + 20

    def pos(s):
        if s <= ta:
            return -TRAIN_L - 20
        if s <= tb:
            return -TRAIN_L - 20 + (X1 + TRAIN_L + 20) * ease_out((s - ta) / (tb - ta))
        if s <= td:
            return X1
        if s <= te:
            return X1 + (X2 - X1) * smooth((s - td) / (te - td))
        if s <= tl:
            return X2
        if s <= tm:
            return X2 + (out_x - X2) * ((s - tl) / (tm - tl)) ** 2
        return out_x
    frames = [(s / 10, f"translate({pos(s / 10):.1f}px,0px)") for s in range(0, 261)]
    frames.append((25.99, f"translate({-TRAIN_L - 20}px,0px)"))
    st.front.append(f'<g class="fx"><g class="train"><g transform="translate(0 {TY - TRAIN_H - 1})">{shinkansen(st, t)}</g></g></g>')
    st.anim("train", frames, base=f"translate({-TRAIN_L - 20}px,0px)")
    win = {"red": 26, "purple": 52, "green": 78, "blue": 104}
    # 乗る：青は切符の行から、緑と紫は観客賞の文字から、窓の位置へ跳び込む
    c["blue"].wait(12.6).hop(13.1, X1 + win["blue"], TY, 12)
    c["green"].wait(12.75).hop(13.3, X1 + win["green"], TY, 12)
    c["purple"].wait(12.9).hop(13.5, X1 + win["purple"], TY, 12)
    for n in ("blue", "green", "purple"):
        follow(c[n], c[n].t + .05, te + .3, pos, win[n])
    # 赤：発車に気づいて飛び起き、走り出した新幹線に飛び乗る
    st.mark(g.aud[3], g.top(g.r1) - CH - 6, "!", 14.3, 15.0)
    c["red"].face("surprised", 14.3, 15.4)
    c["red"].wait(14.3).jump(14.7, 14)
    c["red"].hop(15.3, pos(15.3) + win["red"], TY, 16)
    follow(c["red"], 15.3, te + .3, pos, win["red"])
    # 東京：窓から出て、それぞれ自分の賞へ
    T = 17.0
    sp, inn, dmm = g.spots["green"], g.spots["purple"], g.spots["red"]
    if narrow:
        arrive = {"green": (T, T + 1.2, [(sp[0] - 6, g.award_line), sp]),
                  "purple": (T + .15, T + 1.4, [(inn[0] + 24, g.award_line), inn]),
                  "red": (T + .3, T + 1.6, [(dmm[0] + 30, g.award_line), (dmm[0] + 10, g.top(g.q2)), dmm]),
                  "blue": (T + .1, T + 1.0, [(g.cw - 40, g.award_line)])}
        back = narrow_back(g, TY)
    else:
        arrive = {"green": (T, T + 1.2, [(650, g.top(g.q3)), sp]),
                  "purple": (T + .15, T + 1.3, [(615, g.top(g.q3)), inn]),
                  "red": (T + .3, T + .9, [dmm]),
                  "blue": (T + .1, T + 1.2, [(770, g.feet(g.q2)), (740, g.award_line)])}
        back = pc_back(g)
    award_day(st, c, g, T, arrive, back)
    return st.svg()


# ---------- 案2：路線図 ----------
@option("2", "路線図", "カードを路線図にする。金沢と東京の駅を線でつなぎ、駅の下にそれぞれの日の賞を並べる。"
        "Hack Day の勝者として喜んだあと、青が切符を受け取り、4体は連なって列車になる。眠っていた赤は置いていかれ、"
        "走って追いかけて最後尾に連結する。東京の駅で降りて、Award Day の賞へ。")
def option_2(t, narrow=False):
    H = 78 + (376 if narrow else 206)
    st, g = setup(t, narrow, H, 25.5)
    card(st, 0, g.CT, g.cw, H - g.CT)
    CT = g.CT
    dark = "dark" if t is art.THEMES["dark"] else "light"

    def station(x, y, color):
        st.back.append(f'<circle cx="{x}" cy="{y}" r="6.5" fill="{PAGE[dark]}" stroke="{color}" stroke-width="3"/>')

    if narrow:
        g.L = g.R = 20
        label(st, g.L, CT + 30, "HACK DAY")
        line(st, g.L, g.cw - 20, CT + 40)
        g.r1, g.r2 = CT + 70, CT + 114
        RL = CT + 160
        st.back.append(f'<rect x="20" y="{RL - 1.5}" width="{g.cw - 40}" height="3" rx="1.5" fill="{grad(st, 20, g.cw - 20)}"/>')
        station(30, RL, "#C03BFF")
        station(g.cw - 30, RL, "#22C4FA")
        st.back.append(art.text(20, RL + 26, "金沢", 16, t["ink"], cls="gh", weight=700))
        st.back.append(art.text(g.cw - 20, RL + 26, "東京", 16, t["ink"], cls="gh", weight=700, anchor="end"))
        label(st, g.R, RL + 62, "AWARD DAY")
        line(st, g.R, g.cw - 20, RL + 72)
        g.q1, g.q2, g.q3 = RL + 102, RL + 146, RL + 190
        g.hack_line, g.award_line = CT + 40, RL + 72
        front0, front1 = 110, g.cw - 34
    else:
        g.L, g.R = 24, 452
        RL = CT + 26
        for x, name, en in ((g.L, "金沢", "HACK DAY"), (g.R, "東京", "AWARD DAY")):
            st.back.append(art.text(x, CT + 56, name, 16, t["ink"], cls="gh", weight=700))
            st.back.append(art.text(x + 44, CT + 55, en, 13, t["muted"], cls="gh", weight=700, extra=' letter-spacing="3"'))
        st.back.append(f'<rect x="{g.L}" y="{RL - 1.5}" width="{g.cw - 24 - g.L}" height="3" rx="1.5" fill="{grad(st, g.L, g.cw - 24)}"/>')
        station(g.L + 8, RL, "#C03BFF")
        station(g.R + 8, RL, "#4F9CFC")
        st.back.append(f'<rect x="425" y="{CT + 44}" width="1" height="{H - CT - 66}" fill="{t["line"]}"/>')
        g.r1, g.r2 = CT + 92, CT + 136
        g.q1, g.q2, g.q3 = CT + 92, CT + 136, CT + 180
        g.hack_line = g.award_line = RL - 1.5
        front0, front1 = 120, 540
    awards_rows(st, g)
    c = make_actors(st, g)
    t0 = intro(st, c, g)
    hackday(st, c, g, t0 + .05, sleepy_until=13.2)
    rl = RL - 1.5
    gap = 22
    car = {"blue": 0, "green": 1, "purple": 2, "red": 3}
    # 連なって列車になる
    if narrow:
        c["blue"].wait(11.0).hops(11.9, [(front0, rl)], h=12)
        c["green"].wait(11.1).hops(12.0, [(g.aud[1] + 10, g.top(g.r2)), (front0 - gap, rl)], h=10)
        c["purple"].wait(11.2).hops(12.1, [(g.aud[2] - 20, g.top(g.r2)), (front0 - 2 * gap, rl)], h=10)
    else:
        c["blue"].wait(11.0).hops(11.9, [(200, g.top(g.r1)), (front0, rl)], h=12)
        c["green"].wait(11.1).hop(11.8, front0 - gap, rl, 14)
        c["purple"].wait(11.2).hop(11.9, front0 - 2 * gap, rl, 14)
    st.mark(front0 + 18, rl - CH - 6, "♪", 12.0, 12.6)
    t_go, t_end = 12.6, 16.0
    for n in ("blue", "green", "purple"):
        c[n].wait(t_go).walk(t_end, front0 + (front1 - front0) - car[n] * gap, step=10, h=3)

    def front(s):
        return front0 + (front1 - front0) * min(1, max(0, (s - t_go) / (t_end - t_go)))
    # 赤：置いていかれたことに気づき、走って追いかけ、最後尾に連結する（ぶつかって列車が揺れる）
    st.mark(g.aud[3], g.top(g.r1) - CH - 6, "!", 13.2, 13.9)
    c["red"].face("surprised", 13.2, 14.0)
    c["red"].wait(13.2).jump(13.55, 12).hop(13.95, g.aud[3] - 6, rl, 12)
    tc = 14.55
    c["red"].run(tc, front(tc) - 3 * gap + 6)
    for n in ("blue", "green", "purple"):
        c[n].key(tc + .08, front(tc + .08) - car[n] * gap + 5, rl, 10, 1, 1, OUT_, "linear")
    c["purple"].face("surprised", tc, tc + .5)
    c["red"].put(tc + .12, x=front(tc + .12) - 3 * gap, sx=1.12, sy=.86)
    c["red"].walk(t_end, front1 - 3 * gap, step=10, h=3)
    st.mark(front(tc) - 2 * gap, rl - CH - 8, "!", tc, tc + .6)
    # 東京で降りて、それぞれ自分の賞へ
    T = 16.3
    sp, inn, dmm = g.spots["green"], g.spots["purple"], g.spots["red"]
    if narrow:
        arrive = {"green": (T, T + 1.2, [(sp[0] + 20, g.award_line), sp]),
                  "purple": (T + .15, T + 1.4, [(inn[0] + 40, g.award_line), inn]),
                  "red": (T + .3, T + 1.6, [(dmm[0] + 40, g.award_line), (dmm[0] + 10, g.top(g.q2)), dmm]),
                  "blue": (T + .1, T + 1.0, [(g.cw - 40, g.award_line)])}
        back = narrow_back(g, rl)
    else:
        arrive = {"green": (T, T + .9, [sp]),
                  "purple": (T + .15, T + 1.2, [(inn[0] - 40, g.top(g.q1)), inn]),
                  "red": (T + .3, T + 1.5, [(dmm[0] - 70, g.top(g.q1)), (dmm[0] - 40, g.top(g.q2)), dmm]),
                  "blue": (T + .1, T + 1.2, [])}
        c["blue"].wait(T + .1).walk(T + 1.4, 740)
        del arrive["blue"]
        back = pc_back(g)
    award_day(st, c, g, T, arrive, back)
    return st.svg()


# ---------- 案3：切符 ----------
def ticket_card(st, x0, y0, w, h, notch, vertical, r=10, rr=14):
    """切符の形の枠。vertical なら上下の辺の x=notch に、そうでなければ左右の辺の y=notch に半円の切り欠きを入れる。"""
    x1, y1 = x0 + w, y0 + h
    if vertical:
        d = (f"M{x0 + rr} {y0}H{notch - r}A{r} {r} 0 0 0 {notch + r} {y0}H{x1 - rr}A{rr} {rr} 0 0 1 {x1} {y0 + rr}"
             f"V{y1 - rr}A{rr} {rr} 0 0 1 {x1 - rr} {y1}H{notch + r}A{r} {r} 0 0 0 {notch - r} {y1}H{x0 + rr}"
             f"A{rr} {rr} 0 0 1 {x0} {y1 - rr}V{y0 + rr}A{rr} {rr} 0 0 1 {x0 + rr} {y0}Z")
    else:
        d = (f"M{x0 + rr} {y0}H{x1 - rr}A{rr} {rr} 0 0 1 {x1} {y0 + rr}V{notch - r}A{r} {r} 0 0 0 {x1} {notch + r}"
             f"V{y1 - rr}A{rr} {rr} 0 0 1 {x1 - rr} {y1}H{x0 + rr}A{rr} {rr} 0 0 1 {x0} {y1 - rr}"
             f"V{notch + r}A{r} {r} 0 0 0 {x0} {notch - r}V{y0 + rr}A{rr} {rr} 0 0 1 {x0 + rr} {y0}Z")
    st.back.append(f'<path d="{d}" fill="none" stroke="{st.t["line"]}" stroke-width="1.5"/>')


def gate(st, gx, fy):
    """自動改札：左右の柱と、閉じている扉（ブランドのグラデーション）。扉は flapL / flapR で開け閉めする。"""
    t = st.t
    post = "#C9D1DE" if t is art.THEMES["light"] else "#3A4255"
    st.back.append(f'<rect x="{gx - 22}" y="{fy - 28}" width="9" height="28" rx="3" fill="{post}"/>'
                   f'<rect x="{gx + 13}" y="{fy - 28}" width="9" height="28" rx="3" fill="{post}"/>'
                   f'<rect x="{gx - 20}" y="{fy - 25}" width="5" height="3" rx="1.5" fill="#22C4FA"/>'
                   f'<rect class="flapL" x="{gx - 13}" y="{fy - 19}" width="13" height="6" rx="3" fill="url(#brand)"/>'
                   f'<rect class="flapR" x="{gx}" y="{fy - 19}" width="13" height="6" rx="3" fill="url(#brand)"/>')


@option("3", "切符と改札", "カード全体を、金沢から東京への切符の形にする（切り取り線と半円の切り欠き）。"
        "Hack Day の勝者として喜んだあと、青が切符を受け取る。切り取り線のところの自動改札に青がタッチして3体が通るが、"
        "遅れてきた赤は閉まった扉にぶつかる。青が戻ってもう一度タッチし、赤を通してあげる。そして Award Day の賞へ。")
def option_3(t, narrow=False):
    H = 78 + (358 if narrow else 222)
    st, g = setup(t, narrow, H, 25.5)
    CT = g.CT
    if narrow:
        g.L = g.R = 20
        P = CT + 156
        ticket_card(st, .75, CT + .75, g.cw - 1.5, H - CT - 1.5, P, False)
        st.back.append(f'<line x1="16" y1="{P}" x2="{g.cw - 16}" y2="{P}" stroke="{t["line"]}" stroke-width="1.5" stroke-dasharray="5 5"/>')
        label(st, g.L, CT + 30, "HACK DAY", "金沢", g.cw - 20)
        line(st, g.L, g.cw - 20, CT + 40)
        g.r1, g.r2 = CT + 70, CT + 114
        label(st, g.R, P + 44, "AWARD DAY", "東京", g.cw - 20)
        line(st, g.R, g.cw - 20, P + 54)
        g.q1, g.q2, g.q3 = P + 84, P + 128, P + 172
        g.hack_line, g.award_line = CT + 40, P + 54
        FY, GX = P, 180
    else:
        FY = H - 1.6
        ticket_card(st, .75, CT + .75, g.cw - 1.5, H - CT - 1.5, 425, True)
        st.back.append(f'<line x1="425" y1="{CT + 16}" x2="425" y2="{FY - 36}" stroke="{t["line"]}" stroke-width="1.5" stroke-dasharray="5 5"/>')
        columns(st, g, "金沢", "東京")
        GX = 425
    gate(st, GX, FY)
    awards_rows(st, g)
    c = make_actors(st, g)
    t0 = intro(st, c, g)
    hackday(st, c, g, t0 + .05, sleepy_until=12.9)
    # 改札の手前まで行く
    lx = [GX - 34 - i * 24 for i in range(3)]
    if narrow:
        c["blue"].wait(11.0).hops(11.7, [(lx[0], FY)], h=10)
        c["green"].wait(11.05).hops(12.0, [(g.aud[1] + 6, g.top(g.r2)), (lx[1], FY)], h=8)
        c["purple"].wait(11.15).hops(12.1, [(g.aud[2] - 30, g.top(g.r2)), (lx[2], FY)], h=8)
    else:
        c["blue"].wait(11.0).hop(11.6, 300, FY, 10).walk(12.0, lx[0])
        c["green"].wait(11.05).hops(11.8, [(g.aud[1] + 14, g.top(g.r2)), (240, FY)], h=8).walk(12.1, lx[1])
        c["purple"].wait(11.15).hops(11.9, [(g.aud[2] - 10, g.top(g.r2)), (210, FY)], h=8).walk(12.2, lx[2])
    # 青がタッチすると扉が開き、3体が通る。扉はすぐ閉まる
    flap_open = [(12.5, 1), (12.7, .12), (13.9, .12), (14.1, 1), (15.3, 1), (15.5, .12), (16.2, .12), (16.4, 1)]
    st.anim("flapL", [(s, f"scale({v},1)") for s, v in flap_open], origin="0% 50%")
    st.anim("flapR", [(s, f"scale({v},1)") for s, v in flap_open], origin="100% 50%")
    st.sparkle(GX - 18, FY - 24, 12.4, 10, 5, "#22C4FA")
    c["blue"].wait(12.2).lean(12.35, 14).lean(12.55, 0)
    rx = [GX + 32 + i * 22 for i in range(3)] if narrow else [GX + 120, GX + 96, GX + 72]
    c["blue"].wait(12.7).walk(13.3, rx[0])
    c["green"].wait(12.8).walk(13.5, rx[1])
    c["purple"].wait(12.9).walk(13.7, rx[2])
    # 赤：起きて駆けつけるが、閉まった扉にぶつかって跳ね返る
    st.mark(g.aud[3], g.top(g.r1) - CH - 6, "!", 12.9, 13.6)
    c["red"].face("surprised", 12.9, 13.5)
    c["red"].wait(12.9).jump(13.25, 12).hop(13.8, g.aud[3] - 20 if narrow else 330, FY, 12)
    c["red"].run(14.25, GX - 12).put(14.4, x=GX - 22, r=-22, sx=1.2, sy=.8).put(14.7, x=GX - 34, r=-8).put(14.9, x=GX - 30)
    c["red"].face("dizzy", 14.25, 15.1)
    st.mark(GX - 14, FY - CH - 10, "!", 14.25, 14.9)
    # 青が戻ってもう一度タッチし、赤を通す。赤は青におじぎする
    c["blue"].wait(14.4).walk(15.2, GX + 30).lean(15.35, -14).lean(15.55, 0)
    st.sparkle(GX + 18, FY - 24, 15.3, 10, 5, "#22C4FA")
    c["red"].wait(15.5).walk(16.0, GX + 4 if narrow else GX + 48).bow(16.6, 1)
    c["blue"].wait(16.0).walk(16.4, rx[0] if not narrow else GX + 66)
    T = 16.8
    sp, inn, dmm = g.spots["green"], g.spots["purple"], g.spots["red"]
    if narrow:
        arrive = {"green": (T, T + 1.2, [(sp[0] + 20, g.award_line), sp]),
                  "purple": (T + .15, T + 1.4, [(inn[0] + 40, g.award_line), inn]),
                  "red": (T + .3, T + 1.6, [(dmm[0] + 40, g.award_line), (dmm[0] + 10, g.top(g.q2)), dmm]),
                  "blue": (T + .1, T + 1.0, [(g.cw - 40, g.award_line)])}
        back = narrow_back(g, FY)
    else:
        arrive = {"green": (T, T + 1.2, [(650, g.top(g.q3)), sp]),
                  "purple": (T + .15, T + 1.3, [(615, g.top(g.q3)), inn]),
                  "red": (T + .3, T + 1.2, [(dmm[0] - 30, g.top(g.q3)), dmm]),
                  "blue": (T + .1, T + 1.2, [(770, g.feet(g.q2)), (740, g.award_line)])}
        back = pc_back(g)
    award_day(st, c, g, T, arrive, back)
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
