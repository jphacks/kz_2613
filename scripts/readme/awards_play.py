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


def road(st, x0, x1, y, down=False):
    """Award Day への道：ブランドのグラデーションの点線と、行き先を指す矢印。"""
    gid = f"road{len(st.back)}"
    st.back.append(f'<defs><linearGradient id="{gid}" gradientUnits="userSpaceOnUse" x1="{x0}" y1="0" x2="{x1}" y2="0">'
                   '<stop offset="0" stop-color="#C03BFF"/><stop offset=".55" stop-color="#6F86FF"/>'
                   '<stop offset="1" stop-color="#22C4FA"/></linearGradient></defs>')
    dash = "".join(f'<rect x="{x:.1f}" y="{y - 1}" width="8" height="2.5" rx="1.25"/>' for x in range(int(x0), int(x1) - 14, 14))
    st.back.append(f'<g fill="url(#{gid})">{dash}</g>')
    if down:
        st.back.append(f'<path d="M{x1 - 6} {y + 4}l6 6 6-6" fill="none" stroke="#22C4FA" stroke-width="2.5" '
                       'stroke-linecap="round" stroke-linejoin="round"/>')
    else:
        st.back.append(f'<path d="M{x1 - 6} {y - 6.5}l6.5 6.75-6.5 6.75" fill="none" stroke="#22C4FA" stroke-width="2.5" '
                       'stroke-linecap="round" stroke-linejoin="round"/>')


@option("a", "Award Day への道", "4色の点がキャラクターになって見出しの線の上を駆け、Hack Day へ。みんなで観客賞の文字に乗って喜び、"
        "青が決勝進出の旗を受け取って先導する。寝坊した赤が慌てて追いつき、Award Day ではそれぞれが自分の賞を受け取って画面に映す。"
        "最後は見出しへ戻り、元の点になる。")
def option_a(t, narrow=False):
    W = art.PHONE_W if narrow else art.PC_W
    cw = W - 14
    CT = 78
    D = 25
    H = CT + (354 if narrow else 198)
    st = Stage(W, H, D, t)
    x0, x1, ry, xs, dy = heading(st, W, 2 if narrow else 4)
    if x1 - x0 < 24:  # スマホでは線が短すぎて描かれない（目次の見出しと同じ）
        st.back[-1] = "</g>"
    card(st, 0, CT, cw, H - CT)
    A = {a["key"]: a for a in AWARDS}
    if narrow:
        L = R = 20
        label(st, L, CT + 30, "HACK DAY", "金沢会場", cw - 20)
        line(st, L, cw - 20, CT + 40)
        r1, r2 = CT + 70, CT + 114
        road_y = CT + 156
        label(st, R, CT + 196, "AWARD DAY")
        line(st, R, cw - 20, CT + 206)
        q1, q2, q3 = CT + 236, CT + 280, CT + 324
        hack_line, award_line = CT + 40, CT + 206
    else:
        L, R = 24, 452
        label(st, L, CT + 30, "HACK DAY", "金沢会場", 398)
        line(st, L, 398, CT + 40)
        label(st, R, CT + 30, "AWARD DAY")
        line(st, R, cw - 24, CT + 40)
        st.back.append(f'<rect x="425" y="{CT + 22}" width="1" height="{H - CT - 44}" fill="{t["line"]}"/>')
        r1, r2 = CT + 70, CT + 114
        q1, q2, q3 = CT + 70, CT + 114, CT + 158
        road_y = CT + 162
        hack_line = award_line = CT + 40
    row(st, A["aud"], L, r1)
    e_fin = row(st, A["fin"], L, r2)
    e_sp = row(st, A["sp"], R, q1)
    e_inn = row(st, A["inn"], R, q2)
    e_dmm = row(st, A["dmm"], R, q3)
    road_x1 = cw - 20 if narrow else 404
    road(st, L, road_x1, road_y, down=narrow)

    def top(cy):  # 文字の上
        return cy + 5.5 - 12

    def feet(cy):  # 文字の横（基準線）
        return cy + 6.5

    names = art.ORDER
    out_at = [3.5 + i * .12 for i in range(4)]
    back_at = [23.6 + i * .14 for i in range(4)]
    dots(st, xs, dy, out_at, back_at)
    c = {n: st.actor(n, xs[i], ry) for i, n in enumerate(names)}
    for i, n in enumerate(names):
        c[n].appear(out_at[i])
    # 見出しの線の上を左へ駆け、カードへ跳び下りる。赤は止まりきれずに紫にぶつかる
    aud = [L + 28 + i * (36 if narrow else 40) for i in range(4)]
    if narrow:
        for i, n in enumerate(names):
            c[n].wait(4.6 + i * .15).hops(6.2 + i * .15, [(xs[i] - 20, hack_line), (aud[i], top(r1))], h=14)
    else:
        line_x = [x0 + 12 + i * 23 for i in range(4)]
        for i, n in enumerate(names[:3]):
            c[n].wait(4.5 + i * .08).run(5.9 + i * .1, line_x[i])
        c["red"].wait(4.75).run(6.0, line_x[3] - 5)
        c["red"].shake(6.3, 8, 2, 1.1, .88)
        c["purple"].wait(6.0).lean(6.12, -14).lean(6.35, 0)
        c["green"].wait(6.08).lean(6.2, -10).lean(6.4, 0)
        st.mark(line_x[3] - 2, ry - CH - 4, "!", 6.0, 6.7)
        for i, n in enumerate(names):
            c[n].wait(6.7 + i * .15).hops(7.8 + i * .15, [(line_x[i] - 30, hack_line), (aud[i], top(r1))], h=16)
    # みんなで観客賞（みんなの賞）の文字に乗って喜ぶ
    st.anim("tile-aud", st.pulse("tile-aud", 8.3, 1.3))
    st.sparkle(L + 15, r1, 8.35, 20)
    for i, n in enumerate(names):
        c[n].wait(8.35 + i * .06).jump(8.9 + i * .06, 9).jump(9.55 + i * .06, 9)
        c[n].face("happy", 8.35, 10.0)
    st.say(aud[1] + 18, top(r1) - CH - 2, "みんなの賞！", 8.5, 9.9)
    # 青が決勝進出の旗を受け取り、先導する
    fin = e_fin + 20
    c["blue"].wait(10.0).hop(10.5, fin, feet(r2), 10)
    st.anim("tile-fin", st.pulse("tile-fin", 10.55, 1.3))
    st.sparkle(L + 15, r2, 10.6, 18, 5, art.CHARS["blue"]["body"])
    c["blue"].face("icon:flag", 10.65, 21.0)
    c["blue"].jump(11.0, 8)
    st.say(fin, feet(r2) - CH - 2, "Award Dayへ！", 10.8, 12.0, dx=0 if narrow else 44)
    start = [L + 150, L + 124, L + 98, L + 66]
    c["blue"].wait(11.9).hop(12.4, start[0], road_y, 8)
    for i, n in enumerate(names[1:], 1):
        c[n].wait(10.3 + i * .15).hops(11.5 + i * .15, [(aud[i] + 4, top(r2)), (start[i], road_y)], h=8)
    # 道を進む。赤は寝てしまい、気づいて慌てて追いかけ、紫にぶつかる
    end = [road_x1 - 14 - i * 24 for i in range(4)]
    c["red"].face("sleep", 11.9, 13.5)
    st.mark(start[3] - 18, road_y - 14, "z", 12.1, 13.3, 15, "#7FA8D9")
    st.mark(start[3] - 28, road_y - 26, "z", 12.4, 13.3, 13, "#7FA8D9")
    for i, n in enumerate(names[:3]):
        c[n].wait(12.4 + i * .1).walk(14.7 + i * .1, end[i])
    c["red"].wait(13.5).jump(13.9, 12)
    c["red"].face("surprised", 13.5, 14.3)
    st.mark(start[3], road_y - CH - 6, "!", 13.5, 14.2)
    c["red"].run(14.95, end[3] + 6).shake(15.25, 8, 2, 1.1, .88).walk(15.4, end[3])
    c["purple"].wait(14.95).lean(15.1, 14).lean(15.35, 0)
    c["purple"].face("surprised", 14.95, 15.5)
    # Award Day：それぞれ自分の賞へ。受け取ると画面に賞が映る
    sp, inn, dmm = e_sp + 20, e_inn + 20, e_dmm + 20
    if narrow:
        c["green"].wait(15.5).hops(16.6, [(end[1] - 30, award_line), (sp, feet(q1))], h=10)
        c["purple"].wait(15.7).hops(16.9, [(end[2] - 40, award_line), (inn - 20, top(q1)), (inn, feet(q2))], h=10)
        c["red"].wait(15.9).hops(17.3, [(end[3] - 60, award_line), (dmm - 50, top(q2)), (dmm, feet(q3))], h=10)
        c["blue"].wait(15.4).hops(16.4, [(cw - 40, award_line)], h=10)
    else:
        c["green"].wait(15.5).hops(16.8, [(520, top(q2)), (sp, feet(q1))], h=14)
        c["purple"].wait(15.7).hops(17.0, [(500, top(q3)), (inn, feet(q2))], h=12)
        c["red"].wait(15.9).hop(16.4, 480, top(q3), 10).walk(17.0, dmm - 26).hop(17.4, dmm, feet(q3), 6)
        c["blue"].wait(15.4).hops(16.6, [(560, award_line)], h=40).walk(17.4, 740)
    for n, key, at, cy in (("green", "sp", 17.4, q1), ("purple", "inn", 18.1, q2), ("red", "dmm", 18.8, q3)):
        st.anim(f"tile-{key}", st.pulse(f"tile-{key}", at, 1.3))
        st.sparkle(R + 15, cy, at + .05, 18, 5, art.CHARS[n]["body"])
        c[n].face("icon:" + A[key]["icon"], at + .1, 21.0)
        c[n].wait(at).jump(at + .55, 10)
    c["red"].face("strain", 18.3, 18.8)
    c["red"].wait(18.3).put(18.8, sx=1.12, sy=.84)
    c["red"].jump(19.4, 14)
    c["blue"].wait(19.0).shake(19.6, 10, 4)
    # みんなで喜ぶ
    for i, n in enumerate(names):
        c[n].wait(19.8 + i * .07).jump(20.35 + i * .07, 9).jump(20.9 + i * .07, 11)
    st.mark(W - 60 if narrow else 600, (feet(q2) if narrow else feet(q1)) - CH - 16, "♪", 19.9, 21.2)
    # 見出しへ戻り、点になる
    if narrow:
        back = {"green": [(cw - 60, award_line), (cw - 70, road_y), (xs[1] - 10, hack_line), (xs[1], ry)],
                "purple": [(inn + 30, top(q1)), (cw - 90, award_line), (cw - 80, road_y), (xs[2] - 10, hack_line), (xs[2], ry)],
                "red": [(dmm + 20, top(q2)), (cw - 110, award_line), (cw - 100, road_y), (xs[3] - 10, hack_line), (xs[3], ry)]}
        c["blue"].wait(21.3).hops(22.4, [(cw - 50, road_y), (xs[0] - 10, hack_line), (xs[0], ry)], h=14)
        for k, n in enumerate(("green", "purple", "red")):
            c[n].wait(21.3 + k * .1).hops(23.1 + k * .15, back[n], h=12)
    else:
        c["blue"].wait(21.4).hop(22.2, xs[0], ry, 30)
        c["green"].wait(21.3).hops(22.6, [(680, award_line), (xs[1], ry)], h=22)
        c["purple"].wait(21.4).hops(22.9, [(560, top(q1)), (720, award_line), (xs[2], ry)], h=18)
        c["red"].wait(21.5).hops(23.2, [(560, top(q2)), (700, award_line), (xs[3], ry)], h=18)
    for i, n in enumerate(names):
        c[n].wait(back_at[i]).vanish(back_at[i])
    return st.svg()


def big_number(st, s, x, base, size, cls):
    """ブランドのグラデーションの大きな数字（輪郭にして描く）。動かせるよう <g class> で包む。"""
    st.back.append(f'<g class="{cls}">{art.text(x, base, s, size, "url(#brand)", cls="disp", weight=400)}</g>')
    return vector.width(s, size)


@option("b", "わっしょい！5", "受賞の数「5」を大きな数字で見せる。点から出てきた4体はカードの枠の上を駆けて「5」の下にもぐり、"
        "みんなで担いでわっしょい。赤が足を滑らせて「5」が傾き、みんなで踏んばって立て直す。最後は「5」を放り上げ、"
        "落ちてきた「5」が元の場所に収まると、5つの賞が1つずつ光る。帰りは賞の文字を階段にして見出しへ戻る。")
def option_b(t, narrow=False):
    W = art.PHONE_W if narrow else art.PC_W
    cw = W - 14
    CT = 78
    D = 23
    A = {a["key"]: a for a in AWARDS}
    if narrow:
        size, nx = 130, 26
        base = CT + 18 + 105
        floor = base + CH + 1
        H = floor + 290
    else:
        size, nx = 160, 40
        base = CT + 20 + 129
        floor = base + CH + 1
        H = floor + 1
    st = Stage(W, H, D, t)
    x0, x1, ry, xs, dy = heading(st, W, 2 if narrow else 4)
    if x1 - x0 < 24:
        st.back[-1] = "</g>"
    card(st, 0, CT, cw, H - CT)
    fw = big_number(st, "5", nx, base, size, "five")
    lx = nx + fw + 14
    st.back.append(art.text(lx, base - 4, "AWARDS", 13, t["muted"], cls="gh", weight=700, extra=' letter-spacing="3"'))
    if narrow:
        line(st, 0, cw, floor)
        L = 20
        label(st, L, floor + 30, "HACK DAY", "金沢会場", cw - 20)
        line(st, L, cw - 20, floor + 40)
        rows = {"aud": (L, floor + 68), "fin": (L, floor + 108)}
        label(st, L, floor + 150, "AWARD DAY")
        line(st, L, cw - 20, floor + 160)
        rows.update({"sp": (L, floor + 188), "inn": (L, floor + 228), "dmm": (L, floor + 268)})
        top_line = floor + 160
    else:
        st.back.append(f'<rect x="212" y="{CT + 22}" width="1" height="{H - CT - 44}" fill="{t["line"]}"/>')
        L, R = 236, 540
        label(st, L, CT + 34, "HACK DAY", "金沢会場", 508)
        line(st, L, 508, CT + 44)
        label(st, R, CT + 34, "AWARD DAY")
        line(st, R, cw - 24, CT + 44)
        rows = {"aud": (L, CT + 76), "fin": (L, CT + 118), "sp": (R, CT + 76), "inn": (R, CT + 118), "dmm": (R, CT + 160)}
        top_line = CT + 44
    ends = {k: row(st, A[k], x, cy) for k, (x, cy) in rows.items()}

    def top(k):
        return rows[k][1] + 5.5 - 12

    names = art.ORDER
    out_at = [3.5 + i * .12 for i in range(4)]
    back_at = [21.6 + i * .14 for i in range(4)]
    dots(st, xs, dy, out_at, back_at)
    c = {n: st.actor(n, xs[i], ry) for i, n in enumerate(names)}
    for i, n in enumerate(names):
        c[n].appear(out_at[i])
    # カードの枠の上を左へ駆け、「AWARDS」の上から下へ跳び下りる
    drop = [lx + 8 + i * 18 for i in range(4)] if not narrow else [lx + 4 + i * 16 for i in range(4)]
    edge = [(250 if not narrow else 236) + i * (24 if not narrow else 18) for i in range(4)]
    for i, n in enumerate(names):
        a = c[n]
        a.wait(4.2 + i * .1).hop(4.6 + i * .1, xs[i] - 6, CT, 8)
        a.run(6.1 + i * .12, edge[i])
        a.hop(6.9 + i * .22, drop[i], floor, 10)
    for i in range(4):
        st.sparkle(drop[i], floor - 2, 6.9 + i * .22, 10, 3, "#BFC5D2")
    # 「5」の下へもぐる
    under = [nx + fw / 2 - 30 + i * 20 for i in range(4)]
    for i, n in enumerate(names):
        c[n].wait(7.4 + i * .1).walk(8.5 + i * .12, under[i])
    # せーの、わっしょい
    st.say(under[3], floor - CH - 4, "せーの！", 8.8, 9.8)
    lift = (CH * .3)
    five = [(9.2, "translate(0px,0px) rotate(0deg)")]
    for i, n in enumerate(names):
        c[n].wait(9.2).put(9.5, sx=1.12, sy=.86).put(9.8, sy=1.3, sx=.9)
    five.append((9.5, "translate(0px,0px) rotate(0deg)"))
    five.append((9.8, f"translate(0px,{-lift:.1f}px) rotate(0deg)"))
    tt = 9.8
    for k in range(3):
        for n in names:
            c[n].put(tt + .3, sy=1.05, sx=1.0).put(tt + .6, sy=1.3, sx=.9)
        five += [(tt + .3, f"translate(0px,{-lift * .2:.1f}px) rotate(0deg)"), (tt + .6, f"translate(0px,{-lift:.1f}px) rotate(0deg)")]
        tt += .6
    st.say(lx + 44, base - 64, "わっしょい！", 9.9, 11.4)
    # 赤が足を滑らせ、「5」が傾く。紫が踏んばって支え、赤が戻る
    c["red"].wait(12.0).put(12.25, x=under[3] + 16, r=28, sx=1.05, sy=.9).put(12.6, x=under[3] + 22, r=0, sx=1.2, sy=.75)
    c["red"].face("dizzy", 12.05, 13.0)
    st.mark(under[3] + 22, floor - CH - 12, "!", 12.0, 12.9)
    five += [(12.0, f"translate(0px,{-lift:.1f}px) rotate(0deg)"), (12.35, f"translate(2px,{-lift * .4:.1f}px) rotate(14deg)"),
             (12.6, f"translate(2px,{-lift * .5:.1f}px) rotate(11deg)"), (12.9, f"translate(1px,{-lift * .7:.1f}px) rotate(5deg)"),
             (13.6, f"translate(0px,{-lift:.1f}px) rotate(0deg)")]
    for n in names[:3]:
        c[n].face("strain", 12.1, 13.7)
        c[n].wait(12.0).put(12.3, r=8, sx=1.12, sy=1.1).put(12.9, r=4, sy=1.2).put(13.6, sy=1.3, sx=.9)
    c["purple"].wait(12.3).put(12.9, x=under[2] + 8, r=6, sy=1.25)
    c["red"].wait(12.6).put(13.0, sx=1.0, sy=1.0).walk(13.4, under[3]).put(13.6, sy=1.3, sx=.9)
    c["purple"].wait(13.4).put(13.7, x=under[2], sy=1.3, sx=.9)
    # せーの、で放り上げる。「5」は回って元の場所に収まり、5つの賞が1つずつ光る
    st.say(under[0], floor - CH - 16, "せーの！", 13.9, 14.8)
    for n in names:
        c[n].wait(14.2).put(14.45, sx=1.15, sy=.84).put(14.65, sy=1.35, sx=.88).put(14.9)
    five += [(14.2, f"translate(0px,{-lift:.1f}px) rotate(0deg)"), (14.45, "translate(0px,3px) rotate(0deg)"),
             (14.7, "translate(0px,-40px) rotate(-120deg)"), (15.0, "translate(0px,-56px) rotate(-240deg)"),
             (15.35, "translate(0px,-20px) rotate(-360deg)"), (15.55, "translate(0px,0px) rotate(-360deg)")]
    five += [(15.7, "translate(0px,3px) rotate(-360deg)"), (15.85, "translate(0px,0px) rotate(-360deg)"),
             (20.0, "translate(0px,0px) rotate(-360deg)"), (20.01, "translate(0px,0px) rotate(0deg)")]
    for i, n in enumerate(names):
        c[n].wait(15.5).put(15.65, sx=1.25, sy=.62).put(15.9, sx=.95, sy=1.08).put(16.1)
        c[n].face("dizzy" if n == "red" else "surprised", 15.55, 16.3)
    st.sparkle(nx + fw / 2, base - 60, 15.65, 46, 8)
    st.anim("five", five, origin="50% 100%")
    order = ["aud", "fin", "sp", "inn", "dmm"]
    for k, key in enumerate(order):
        at = 16.4 + k * .28
        st.anim(f"tile-{key}", st.pulse(f"tile-{key}", at, 1.35))
        x, cy = rows[key]
        st.sparkle(x + 15, cy, at + .03, 16, 5, tile_color(A[key]) if A[key]["color"] != "brand" else scenes.GOLD)
    # 喜んで、賞の文字を階段にして見出しへ戻る
    out = [lx + 6 + i * 22 for i in range(4)]
    for i, n in enumerate(names):
        c[n].wait(16.3 + i * .08).walk(16.9 + i * .08, out[i] if not narrow else out[i] - 20)
        c[n].face("happy", 16.9, 18.4)
        c[n].wait(17.0 + i * .06).jump(17.5 + i * .06, 10).jump(18.0 + i * .06, 10)
    st.mark(out[1] + 10, floor - CH - 14, "♪", 17.0, 18.3)
    if narrow:
        for i, n in enumerate(names):
            c[n].wait(18.4 + i * .18).walk(19.0 + i * .18, xs[i] - 50).hops(21.2 + i * .1, [(xs[i] - 30, CT), (xs[i], ry)], h=14)
    else:
        stairs = ["dmm", "inn", "sp"]
        for i, n in enumerate(names):
            pts = [(ends[k] + 18 + i * 9, rows[k][1] + 6.5) for k in stairs] + [(740 + i * 8, top_line), (xs[i] - 6, CT), (xs[i], ry)]
            c[n].wait(18.4 + i * .2).walk(19.0 + i * .2, 560 + i * 8).hops(21.4 + i * .05, pts, h=10)
    for i, n in enumerate(names):
        c[n].wait(back_at[i]).vanish(back_at[i])
    return st.svg()


def wrap_name(s, size, avail):
    if tw(s, size) <= avail:
        return [s]
    if " " in s:
        words = s.split(" ")
        for k in range(len(words) - 1, 0, -1):
            a = " ".join(words[:k])
            if tw(a, size) <= avail:
                return [a, " ".join(words[k:])]
    for k in range(len(s) - 1, 0, -1):
        if tw(s[:k], size) <= avail and not s[k - 1].isascii() and s[k].isascii():
            return [s[:k], s[k:]]
    return [s]


def award_card(st, a, num, x, y, w, h, size=16):
    """特長の図と同じ形のカード：左上にタイル、右上にグラデーションの番号、下に賞の名前。"""
    t = st.t
    st.back.append(f'<g class="card-{a["key"]}"><rect x="{x + .75}" y="{y + .75}" width="{w - 1.5}" height="{h - 1.5}" rx="14" '
                   f'fill="none" stroke="{t["line"]}" stroke-width="1.5"/>'
                   f'<g class="tile-{a["key"]}">{tile(a, x + 16 + 15, y + 16 + 15)}</g>'
                   + art.text(x + w - 14, y + 40, num, 26, "url(#brand)", cls="disp", weight=400, anchor="end"))
    lines = wrap_name(a["name"], size, w - 28)
    for k, s in enumerate(lines):
        st.back.append(art.text(x + 14, y + h - 16 - (len(lines) - 1 - k) * (size + 6), s, size, t["ink"], cls="gh", weight=700))
    st.back.append("</g>")


@option("c", "取り違え", "賞を、特長の図と同じ形の5枚のカードにする。点から出てきた4体は、それぞれ自分の賞のカードの上に乗り、"
        "画面に賞を映す。ところが赤は緑の賞に乗ってしまい、画面に緑の星が映る。緑に見つめられて赤は気づき、謝って自分の賞へ。"
        "最後は「みんなの賞」の観客賞に4体でぎゅうぎゅうに乗り、カードがたわむ。")
def option_c(t, narrow=False):
    W = art.PHONE_W if narrow else art.PC_W
    cw = W - 14
    D = 22
    A = {a["key"]: a for a in AWARDS}
    LB = PAD + 76  # 組の見出しの基準線
    if narrow:
        gap, ch = 10, 104
        w2 = (cw - gap) / 2
        y1 = LB + 30
        y2 = y1 + ch + 46
        y3 = y2 + ch + 40
        pos = {"aud": (0, y1, w2), "fin": (w2 + gap, y1, w2), "sp": (0, y2, w2), "inn": (w2 + gap, y2, w2),
               "dmm": (0, y3, cw)}
        H = y3 + ch + 2
        size = 15
    else:
        gap, ch = 12, 112
        w5 = (cw - 4 * gap) / 5
        y1 = LB + 30
        pos = {k: (i * (w5 + gap), y1, w5) for i, k in enumerate(["aud", "fin", "sp", "inn", "dmm"])}
        H = y1 + ch + 2
        size = 16
    st = Stage(W, H, D, t)
    x0, x1, ry, xs, dy = heading(st, W, 2 if narrow else 4)
    if x1 - x0 < 24:
        st.back[-1] = "</g>"
    if narrow:
        label(st, 0, LB, "HACK DAY", "金沢会場", cw)
        line(st, 0, cw, LB + 10)
        label(st, 0, y2 - 30, "AWARD DAY")
        line(st, 0, cw, y2 - 20)
        lines = {"hack": LB + 10, "award": y2 - 20}
    else:
        hw = 2 * w5 + gap
        label(st, 0, LB, "HACK DAY", "金沢会場")
        line(st, 0, hw, LB + 10)
        label(st, hw + gap, LB, "AWARD DAY")
        line(st, hw + gap, cw, LB + 10)
        lines = {"hack": LB + 10, "award": LB + 10}
    for i, k in enumerate(["aud", "fin", "sp", "inn", "dmm"]):
        x, y, w = pos[k]
        award_card(st, A[k], f"0{i + 1}", x, y, w, ch, size)

    def spot(k, dx=0):
        x, y, w = pos[k]
        return x + w * .62 + dx, y

    names = art.ORDER
    out_at = [3.5 + i * .12 for i in range(4)]
    back_at = [20.6 + i * .14 for i in range(4)]
    dots(st, xs, dy, out_at, back_at)
    c = {n: st.actor(n, xs[i], ry) for i, n in enumerate(names)}
    for i, n in enumerate(names):
        c[n].appear(out_at[i])
    # それぞれ自分の賞のカードへ。赤はいちばん近い緑の賞に先に乗ってしまう
    mine = {"blue": "fin", "green": "sp", "purple": "inn", "red": "dmm"}
    if narrow:
        route = {
            "blue": [(xs[0] - 20, lines["hack"]), spot("fin")],
            "green": [(xs[1] - 30, lines["hack"]), (cw - 40, y1), (cw - 60, lines["award"]), spot("sp", -14)],
            "purple": [(xs[2] - 40, lines["hack"]), (cw - 30, y1), (cw - 40, lines["award"]), spot("inn")],
            "red": [(xs[3] - 50, lines["hack"]), (cw - 20, y1), (cw - 20, lines["award"]), spot("sp", 14)],
        }
    else:
        route = {
            "blue": [(xs[0] - 340, lines["award"]), (spot("fin")[0] + 60, lines["hack"]), spot("fin")],
            "green": [(xs[1] - 200, lines["award"]), spot("sp", -14)],
            "purple": [(xs[2] - 140, lines["award"]), spot("inn")],
            "red": [(xs[3] - 90, lines["award"]), spot("sp", 14)],
        }
    arrive = {"blue": 6.6, "green": 6.4, "purple": 6.0, "red": 5.6}
    for i, n in enumerate(names):
        c[n].wait(4.3 + i * .05).hops(arrive[n], route[n], h=14)
    # 画面に賞が映る（赤は緑の星を映してしまう）
    shows = {"red": 5.8, "purple": 6.2, "green": 6.7, "blue": 6.9}
    for n in ("purple", "blue"):
        k = mine[n]
        st.anim(f"tile-{k}", st.pulse("", shows[n], 1.3))
        x, y, w = pos[k]
        st.sparkle(x + 31, y + 31, shows[n] + .05, 16, 5, art.CHARS[n]["body"])
        c[n].face("icon:" + A[k]["icon"], shows[n] + .1, 19.0)
        c[n].wait(shows[n]).jump(shows[n] + .5, 9)
    c["red"].face("icon:star", 5.9, 8.4)
    c["red"].wait(5.8).jump(6.3, 9).jump(6.8, 9)
    # 緑が来て、じっと見る。赤は気づいて謝る
    c["green"].face("worried", 6.5, 8.4)
    st.mark(spot("sp", -14)[0], spot("sp")[1] - CH - 8, "?", 7.0, 8.0)
    c["green"].wait(7.0).lean(7.3, 10).lean(8.0, 10).lean(8.2, 0)
    c["red"].wait(7.6).lean(7.8, -12)
    c["red"].face("surprised", 8.4, 9.0)
    st.mark(spot("sp", 14)[0], spot("sp")[1] - CH - 8, "!", 8.4, 9.1)
    c["red"].wait(8.4).jump(8.8, 12).put(9.0).bow(10.0, 2)
    st.say(spot("sp", 14)[0], spot("sp")[1] - CH - 4, "ごめん！", 9.0, 10.1)
    c["red"].face("worried", 9.0, 10.0)
    # 赤は自分の賞へ。緑は空いた自分の賞に乗る
    if narrow:
        c["red"].wait(10.1).hops(11.0, [spot("dmm")], h=14)
    else:
        c["red"].wait(10.1).hops(11.0, [spot("inn", 34), spot("dmm")], h=14)
    c["green"].wait(10.1).walk(10.7, spot("sp")[0])
    for n, at in (("green", 10.9), ("red", 11.4)):
        k = mine[n]
        st.anim(f"tile-{k}", st.pulse("", at, 1.3))
        x, y, w = pos[k]
        st.sparkle(x + 31, y + 31, at + .05, 16, 5, art.CHARS[n]["body"])
        c[n].face("icon:" + A[k]["icon"], at + .1, 19.0)
        c[n].wait(at).jump(at + .5, 10)
    c["red"].jump(12.4, 14)
    # みんなの賞（観客賞）へ。4体で乗るとカードがたわむ
    ax, ay, aw = pos["aud"]
    on = [ax + aw / 2 - 33 + i * 22 for i in range(4)]
    if narrow:
        paths = {"blue": [(on[0], ay)],
                 "green": [(cw - 40, lines["award"]), (on[1], ay)],
                 "purple": [(cw - 60, lines["award"]), (on[2] + 4, ay)],
                 "red": [(spot("inn")[0], pos["inn"][1]), (cw - 80, lines["award"]), (on[3], ay)]}
    else:
        paths = {"blue": [(on[0], ay)],
                 "green": [(spot("fin", 20)[0], ay), (on[1], ay)],
                 "purple": [(spot("sp")[0], ay), (spot("fin", 30)[0], ay), (on[2], ay)],
                 "red": [(spot("inn")[0], ay), (spot("sp", 10)[0], ay), (spot("fin", 40)[0], ay), (on[3], ay)]}
    for i, n in enumerate(names):
        c[n].wait(12.8 + i * .15).hops(14.6 + i * .1, paths[n], h=14)
    card_bend = [(14.4, "translate(0px,0px) scale(1,1)"), (14.55, "translate(0px,3px) scale(1,1)"),
                 (14.75, "translate(0px,0px) scale(1,1)"), (14.9, "translate(0px,4px) scale(1,1)"),
                 (15.1, "translate(0px,0px) scale(1,1)")]
    for n in names:
        c[n].face("happy", 15.1, 17.4)
    st.anim("tile-aud", st.pulse("", 15.2, 1.35))
    st.sparkle(ax + 31, ay + 31, 15.25, 22, 7)
    for i, n in enumerate(names):
        y = c[n].y
        c[n].wait(15.4 + i * .1).put(15.6 + i * .1, y=y - 10).put(15.8 + i * .1, y=y)
        c[n].wait(16.3 + i * .1).put(16.5 + i * .1, y=y - 10).put(16.7 + i * .1, y=y)
    st.say(on[1] + 11, ay - CH - 4, "みんなの賞！", 15.3, 17.0)
    st.anim("card-aud", card_bend + [(15.6, "translate(0px,0px) scale(1,1)"), (15.75, "translate(0px,3px) scale(1,1)"),
                                     (15.95, "translate(0px,0px) scale(1,1)"), (16.5, "translate(0px,0px) scale(1,1)"),
                                     (16.65, "translate(0px,3px) scale(1,1)"), (16.85, "translate(0px,0px) scale(1,1)")])
    # 見出しへ戻る
    for i, n in enumerate(names):
        c[n].wait(17.6 + i * .15).hops(20.0 + i * .12, [(on[i] + (40 if narrow else 120), lines["hack"]),
                                                        (xs[i] - 8, ry)], h=18)
    for i, n in enumerate(names):
        c[n].wait(back_at[i]).vanish(back_at[i])
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
