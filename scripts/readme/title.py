"""READMEの作品名（h1）を、GitHubの見出しと同じ見た目のSVGアニメーションにする案を生成する。

最初はふつうの見出しにしか見えず、少し時間がたつと4色のキャラクターが現れて文字で遊ぶ。
1行目の作品名はGitHubの h1（32px・太さ600）、2行目のキャッチコピーは h2 と同じ24pxにする。
文字はGitHub本体と同じフォント指定で描き、1文字ずつの位置はGitHubの見出しをChromeで実測した幅
（WIDTHS、32pxのとき）で置く。READMEでは <h1> の中に align="absbottom" で入れると、
見出しの下線までの間隔もふつうの見出しと同じになる。

    python scripts/readme/title.py
"""
import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import build_art as art  # noqa: E402

OUT = art.OUT / "title"
TITLE = "Re:Cooplay（リコープレイ）ゲームはそのまま。1キャラを、みんなで操作。"
# GitHubの h1（32px・太さ600）で実測した各文字の幅（Windows・Chrome）
WIDTHS = [19.08, 17, 7.72, 19.88, 19.11, 19.11, 19.28, 8.36, 16.7, 16.27, 32, 32, 32, 30.09, 32.02, 32.02, 32.02,
          32.02, 32.02, 31.05, 32.02, 32.02, 32.02, 32.02, 32.02, 30.73, 32.02, 12.89, 32.02, 32.02, 32.02, 32.02,
          32.02, 32.02, 32.02, 32.02, 32.02, 32.02, 32.02, 32.02]
# 英字はまとめて1つの要素にし、端末のフォントの違いを textLength で吸収する。「:」は動かすので分ける
WORDS = [(0, 2), (2, 3), (3, 10)]
# 行：(始まり, 終わり, 文字の大きさ)
LINES = {"wide": [(0, 18, 32), (18, 40, 24)],
         "narrow": [(0, 10, 32), (10, 18, 32), (18, 27, 24), (27, 40, 24)]}
SIZE = {"wide": art.PC_W, "narrow": art.PHONE_W}
TOP = 18  # 上の余白（跳ねる分）
INK = {"light": "#1F2328", "dark": "#F0F6FC"}
FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI','Noto Sans',Helvetica,Arial,sans-serif"
STILL = "@media (prefers-reduced-motion:reduce){*{animation:none!important}}"
COLON = TITLE.index(":")
BALL = len(TITLE) - 1  # 文末の「。」
BAR = TITLE.index("ー")  # リコープレイ の「ー」
STAY = list(range(TITLE.index("ゲーム"), TITLE.index("1キャラ")))  # 「ゲームはそのまま。」


def T(x=0, y=0, r=0, sx=1, sy=1):
    return f"translate({x:.1f}px,{y:.1f}px) rotate({r:.1f}deg) scale({sx},{sy})"


class Title:
    def __init__(self, kind, mode, dur):
        self.kind, self.mode, self.dur = kind, mode, dur
        self.rows = LINES[kind]
        self.W = SIZE[kind]
        self.tops, y = [], TOP
        for _, _, size in self.rows:
            self.tops.append(y)
            y += size * 1.25
        self.H = y
        self.g = self.layout()
        self.css, self.front, self.back = [], [], []
        self.moves, self.groups, self.halves = {}, [], {}

    def layout(self):
        """各要素の {始まりの番号: (文字, x, 行, 幅, 大きさ)}。"""
        g = {}
        words = {a: z for a, z in WORDS}
        for row, (a, z, size) in enumerate(self.rows):
            x, i = 0.0, a
            k = size / 32
            while i < z:
                end = words.get(i, i + 1)
                w = sum(WIDTHS[i:end]) * k
                g[i] = (TITLE[i:end], x, row, w, size)
                x += w
                i = end
        return g

    # 位置
    def base(self, row):
        size = self.rows[row][2]
        return self.tops[row] + size * 1.25 / 2 + 13 * size / 32

    def ground(self):
        return self.H

    def center(self, i):
        """文字の見た目の中心（「。」「:」「ー」用）。"""
        ch, x, row, w, size = self.g[i]
        b = self.base(row)
        if ch == "。":
            return x + w * .27, b - size * .12
        if ch == ":":
            return x + w / 2, b - size * .33
        if ch == "ー":
            return x + w / 2, b - size * .36
        return x + w / 2, b - size * .35

    # 動き
    def kf(self, name, frames, origin="50% 100%"):
        body = "".join(f"{p:g}%{{transform:{v}}}" for p, v in sorted(frames))
        self.css.append(f"@keyframes {name}{{{body}}}.{name}{{animation:{name} {self.dur}s linear infinite;"
                        f"transform-box:fill-box;transform-origin:{origin}}}")

    def move(self, i, frames, origin="50% 100%"):
        self.moves[i] = (fill(frames), origin)

    def move_group(self, ids, frames):
        self.groups.append((list(ids), fill(frames)))

    def split(self, i, top_frames, bottom_frames):
        """「:」を上下2つの点に分けて、それぞれ動かす。"""
        self.halves[i] = (fill(top_frames), fill(bottom_frames))

    def actor(self, cid, name, x, frames, s=.2, front=True):
        """キャラクター。(x, 下端) に足を置く。下端より下に出た部分は画像の外なので隠れる。"""
        self.kf(f"a-{cid}", fill(frames))
        y = self.ground() - 124 * s
        body = f'<g class="a-{cid}">{art.char(name, x - 50 * s, y, s, art.THEMES[self.mode])}</g>'
        (self.front if front else self.back).append(body)

    def render(self):
        ink = INK[self.mode]
        texts = {}
        for i, (ch, x, row, w, size) in sorted(self.g.items()):
            fit = f' textLength="{w:.2f}" lengthAdjust="spacingAndGlyphs"' if len(ch) > 1 else ""
            t = f'<text x="{x:.2f}" y="{self.base(row):.2f}" class="h{size}"{fit}>{ch}</text>'
            if i in self.halves:
                b = self.base(row)
                cut = b - size * .3
                parts = []
                for n, (fr, y0, y1) in enumerate(((self.halves[i][0], b - size, cut), (self.halves[i][1], cut, b + 6))):
                    self.kf(f"c{i}{n}", fr, "50% 50%")
                    parts.append(f'<clipPath id="cut{i}{n}"><rect x="{x - 4:.1f}" y="{y0:.1f}" width="{w + 8:.1f}" height="{y1 - y0:.1f}"/></clipPath>'
                                 f'<g class="c{i}{n}"><g clip-path="url(#cut{i}{n})">{t}</g></g>')
                t = "".join(parts)
            elif i in self.moves:
                fr, origin = self.moves[i]
                self.kf(f"g{i}", fr, origin)
                t = f'<g class="g{i}">{t}</g>'
            texts[i] = t
        for n, (ids, fr) in enumerate(self.groups):
            self.kf(f"gg{n}", fr)
            texts[ids[0]] = f'<g class="gg{n}">' + "".join(texts.pop(i) for i in ids if i in texts) + "</g>"
        css = (f".h32{{font-family:{FONT};font-size:32px;font-weight:600;fill:{ink}}}"
               f".h24{{font-family:{FONT};font-size:24px;font-weight:600;fill:{ink}}}" + "".join(self.css) + STILL)
        body = "".join(self.back) + "".join(texts[k] for k in sorted(texts)) + "".join(self.front)
        return art.svg(self.W, self.H, body, art.THEMES[self.mode], TITLE, css)


def fill(frames):
    """0% と 100% を止まった状態で補い、同じ時刻は後のものを使う。"""
    out = {0: T(), 100: T()}
    for p, v in frames:
        out[round(p, 2)] = v
    return sorted(out.items())


def arc(p0, p1, x0, y0, x1, y1, peak, n=8):
    """p0〜p1(%) に (x0,y0) から (x1,y1) へ放物線で飛ぶ。peak は頂点の高さ（上が負）。"""
    out = []
    for k in range(n + 1):
        u = k / n
        x = x0 + (x1 - x0) * u
        y = y0 + (y1 - y0) * u + peak * 4 * u * (1 - u)
        out.append((p0 + (p1 - p0) * u, T(x, y)))
    return out


class Path:
    """キャラクターの動き。位置は画像の中の絶対座標（x、足の高さ y）で持ち、歩く・跳ぶ・飛び乗るを順に足していく。
    ふつうは画像の外から歩いてきて、画像の外へ歩いて去る。"""

    def __init__(self, t, x, y=None):
        self.t, self.x, self.y, self.p = t, x, t.H if y is None else y, 0
        self.k = []
        self.put(0)

    def put(self, p, dy=0, r=0, sx=1, sy=1, dx=0):
        self.k.append((round(p, 2), T(self.x + dx, self.y - self.t.H + dy, r, sx, sy)))
        return self

    def wait(self, p):
        self.put(p)
        self.p = p
        return self

    def walk(self, p, x):
        """同じ高さで x まで歩く（1歩ごとに小さく弾む）。"""
        n = max(2, round(abs(x - self.x) / 12))
        x0, p0 = self.x, self.p
        for j in range(1, n + 1):
            self.x = x0 + (x - x0) * j / n
            self.put(p0 + (p - p0) * j / n, -3 if j % 2 else 0)
        self.p = p
        return self

    def hop(self, p, x, y, h=10):
        """(x, y) へ跳ぶ。踏み切りでかがみ、着地でつぶれる。"""
        x0, y0, p0 = self.x, self.y, self.p
        d = p - p0
        self.put(p0 + d * .15, sx=1.1, sy=.86)
        peak = min(y0, y) - h
        for u in (.35, .55, .75):
            self.k.append((round(p0 + d * (.15 + .7 * u), 2),
                           T(x0 + (x - x0) * u, (y0 + (y - y0) * u) + (peak - min(y0, y)) * 4 * u * (1 - u) - self.t.H)))
        self.x, self.y = x, y
        self.put(p0 + d * .9, sx=1.12, sy=.86)
        self.put(p)
        self.p = p
        return self

    def jump(self, p, h=8):
        """その場で跳ねる（喜ぶ・押し上げる）。"""
        d = p - self.p
        self.put(self.p + d * .2, sx=1.08, sy=.9)
        self.put(self.p + d * .55, dy=-h, sx=.95, sy=1.06)
        self.put(self.p + d * .9, sx=1.06, sy=.92)
        self.put(p)
        self.p = p
        return self

    def lean(self, p, r):
        self.put(p, r=r)
        self.p = p
        return self

    def frames(self):
        last = self.k[-1][1]
        return self.k + [(100, last)]


def plat(t, row):
    """文字の上（キャラクターが乗れる高さ）。"""
    size = t.rows[row][2]
    return t.base(row) - size * .8


def row_end(t, row):
    a, z, _ = t.rows[row]
    keys = [i for i in t.g if a <= i < z]
    ch, x, _, w, _ = t.g[max(keys)]
    return x + w


def climb(path, p, x, row):
    """下の地面から、文字の段を1段ずつ跳び乗って、row の文字の上へ上がる。"""
    t = path.t
    rows = list(range(len(t.rows) - 1, row - 1, -1))
    d = (p - path.p) / len(rows)
    for k, r in enumerate(rows):
        path.hop(path.p + d, path.x + (x - path.x) / (len(rows) - k), plat(t, r), 8)
    return path


def descend(path, p, x):
    """文字の上から段を下りて、地面へ降りる。"""
    t = path.t
    cur = min((r for r in range(len(t.rows)) if abs(plat(t, r) - path.y) < 1), default=len(t.rows))
    rows = list(range(cur + 1, len(t.rows))) + [None]
    d = (p - path.p) / len(rows)
    for k, r in enumerate(rows):
        y = t.H if r is None else plat(t, r)
        path.hop(path.p + d, path.x + (x - path.x) / (len(rows) - k), y, 6)
    return path


# ---------- 共通：「。」を蹴って「:」に当てる ----------
HIT = 36


def kick_ball(t):
    """赤が歩いてきて、文末の「。」を蹴る。「。」は行をまたいで「:」に当たり、跳ね返って転がって元の場所に戻る。
    戻り値は赤の Path（蹴ったあとの動きは各案で足す）。"""
    bx, by = t.center(BALL)
    cx, cy = t.center(COLON)
    dx, dy = cx - bx, cy - by
    fly = arc(29, HIT, 0, 0, dx, dy, min(dy, 0) - 30, 10)
    back = [(HIT + 2, T(dx + 18, dy - 12)), (HIT + 5, T(dx + 36, (dy - 12) * .3)), (HIT + 7, T(dx + 46, 0)),
            (HIT + 8.5, T(dx + 52, -8)), (HIT + 10, T(dx + 58, 0)), (HIT + 18, T(dx * .3, 0)), (HIT + 20, T(0, -5)),
            (HIT + 21.5, T(0, 0))]
    t.move(BALL, [(28.5, T()), *fly, *back], origin="50% 50%")
    end = t.g[BALL][1] + t.g[BALL][3]
    red = Path(t, t.W + 24)
    red.wait(16).walk(26, min(end + 12, t.W - 10)).lean(27, -14).lean(28.5, 18).lean(30, 0)
    return red


def colon_drop():
    """「:」がぐらついて、真下の文字の上へボトッと落ちる。dy は落ちる量。"""
    def frames(dy, dx=6):
        return [(HIT, T()), (HIT + .8, T(-3, -3, -18)), (HIT + 2, T(-1, 0, 12)), (HIT + 5, T(dx, dy, 30)),
                (HIT + 5.7, T(dx, dy, 0, 1.3, .65)), (HIT + 6.8, T(dx, dy - 7)), (HIT + 8, T(dx, dy)),
                (HIT + 8.7, T(dx, dy, 0, 1.1, .85)), (HIT + 9.5, T(dx, dy))]
    return frames


def setup(kind, mode, dur=14):
    """3案に共通の段取り。「:」の落ちる量と、乗る段・位置を返す。"""
    t = Title(kind, mode, dur)
    red = kick_ball(t)
    cx, _ = t.center(COLON)
    land_row = 1  # 「:」は真下の行の文字の上に落ちる
    colon_bottom = t.base(t.g[COLON][2])
    dy = plat(t, land_row) - colon_bottom
    return t, red, cx, land_row, dy


def enter(t, x_stop, row, p_in, p_up, start=-30):
    """左の外から地面を歩いてきて、文字の段を上がる。"""
    path = Path(t, start)
    path.wait(p_in).walk(p_in + 8, max(x_stop - 14, 4))
    return climb(path, p_up, x_stop, row)


def leave(path, p_down, p_out, side="left"):
    """文字の段を下りて、地面を歩いて外へ出ていく。"""
    t = path.t
    descend(path, p_down, path.x)
    path.walk(p_out, -40 if side == "left" else t.W + 40)
    return path


# ---------- 案C1：みんなで担いで戻す ----------
def carry(kind, mode):
    """落ちた「:」を、文字の上に乗った青・緑・紫が担いで元の場所の下まで運ぶ。最後は蹴った赤が跳んで押し込む。"""
    t, red, cx, row, dy = setup(kind, mode)
    s = 124 * .2
    held = dy - s - 2  # 担いだときの「:」の高さ（3体の頭の上）
    fr = colon_drop()(dy)
    fr += [(56, T(6, dy)), (58, T(10, held)), (60, T(16, held - 3)), (62, T(10, held)), (64, T(4, held - 3)),
           (66, T(0, held)), (70, T(0, held)), (72.5, T(0, -6)), (73.5, T(0, 0, 0, 1.12, .88)), (75, T())]
    t.move(COLON, fr)
    for k, (name, off) in enumerate((("blue", -14), ("green", 6), ("purple", 26))):
        path = enter(t, cx + off + 16, row, 40 + k * 2, 52 + k)
        path.walk(56, cx + off + 16)
        # 担いでわっしょい（少し右に揺れて戻る）
        path.put(58, dy=-2).put(60, dx=6, dy=-4).put(62, dy=-2).put(64, dx=-6, dy=-4).put(66, dy=0)
        path.wait(70).jump(78 + k * .5, 7)
        leave(path, 84, 94)
        t.actor(f"m{k}", name, 0, path.frames())
    # 赤：蹴ったあと地面を歩いて左へ、文字に乗って最後に跳んで押し込む
    red.walk(52, cx + 60)
    climb(red, 66, cx + 44, row)
    red.jump(73, 12).wait(78).jump(80, 7)
    leave(red, 86, 96)
    t.actor("kick", "red", 0, red.frames())
    return t.render()


# ---------- 案C2：2つの点を拾い集める ----------
def gather(kind, mode):
    """「:」が上下2つの点に割れて、下の行の文字の上に転がる。文字に乗った4体が1つずつ拾い、跳んで元に戻す。"""
    t, red, cx, row, dy = setup(kind, mode)
    size = t.g[COLON][4]
    gap = size * .33
    far = 54 if kind == "wide" else 40
    top = [(HIT, T()), (HIT + .8, T(-2, -4, -20)), (HIT + 4, T(far * .5, dy + gap - 18)), (HIT + 6, T(far, dy + gap)),
           (HIT + 7, T(far, dy + gap - 6)), (HIT + 8.5, T(far, dy + gap)), (58, T(far, dy + gap)),
           (60, T(far, dy + gap - 24)), *arc(61, 66, far, dy + gap - 24, 0, 0, -18, 6)[1:], (67, T(0, -3)), (68, T())]
    bot = [(HIT, T()), (HIT + .8, T(-2, 0, 10)), (HIT + 5, T(8, dy)), (HIT + 6, T(8, dy - 6)), (HIT + 7.5, T(8, dy)),
           (66, T(8, dy)), (68, T(8, dy - 24)), *arc(69, 74, 8, dy - 24, 0, 0, -14, 6)[1:], (75, T(0, -3)), (76, T())]
    t.split(COLON, top, bot)
    # 青：右の点を拾って跳び上げる。紫：左の点。緑：紫の踏み台になる
    blue = enter(t, cx + far + 10, row, 40, 52)
    blue.walk(57, cx + far + 2).jump(60, 12).walk(63, cx + 12).wait(70).jump(78, 7)
    purple = enter(t, cx + 8, row, 42, 55)
    purple.wait(66).jump(68.5, 12).wait(70).jump(78.5, 7)
    green = enter(t, cx - 16, row, 44, 56)
    green.wait(70).jump(79, 7)
    red.walk(54, cx + 80)
    climb(red, 64, cx + 34, row)
    red.wait(70).jump(79.5, 7)
    for k, path in enumerate((blue, purple, green, red)):
        leave(path, 85 + k * .5, 95)
        t.actor(f"m{k}", ("blue", "purple", "green", "red")[k], 0, path.frames())
    return t.render()


# ---------- 案C3：トスでつなぐ ----------
def relay(kind, mode):
    """落ちた「:」を、文字の上に並んだ4体がトスでつなぐ。最後は蹴った赤が元の場所へ押し込む。"""
    t, red, cx, row, dy = setup(kind, mode)
    step = 26
    xs = [cx + 6 + step * 3, cx + 6 + step * 2, cx + 6 + step, cx + 4]  # 青・緑・紫・赤（「:」の真下が最後）
    fr = colon_drop()(dy, 6 + step * 3)
    fr += [(56, T(6 + step * 3, dy))]
    fr += arc(56.5, 59.5, xs[0] - cx, dy, xs[1] - cx, dy - 26, -16, 4)[1:]
    fr += arc(60, 63, xs[1] - cx, dy - 26, xs[2] - cx, dy - 30, -16, 4)[1:]
    fr += arc(63.5, 66.5, xs[2] - cx, dy - 30, xs[3] - cx, dy - 34, -14, 4)[1:]
    fr += [(69, T(0, dy - 34)), (70.5, T(0, -6)), (71.5, T(0, 0, 0, 1.12, .88)), (73, T())]
    t.move(COLON, fr)
    pats = []
    for k, name in enumerate(("blue", "green", "purple")):
        path = enter(t, xs[k], row, 40 + k * 2, 52 + k)
        path.wait(56 + k * 3.5).jump(58 + k * 3.5, 9).wait(76).jump(79 + k * .5, 7)
        pats.append((name, path))
    red.walk(52, xs[3] + 50)
    climb(red, 62, xs[3], row)
    red.wait(68).jump(70.5, 12).wait(76).jump(80.5, 7)
    pats.append(("red", red))
    for k, (name, path) in enumerate(pats):
        leave(path, 85 + k * .5, 95)
        t.actor(f"m{k}", name, 0, path.frames())
    return t.render()


# ---------- 案E：Cooplay の目 ----------
def eyes(kind, mode):
    """「Cooplay」の2つの「o」に黒目が現れ、文字の上を歩いてくるキャラクターを目で追い、まばたきして消える。"""
    t = Title(kind, mode, 12)
    _, x, row, w, size = t.g[3]  # "Cooplay"
    k = w / sum(WIDTHS[3:10])
    ox = [x + (WIDTHS[3] + WIDTHS[4] / 2) * k, x + (WIDTHS[3] + WIDTHS[4] + WIDTHS[5] / 2) * k]
    oy = t.base(row) - size * .26
    r = size * .1
    look = [(0, T(0, 0, 0, 0, 0)), (24, T(0, 0, 0, 0, 0)), (27, T(0, 0, 0, 1.2, 1.2)), (28.5, T()),
            (34, T(r * .9, r * .5)), (50, T(r * .9, r * .5)), (62, T(-r * .5, r * .6)), (66, T(-r * .5, r * .6)),
            (67, T(-r * .5, r * .6, 0, 1, .1)), (68, T(-r * .5, r * .6)), (72, T(-r * .9, r * .4)), (80, T(-r * .9, r * .4)),
            (81, T(-r * .9, r * .4, 0, 1, .1)), (82, T(0, 0)), (86, T(0, 0)), (89, T(0, 0, 0, 0, 0)), (100, T(0, 0, 0, 0, 0))]
    for n, cx in enumerate(ox):
        t.kf(f"eye{n}", look, "50% 50%")
        t.front.append(f'<g class="eye{n}"><circle cx="{cx:.1f}" cy="{oy:.1f}" r="{r:.1f}" fill="{INK[mode]}"/>'
                       f'<circle cx="{cx - r * .35:.1f}" cy="{oy - r * .35:.1f}" r="{r * .3:.1f}" fill="#FFFFFF"/></g>')
    # 4体は右から歩いてきて、下の行の文字に乗り、文字の上を左へ歩く。目の前で止まって見上げ、跳ねて、左へ去る
    last = len(t.rows) - 1
    for n, name in enumerate(art.ORDER):
        path = Path(t, t.W + 30 + n * 28)
        stop = ox[0] + 14 + n * 28
        path.wait(26 + n * 2).walk(36 + n * 2, min(row_end(t, last) - 10, t.W - 30) + n * 4)
        path.hop(40 + n * 2, path.x - 14, plat(t, last), 8)
        path.walk(60 + n, stop).wait(70).jump(73 + n, 9).wait(78)
        path.walk(88, -10).hop(91, -40, t.H, 6)
        t.actor(f"w{n}", name, 0, path.frames())
    return t.render()


# ---------- 案F：そのままだけ動かない ----------
def still(kind, mode):
    """4体が歩いてきて文字の上に乗り、そろって足踏みすると文字がみんな揺れる。ただし「ゲームはそのまま。」だけは動かない。"""
    t = Title(kind, mode, 12)
    stomps = (46, 54, 62)
    for n, i in enumerate(sorted(t.g)):
        if i in STAY:
            continue
        fr = []
        for s in stomps:
            r = 5 if (n + s) % 2 else -5
            fr += [(s, T()), (s + 1, T(0, -7, r)), (s + 2.5, T(0, 0, -r * .5)), (s + 4, T())]
        t.move(i, fr)
    last = len(t.rows) - 1
    a = TITLE.index("みんなで")
    for k, name in enumerate(art.ORDER):
        x = t.g[a + k][1] + t.g[a + k][3] / 2
        path = Path(t, t.W + 30 + k * 30)
        path.wait(22 + k * 1.5).walk(34 + k * 1.5, min(x + 30, t.W - 20))
        path.hop(38 + k * .5, x, plat(t, last), 8).wait(42)
        for s in stomps:
            path.wait(s - 3).put(s - 1.5, dy=-12, sx=.95, sy=1.06).put(s, sx=1.15, sy=.82).put(s + 2)
            path.p = s + 2
        path.wait(70).jump(74 + k * .5, 6).wait(78)
        path.hop(82, x + 20, t.H, 6).walk(94, t.W + 40)
        t.actor(f"s{k}", name, 0, path.frames())
    qx = t.g[STAY[0]][1] + 4
    qy = t.base(t.g[STAY[0]][2]) - t.g[STAY[0]][4] - 2
    t.front.append(f'<g class="q"><text x="{qx:.1f}" y="{qy:.1f}" font-size="20" font-weight="800" fill="#FF8A00" '
                   f'font-family="{FONT}">？</text></g>')
    t.css.append("@keyframes q{0%,68%{opacity:0}70%,80%{opacity:1}82%,100%{opacity:0}}.q{opacity:0;animation:q 12s linear infinite}")
    return t.render()


# ---------- 案G：長音のなわとび ----------
def rope(kind, mode):
    """「リコープレイ」の「ー」が外れて下の行の文字の上に落ちる。歩いてきた緑と紫が縄として回し、青と赤が跳ぶ。最後に「ー」を戻す。"""
    t = Title(kind, mode, 14)
    bx, by = t.center(BAR)
    row = t.g[BAR][2] + 1  # 「ー」の真下の行
    py = plat(t, row)
    cy = py - 12  # 縄を回す高さ
    fdy = cy - by
    fr = [(30, T()), (31, T(0, -6)), *arc(32, 36, 0, -6, 0, fdy, -6, 5)[1:], (36.6, T(0, fdy, 0, 1.3, .7)), (37.5, T(0, fdy))]
    turns = (50, 56, 62, 68)
    for p in turns:
        fr += [(p, T(0, fdy - 16, 0, 2.6, 1)), (p + 1.5, T(0, fdy - 6, 0, 2.6, -1)), (p + 3, T(0, fdy + 12, 0, 2.6, 1)),
               (p + 4.5, T(0, fdy - 2, 0, 2.6, -1)), (p + 6, T(0, fdy - 16, 0, 2.6, 1))]
    fr += [(76, T(0, fdy)), (78, T(0, fdy - 4)), *arc(79, 84, 0, fdy - 4, 0, 0, -20, 6)[1:], (85, T(0, -3)), (86, T())]
    t.move(BAR, fr, origin="50% 50%")
    half = t.g[BAR][3] * 1.3 + 12
    roles = (("green", bx - half), ("purple", bx + half), ("blue", bx - 8), ("red", bx + 8))
    for k, (name, x) in enumerate(roles):
        path = Path(t, -30 - k * 26)
        path.wait(36 + k * 1.5).walk(44 + k * 1.5, max(x - 20, 8))
        climb(path, 48 + k * .5, x, row)
        if name in ("blue", "red"):
            for p in turns:
                path.wait(p + 1.5).put(p + 2.4, dy=-14).put(p + 3.3).put(p + 3.8, sx=1.08, sy=.9).put(p + 4.4)
                path.p = p + 4.4
        path.wait(76)
        if name == "purple":
            path.jump(80, 12)  # 「ー」を放り上げて戻す
        path.wait(84).jump(87, 7)
        leave(path, 91, 98)
        t.actor(f"r{k}", name, 0, path.frames(), front=name in ("blue", "red"))
    return t.render()


OPTIONS = [
    ("c1", "みんなで担いで戻す", "赤が歩いてきて文末の「。」を蹴ると、行をまたいで「:」に当たり、「:」が下の行の文字の上へボトッと落ちる。"
     "歩いてきた3体が文字に乗って担いで運び、最後は赤が跳んで押し込む。", carry),
    ("c2", "2つの点を拾い集める", "「。」が当たると「:」が上下2つの点に割れて、下の行の文字の上に転がる。文字に乗った4体が1つずつ跳び上げて元に戻す。", gather),
    ("c3", "トスでつなぐ", "落ちた「:」を、文字の上に並んだ4体がトスでつなぎ、最後は蹴った赤が元の場所へ押し込む。", relay),
    ("e", "Cooplayの目", "「Cooplay」の2つの「o」に黒目が現れ、文字の上を歩いてくるキャラクターを目で追い、まばたきして消える。", eyes),
    ("f", "そのままだけ動かない", "4体が歩いてきて文字に乗り、そろって足踏みすると文字がみんな揺れるが、「ゲームはそのまま。」だけは動かない。", still),
    ("g", "長音のなわとび", "「リコープレイ」の「ー」が外れて落ち、歩いてきた緑と紫が文字の上で縄として回す。青と赤が跳び、最後に「ー」を元に戻す。", rope),
]


def picture(key, alt):
    b = f"title-{key}"
    return (f'<h1><picture>'
            f'<source media="(max-width: 700px) and (prefers-color-scheme: dark)" srcset="{b}-narrow-dark.svg">'
            f'<source media="(max-width: 700px)" srcset="{b}-narrow-light.svg">'
            f'<source media="(prefers-color-scheme: dark)" srcset="{b}-dark.svg">'
            f'<img src="{b}-light.svg" align="absbottom" alt="{alt}"></picture></h1>')


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    for old in OUT.glob("title-*.svg"):
        old.unlink()
    for key, _, _, make in OPTIONS:
        for kind in ("wide", "narrow"):
            for mode in ("light", "dark"):
                suffix = ("-narrow" if kind == "narrow" else "") + f"-{mode}"
                (OUT / f"title-{key}{suffix}.svg").write_text(make(kind, mode) + "\n", encoding="utf-8", newline="\n")
    lines = ["# 作品名の見出し（案）", "",
             "ふつうの見出しに見えて、少したつとキャラクターが文字で遊ぶ案です。作品名はGitHubの見出しと同じ32px、"
             "キャッチコピーは一回り小さい24pxです。各案の下の文は、本文との並びを見るためのものです。", "",
             "動きは12〜14秒で1周し、最初の約2秒は止まっています。キャラクターは歩いてきて、文字の上に乗り、歩いて去ります。", "",
             "生成：`python scripts/readme/title.py`", "", "---", "", "## 比較用：ふつうの見出し", "", f"# {TITLE}", "",
             "Re:Cooplayは、**既存のPCゲームに協力プレイを後付けするシステム**です。", ""]
    for key, name, desc, _ in OPTIONS:
        lines += ["---", "", f"## 案{key.upper()}：{name}", "", desc, "", picture(key, TITLE), "",
                  "Re:Cooplayは、**既存のPCゲームに協力プレイを後付けするシステム**です。", ""]
    (OUT / "README.md").write_text("\n".join(lines), encoding="utf-8", newline="\n")
    print(f"wrote {len(OPTIONS) * 4} files to {OUT}")


if __name__ == "__main__":
    main()
