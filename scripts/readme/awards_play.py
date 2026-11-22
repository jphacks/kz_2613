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

# ---------- 物語 ----------
# 事実に沿った筋：私たちは3人のチーム。Hack Day（金沢）で観客賞＝Hack Day の勝者になり、決勝進出＝Award Day への切符を
# 手にして、新幹線で東京へ行き、Award Day で3つの賞を受けた。
# 見出しの4色の点のうち、青・緑・紫の3体がチーム、赤は応援してくれる観客。観客賞は赤の投票（ハート）で贈られる。
# 決勝進出は、3人分の切符が1枚ずつ届き、灰色だった金沢→東京の路線が光って開通することで「資格を得た」ことを表す。
# セリフは使わず、「!」「♪」やハートなどの記号だけにする。
ICONS["crown"] = '<path d="M3.6 8.6l4.5 3.7L12 5.6l3.9 6.7 4.5-3.7-1.8 9.2H5.4z"/><path d="M5.6 20.6h12.8"/>'
ICONS["ticket"] = ('<path d="M3 6.6h18v3.1a2.3 2.3 0 0 0 0 4.6v3.1H3v-3.1a2.3 2.3 0 0 0 0-4.6z"/>'
                   '<path d="M14.6 7.8v1.4M14.6 11.3v1.4M14.6 14.8v1.4"/>')
# 色は、受け取るキャラクターの色にする。観客賞は観客（赤）が贈る賞、切符はチーム3人のものなのでグラデーション
COLORS = {"aud": ("crown", "red"), "fin": ("ticket", "brand"), "sp": ("star", "green"), "inn": ("bulb", "purple"),
          "dmm": ("trophy", "blue")}
for _a in AWARDS:
    _a["icon"], _a["color"] = COLORS[_a["key"]]
TEAM = ["blue", "green", "purple"]  # 前から順に（青が先頭）
MINE = {"green": "sp", "purple": "inn", "blue": "dmm"}
PAGE = {"light": "#FFFFFF", "dark": "#0D1117"}
HEART = "M0 3.2C-1.6-.6-6.4-.4-6.4 3.4c0 3.4 6.4 6.8 6.4 6.8s6.4-3.4 6.4-6.8C6.4-.4 1.6-.6 0 3.2z"


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


def fly(st, art_svg, t0, t1, p0, p1, peak=-30, n=8):
    """小道具（(0,0) を中心に描いたもの）を、t0〜t1秒に p0 から p1 へ放物線で飛ばす。飛んでいるあいだだけ見える。"""
    cls = f"fly{len(st.css)}"
    (x0, y0), (x1, y1) = p0, p1
    fr = [(t0 - .01, f"translate({x0}px,{y0}px) scale(0)"), (t0, f"translate({x0}px,{y0}px) scale(.4)")]
    for k in range(1, n + 1):
        u = k / n
        x, y = x0 + (x1 - x0) * u, y0 + (y1 - y0) * u + peak * 4 * u * (1 - u)
        s = .4 + .6 * min(1, u * 3)
        fr.append((t0 + (t1 - t0) * u, f"translate({x:.1f}px,{y:.1f}px) scale({s:.2f})"))
    fr += [(t1 + .12, f"translate({x1}px,{y1}px) scale(0)")]
    st.front.append(f'<g class="fx"><g class="{cls}">{art_svg}</g></g>')
    st.anim(cls, fr, origin="50% 50%", base="scale(0)")


def ticket_art():
    """手に入れる切符（ブランドのグラデーション、白い星と切り取り線）。"""
    return ('<path d="M-15-9H15V-3.2A3.2 3.2 0 0 0 15 3.2V9H-15V3.2A3.2 3.2 0 0 0-15-3.2Z" fill="url(#brand)" '
            'stroke="#FFFFFF" stroke-width="1.2"/>' + art.star(-4, 0, 5, "#FFFFFF")
            + '<path d="M7-6.5v2.6M7-1.3v2.6M7 3.9v2.6" stroke="#FFFFFF" stroke-width="1.4" stroke-linecap="round"/>')


def heart_art(color="#FF1D00"):
    return f'<path d="{HEART}" transform="translate(0 -4)" fill="{color}" stroke="#FFFFFF" stroke-width="1.4"/>'


def cheer(st, a, t0, x, y):
    """観客（赤）の応援：跳ねて、ハートを出す。"""
    a.wait(t0).jump(t0 + .5, 10)
    cls = f"h{len(st.css)}"
    st.front.append(f'<g class="fx"><g class="{cls}"><g transform="translate({x} {y})">{heart_art()}</g></g></g>')
    st.anim(cls, [(t0, "translate(0px,0px) scale(0)", OUT_), (t0 + .25, "translate(0px,-6px) scale(1.15)"),
                  (t0 + .9, "translate(0px,-16px) scale(.9)", IN), (t0 + 1.1, "translate(0px,-18px) scale(0)")],
            origin="50% 50%", base="scale(0)")


def setup(t, narrow, H, D):
    W = art.PHONE_W if narrow else art.PC_W
    st = Stage(W, H, D, t)
    x0, x1, ry, xs, dy = heading(st, W, 2 if narrow else 4)
    if x1 - x0 < 24:  # スマホでは線が短すぎて描かれない（目次の見出しと同じ）
        st.back[-1] = "</g>"
    g = Geo(W=W, cw=W - 14, narrow=narrow, x0=x0, ry=ry, xs=xs, dy=dy, CT=78)
    return st, g


def rows(st, g, L, R):
    A = {a["key"]: a for a in AWARDS}
    g.e = {}
    for k, x, cy in (("aud", L, g.r1), ("fin", L, g.r2), ("sp", R, g.q1), ("inn", R, g.q2), ("dmm", R, g.q3)):
        g.e[k] = row(st, A[k], x, cy)
    g.L, g.R = L, R
    g.spots = {n: (g.e[k] + 20, g.feet({"sp": g.q1, "inn": g.q2, "dmm": g.q3}[k])) for n, k in MINE.items()}
    g.tiles = {"aud": (L + 15, g.r1), "fin": (L + 15, g.r2), "sp": (R + 15, g.q1), "inn": (R + 15, g.q2),
               "dmm": (R + 15, g.q3)}


def station(st, x, y, color, cls=""):
    c = f' class="{cls}"' if cls else ""
    st.back.append(f'<circle{c} cx="{x}" cy="{y}" r="6.5" fill="{PAGE[mode_of(st.t)]}" stroke="{color}" stroke-width="3"/>')


def lock(st, shape, ring, t_on, u0, u1, origin):
    """路線の「未開通」：灰色の線（と東京駅の灰色の輪）を重ね、u0〜u1秒に金沢側から消して、路線を開通させる。"""
    gray = st.t["line"]
    st.front.insert(0, f'<g class="fx"><g class="lockO"><g class="lockS">{shape(gray)}</g></g>'
                       f'<g class="lockT">{ring(gray)}</g></g>')
    opa = [(t_on, 0), (t_on + .4, 1), (u1, 1), (u1 + .01, 0)]
    st.anim("lockO", opa, prop="opacity", base="0")
    st.anim("lockT", [(t_on, 0), (t_on + .4, 1), (u1 - .1, 1), (u1 + .2, 0)], prop="opacity", base="0")
    st.anim("lockS", [(u0, "scale(1,1)", IO), (u1, "scale(0,0.999)" if origin.startswith("100%") else "scale(0.999,0)"),
                      (u1 + .02, "scale(1,1)")], origin=origin)


def common_story(st, g, c, T):
    """Hack Day で喜ぶところから、切符・開通までを、観客の赤も含めて描く。T：時刻の辞書。"""
    # 観客（赤）が投票し、ハートが王冠のタイルに届く → Hack Day の勝者
    rx, ryy = c["red"].x, c["red"].y
    c["red"].wait(T["vote"] - .4).jump(T["vote"], 12)
    fly(st, heart_art(), T["vote"], T["vote"] + .7, (rx, ryy - CH - 4), g.tiles["aud"], peak=-26)
    hit = T["vote"] + .7
    st.anim("tile-aud", st.pulse("tile-aud", hit, 1.4))
    st.sparkle(*g.tiles["aud"], hit + .02, 22, 8)
    st.sparkle(*g.tiles["aud"], hit + .02, 12, 5, "#FF1D00")
    for i, n in enumerate(TEAM):
        c[n].wait(hit + .05 + i * .06).jump(hit + .6 + i * .06, 10).jump(hit + 1.25 + i * .06, 12)
        c[n].face("happy", hit, hit + 1.8)
    st.mark(g.aud[1], g.top(g.r1) - CH - 6, "♪", hit + .2, hit + 1.6)
    c["red"].face("happy", hit, hit + 1.8)
    c["red"].wait(hit + .2).jump(hit + .7, 10)
    # 決勝進出：青が行へ跳ぶとタイルが大きく光り、3人分の切符が1枚ずつ飛んできて、それぞれの画面に収まる
    tb = T["ticket"]
    c["blue"].wait(tb).hop(tb + .5, g.e["fin"] + 20, g.feet(g.r2), 10)
    st.anim("tile-fin", [(tb + .55, "scale(1)", OUT_), (tb + .75, "scale(1.5)", IO), (tb + 1.0, "scale(1.3)"),
                         (tb + 2.1, "scale(1.3)", IO), (tb + 2.35, "scale(1)")])
    st.sparkle(*g.tiles["fin"], tb + .6, 22, 8)
    for k, n in enumerate(TEAM):
        a = c[n]
        t0 = tb + .9 + k * .38
        fly(st, ticket_art(), t0, t0 + .55, g.tiles["fin"], (a.x, a.y - CH * .62), peak=-34)
        a.face("icon:ticket", t0 + .55, T["end_ticket"])
        a.wait(t0 + .5).put(t0 + .62, sx=1.15, sy=.85).jump(t0 + 1.1, 12)
        st.sparkle(a.x, a.y - CH * .62, t0 + .56, 14, 5, art.CHARS[n]["body"])
    # 3人で切符を掲げる（そろって跳ぶ）
    tj = tb + .9 + 2 * .38 + 1.2
    for n in TEAM:
        c[n].wait(tj).jump(tj + .5, 14)
    st.mark(g.e["fin"] + 46, g.feet(g.r2) - CH - 6, "!", tj, tj + .9, 20, "#22C4FA")
    return tj + .5


def award_part(st, g, c, T, arrive):
    """Award Day：3人がそれぞれの賞へ。受け取ると画面に賞が映り、観客の赤が応援する。"""
    A = {a["key"]: a for a in AWARDS}
    for n, (a, b, pts) in arrive.items():
        c[n].wait(a).hops(b, pts, h=12)
    times = {"green": T + 1.9, "purple": T + 2.6, "blue": T + 3.3}
    for n, at in times.items():
        key = MINE[n]
        st.anim(f"tile-{key}", st.pulse(f"tile-{key}", at, 1.4))
        st.sparkle(*g.tiles[key], at + .05, 18, 6, art.CHARS[n]["body"])
        c[n].face("icon:" + A[key]["icon"], at + .1, T + 6.0)
        c[n].wait(at).jump(at + .55, 10)
        cheer(st, c["red"], at + .25, c["red"].x, c["red"].y - CH - 6)
    for i, n in enumerate(TEAM + ["red"]):
        c[n].wait(T + 4.4 + i * .07).jump(T + 4.95 + i * .07, 10).jump(T + 5.5 + i * .07, 12)
    sx, sy = g.spots["purple"]
    st.mark(sx + 34, sy - CH - 10, "♪", T + 4.5, T + 5.8)


def finish(st, g, c, T, back, red_back):
    for i, n in enumerate(TEAM):
        c[n].wait(T + 6.0 + i * .1).hops(T + 7.6 + i * .15, back[n], h=14)
    red_back(c["red"], T + 6.2, T + 7.6)
    order = art.ORDER
    back_at = [T + 8.1 + i * .14 for i in range(4)]
    for i, n in enumerate(order):
        c[n].wait(back_at[i]).vanish(back_at[i])
    dots(st, g.xs, g.dy, [3.5 + i * .12 for i in range(4)], back_at)
    return T + 9.0


@option("2", "路線図（3人チームと観客）",
        "カードを金沢と東京を結ぶ路線図にする。青・緑・紫の3体がチーム、赤は応援する観客。"
        "観客の赤が投票のハートを送ると、観客賞の王冠が光る（Hack Day の勝者）。決勝進出では、3人分の切符が1枚ずつ飛んできて"
        "それぞれの画面に収まり、灰色だった路線が金沢から東京まで光って開通する。"
        "PCでは3体が連なって列車になり、赤は見出しの線の上を並走して見送る。スマホでは縦の路線図で、3体が新幹線に乗って下る。"
        "東京ではそれぞれ自分の賞を受け取り、赤が応援する。")
def option_2(t, narrow=False):
    return route_narrow(t) if narrow else route_pc(t)


def route_pc(t):
    H = 78 + 206
    D = 26.8
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
    T = {"vote": 8.9, "ticket": 10.9}
    unlock0 = 13.5
    T["end_ticket"] = 26
    lock(st, lambda c_: f'<rect x="{L}" y="{RL - 1.5}" width="{x1 - L}" height="3" rx="1.5" fill="{c_}"/>',
         lambda c_: f'<circle cx="{R + 8}" cy="{RL}" r="6.5" fill="{PAGE[mode_of(t)]}" stroke="{c_}" stroke-width="3"/>',
         3.7, unlock0, unlock0 + .9, "100% 50%")
    st.anim("st-tokyo", [(unlock0 + .85, "scale(1)", OUT_), (unlock0 + 1.05, "scale(1.6)", IO), (unlock0 + 1.3, "scale(1)")])
    st.sparkle(R + 8, RL, unlock0 + .9, 18, 6, "#22C4FA")
    c = {n: st.actor(n, g.xs[i], g.ry) for i, n in enumerate(art.ORDER)}
    for i, n in enumerate(art.ORDER):
        c[n].appear(3.5 + i * .12)
    # チームは見出しの線の上を駆けて Hack Day へ。紫は止まりきれずに緑にぶつかる
    line_x = [g.x0 + 12 + i * 23 for i in range(3)]
    c["blue"].wait(4.5).run(5.9, line_x[0])
    c["green"].wait(4.58).run(6.0, line_x[1])
    c["purple"].wait(4.7).run(6.05, line_x[2] - 5).shake(6.35, 8, 2, 1.1, .88)
    c["green"].wait(6.05).lean(6.17, -12).lean(6.4, 0)
    st.mark(line_x[2] - 2, g.ry - CH - 4, "!", 6.05, 6.7)
    for i, n in enumerate(TEAM):
        c[n].wait(6.8 + i * .15).hops(7.9 + i * .15, [(line_x[i] - 40, rl), (g.aud[i], g.top(g.r1))], h=16)
    # 観客の赤は、見出しの線の上を歩いて Hack Day の上で見守る
    c["red"].wait(4.9).walk(7.2, 330)
    common_story(st, g, c, T)
    # 3人で路線に上がって連なる（青が先頭）
    gap, front0, front1 = 22, 150, 540
    tf = unlock0 + 1.2
    c["blue"].wait(tf).hops(tf + .9, [(210, g.top(g.r1)), (front0, rl)], h=12)
    c["green"].wait(tf + .1).hop(tf + .8, front0 - gap, rl, 14)
    c["purple"].wait(tf + .2).hop(tf + .9, front0 - 2 * gap, rl, 14)
    st.mark(front0 + 14, rl - CH - 6, "♪", tf + .95, tf + 1.5)
    t_go, t_end = tf + 1.3, tf + 4.3
    for k, n in enumerate(TEAM):
        c[n].wait(t_go).walk(t_end, front1 - k * gap, step=10, h=3)
    # 赤は見出しの線の上を並走して見送る
    c["red"].wait(t_go - .6).shake(t_go, 10, 4)
    c["red"].wait(t_go).walk(t_end, 700, step=12, h=4)
    TA = t_end + .2
    sp, inn, dmm = g.spots["green"], g.spots["purple"], g.spots["blue"]
    arrive = {"green": (TA, TA + .9, [sp]),
              "purple": (TA + .15, TA + 1.2, [(inn[0] - 40, g.top(g.q1)), inn]),
              "blue": (TA + .3, TA + 1.5, [(dmm[0] - 70, g.top(g.q1)), (dmm[0] - 40, g.top(g.q2)), dmm])}
    award_part(st, g, c, TA, arrive)
    back = {"blue": [(560, g.top(g.q2)), (690, rl), (g.xs[0], g.ry)],
            "green": [(660, rl), (g.xs[1], g.ry)],
            "purple": [(570, g.top(g.q1)), (680, rl), (g.xs[2], g.ry)]}
    finish(st, g, c, TA, back, lambda a, t0, t1: a.wait(t0).walk(t1, g.xs[3]))
    return st.svg()


def train_icon(t):
    """縦の路線図を下る新幹線（先頭は下）。3つの窓は、乗ったキャラクターの色で光る。"""
    dark = t is art.THEMES["dark"]
    body = "#E8EDF5" if dark else "#FFFFFF"
    edge = "#8A95A8" if dark else "#A9B3C3"
    out = (f'<path d="M-12 7Q-12 0-5 0H5Q12 0 12 7V50Q12 66 0 74Q-12 66-12 50Z" fill="{body}" stroke="{edge}" stroke-width="1.5"/>'
           '<rect x="7" y="4" width="3" height="54" rx="1.5" fill="url(#brand)"/>'
           '<path d="M-6 56H6L3 63H-3Z" fill="#1C2333"/>')
    for k, n in enumerate(["purple", "green", "blue"]):
        y = 12 + k * 14
        out += (f'<rect x="-6" y="{y - 4.5}" width="10" height="9" rx="3" fill="#1C2333"/>'
                f'<rect class="win-{n}" x="-6" y="{y - 4.5}" width="10" height="9" rx="3" fill="{art.CHARS[n]["body"]}"/>')
    return out


def route_narrow(t):
    D = 27.2
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
    st.back.append(f'<rect x="{LX - 1.5}" y="{S1}" width="3" height="{S2 - S1}" rx="1.5" fill="{grad(st, 0, S1, 0, S2)}"/>')
    station(st, LX, S1, "#C03BFF")
    station(st, LX, S2, "#22C4FA", "st-tokyo")
    g.r1, g.r2 = S1 + 44, S1 + 88
    g.q1, g.q2, g.q3 = S2 + 44, S2 + 88, S2 + 132
    rows(st, g, X0, X0)
    g.aud = [X0 + 52 + i * 38 for i in range(3)]
    T = {"vote": 8.6, "ticket": 10.6, "end_ticket": 27}
    unlock0 = 13.2
    lock(st, lambda c_: f'<rect x="{LX - 1.5}" y="{S1}" width="3" height="{S2 - S1}" rx="1.5" fill="{c_}"/>',
         lambda c_: f'<circle cx="{LX}" cy="{S2}" r="6.5" fill="{PAGE[mode_of(t)]}" stroke="{c_}" stroke-width="3"/>',
         3.7, unlock0, unlock0 + .9, "50% 100%")
    st.anim("st-tokyo", [(unlock0 + .85, "scale(1)", OUT_), (unlock0 + 1.05, "scale(1.6)", IO), (unlock0 + 1.3, "scale(1)")])
    st.sparkle(LX, S2, unlock0 + .9, 18, 6, "#22C4FA")
    c = {n: st.actor(n, g.xs[i], g.ry) for i, n in enumerate(art.ORDER)}
    for i, n in enumerate(art.ORDER):
        c[n].appear(3.5 + i * .12)
    # チームは観客賞の文字の右端に跳び乗り、文字の上を歩いて並ぶ。赤は見出しに残って見守る
    for i, n in enumerate(TEAM):
        c[n].wait(4.6 + i * .15).hop(5.4 + i * .15, 262 - i * 6, g.top(g.r1), 18).walk(7.0 + i * .2, g.aud[i])
    c["red"].wait(4.5).walk(5.2, g.xs[3] - 8)
    common_story(st, g, c, T)
    # 新幹線が金沢駅に入ってくる。3体は乗り込むと、窓がその色で光る
    tr_in, ride0 = unlock0 + 1.1, unlock0 + 2.6
    y_top = S1 + 10
    ride1 = ride0 + 2.4
    y_end = S2 - 50
    tr = [(tr_in, f"translate(0px,{y_top - 30}px)"), (tr_in + .5, f"translate(0px,{y_top}px)"),
          (ride0, f"translate(0px,{y_top}px)", IO), (ride1, f"translate(0px,{y_end}px)"),
          (ride1 + 1.6, f"translate(0px,{y_end}px)"), (ride1 + 2.0, f"translate(0px,{y_end + 20}px)")]
    st.front.append(f'<g class="fx"><g class="trainO"><g class="train"><g transform="translate({LX} 0)">{train_icon(t)}</g></g></g></g>')
    st.anim("train", tr, base=f"translate(0px,{y_top - 30}px)")
    st.anim("trainO", [(tr_in, 0), (tr_in + .4, 1), (ride1 + 1.6, 1), (ride1 + 2.0, 0)], prop="opacity", base="0")
    board = {"blue": tr_in + .6, "green": tr_in + .85, "purple": tr_in + 1.1}
    for k, n in enumerate(TEAM):
        a = c[n]
        b = board[n]
        a.wait(b).hop(b + .45, LX, y_top + 40, 14)
        a.key(b + .55, sx=0, sy=0, ease=IN).put(b + .56, sx=0, sy=0)
        st.anim(f"win-{n}", [(b + .5, 0), (b + .6, 1), (ride1 + .3 + k * .2, 1), (ride1 + .4 + k * .2, 0)],
                prop="opacity", base="0")
    # 東京駅に着くと、3体が窓から飛び出して、それぞれの賞へ
    for k, n in enumerate(TEAM):
        a = c[n]
        out_t = ride1 + .3 + k * .2
        a.key(out_t - .01, LX, y_end + 40, 0, 0, 0)
        a.x, a.y, a.t = LX, y_end + 40, out_t - .01
        a.key(out_t, sx=0, sy=0, ease=OUT_).key(out_t + .15, sx=1.2, sy=.85).put(out_t + .3)
    st.mark(LX + 22, y_end + 10, "♪", ride1 + .2, ride1 + .9)
    TA = ride1 + .4
    sp, inn, dmm = g.spots["green"], g.spots["purple"], g.spots["blue"]
    arrive = {"blue": (TA + .35, TA + 1.4, [(dmm[0] - 60, g.top(g.q2)), dmm]),
              "green": (TA + .55, TA + 1.4, [sp]),
              "purple": (TA + .75, TA + 1.6, [inn])}
    award_part(st, g, c, TA, arrive)
    back = {}
    for k, n in enumerate(TEAM):
        x = 250 + k * 18
        back[n] = [(x - 20, g.top(g.q1)), (x - 40, g.top(g.r2) + 4), (x, g.top(g.r1)), (g.xs[k], g.ry)]
    finish(st, g, c, TA, back, lambda a, t0, t1: a.wait(t0).walk(t1, g.xs[3]))
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
