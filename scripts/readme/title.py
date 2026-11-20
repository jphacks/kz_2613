"""READMEの作品名（h1）を、GitHubの見出しと同じ見た目のSVGアニメーションにする案を生成する。

最初はふつうの見出しにしか見えず、少し時間がたつと4色のキャラクターが現れて文字で遊ぶ。
1行目の作品名はGitHubの h1（32px・太さ600）、2行目のキャッチコピーは h2 と同じ24pxにする。
文字はGitHub本体と同じフォント指定で描き、1文字ずつの位置はGitHubの見出しをChromeで実測した幅
（WIDTHS、32pxのとき）で置く。READMEでは <h1> の中に align="absbottom" で入れると、
見出しの下線までの間隔もふつうの見出しと同じになる。

    python scripts/readme/title.py
"""
import math
import re
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
        self.k, self.raw = [], []  # raw：(時刻, x, 足の高さ, 縦の伸び) 頭に物を載せるときに使う
        self.put(0)

    def at(self, p, x, y, r=0, sx=1, sy=1):
        self.k.append((round(p, 2), T(x, y - self.t.H, r, sx, sy)))
        self.raw.append((round(p, 2), x, y, sy))

    def put(self, p, dy=0, r=0, sx=1, sy=1, dx=0):
        self.at(p, self.x + dx, self.y + dy, r, sx, sy)
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
            self.at(p0 + d * (.15 + .7 * u), x0 + (x - x0) * u, (y0 + (y - y0) * u) + (peak - min(y0, y)) * 4 * u * (1 - u))
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

    def head(self, p0, p1, hx, hy, r):
        """p0〜p1(%) のあいだ、頭の上に載せた点（元の中心 hx, hy、半径 r）の動き。"""
        return [(p, T(x - hx, y - 124 * .2 * sy - r - hy)) for p, x, y, sy in self.raw if p0 <= p <= p1]

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


def cur_row(path):
    """いま乗っている行。地面なら行の数。"""
    t = path.t
    return min((r for r in range(len(t.rows)) if abs(plat(t, r) - path.y) < 1), default=len(t.rows))


def climb(path, p, x, row):
    """いまの段から、文字の段を1段ずつ跳び乗って、row の文字の上へ上がる。"""
    t = path.t
    rows = list(range(cur_row(path) - 1, row - 1, -1))
    if not rows:
        return path.walk(p, x)
    d = (p - path.p) / len(rows)
    for k, r in enumerate(rows):
        path.hop(path.p + d, path.x + (x - path.x) / (len(rows) - k), plat(t, r), 8)
    return path


def descend(path, p, x, ground=False):
    """文字の上から段を下りて、いちばん下の行の文字の上（ground なら地面）へ降りる。"""
    t = path.t
    rows = list(range(cur_row(path) + 1, len(t.rows))) + ([None] if ground else [])
    if not rows:
        return path.walk(p, x)
    d = (p - path.p) / len(rows)
    for k, r in enumerate(rows):
        y = t.H if r is None else plat(t, r)
        path.hop(path.p + d, path.x + (x - path.x) / (len(rows) - k), y, 6)
    return path


# ---------- 共通：「。」を蹴って「:」に当てる ----------
HIT = 36


def ball_flight(t, kick=28.5, hit=HIT):
    """文末の「。」が kick(%) に蹴られ、行をまたいで hit(%) に「:」に当たり、跳ね返って転がって元の場所に戻る。"""
    bx, by = t.center(BALL)
    cx, cy = t.center(COLON)
    dx, dy = cx - bx, cy - by
    fly = arc(kick + .5, hit, 0, 0, dx, dy, min(dy, 0) - 30, 10)
    back = [(hit + 2, T(dx + 18, dy - 12)), (hit + 5, T(dx + 36, (dy - 12) * .3)), (hit + 7, T(dx + 46, 0)),
            (hit + 8.5, T(dx + 52, -8)), (hit + 10, T(dx + 58, 0)), (hit + 18, T(dx * .3, 0)), (hit + 20, T(0, -5)),
            (hit + 21.5, T(0, 0))]
    t.move(BALL, [(kick, T()), *fly, *back], origin="50% 50%")


def kick_ball(t):
    """赤が歩いてきて、文末の「。」を蹴る。「。」は行をまたいで「:」に当たり、跳ね返って転がって元の場所に戻る。
    戻り値は赤の Path（蹴ったあとの動きは各案で足す）。"""
    ball_flight(t)
    end = t.g[BALL][1] + t.g[BALL][3]
    red = Path(t, t.W + 24)
    red.wait(16).walk(26, min(end + 12, t.W - 10)).lean(27, -14).lean(28.5, 18).lean(30, 0)
    red.hop(33, end - 12, plat(t, len(t.rows) - 1), 10)  # 文字の上へ跳び乗る（地面は文字と重なるので歩かない）
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


def floor(t):
    """いちばん下の行の文字の上。左の外から出入りするときはここを歩く（地面は文字と重なる）。"""
    return plat(t, len(t.rows) - 1)


def enter(t, x_stop, row, p_in, p_up, start=-30):
    """左の外から、いちばん下の行の文字の上を歩いてきて、文字の段を上がる。"""
    path = Path(t, start, floor(t))
    path.wait(p_in).walk(p_in + 8, max(x_stop - 14, 4))
    return climb(path, p_up, x_stop, row)


def arrive(t, x_stop, p_in, p_walk, p_up, start):
    """右の外から地面（文字のない所）を歩いてきて、いちばん下の行の文字の端に跳び乗り、x_stop まで歩く。"""
    end = row_end(t, len(t.rows) - 1)
    path = Path(t, start)
    path.wait(p_in).walk(p_walk, min(end + 16, t.W - 12))
    path.hop(p_walk + 3, end - 10, floor(t), 10)
    return path.walk(p_up, x_stop)


def leave(path, p_down, p_out, side="left"):
    """文字の段を下りて、いちばん下の行の文字の上を歩いて外へ出ていく。右へ出るときは文字の端で地面へ降りる。"""
    t = path.t
    descend(path, p_down, path.x)
    if side == "left":
        return path.walk(p_out, -40)
    end = row_end(t, len(t.rows) - 1)
    path.walk(p_down + (p_out - p_down) * .5, end - 6).hop(p_down + (p_out - p_down) * .65, min(end + 16, t.W - 12), t.H, 6)
    return path.walk(p_out, t.W + 40)


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


# ---------- 案C2：やってしまった赤を、みんなで助ける ----------
def gather(kind, mode):
    """赤がためてから「。」を蹴り、当たった「:」が上下2つの点に割れて一番下の行まで落ちる。
    やってしまった赤のもとへ3体が来て、青と緑が点を頭に載せて運び、下の点は緑から受け取った赤が自分で戻す。
    最後はみんなで喜んで、左へ去っていく。"""
    t = Title(kind, mode, 16)
    kick, hit = 31, 37
    ball_flight(t, kick, hit)
    last = len(t.rows) - 1
    fl = floor(t)
    _, x0, row0, w0, size = t.g[COLON]
    cx = x0 + w0 / 2
    b0 = t.base(row0)
    rad = size * .07
    homes = (b0 - size * .42, b0 - size * .06)  # 上の点・下の点の中心の高さ
    up = row0 + 1  # 「:」の真下の行。ここに乗って点を戻す
    # 落ちた点が止まる所。スマホは一番下の行の文字の上。PCは行が2つで一段しか落ちないので、画像の一番下
    # （真下の「ゲーム」の「ー」の下は空いている）まで落とす
    if kind == "wide":
        rest, low = (cx - 8, cx + 4), t.H - rad
    else:
        rest, low = (cx + 40, cx + 10), fl - rad

    def fall(n):
        """点が段で跳ねながら、一番下の行の文字の上まで落ちる。"""
        hy = homes[n]
        out = [(hit, T()), (hit + .8, T(-2, -4 if n == 0 else 0, -20 if n == 0 else 10))]
        rows = list(range(up, last + 1)) if kind == "narrow" else []
        p, x = hit + 1.5, rest[n] - cx
        step = 5 / max(len(rows), 1)
        for k, r in enumerate(rows):
            x = (rest[n] - cx) * (k + 1) / len(rows)
            y = plat(t, r) - rad - hy
            out += [(p + step * .6, T(x, y)), (p + step * .8, T(x, y - (8 if r < last else 5)))]
            p += step
        y = low - hy
        return out + [(p, T(x, y)), (p + 1, T(x, y - 3)), (p + 2, T(x, y))]

    # 赤：右から来て「。」の前で止まり、一歩下がって、かがんで震えてから、駆け寄って蹴る
    end = row_end(t, last)
    kx = min(end + 14, t.W - 10)
    bx = min(kx + 16, t.W - 2)
    red = Path(t, t.W + 24)
    red.wait(9).walk(19, kx).wait(21).walk(23.5, bx)
    red.put(24.5, sx=1.12, sy=.82).put(25.5, dx=-1, sx=1.12, sy=.82).put(26.5, dx=1, sx=1.12, sy=.82)
    red.put(27.5, dx=-1, sx=1.12, sy=.82).put(28.5, r=-14, sx=1.12, sy=.82)
    red.p = 28.5
    red.walk(30, kx).lean(kick, 22).lean(32.5, 0)
    # やってしまった：跳び上がって、しょんぼり
    red.wait(hit).jump(hit + 2.5, 12).put(hit + 3.5, r=-8, sx=1.06, sy=.88).put(46, r=-8, sx=1.06, sy=.88)
    red.p = 46
    mark_x, mark_y = red.x, red.y - 124 * .2 - 6
    red.hop(48, end - 12, fl, 10)
    meet = min((rest[0] + end) / 2 + 20, end - 12)
    red.walk(52, meet).put(53, sx=1.04, sy=.92).put(54)  # 紫に励まされて、うなずく
    red.p = 54
    climb(red, 58, cx + 12, up).wait(65)
    # 青：上の点を拾って運び、元の場所へ放り上げる
    blue = Path(t, -30, fl)
    blue.wait(40).walk(48, rest[0] - 2).put(49, sx=1.12, sy=.84).put(50)
    blue.p = 50
    climb(blue, 56, cx - 14, up).wait(58).jump(60, 8)
    # 緑：下の点を拾って運び、赤へトスする
    green = Path(t, -56, fl)
    green.wait(41).walk(50, rest[1]).put(51, sx=1.12, sy=.84).put(52)
    green.p = 52
    climb(green, 59, cx + 36, up).wait(61.5).jump(63.5, 8)
    # 紫：赤を励ます（跳ねる）、一緒に上がる
    purple = Path(t, -82, fl)
    purple.wait(42).walk(51, meet - 24).jump(53, 10)
    climb(purple, 59, cx + 60, up)
    # 赤が受け取った下の点を、跳んで元に戻す
    red.jump(67.5, 10)
    paths = (("blue", blue), ("green", green), ("purple", purple), ("red", red))
    # みんなで喜ぶ
    for k, (name, path) in enumerate(paths):
        path.wait(70 + k * .4).jump(73 + k * .4, 10).wait(74.5 + k * .4).jump(77.5 + k * .4, 16 if name == "red" else 10)
    for k, (name, path) in enumerate(paths):
        leave(path, 83 + k * .6, 96 + k * .6)
        t.actor(f"m{k}", name, 0, path.frames())

    top = fall(0)
    top += [(49, top[-1][1])] + blue.head(50, 58, cx, homes[0], rad)
    bx0, by0 = _xy(top[-1][1])
    top += arc(58.6, 61, bx0, by0, 0, 0, -14, 6)[1:] + [(61.6, T(0, -3)), (62.2, T())]
    bot = fall(1)
    bot += [(51, bot[-1][1])] + green.head(52, 62, cx, homes[1], rad)
    gx, gy = _xy(bot[-1][1])
    rx, ry = _xy(red.head(58, 65, cx, homes[1], rad)[-1][1])
    bot += arc(62.2, 64.5, gx, gy, rx, ry, -16, 6)[1:] + red.head(64.6, 65.6, cx, homes[1], rad)
    bot += arc(66, 68, rx, ry, 0, 0, -12, 6)[1:] + [(68.6, T(0, -3)), (69.2, T())]
    t.split(COLON, top, bot)
    # 「!」と「♪」
    t.front.append(f'<g class="oops"><text x="{mark_x - 4:.1f}" y="{mark_y:.1f}" font-size="20" font-weight="800" '
                   f'fill="#FF8A00" font-family="{FONT}">!</text></g>')
    t.css.append("@keyframes oops{0%,37.5%{opacity:0}38.5%,46%{opacity:1}47%,100%{opacity:0}}"
                 ".oops{opacity:0;animation:oops 16s linear infinite}")
    note_y = plat(t, up) - 124 * .2 - 8
    t.front.append(f'<g class="joy"><text x="{cx + 20:.1f}" y="{note_y:.1f}" font-size="18" font-weight="800" '
                   f'fill="#FF8A00" font-family="{FONT}">♪</text></g>')
    t.css.append("@keyframes joy{0%,70%{opacity:0;transform:translateY(4px)}72%,80%{opacity:1;transform:translateY(-4px)}"
                 "82%,100%{opacity:0}}.joy{opacity:0;animation:joy 16s linear infinite}")
    return t.render()


def _xy(tr):
    """T() の文字列から移動量 (x, y) を取り出す。"""
    m = re.match(r"translate\(([-\d.]+)px,([-\d.]+)px\)", tr)
    return float(m.group(1)), float(m.group(2))


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
    for n, name in enumerate(art.ORDER):
        stop = ox[0] + 14 + n * 28
        path = arrive(t, stop, 26 + n * 2, 34 + n * 2, 60 + n, t.W + 30 + n * 28)
        path.wait(70).jump(73 + n, 9).wait(78).walk(92, -40)
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
    a = TITLE.index("みんなで")
    for k, name in enumerate(art.ORDER):
        x = t.g[a + k][1] + t.g[a + k][3] / 2
        path = arrive(t, x, 22 + k * 1.5, 30 + k * 1.5, 40, t.W + 30 + k * 30).wait(42)
        for s in stomps:
            path.wait(s - 3).put(s - 1.5, dy=-12, sx=.95, sy=1.06).put(s, sx=1.15, sy=.82).put(s + 2)
            path.p = s + 2
        path.wait(70).jump(74 + k * .5, 6).wait(78)
        leave(path, 80, 96, "right")
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
        path = enter(t, x, row, 36 + k * 1.5, 48 + k * .5, -30 - k * 26)
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
    ("c2", "やってしまった赤を、みんなで助ける", "赤が歩いてきて、ためてから文末の「。」を蹴る。「。」が当たると「:」が上下2つの点に割れ、"
     "一番下の行まで落ちる。やってしまった赤を3体が励まし、青と緑が点を1つずつ運んで、下の点は赤が自分で戻す。みんなで喜んで去っていく。", gather),
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
