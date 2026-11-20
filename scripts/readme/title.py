"""READMEの作品名（h1）を、GitHubの見出しと同じ見た目のSVGアニメーションにする案を生成する。

最初はふつうの見出しにしか見えず、少し時間がたつと4色のキャラクターが現れて文字を動かす。
文字はGitHub本体と同じフォント指定・32px・太さ600で描き、1文字ずつの位置はGitHubの見出しを
Chromeで実測した幅（WIDTHS）で置く。READMEでは <h1> の中に align="absbottom" で入れると、
見出しの下線までの間隔もふつうの見出しと同じになる。

    python scripts/readme/title.py
"""
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
NAME = len("Re:Cooplay")  # 英字の作品名は1語として扱い、端末のフォントの違いを textLength で吸収する
LINES = {"wide": [(0, 18), (18, 40)],  # 作品名／キャッチコピー
         "narrow": [(0, 10), (10, 18), (18, 27), (27, 33), (33, 40)]}
SIZE = {"wide": art.PC_W, "narrow": art.PHONE_W}
TOP, LH, BASE = 18, 40, 33  # 上の余白（跳ねる分）、行の高さ、行の上端から文字の基準線まで
INK = {"light": "#1F2328", "dark": "#F0F6FC"}
FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI','Noto Sans',Helvetica,Arial,sans-serif"
STILL = "@media (prefers-reduced-motion:reduce){*{animation:none!important}}"


def layout(kind):
    """各文字の (文字, x, 行) を返す。作品名の英字は1つの要素にまとめる。"""
    glyphs = {}
    for row, (a, z) in enumerate(LINES[kind]):
        x = 0.0
        i = a
        while i < z:
            if i == 0:
                glyphs[0] = (TITLE[:NAME], x, row, sum(WIDTHS[:NAME]))
                x += sum(WIDTHS[:NAME])
                i = NAME
                continue
            glyphs[i] = (TITLE[i], x, row, WIDTHS[i])
            x += WIDTHS[i]
            i += 1
    return glyphs


def find(word):
    i = TITLE.index(word)
    return list(range(i, i + len(word)))


class Title:
    def __init__(self, kind, mode, dur):
        self.kind, self.mode, self.dur = kind, mode, dur
        self.g = layout(kind)
        self.rows = len(LINES[kind])
        self.W, self.H = SIZE[kind], TOP + LH * self.rows
        self.css, self.front = [], []
        self.moves = {}  # 文字の番号 → キーフレーム
        self.groups = []  # (文字の番号の並び, キーフレーム)：まとめて動かす語

    def base(self, row):
        return TOP + LH * row + BASE

    def ground(self, row):
        return TOP + LH * (row + 1)

    def move(self, idx, frames):
        self.moves[idx] = frames

    def move_group(self, ids, frames):
        self.groups.append((list(ids), frames))

    def kf(self, name, frames, prop="transform", origin="50% 100%", ease="linear"):
        body = "".join(f"{p:g}%{{{prop}:{v}}}" for p, v in frames)
        self.css.append(f"@keyframes {name}{{{body}}}.{name}{{animation:{name} {self.dur}s {ease} infinite;"
                        f"transform-box:fill-box;transform-origin:{origin}}}")

    def actor(self, cid, name, x, row, frames, s=.22, clip=True):
        """キャラクター。(x, 行の下端) に足を置き、frames で動かす。clip なら行の下端より下は隠す。"""
        self.kf(f"a-{cid}", frames)
        y = self.ground(row) - 124 * s
        body = f'<g class="a-{cid}">{art.char(name, x - 50 * s, y, s, art.THEMES[self.mode])}</g>'
        if clip:
            body = f'<g clip-path="url(#row{row})">{body}</g>'
        self.front.append(body)

    def render(self, title):
        ink = INK[self.mode]
        texts = {}
        for i, (ch, x, row, w) in sorted(self.g.items()):
            fit = f' textLength="{w:.2f}" lengthAdjust="spacingAndGlyphs"' if i == 0 else ""
            t = f'<text x="{x:.2f}" y="{self.base(row)}" class="h"{fit}>{ch}</text>'
            if i in self.moves:
                self.kf(f"g{i}", self.moves[i])
                t = f'<g class="g{i}">{t}</g>'
            texts[i] = t
        for n, (ids, fr) in enumerate(self.groups):
            self.kf(f"gg{n}", fr)
            texts[ids[0]] = f'<g class="gg{n}">' + "".join(texts.pop(i) for i in ids) + "</g>"
        texts = [texts[k] for k in sorted(texts)]
        clips = "".join(f'<clipPath id="row{r}"><rect x="-50" y="-200" width="{self.W + 100}" height="{self.ground(r) + 200}"/></clipPath>'
                        for r in range(self.rows))
        css = f".h{{font-family:{FONT};font-size:32px;font-weight:600;fill:{ink}}}" + "".join(self.css) + STILL
        body = f"<defs>{clips}</defs>" + "".join(texts) + "".join(self.front)
        return art.svg(self.W, self.H, body, art.THEMES[self.mode], title, css)


def hop(p, h=12, d=4):
    """p(%) で跳ねる：ため→跳ぶ→着地でつぶれる。"""
    return [(p - d * .5, "translateY(0px) scale(1,1)"), (p - d * .25, "translateY(0px) scale(1.08,.9)"),
            (p, f"translateY(-{h}px) scale(.95,1.06)"), (p + d * .5, "translateY(0px) scale(1.06,.92)"),
            (p + d * .8, "translateY(0px) scale(1,1)")]


def frames(*parts):
    """(%, 値) の並びに 0% と 100% を足して、時刻順に並べる。"""
    rest = "translate(0px,0px) rotate(0deg) scale(1,1)"
    out = {0: rest, 100: rest}
    for p, v in parts:
        out[round(p, 2)] = v
    return sorted(out.items())


# ---------- 案A：ウェーブ ----------
def wave(kind, mode):
    """キャラクターが下の行を駆け抜け、通ったところの文字が順に跳ねる。"""
    t = Title(kind, mode, 9)
    start, span = 30, 40
    row = t.rows - 1
    run = lambda x: start + span * (x + 40) / (t.W + 80)  # noqa: E731
    for i, (ch, x, r, w) in t.g.items():
        p = run(x + w / 2) + (t.rows - 1 - r) * 1.5
        t.move(i, frames(*hop(p, 12 if r == row else 9)))
    for k, name in enumerate(art.ORDER):
        x0, x1 = -30 - k * 26, t.W + 30 - k * 26
        steps = [(0, f"translate({x0 - 0}px,0px)"), (start - 1, f"translate({x0}px,0px)")]
        n = 14
        for j in range(n + 1):
            p = start + span * j / n
            x = x0 + (x1 - x0) * j / n
            steps.append((round(p, 2), f"translate({x:.1f}px,{-6 if j % 2 else 0}px)"))
        steps.append((100, f"translate({x1}px,0px)"))
        t.actor(f"w{k}", name, 0, row, steps, clip=False)
    return t.render("Re:Cooplay（リコープレイ）ゲームはそのまま。1キャラを、みんなで操作。")


# ---------- 案B：1キャラを操作 ----------
def operate(kind, mode):
    """P1・P2・P3 が下から現れ、「1キャラ」を順に動かす（P1で歩き、P2で向きを変え、P3で跳ぶ）。"""
    t = Title(kind, mode, 10)
    ids = find("1キャラ")
    x0 = t.g[ids[0]][1]
    x1 = t.g[ids[-1]][1] + t.g[ids[-1]][3]
    row = t.g[ids[0]][2]
    walk = []
    for p, dx in ((31, 0), (33, 8), (35, 4), (37, 12), (39, 8), (41, 16), (43, 12), (45, 0)):
        walk.append((p, f"translate({dx}px,{-3 if p in (33, 37, 41) else 0}px) rotate(0deg) scale(1,1)"))
    look = [(48, "translate(0px,0px) rotate(0deg) scale(1,1)"), (52, "translate(0px,0px) rotate(-14deg) scale(1,1)"),
            (56, "translate(0px,0px) rotate(14deg) scale(1,1)"), (60, "translate(0px,0px) rotate(0deg) scale(1,1)")]
    jump = [(64, "translate(0px,0px) rotate(0deg) scale(1.08,.9)"), (67, "translate(0px,-18px) rotate(0deg) scale(.95,1.06)"),
            (70, "translate(0px,0px) rotate(0deg) scale(1.06,.92)"), (72, "translate(0px,0px) rotate(0deg) scale(1,1)"),
            (73, "translate(0px,0px) rotate(0deg) scale(1.08,.9)"), (76, "translate(0px,-18px) rotate(0deg) scale(.95,1.06)"),
            (79, "translate(0px,0px) rotate(0deg) scale(1.06,.92)"), (81, "translate(0px,0px) rotate(0deg) scale(1,1)")]
    t.move_group(ids, frames(*walk, *look, *jump))
    hidden, shown = "translateY(32px)", "translateY(11px)"  # 頭だけ出す
    spots = [x0 + 14, (x0 + x1) / 2, x1 - 14]  # 語の下から顔を出す
    for k, (name, a, z) in enumerate((("blue", 31, 45), ("green", 48, 60), ("purple", 64, 81))):
        act = [(a - 1, shown), (a + 1, "translateY(2px)"), (a + 3, shown), (z - 3, "translateY(2px)"), (z - 1, shown)]
        t.actor(f"o{k}", name, spots[k], row,
                [(0, hidden), (24 + k * 2, hidden), (27 + k * 2, shown), *act, (86, shown), (90, hidden), (100, hidden)])
    return t.render("Re:Cooplay（リコープレイ）ゲームはそのまま。1キャラを、みんなで操作。")


# ---------- 案C：句点のボール ----------
def ball(kind, mode):
    """文末の「。」がボールになる。赤が蹴ると転がっていき、青が蹴り返すと元の場所に戻る。"""
    t = Title(kind, mode, 10)
    i = TITLE.index("。", TITLE.index("操作"))
    ch, x, row, w = t.g[i]
    room = min(120, t.W - (x + w) - 46)
    roll = []
    for p, dx, dy, rot in ((30, 0, 0, 0), (32, 0, -10, 0), (34, 0, 0, 0), (36, room * .45, 0, 200), (38, room * .7, -8, 300),
                           (40, room * .85, 0, 380), (43, room, 0, 470), (58, room, 0, 470), (60, room, -10, 470),
                           (62, room * .6, 0, 300), (64, room * .3, -6, 160), (67, 0, 0, 0), (69, 0, -6, 0), (71, 0, 0, 0)):
        roll.append((p, f"translate({dx:.1f}px,{dy}px) rotate(0deg) scale(1,1)"))  # 「。」は丸いので回さない
    t.move(i, frames(*roll))
    hidden = "translateY(32px)"
    kick_r = [(0, hidden), (25, hidden), (28, "translate(0px,0px)"), (31, "translate(-4px,0px) rotate(-8deg)"),
              (33, "translate(4px,0px) rotate(14deg)"), (35, "translate(0px,0px) rotate(0deg)"), (48, "translate(0px,0px)"),
              (52, hidden), (100, hidden)]
    t.actor("c0", "red", x - 12, row, kick_r)
    far = x + w / 2 + room + 34
    kick_b = [(0, hidden), (46, hidden), (50, "translate(0px,0px)"), (57, "translate(4px,0px) rotate(8deg)"),
              (59.5, "translate(-4px,0px) rotate(-14deg)"), (62, "translate(0px,0px) rotate(0deg)"), (74, "translate(0px,0px)"),
              (78, hidden), (100, hidden)]
    t.actor("c1", "blue", far, row, kick_b)
    return t.render("Re:Cooplay（リコープレイ）ゲームはそのまま。1キャラを、みんなで操作。")


# ---------- 案D：わっしょい ----------
def lift(kind, mode):
    """4体が下から現れ、「みんなで操作。」をみんなで担ぎ上げて、わっしょいと揺らしてから降ろす。"""
    t = Title(kind, mode, 10)
    ids = find("みんなで操作。")
    row = t.g[ids[0]][2]
    up = []
    for p, y in ((32, 0), (36, -16), (40, -16), (43, -24), (46, -14), (49, -24), (52, -14), (55, -24), (58, -16),
                 (66, -16), (70, 0)):
        up.append((p, f"translate(0px,{y}px) rotate(0deg) scale(1,1)"))
    for n, i in enumerate(ids):
        sway = [(p, v.replace("rotate(0deg)", f"rotate({(-3 if (n + j) % 2 else 3) if 43 <= p <= 55 else 0}deg)"))
                for j, (p, v) in enumerate(up)]
        t.move(i, frames(*sway))
    x0 = t.g[ids[0]][1]
    x1 = t.g[ids[-1]][1] + t.g[ids[-1]][3]
    hidden = 32
    for k, name in enumerate(art.ORDER):
        x = x0 + (x1 - x0) * (k + .5) / 4
        fr = [(0, f"translateY({hidden}px)"), (26 + k, f"translateY({hidden}px)"), (31 + k * .5, "translateY(0px)")]
        fr += [(p, f"translateY({y}px)") for p, y in ((36, -16), (40, -16), (43, -24), (46, -14), (49, -24), (52, -14),
                                                       (55, -24), (58, -16), (66, -16), (70, 0))]
        fr += [(76 + k, "translateY(0px)"), (80 + k, f"translateY({hidden}px)"), (100, f"translateY({hidden}px)")]
        t.actor(f"l{k}", name, x, row, fr)
    return t.render("Re:Cooplay（リコープレイ）ゲームはそのまま。1キャラを、みんなで操作。")


OPTIONS = [("a", "ウェーブ", "キャラクターが下の行を駆け抜け、通ったところの文字が順に跳ねる。", wave),
           ("b", "1キャラを操作", "P1・P2・P3が下から現れ、「1キャラ」を順に動かす（P1で歩き、P2で向きを変え、P3で跳ぶ）。", operate),
           ("c", "句点のボール", "文末の「。」がボールになる。赤が蹴ると転がっていき、青が蹴り返すと元の場所に戻る。", ball),
           ("d", "わっしょい", "4体が下から現れ、「みんなで操作。」を担ぎ上げて揺らしてから降ろす。", lift)]


def picture(key, alt):
    b = f"title-{key}"
    return (f'<h1><picture>'
            f'<source media="(max-width: 700px) and (prefers-color-scheme: dark)" srcset="{b}-narrow-dark.svg">'
            f'<source media="(max-width: 700px)" srcset="{b}-narrow-light.svg">'
            f'<source media="(prefers-color-scheme: dark)" srcset="{b}-dark.svg">'
            f'<img src="{b}-light.svg" align="absbottom" alt="{alt}"></picture></h1>')


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    for key, _, _, make in OPTIONS:
        for kind in ("wide", "narrow"):
            for mode in ("light", "dark"):
                suffix = ("-narrow" if kind == "narrow" else "") + f"-{mode}"
                (OUT / f"title-{key}{suffix}.svg").write_text(make(kind, mode) + "\n", encoding="utf-8", newline="\n")
    lines = ["# 作品名の見出し（案）", "",
             "ふつうの見出しに見えて、少したつとキャラクターが文字を動かす案です。各案の下の文は、本文との並びを見るためのものです。",
             "動きはおよそ10秒で1周し、最初の約3秒は止まっています。", "",
             "生成：`python scripts/readme/title.py`", "", "---", "", "## 比較用：ふつうの見出し", "", f"# {TITLE}", "",
             "Re:Cooplayは、**既存のPCゲームに協力プレイを後付けするシステム**です。", ""]
    for key, name, desc, _ in OPTIONS:
        lines += ["---", "", f"## 案{key.upper()}：{name}", "", desc, "", picture(key, TITLE), "",
                  "Re:Cooplayは、**既存のPCゲームに協力プレイを後付けするシステム**です。", ""]
    (OUT / "README.md").write_text("\n".join(lines), encoding="utf-8", newline="\n")
    print(f"wrote {len(OPTIONS) * 4} files to {OUT}")


if __name__ == "__main__":
    main()
