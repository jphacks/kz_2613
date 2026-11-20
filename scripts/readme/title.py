"""READMEの作品名（h1）を、GitHubの見出しと同じ見た目のSVGアニメーションにする。

最初はふつうの見出しにしか見えず、少し時間がたつと4色のキャラクターが現れる。赤がためてから文末の「。」を蹴ると、
「Re:Cooplay」の「:」に当たって2つの点に割れ、画像の一番下まで落ちる。赤は「。」を拾ってみんなに謝り、
点は青と緑が1つずつ戻す。みんなで喜んだあと3体は去り、赤は「。」を文末に戻して去る。1周22秒で、最初の約6.5秒は止まっている。
キャラクターはふだん画像の一番下（一番下の段の下）にいて、点を戻すときだけ文字の段を上る。
いちばん上には「※JPHACKS 2026 Award Dayでの内容です」の注釈を、GitHubの引用（> で始まる行）と同じ見た目で描く。
READMEの先頭に引用と見出しを並べたときと同じ位置になり、見出しの上に余分な余白ができない。注釈の行と見出しの間の
余白は、蹴った「。」が放物線で飛ぶ場所にもなる。
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

OUT = art.OUT
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
# いちばん上の注釈。GitHubの引用（16px・行の高さ24px、左に4pxの線、文字は線から16px右）をChromeで実測した見た目で描く。
# スマホ（本文欄324px）では注釈が入りきらず、GitHubと同じく最後の1文字が折り返す
NOTE = "※JPHACKS 2026 Award Dayでの内容です"
NOTE_LINES = {"wide": [NOTE], "narrow": [NOTE[:-1], NOTE[-1]]}
GAP = 24  # 引用と見出しの間（見出しの上の余白）
INK = {"light": "#1F2328", "dark": "#F0F6FC"}
MUTED = {"light": "#59636E", "dark": "#9198A1"}  # 引用の文字
QUOTE = {"light": "#D1D9E0", "dark": "#3D444D"}  # 引用の線
FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI','Noto Sans',Helvetica,Arial,sans-serif"
STILL = "@media (prefers-reduced-motion:reduce){*{animation:none!important}}"
ALT = f"{NOTE} {TITLE}"
COLON = TITLE.index(":")
BALL = len(TITLE) - 1  # 文末の「。」


def T(x=0, y=0, r=0, sx=1, sy=1):
    return f"translate({x:.1f}px,{y:.1f}px) rotate({r:.1f}deg) scale({sx},{sy})"


class Title:
    def __init__(self, kind, mode, dur, lead=0):
        """dur 秒の動きの前に、lead 秒の止まった時間を足す。動きの時刻は dur 秒を100とした%で書く。"""
        self.kind, self.mode, self.dur, self.lead = kind, mode, dur + lead, lead
        self.rows = LINES[kind]
        self.W = SIZE[kind]
        self.notes = NOTE_LINES[kind]
        self.tops, y = [], 24 * len(self.notes) + GAP
        for _, _, size in self.rows:
            self.tops.append(y)
            y += size * 1.25
        self.H = y
        self.g = self.layout()
        self.css, self.front, self.back = [], [], []
        self.moves, self.halves = {}, {}

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
        """文字の見た目の中心（「。」「:」用）。"""
        ch, x, row, w, size = self.g[i]
        b = self.base(row)
        if ch == "。":
            return x + w * .27, b - size * .12
        if ch == ":":
            return x + w / 2, b - size * .33
        return x + w / 2, b - size * .35

    # 動き
    def pct(self, p):
        """動きの時刻(%)を、止まった時間を含めた1周の中の%にする。"""
        return round((self.lead + p * (self.dur - self.lead) / 100) / self.dur * 100, 2)

    def kf(self, name, frames, origin="50% 100%"):
        frames = sorted(frames)
        frames = [(0, frames[0][1])] + [(self.pct(p), v) for p, v in frames]
        body = "".join(f"{p:g}%{{transform:{v}}}" for p, v in frames)
        self.css.append(f"@keyframes {name}{{{body}}}.{name}{{animation:{name} {self.dur}s linear infinite;"
                        f"transform-box:fill-box;transform-origin:{origin}}}")

    def move(self, i, frames, origin="50% 100%"):
        self.moves[i] = (fill(frames), origin)

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
        nh = 24 * len(self.notes)
        note = f'<rect x="0" y="0" width="4" height="{nh}" fill="{QUOTE[self.mode]}"/>' + "".join(
            f'<text x="20" y="{18.5 + 24 * k}" class="note">{line}</text>' for k, line in enumerate(self.notes))
        css = (f".note{{font-family:{FONT};font-size:16px;fill:{MUTED[self.mode]}}}"
               f".h32{{font-family:{FONT};font-size:32px;font-weight:600;fill:{ink}}}"
               f".h24{{font-family:{FONT};font-size:24px;font-weight:600;fill:{ink}}}" + "".join(self.css) + STILL)
        body = note + "".join(self.back) + "".join(texts[k] for k in sorted(texts)) + "".join(self.front)
        return art.svg(self.W, self.H, body, art.THEMES[self.mode], ALT, css)


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
        self.k, self.raw = [], []  # raw：(時刻, x, 足の高さ, 傾き, 縦の伸び) 頭に物を載せるときに使う
        self.put(0)

    def at(self, p, x, y, r=0, sx=1, sy=1):
        self.k.append((round(p, 2), T(x, y - self.t.H, r, sx, sy)))
        self.raw.append((round(p, 2), x, y, r, sy))

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
        """p0〜p1(%) のあいだ、頭の上に載せた点（元の中心 hx, hy、半径 r）の動き。傾くと足元を軸に頭も動く。"""
        out = []
        for p, x, y, a, sy in self.raw:
            if p0 <= p <= p1:
                h = 124 * .2 * sy + r
                a = math.radians(a)
                out.append((p, T(x + h * math.sin(a) - hx, y - h * math.cos(a) - hy)))
        return out

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


def descend(path, p, x):
    """文字の上から段を1段ずつ下りて、地面（画像の一番下）へ降りる。"""
    t = path.t
    rows = list(range(cur_row(path) + 1, len(t.rows))) + [None]
    if path.y == t.H:
        return path.walk(p, x)
    d = (p - path.p) / len(rows)
    for k, r in enumerate(rows):
        y = t.H if r is None else plat(t, r)
        path.hop(path.p + d, path.x + (x - path.x) / (len(rows) - k), y, 6)
    return path


def floor(t):
    """キャラクターがふだんいる地面（画像の一番下＝一番下の段の下）。"""
    return t.H


def leave(path, p_down, p_out, side="left"):
    """文字の段を下りて、地面を歩いて外へ出ていく。"""
    descend(path, p_down, path.x)
    return path.walk(p_out, -40 if side == "left" else path.t.W + 40)


def make(kind, mode):
    """赤がためてから「。」を蹴り、当たった「:」が上下2つの点に割れて画像の一番下まで落ちる。
    やってしまった赤は、跳ね返って止まった「。」を拾い、来てくれた3体に謝る。点は青と緑が1つずつ運んで戻す。
    キャラクターはふだん画像の一番下（一番下の段の下）にいて、点を戻すときだけ段を上る。
    みんなで喜んだあと3体は左へ去り、赤は「。」を文末へ戻してから右へ去る。"""
    t = Title(kind, mode, 17, lead=5)  # 1周22秒。最初の5秒は止まったまま
    dur, q = t.dur, t.pct
    kick, hit = 31, 37
    last = len(t.rows) - 1
    fl = floor(t)
    _, x0, row0, w0, size = t.g[COLON]
    cx = x0 + w0 / 2
    b0 = t.base(row0)
    rad = size * .07
    homes = (b0 - size * .42, b0 - size * .06)  # 上の点・下の点の中心の高さ
    up = row0 + 1  # 「:」の真下の行。ここに乗って点を戻す
    rest, low = (cx - 8, cx + 4), fl - rad  # 落ちた点は画像の一番下（キャラクターのいる地面）で止まる

    def fall(n):
        """点が段で跳ねながら、画像の一番下まで落ちる。"""
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

    # 「。」：蹴られて「:」に当たり、跳ね返って画像の一番下に落ちて止まる
    bx, by = t.center(BALL)
    _, ccy = t.center(COLON)
    br = size * .11
    dx, dy = cx - bx, ccy - by
    bxr = min(cx + 200, t.W * .5)  # 止まる x
    rx, ry = bxr - bx, fl - br - by
    mid = dx + (rx - dx) * .6
    peak = min(dy, 0) - 30
    while min(by + dy * u + peak * 4 * u * (1 - u) for u in (k / 20 for k in range(21))) < br + 2:
        peak += 1  # 放物線の頂点が画像の上で切れないように低くする
    ball = [(kick, T()), *arc(kick + .5, hit, 0, 0, dx, dy, peak, 10)]
    ball += arc(hit, hit + 3, dx, dy, mid, ry, -14, 5)[1:] + arc(hit + 3, hit + 5, mid, ry, rx - 6, ry, -8, 4)[1:]
    ball += [(hit + 6.5, T(rx, ry))]

    # 赤：右から来て「。」の前で止まり、一歩下がって、かがんで震えてから、駆け寄って蹴る
    end = row_end(t, last)
    kx = min(end + 14, t.W - 10)
    back = min(kx + 16, t.W - 2)
    red = Path(t, t.W + 24)
    red.wait(9).walk(19, kx).wait(21).walk(23.5, back)
    red.put(24.5, sx=1.12, sy=.82).put(25.5, dx=-1, sx=1.12, sy=.82).put(26.5, dx=1, sx=1.12, sy=.82)
    red.put(27.5, dx=-1, sx=1.12, sy=.82).put(28.5, r=-14, sx=1.12, sy=.82)
    red.p = 28.5
    red.walk(30, kx).lean(kick, 22).lean(32.5, 0)
    # やってしまった：跳び上がって、しょんぼり
    red.wait(hit).jump(hit + 2.5, 12).put(hit + 3.5, r=-8, sx=1.06, sy=.88).put(43, r=-8, sx=1.06, sy=.88)
    red.p = 43
    mark_x, mark_y = kx, fl - 124 * .2 - 6
    # 止まった「。」を拾う
    red.walk(51, bxr).put(51.8, sx=1.12, sy=.82).put(52.6)
    red.p = 52.6
    # 来てくれた紫に謝る（2回おじぎ）
    for p in (54, 56):
        red.put(p - .6, r=-28).put(p + .6)
    red.p = 56.6
    # 点を戻すのを見守る
    red.walk(61, cx + 40).wait(66.5)
    # みんなに謝る
    for p in (67.5, 69.5):
        red.put(p - .6, r=-28).put(p + .6)
    red.p = 70.1
    # 青：上の点を拾って運び、元の場所へ放り上げる
    blue = Path(t, -30, fl)
    blue.wait(40).walk(48, rest[0] - 2).put(49, sx=1.12, sy=.84).put(50)
    blue.p = 50
    climb(blue, 56, cx - 14, up).wait(58).jump(60, 8)
    descend(blue, 64, blue.x)  # 戻したら一番下へ
    # 緑：下の点を拾って運び、元の場所へ放り上げる
    green = Path(t, -56, fl)
    green.wait(41).walk(50, rest[1] + 2).put(51, sx=1.12, sy=.84).put(52)
    green.p = 52
    climb(green, 59, cx + 14, up).wait(61.5).jump(63.5, 8)
    descend(green, 66.5, green.x)
    # 紫：赤のところへ行き、謝る赤を励ます（跳ねる）。点は運ばないので、一番下で見守る
    purple = Path(t, -82, fl)
    purple.wait(42).walk(52.5, bxr - 26).wait(56.4).jump(58.4, 10)
    purple.walk(62, cx + 64)
    paths = (("blue", blue), ("green", green), ("purple", purple), ("red", red))
    # 謝る赤を許して、みんなで喜ぶ
    for k, (name, path) in enumerate(paths):
        path.wait(70.5 + k * .4).jump(73 + k * .4, 10).wait(74 + k * .4).jump(76.5 + k * .4, 14 if name == "red" else 10)
    # 3体は左へ去る。赤は「。」を文末へ戻して、右へ去る
    for k, (name, path) in enumerate(paths[:3]):
        leave(path, 80 + k * .6, 95 + k * .6)
    red.wait(78).walk(90, bx - 14).put(90.8, r=30).put(92.4)
    red.p = 92.4
    red.walk(99, t.W + 40)
    for k, (name, path) in enumerate(paths):
        t.actor(f"m{k}", name, 0, path.frames())

    hx0, hy0 = _xy(red.head(90.8, 90.8, bx, by, br)[-1][1])
    ball += [(51.8, T(rx, ry))] + red.head(52.6, 90.8, bx, by, br)
    ball += arc(90.8, 92.2, hx0, hy0, 0, 0, -6, 4)[1:] + [(92.8, T(0, -3)), (93.4, T())]
    t.move(BALL, ball, origin="50% 50%")

    top = fall(0)
    top += [(49, top[-1][1])] + blue.head(50, 58, cx, homes[0], rad)
    tx, ty = _xy(top[-1][1])
    top += arc(58.6, 61, tx, ty, 0, 0, -14, 6)[1:] + [(61.6, T(0, -3)), (62.2, T())]
    bot = fall(1)
    bot += [(51, bot[-1][1])] + green.head(52, 62, cx, homes[1], rad)
    gx, gy = _xy(bot[-1][1])
    bot += arc(62.2, 64.6, gx, gy, 0, 0, -12, 6)[1:] + [(65.2, T(0, -3)), (65.8, T())]
    t.split(COLON, top, bot)
    # 「!」と「♪」
    t.front.append(f'<g class="oops"><text x="{mark_x - 4:.1f}" y="{mark_y:.1f}" font-size="20" font-weight="800" '
                   f'fill="#FF8A00" font-family="{FONT}">!</text></g>')
    t.css.append(f"@keyframes oops{{0%,{q(37.5)}%{{opacity:0}}{q(38.5)}%,{q(43)}%{{opacity:1}}{q(44)}%,100%{{opacity:0}}}}"
                 f".oops{{opacity:0;animation:oops {dur}s linear infinite}}")
    note_y = fl - 124 * .2 - 8
    t.front.append(f'<g class="joy"><text x="{cx + 20:.1f}" y="{note_y:.1f}" font-size="18" font-weight="800" '
                   f'fill="#FF8A00" font-family="{FONT}">♪</text></g>')
    t.css.append(f"@keyframes joy{{0%,{q(70.5)}%{{opacity:0;transform:translateY(4px)}}{q(72)}%,{q(78)}%{{opacity:1;"
                 f"transform:translateY(-4px)}}{q(80)}%,100%{{opacity:0}}}}.joy{{opacity:0;animation:joy {dur}s linear infinite}}")
    return t.render()


def _xy(tr):
    """T() の文字列から移動量 (x, y) を取り出す。"""
    m = re.match(r"translate\(([-\d.]+)px,([-\d.]+)px\)", tr)
    return float(m.group(1)), float(m.group(2))


def main():
    for kind in ("wide", "narrow"):
        for mode in ("light", "dark"):
            name = "title" + ("-narrow" if kind == "narrow" else "") + f"-{mode}.svg"
            (OUT / name).write_text(make(kind, mode) + "\n", encoding="utf-8", newline="\n")
    print(f"wrote 4 files to {OUT}")


if __name__ == "__main__":
    main()
