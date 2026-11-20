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


def hide(y=34):
    return T(0, y)


# ---------- 共通：「。」を蹴って「:」に当てる ----------
def kick_ball(t, hit_at=38):
    """赤が文末の「。」を蹴り、行をまたいで「:」に当てる。「。」は跳ね返って転がり、元の場所に戻る。
    戻り値は「:」が落ちる場所 (dx, dy)。PCは2行目の右の空いた所、スマホは真下に落ちる。"""
    bx, by = t.center(BALL)
    cx, cy = t.center(COLON)
    dx, dy = cx - bx, cy - by
    fly = arc(31, hit_at, 0, 0, dx, dy, min(dy, 0) - 34, 10)
    back = [(hit_at + 2, T(dx + 18, dy - 12)), (hit_at + 5, T(dx + 36, (dy - 12) * .3)), (hit_at + 7, T(dx + 46, 0)),
            (hit_at + 8.5, T(dx + 52, -8)), (hit_at + 10, T(dx + 58, 0)), (hit_at + 16, T(dx * .35, 0)),
            (hit_at + 18, T(0, -5)), (hit_at + 19.5, T(0, 0))]
    t.move(BALL, [(30.5, T()), *fly, *back], origin="50% 50%")
    kx = t.g[BALL][1] - 10
    t.actor("kick", "red", kx, [(0, hide()), (24, hide()), (27, T()), (29.5, T(-3, 0, -10)), (31, T(4, 0, 16)),
                                 (33, T()), (hit_at + 1, T()), (hit_at + 2, T(0, -6)), (hit_at + 3.5, T()),
                                 (84, T()), (88, hide()), (100, hide())])
    fall = t.ground() - 3 - t.base(t.g[COLON][2])  # 「:」の下端が画像の下端に着くまで
    if t.kind == "wide":
        end = t.g[BALL][1] + t.g[BALL][3]
        land = end + 110 - cx  # 2行目の右の空いた所
    else:
        land = -6
    return land, fall


def colon_fall(hit_at, land, fall):
    """「:」が当たってぐらつき、弧を描いて飛ばされ、ボトッと落ちて弾む。"""
    fly = arc(hit_at + 1, hit_at + 7, -3, -3, land, fall, -30 if land > 40 else 0, 7)
    return [(hit_at, T()), (hit_at + .8, T(-3, -3, -18)), *fly, (hit_at + 7.8, T(land, fall, 0, 1.25, .7)),
            (hit_at + 9, T(land, fall - 7)), (hit_at + 10.5, T(land, fall)), (hit_at + 11.3, T(land, fall, 0, 1.1, .85)),
            (hit_at + 12.3, T(land, fall))]


def bump(p):
    """跳ねて押し上げる動き。"""
    return [(p - 1.5, T(0, 0, 0, 1.08, .9)), (p, T(0, -8, 0, .95, 1.06)), (p + 1.5, T())]


def walk(p0, p1, x0, x1, n=6):
    out = []
    for k in range(n + 1):
        out.append((p0 + (p1 - p0) * k / n, T(x0 + (x1 - x0) * k / n, -4 if k % 2 else 0)))
    return out


# ---------- 案C1：肩車で直す ----------
def tower(kind, mode):
    """飛ばされて落ちた「:」を緑が担いで運び、青の上に紫が乗って元の場所へ押し込む。"""
    t = Title(kind, mode, 12)
    hit = 38
    land, fall = kick_ball(t, hit)
    cx = t.center(COLON)[0]
    held = -124 * .2 - 4  # 緑の頭の上
    fr = colon_fall(hit, land, fall)
    fr += [(53, T(land, fall)), (55, T(land, fall + held)), (63, T(22, fall + held)),  # 緑が担いで運ぶ
           (65, T(22, fall + held)), (67, T(0, fall + held - 26)), (70, T(0, -6)), (71.5, T(0, 0, 0, 1.12, .88)),
           (73, T())]
    t.move(COLON, fr)
    sx = cx + land
    t.actor("g", "green", sx, [(0, hide()), (48, hide()), (51, T()), (53, T(0, -4)), (55, T()),
                               *walk(55, 63, 0, cx + 22 - sx, 8)[1:], (66, T(cx + 22 - sx, -4)), (67, T(cx + 22 - sx)),
                               (76, T(cx + 22 - sx)), (78, T(cx + 22 - sx, -8)), (80, T(cx + 22 - sx)),
                               (86, T(cx + 22 - sx)), (90, hide())])
    t.actor("b", "blue", cx, [(0, hide()), (54, hide()), (57, T()), (67, T(0, 0, 0, 1.06, .94)), (71, T()),
                              (78, T(0, -8)), (80, T()), (86, T()), (90, hide())])
    up = -124 * .2 + 2
    t.actor("p", "purple", cx + 52, [(0, hide()), (55, hide()), (58, T()), (61, T(-26, -16)), (63, T(-52, up)),
                                     (67, T(-52, up)), (68.5, T(-52, up - 9)), (70.5, T(-52, up)), (73, T(-38, -16)),
                                     (75, T(-28, 0)), (78, T(-28, -8)), (80, T(-28, 0)), (86, T(-28, 0)), (90, hide())])
    return t.render()


# ---------- 案C2：2つの点を拾い集める ----------
def gather(kind, mode):
    """「:」が上下2つの点に割れて飛ばされる。青が上の点を、紫が下の点を、それぞれ元の場所へ放り投げて戻す。"""
    t = Title(kind, mode, 12)
    hit = 38
    land, fall = kick_ball(t, hit)
    cx = t.center(COLON)[0]
    size = t.g[COLON][4]
    gap = size * .33  # 上の点が下の点より上にある量
    spread = 46 if kind == "wide" else 30
    top_fly = arc(hit + 1, hit + 7, -2, -4, land + spread, fall + gap, -34 if land > 40 else -10, 7)
    bot_fly = arc(hit + 1, hit + 6, 0, 0, land, fall, -22 if land > 40 else 0, 6)
    top = [(hit, T()), (hit + .8, T(-2, -4, -20)), *top_fly, (hit + 8, T(land + spread, fall + gap - 7)),
           (hit + 9.5, T(land + spread, fall + gap)), (58, T(land + spread, fall + gap)), (60, T(land + spread, fall + gap - 10)),
           *arc(61, 68, land + spread, fall + gap - 10, 0, 0, -40, 8)[1:], (69, T(0, -3)), (70, T())]
    bot = [(hit, T()), (hit + .8, T(-2, 0, 10)), *bot_fly, (hit + 7, T(land, fall - 6)), (hit + 8.5, T(land, fall)),
           (66, T(land, fall)), (68, T(land, fall - 10)), *arc(69, 76, land, fall - 10, 0, 0, -36, 8)[1:],
           (77, T(0, -3)), (78, T())]
    t.split(COLON, top, bot)
    tx, bx = cx + land + spread, cx + land
    t.actor("b", "blue", tx, [(0, hide()), (48, hide()), (51, T()), (58, T()), (59.5, T(0, 0, 0, 1.1, .88)),
                              (61, T(0, -10)), (62.5, T()), (80, T()), (82, T(0, -8)), (84, T()), (88, hide())])
    t.actor("p", "purple", bx, [(0, hide()), (50, hide()), (53, T()), (66, T()), (67.5, T(0, 0, 0, 1.1, .88)),
                                (69, T(0, -10)), (70.5, T()), (80, T()), (82, T(0, -8)), (84, T()), (88, hide())])
    t.actor("g", "green", (tx + bx) / 2 if kind == "wide" else bx + 24, [(0, hide()), (52, hide()), (55, T()), (62, T(0, -6)),
                                                                         (63.5, T()), (70, T(0, -6)), (71.5, T()), (80, T()),
                                                                         (82, T(0, -8)), (84, T()), (88, hide())])
    return t.render()


# ---------- 案C3：トスでつないで戻す ----------
def relay(kind, mode):
    """飛ばされて落ちた「:」を青・緑・紫がトスでつなぎ、元の場所へ送り返す。"""
    t = Title(kind, mode, 12)
    hit = 38
    land, fall = kick_ball(t, hit)
    cx = t.center(COLON)[0]
    lx = cx + land
    xs = [lx, (lx + cx) / 2 + 10, cx + 4]  # 青・緑・紫
    fr = [*colon_fall(hit, land, fall), (54, T(land, fall))]
    fr += arc(56, 61, land, fall, xs[1] - cx, fall - 22, -40, 6)[1:]
    fr += arc(62, 69, xs[1] - cx, fall - 22, 0, 0, -50, 8)[1:]
    fr += [(70, T(0, -3)), (71, T(0, 0, 0, 1.1, .9)), (72, T())]
    t.move(COLON, fr)
    t.actor("b", "blue", xs[0], [(0, hide()), (48, hide()), (51, T()), *bump(56), (78, T()), (80, T(0, -8)), (82, T()),
                                 (86, T()), (90, hide())])
    t.actor("g", "green", xs[1], [(0, hide()), (50, hide()), (53, T()), *bump(61.5), (78, T()), (80, T(0, -8)), (82, T()),
                                  (86, T()), (90, hide())])
    t.actor("p", "purple", xs[2], [(0, hide()), (52, hide()), (55, T()), (66, T()), (68, T(0, -10)), (70, T()),
                                   (78, T()), (80, T(0, -8)), (82, T()), (86, T()), (90, hide())])
    return t.render()


# ---------- 案E：Cooplay の目 ----------
def eyes(kind, mode):
    """「Cooplay」の2つの「o」に黒目が現れ、下を歩くキャラクターを目で追い、まばたきして消える。"""
    t = Title(kind, mode, 11)
    _, x, row, w, size = t.g[3]  # "Cooplay"
    k = w / sum(WIDTHS[3:10])
    ox = [x + (WIDTHS[3] + WIDTHS[4] / 2) * k, x + (WIDTHS[3] + WIDTHS[4] + WIDTHS[5] / 2) * k]
    oy = t.base(row) - size * .26
    r = size * .1
    look = [(0, T(0, 0, 0, 0, 0)), (26, T(0, 0, 0, 0, 0)), (29, T(0, 0, 0, 1.2, 1.2)), (30.5, T()),
            (36, T(r * .9, r * .5)), (50, T(r * .9, r * .5)), (60, T(-r * .9, r * .5)), (66, T(-r * .9, r * .5)),
            (67, T(-r * .9, r * .5, 0, 1, .1)), (68, T(-r * .9, r * .5)), (74, T(0, -r * .3)), (78, T(0, -r * .3)),
            (79, T(0, -r * .3, 0, 1, .1)), (80, T(0, -r * .3)), (84, T(0, 0)), (87, T(0, 0, 0, 0, 0)), (100, T(0, 0, 0, 0, 0))]
    for n, cx in enumerate(ox):
        t.css.append("")
        t.kf(f"eye{n}", look, "50% 50%")
        t.front.append(f'<g class="eye{n}"><circle cx="{cx:.1f}" cy="{oy:.1f}" r="{r:.1f}" fill="{INK[mode]}"/>'
                       f'<circle cx="{cx - r * .35:.1f}" cy="{oy - r * .35:.1f}" r="{r * .3:.1f}" fill="#FFFFFF"/></g>')
    # キャラクターは右から左へ歩き、途中で立ち止まって見上げ、手を振るように跳ねる
    for k2, name in enumerate(art.ORDER):
        x0, x1 = t.W + 30 + k2 * 30, 40 + k2 * 34
        steps = [(0, T(x0)), (30, T(x0))]
        n = 10
        for j in range(n + 1):
            steps.append((30 + 30 * j / n, T(x0 + (x1 - x0) * j / n, -4 if j % 2 else 0)))
        steps += [(70, T(x1, 0)), (72 + k2, T(x1, -8)), (74 + k2, T(x1, 0)), (80, T(x1)), (88, T(x1 + 400, 0))]
        t.actor(f"w{k2}", name, 0, [(p, v) for p, v in steps] + [(100, T(x1 + 400))])
    return t.render()


# ---------- 案F：そのままだけ動かない ----------
def still(kind, mode):
    """4体がそろって足踏みすると、文字がみんな揺れる。ただし「ゲームはそのまま。」だけはそのまま動かない。"""
    t = Title(kind, mode, 10)
    stomps = (34, 44, 54)
    for n, i in enumerate(sorted(t.g)):
        if i in STAY:
            continue
        fr = []
        for s in stomps:
            r = (5 if (n + s) % 2 else -5)
            fr += [(s, T()), (s + 1, T(0, -7, r)), (s + 2.5, T(0, 0, -r * .5)), (s + 4, T())]
        t.move(i, fr)
    last = t.g[max(t.g)]
    span = last[1] + last[3]
    for k, name in enumerate(art.ORDER):
        x = span + 30 + k * 30 if span + 150 < t.W else 24 + k * 30
        fr = [(0, hide()), (24 + k, hide()), (28 + k, T())]
        for s in stomps:
            fr += [(s - 3, T(0, -12, 0, .95, 1.06)), (s, T(0, 0, 0, 1.12, .85)), (s + 2, T())]
        fr += [(64, T()), (68, T(0, -6)), (70, T()), (80, T()), (84, hide())]
        t.actor(f"s{k}", name, x, fr)
    # 「？」
    qx = t.g[STAY[0]][1] + 4
    qy = t.base(t.g[STAY[0]][2]) - t.g[STAY[0]][4] - 2
    t.front.append(f'<g class="q"><text x="{qx:.1f}" y="{qy:.1f}" font-size="20" font-weight="800" fill="#FF8A00" '
                   f'font-family="{FONT}">？</text></g>')
    t.css.append("@keyframes q{0%,62%{opacity:0}64%,76%{opacity:1}78%,100%{opacity:0}}.q{opacity:0;animation:q 10s linear infinite}")
    return t.render()


# ---------- 案G：長音のなわとび ----------
def rope(kind, mode):
    """「リコープレイ」の「ー」が外れて落ち、緑と紫が縄として回す。青と赤が跳び、最後に「ー」を元に戻す。"""
    t = Title(kind, mode, 12)
    bx, by = t.center(BAR)
    ground = t.ground() - 22  # 縄を回す高さ（キャラクターの胴の高さ）
    mid = 140 if kind == "wide" else t.W / 2  # 縄を回す場所
    fdx, fdy = mid - bx, ground - by
    fr = [(30, T()), (31, T(0, -6)), *arc(32, 37, 0, -6, fdx, fdy, -10, 6)[1:], (37.6, T(fdx, fdy, 0, 1.3, .7)),
          (38.5, T(fdx, fdy))]
    # 回す：縄が上下に回る。横に伸ばして縄に見せる
    swing = 0
    for k in range(4):
        p = 44 + k * 6
        fr += [(p, T(fdx, fdy - 26, 0, 2.6, 1)), (p + 1.5, T(fdx, fdy - 14, 0, 2.6, -1)), (p + 3, T(fdx, fdy + 18, 0, 2.6, 1)),
               (p + 4.5, T(fdx, fdy - 6, 0, 2.6, -1)), (p + 6, T(fdx, fdy - 26, 0, 2.6, 1))]
        swing = p + 6
    fr += [(swing + 2, T(fdx, fdy)), *arc(swing + 4, swing + 10, fdx, fdy, 0, 0, -30, 6)[1:], (swing + 11, T(0, -3)),
           (swing + 12, T())]
    t.move(BAR, fr, origin="50% 50%")
    half = bx and t.g[BAR][3] * 1.3 + 14
    t.actor("g", "green", mid - half, [(0, hide()), (36, hide()), (39, T()), (40, T(4, 0)), (68, T(4, 0)), (70, T()),
                                       (80, T()), (84, hide())], front=False)
    t.actor("p", "purple", mid + half, [(0, hide()), (36, hide()), (39, T()), (40, T(-4, 0)), (68, T(-4, 0)), (70, T()),
                                        (80, T()), (84, hide())], front=False)
    for n, (name, dx) in enumerate((("blue", -9), ("red", 9))):
        fr2 = [(0, hide()), (38, hide()), (41, T())]
        for k in range(4):
            p = 44 + k * 6 + 3
            fr2 += [(p - 1.5, T(0, 0, 0, 1.08, .9)), (p, T(0, -16)), (p + 1.5, T(0, 0, 0, 1.08, .9)), (p + 2.5, T())]
        fr2 += [(72, T()), (74, T(0, -8)), (76, T()), (80, T()), (84, hide())]
        t.actor(f"j{n}", name, mid + dx, fr2)
    return t.render()


OPTIONS = [
    ("c1", "肩車で直す", "文末の「。」を赤が蹴ると、行をまたいで「:」に当たり、「:」がボトッと落ちる。緑が拾い、青の上に紫が乗って元の場所へ押し込む。", tower),
    ("c2", "2つの点を拾い集める", "「。」が当たると「:」が上下2つの点に割れて転がる。4体で押して戻し、1つずつ放り上げて元に戻す。", gather),
    ("c3", "トスでつなぐ", "落ちた「:」を青・緑・紫がトスでつなぎ、だんだん高く上げて、最後に元の場所へ収める。", relay),
    ("e", "Cooplayの目", "「Cooplay」の2つの「o」に黒目が現れ、下を歩くキャラクターを目で追い、まばたきして消える。", eyes),
    ("f", "そのままだけ動かない", "4体がそろって足踏みすると文字がみんな揺れるが、「ゲームはそのまま。」だけはそのまま動かない。", still),
    ("g", "長音のなわとび", "「リコープレイ」の「ー」が外れて落ち、緑と紫が縄として回す。青と赤が跳び、最後に「ー」を元に戻す。", rope),
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
             "動きは10〜12秒で1周し、最初の約3秒は止まっています。", "",
             "生成：`python scripts/readme/title.py`", "", "---", "", "## 比較用：ふつうの見出し", "", f"# {TITLE}", "",
             "Re:Cooplayは、**既存のPCゲームに協力プレイを後付けするシステム**です。", ""]
    for key, name, desc, _ in OPTIONS:
        lines += ["---", "", f"## 案{key.upper()}：{name}", "", desc, "", picture(key, TITLE), "",
                  "Re:Cooplayは、**既存のPCゲームに協力プレイを後付けするシステム**です。", ""]
    (OUT / "README.md").write_text("\n".join(lines), encoding="utf-8", newline="\n")
    print(f"wrote {len(OPTIONS) * 4} files to {OUT}")


if __name__ == "__main__":
    main()
