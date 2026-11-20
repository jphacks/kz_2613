"""項目の見出しの横で、スマホ型のキャラクターが製品の使い方を演じる場面（head_play.py が使う）。

キャラクターはスマホそのもの。画面の表示が顔から操作画面へ切り替わる、カメラで読み取る、
横に寝かせて横持ちになる、笑って震える、といったスマホらしい動きで、見出しの内容を1つずつ演じる。
PCは画面にゲームを映したモニターで表し、ゲームの中の主人公（1人）をスマホたちが一緒に動かす。

舞台は scenes.py と同じ幅560・高さ100・地面94。文字は吹き出しと、モニターの「START」だけにする。
"""

import build_art as art
import scenes
from scenes import G, HW, IN, IO, OUT_, Key, Scene, actor, bubble, dust, key, kf, lie

GOLD = scenes.GOLD
AV_SHIRT, AV_SKIN, AV_LEGS = "#FF9F1C", "#FFD9AE", "#3B4252"
SKY, HILL, HILL2 = "#A8E0FF", "#C9EDB6", "#B3E19E"
DIRT, DIRT_D, GRASS = "#9A6A43", "#6E4A2D", "#5DBE4E"
SW, SH, TOP = 124, 70, 4  # モニターの画面の大きさと上端
SPARK = "M0-7Q1-1 7 0Q1 1 0 7Q-1 1-7 0Q-1-1 0-7Z"


# ---------- アニメーションの小道具 ----------


def tl(cls, D, frames, prop="transform", box=True, origin="50% 50%"):
    """クラス cls を frames（(%, 値[, 緩急])）で動かすCSS。box=True なら自分の中心を基準に回す・伸ばす。"""
    rule = f"animation:k-{cls} {D}s linear infinite"
    if box and prop == "transform":
        rule += f";transform-box:fill-box;transform-origin:{origin}"
    return kf(f"k-{cls}", frames) if prop == "transform" else kf(f"k-{cls}", frames, prop), f".{cls}{{{rule}}}"


def anim(sc, cls, D, frames, prop="transform", box=True, origin="50% 50%"):
    a, b = tl(cls, D, frames, prop, box, origin)
    sc.raw(css=a + b)


def fade(sc, cls, D, frames):
    """不透明度を frames（(%, 値)）でなめらかに変える。動きを減らす設定では最初の値のまま止まる。"""
    sc.raw(css=kf(f"k-{cls}", frames, "opacity") + f".{cls}{{opacity:{frames[0][1]};animation:k-{cls} {D}s linear infinite}}")


def pop(cls, D, a, b):
    """a〜b(%) の間だけ、ふくらんで出てしぼんで消える。動きを減らす設定では隠れたままにする。"""
    frames = [(0, "scale(0)"), (a, "scale(0)", OUT_), (a + 2.5, "scale(1.12)", IO), (a + 4, "scale(1)"),
              (b - 1.5, "scale(1)", IN), (b, "scale(0)"), (100, "scale(0)")]
    return (kf(f"k-{cls}", frames) + f".{cls}{{transform:scale(0);animation:k-{cls} {D}s linear infinite;"
            "transform-box:fill-box;transform-origin:50% 100%}")


def say(sc, x, y, s, cls, D, a, b, size=12):
    sc.raw(bubble(x, y, s, cls, size), pop(cls, D, a, b))


def note(sc, x, y, s, cls, D, a, b, size=14, fill=scenes.MARK):
    sc.raw(scenes.mark(x, y, s, cls, size, fill), pop(cls, D, a, b))


def faces(cid, D, spec):
    """spec：[(顔の種類, [(始め%, 終わり%), ...]), ...]。キャラクターの層と、切り替えのCSSを返す。"""
    layers, css = [], ""
    for i, (kind, on) in enumerate(spec):
        cls = f"{cid}-f{i}"
        layers.append((kind, cls))
        css += scenes.show(cls, D, on)
    return tuple(layers), css


def person(sc, cid, name, x0, keys, D, spec, shadow=True):
    layers, css = faces(cid, D, spec)
    sc.add(actor(cid, name, keys, D, layers, x0=x0, shadow=shadow))
    sc.raw(css=css)


def tap(p, x=0, y=0, r=0):
    """画面の切り替えや押す動き：沈んで、少し跳ねて戻る。"""
    return [key(p - 1.5, x, y, r, 1.07, .92, OUT_), key(p, x, y - 7, r, .95, 1.07, IN), key(p + 1.6, x, y, r, 1.05, .95, OUT_),
            key(p + 3, x, y, r)]


def turn(p, x=0, y=0):
    """くるっと向きを変える（体が細くなった瞬間に、表と裏の絵を入れ替える）。"""
    return [key(p - 2, x, y, 0, 1.05, .94, OUT_), key(p, x, y - 6, 0, .14, 1.05, IN), key(p + 2, x, y, 0, 1.06, .93),
            key(p + 3.5, x, y)]


def hop(p, x=0, h=14, r=0):
    return [key(p, x, 0, r, 1.1, .88, OUT_), key(p + 3, x, -h, r, .93, 1.1, IN), key(p + 6, x, 0, r, 1.1, .88, OUT_),
            key(p + 8, x, 0, r)]


def buzz(p0, p1, x=0, amp=1.6, step=.7, r=0):
    """スマホの振動：左右に細かく震える。"""
    out, k = [], 0
    p = p0
    while p < p1:
        out.append(Key(round(p, 2), x + (amp if k % 2 else -amp), 0, r + (2 if k % 2 else -2), 1, 1, "linear", "linear"))
        p += step
        k += 1
    out.append(key(p1, x, 0, r))
    return out


def flight(sc, cls, D, p0, p1, a, b, lift, body, spin=0):
    """a〜b(%) に p0 から p1 へ、高さ lift の弧を描いて飛ぶ。body は (0, 0) を中心に描く。"""
    (x0, y0), (x1, y1) = p0, p1
    m = (a + b) / 2
    top = min(y0, y1) - lift
    fx = [(0, f"translateX({x0}px)"), (a, f"translateX({x0}px)", "linear"), (b, f"translateX({x1}px)"), (100, f"translateX({x1}px)")]
    fy = [(0, f"translateY({y0}px)"), (a, f"translateY({y0}px)", OUT_), (m, f"translateY({top}px)", IN), (b, f"translateY({y1}px)"),
          (100, f"translateY({y1}px)")]
    a0, b0 = max(a - .2, 0), min(b + .2, 100)
    op = [(0, 0), (a0, 0), (a, 1), (b, 1), (b0, 0), (100, 0)]
    spin_css = ""
    inner = body
    if spin:
        inner = f'<g class="{cls}r">{body}</g>'
        spin_css = kf(f"k-{cls}r", [(0, "rotate(0deg)"), (a, "rotate(0deg)", "linear"), (b, f"rotate({spin}deg)"), (100, f"rotate({spin}deg)")]) \
            + f".{cls}r{{animation:k-{cls}r {D}s linear infinite;transform-box:fill-box;transform-origin:50% 50%}}"
    sc.raw(f'<g class="{cls}x"><g class="{cls}y"><g class="{cls}o">{inner}</g></g></g>',
           kf(f"k-{cls}x", fx) + kf(f"k-{cls}y", fy) + kf(f"k-{cls}o", op, "opacity")
           + f".{cls}x{{animation:k-{cls}x {D}s linear infinite}}.{cls}y{{animation:k-{cls}y {D}s linear infinite}}"
           + f".{cls}o{{opacity:0;animation:k-{cls}o {D}s linear infinite}}" + spin_css)


def stream(sc, cid, D, p0, p1, a, b, color, lift=16, travel=5, gap=1.5, r=3.3):
    """a〜b(%) のあいだ、色つきの点を次々に飛ばす（スマホから届く操作）。"""
    t, i = a, 0
    while t + travel <= b + .01:
        flight(sc, f"{cid}{i}", D, p0, p1, t, t + travel, lift,
               dot(color, r))
        t += gap
        i += 1


# ---------- スマホの画面（キャラクターの原寸100x150の座標。画面は x14〜86・y16〜133） ----------


def screen(kind, name):
    e = art.CHARS[name]["eye"]
    kind, _, cls = kind.partition(":")
    kind, _, rot = kind.partition("@")
    c = f' class="{cls}"' if cls else ""
    def ring(w=6):
        return f'fill="none" stroke="{e}" stroke-width="{w}"'

    def line(w=8):
        return f'fill="none" stroke="{e}" stroke-width="{w}" stroke-linecap="round" stroke-linejoin="round"'
    if kind == "stick":  # P1：移動のスティック
        g = f'<circle cx="50" cy="76" r="25" {ring()} opacity=".45"/><g{c}><circle cx="50" cy="76" r="13" fill="{e}"/></g>'
    elif kind == "drag":  # P2：視点のドラッグパッド
        g = (f'<rect x="24" y="40" width="52" height="72" rx="12" {ring()} opacity=".45"/>'
             f'<path d="M33 70l-6 6 6 6M67 70l6 6-6 6" {line(5)} opacity=".7"/>'
             f'<g{c}><circle cx="50" cy="76" r="10" fill="{e}"/></g>')
    elif kind == "button":  # P3：アクションのボタン
        g = (f'<circle cx="50" cy="66" r="26" {ring()} opacity=".4"/><g{c}><circle cx="50" cy="66" r="18" fill="{e}"/></g>'
             f'<circle cx="38" cy="108" r="8" fill="{e}" opacity=".55"/><circle cx="62" cy="108" r="8" fill="{e}" opacity=".55"/>')
    elif kind == "pad":  # P1のリモコン：タッチパッド
        g = (f'<rect x="22" y="30" width="56" height="70" rx="8" {ring()} opacity=".5"/>'
             f'<rect x="22" y="106" width="26" height="14" rx="5" fill="{e}" opacity=".55"/>'
             f'<rect x="52" y="106" width="26" height="14" rx="5" fill="{e}" opacity=".55"/>'
             f'<g{c}><circle cx="50" cy="65" r="9" fill="{e}"/></g>')
    elif kind == "wheel":  # レース：ハンドル
        g = (f'<g{c}><circle cx="50" cy="74" r="25" {ring(8)}/><circle cx="50" cy="74" r="6" fill="{e}"/>'
             f'<path d="M26 74h48M50 74v25" {line(6)}/></g>')
    elif kind == "pedal":  # レース：アクセルとブレーキ
        g = (f'<rect x="28" y="62" width="18" height="30" rx="5" fill="{e}" opacity=".55"/>'
             f'<g{c}><rect x="54" y="48" width="18" height="44" rx="5" fill="{e}"/></g>')
    elif kind == "gear":  # レース：ライト・ギアの2ボタン
        g = (f'<circle cx="34" cy="74" r="11" fill="{e}" opacity=".55"/><g{c}><circle cx="66" cy="74" r="13" fill="{e}"/></g>')
    elif kind == "lr":  # パズル：左右移動
        g = f'<path d="M42 58l-16 18 16 18z" fill="{e}"/><g{c}><path d="M58 58l16 18-16 18z" fill="{e}"/></g>'
    elif kind == "spin":  # パズル：回転
        g = f'<g{c}><path d="M70 66a21 21 0 1 0 2 18" {line(7)}/><path d="M76 56l-3 16-14-7z" fill="{e}"/></g>'
    elif kind == "drop":  # パズル：落下
        g = f'<path d="M34 50h32" {line(6)} opacity=".5"/><g{c}><path d="M50 98l-20-26h40z" fill="{e}"/></g>'
    elif kind == "finder":  # カメラでQRを読み取る
        q = "#E9EEF6"
        g = (f'<path d="M24 46v-10h10M66 36h10v10M76 104v10H66M34 114H24v-10" {line(5)}/>'
             + "".join(f'<rect x="{x}" y="{y}" width="12" height="12" fill="none" stroke="{q}" stroke-width="3"/>'
                       for x, y in ((33, 54), (55, 54), (33, 84)))
             + f'<rect x="57" y="86" width="5" height="5" fill="{q}"/><rect x="64" y="93" width="5" height="5" fill="{q}"/>'
             f'<g{c}><rect x="22" y="74" width="56" height="3" rx="1.5" fill="#FF4A6A"/></g>')
    elif kind == "check":
        g = f'<path d="M30 76l14 14 26-30" {line(9)}/>'
    elif kind == "bored":  # 退屈：半目
        g = (f'<g transform="translate(0 6)"><path d="M28 47h15M57 47h15" {line(5)}/>'
             f'<path d="M30 52q6 4 12 0M58 52q6 4 12 0" {line(3.5)} opacity=".8"/>'
             f'<path d="M45 64h10" {line(4)}/></g>')
    elif kind == "off":  # 画面が消えている
        return '<path d="M24 40L44 24M24 56L58 26" stroke="#FFFFFF" stroke-width="4" stroke-linecap="round" opacity=".1"/>'
    elif kind == "notify":  # 通知が届いて画面が点く（横に寝かせたスマホでは、通知を画面の上辺に出す）
        g = (f'<rect x="{50 - 54}" y="{74 - 33}" width="108" height="20" rx="7" fill="{e}"/>'
             f'<circle cx="{50 - 42}" cy="{74 - 23}" r="5" fill="#FFFFFF" opacity=".9"/>'
             f'<rect x="{50 - 31}" y="{74 - 26}" width="60" height="6" rx="3" fill="#FFFFFF" opacity=".85"/>'
             f'<rect x="{50 - 31}" y="{74 - 17}" width="38" height="4" rx="2" fill="#FFFFFF" opacity=".6"/>')
    else:
        return None
    if rot:
        g = f'<g transform="rotate({rot} 50 74)">{g}</g>'
    return f'<g filter="url(#glow)">{g}</g>'


_base_layer = scenes.layer


def layer(kind, name):
    return screen(kind, name) or _base_layer(kind, name)


scenes.layer = layer  # scenes.body が顔を描くときに、スマホの画面の種類も使えるようにする


# ---------- PCのモニターとゲームの画面 ----------


def monitor(sc, cx, inner, cid="mon"):
    x0 = cx - SW / 2
    neck = TOP + SH + 4
    sc.raw(f'<rect x="{cx - 5}" y="{neck}" width="10" height="{G - 3 - neck}" fill="#4A5062"/>'
           f'<rect x="{cx - 21}" y="{G - 4}" width="42" height="4.5" rx="2.2" fill="#4A5062"/>'
           f'<rect x="{x0 - 4}" y="{TOP - 4}" width="{SW + 8}" height="{SH + 8}" rx="6" fill="#262A35" stroke="#5A6072" stroke-width="1.2"/>'
           f'<clipPath id="{cid}"><rect x="{x0}" y="{TOP}" width="{SW}" height="{SH}" rx="2"/></clipPath>'
           f'<g clip-path="url(#{cid})"><g transform="translate({x0} {TOP})">{inner}</g></g>')
    return x0


def sky():
    return (f'<rect width="{SW}" height="{SH}" fill="{SKY}"/><circle cx="16" cy="13" r="7" fill="#FFE27A"/>'
            f'<ellipse cx="22" cy="56" rx="36" ry="15" fill="{HILL}"/><ellipse cx="88" cy="58" rx="44" ry="13" fill="{HILL2}"/>')


def ground(x0, x1, y=54):
    return (f'<rect x="{x0}" y="{y}" width="{x1 - x0}" height="{SH - y + 4}" fill="{DIRT}"/>'
            f'<rect x="{x0}" y="{y}" width="{x1 - x0}" height="4" fill="{GRASS}"/>')


def block(x, y, s=12):
    return (f'<rect x="{x}" y="{y}" width="{s}" height="{s}" fill="{DIRT}" stroke="{DIRT_D}" stroke-width="1"/>'
            f'<rect x="{x}" y="{y}" width="{s}" height="3.5" fill="{GRASS}"/>')


def avatar(face=1):
    """ゲームの中の主人公。足もとの中央を原点にする。face=1 なら右向き、-1 なら左向き。"""
    ex = (-.5, 2.6) if face > 0 else (-4.6, -1.5)
    return (f'<rect x="-4" y="-7" width="3.4" height="7" fill="{AV_LEGS}"/><rect x=".6" y="-7" width="3.4" height="7" fill="{AV_LEGS}"/>'
            f'<rect x="-5" y="-15.5" width="10" height="9" rx="1.2" fill="{AV_SHIRT}"/>'
            f'<rect x="-5" y="-25" width="10" height="9.5" rx="1.8" fill="{AV_SKIN}"/>'
            + "".join(f'<rect x="{x}" y="-21.5" width="2" height="2.8" fill="#2E2B48"/>' for x in ex))


def walk_y(p0, p1, y, n, h=1.6):
    """歩くときの小さな上下。"""
    out = []
    for i in range(n):
        a = p0 + (p1 - p0) * i / n
        out += [(round(a, 2), f"translateY({y}px)", OUT_), (round(a + (p1 - p0) / n / 2, 2), f"translateY({y - h}px)", IN)]
    return out + [(p1, f"translateY({y}px)")]


def spark(x, y, cls, color=GOLD, s=1.0):
    return f'<g transform="translate({x} {y}) scale({s})"><path class="{cls}" d="{SPARK}" fill="{color}"/></g>'


def twinkle(sc, cls, D, a, b):
    anim(sc, cls, D, [(0, "scale(0) rotate(0deg)"), (a, "scale(0) rotate(0deg)", OUT_), (a + 4, "scale(1.25) rotate(45deg)", IO),
                      (b - 3, "scale(1) rotate(90deg)", IN), (b, "scale(0) rotate(120deg)"), (100, "scale(0) rotate(120deg)")])
    sc.raw(css=f".{cls}{{transform:scale(0)}}")


def flash(sc, cls, D, at, color="#FFFFFF"):
    """モニターの画面が白く光って切り替わる（at% で最も明るい）。画面の座標で描く。"""
    frames = [(0, 0), (max(at - 3, 0), 0), (at, 1), (min(at + 4, 100), 0), (100, 0)]
    if at >= 97:  # 1周の終わりで光り、次の周の始まりで消える
        frames = [(0, .85), (4, 0), (at - 3, 0), (at, 1), (100, .85)]
    fade(sc, cls, D, frames)
    return f'<rect class="{cls}" width="{SW}" height="{SH}" fill="{color}"/>'


def zzz(sc, x, y, D, on, cls="zz"):
    """寝息の「Z」が、ふわっと浮かんで消える。on の範囲だけ出す。"""
    out = []
    for i in range(3):
        c = f"{cls}{i}"
        out.append(f'<g class="{c}">{art.text(x, y, "Z", 11 + i * 2, "#7C8BFF", cls="rnd", weight=800)}</g>')
        sc.raw(css=kf(f"k-{c}", [(0, "translate(0px,0px) scale(.6)"), (100, "translate(12px,-22px) scale(1.2)")])
               + kf(f"k-{c}o", [(0, 0), (25, 1), (100, 0)], "opacity")
               + f".{c}{{animation:k-{c} 2.1s ease-out {-i * .7:.2f}s infinite,k-{c}o 2.1s ease-out {-i * .7:.2f}s infinite;"
                 "transform-box:fill-box;transform-origin:50% 50%}")
    sc.raw(f'<g class="{cls}">{"".join(out)}</g>', scenes.show(cls, D, on))


def head_top(x):
    return (x, G - 47)


def dot(color, r=3.3):
    return f'<circle r="{r}" fill="{color}" stroke="#FFFFFF" stroke-width="1.1"/>'


BODY = {n: art.CHARS[n]["body"] for n in art.ORDER}
ROLE = {"blue": "stick", "green": "drag", "purple": "button", "red": "gear"}


# ---------- 01 背景：1人で遊ぶと、ゲームが眠ってしまう ----------


def alone():
    D = 10
    sc = Scene(D)
    mx = 420
    # ゲーム：主人公が同じ道を行ったり来たりするうちに、画面が暗くなって眠る
    ax = [(0, "translateX(30px)", "linear"), (12, "translateX(72px)"), (13, "translateX(72px)", "linear"), (25, "translateX(30px)"),
          (26, "translateX(30px)", "linear"), (38, "translateX(72px)"), (88, "translateX(72px)", "linear"), (99, "translateX(30px)"),
          (100, "translateX(30px)")]
    ay = walk_y(0, 12, 54, 5) + walk_y(13, 25, 54, 5) + walk_y(26, 38, 54, 5) + walk_y(88, 99, 54, 4) + [(100, "translateY(54px)")]
    anim(sc, "a1x", D, ax, box=False)
    anim(sc, "a1y", D, ay, box=False)
    sc.raw(css=scenes.show("a1r", D, [(0, 12.5), (25.5, 88)]) + scenes.show("a1l", D, [(12.5, 25.5), (88, 100)]))
    fade(sc, "a1dim", D, [(0, 0), (38, 0), (47, .62), (84, .62), (93, 0), (100, 0)])
    game = (sky() + ground(-10, SW + 10) + block(100, 42) + block(8, 42)
            + f'<g class="a1x"><g class="a1y"><g class="a1r">{avatar(1)}</g><g class="a1l">{avatar(-1)}</g></g></g>'
            + f'<rect class="a1dim" width="{SW}" height="{SH}" fill="#0B0E1A"/>')
    monitor(sc, mx, game)
    zzz(sc, mx + 40, 30, D, [(50, 86)])
    # 3台のスマホ（友達）は床に置かれたまま。青からの通知で震えて、画面が点く
    for i, (name, x0, r) in enumerate((("green", 104, 90), ("purple", 160, 90), ("red", 216, 90))):
        t = 74 + i * 3
        ks = [Key(0, 0, -HW, r)] + [Key(round(t + .4 + k * .6, 2), (1.3 if k % 2 else -1.3), -HW, r + (2 if k % 2 else -2), 1, 1,
                                        "linear", "linear") for k in range(6)] + [Key(t + 4.4, 0, -HW, r)]
        person(sc, f"f1{i}", name, x0, ks, D, [("off", [(0, t), (90, 100)]), ("notify@-90", [(t, 90)])])
        for k in range(3):
            flight(sc, f"p1{i}{k}", D, (322, G - 48), (x0 + 22, G - 22), t - 4 + k * .5, t + k * .5, 14, dot(BODY["blue"], 3.3 - k * .6))
    # 青は1人で遊ぶ。あくびをして、床のスマホに気づき、ひらめいて呼びかける
    b = [key(0, 0, 0, -3), key(12, 0, 0, 3), key(25, 0, 0, -3), key(38, 0, 0, 3), key(40, 0, 0, 0)] + turn(43)
    b += [key(56, 0), key(58, 0, 0, -9), key(61, 0, 0, -9)] + hop(62, 0, 14) + tap(70) + [key(84, 0)] + turn(87) + [key(100, 0, 0, -3)]
    person(sc, "b1", "blue", 322, b, D, [("back", [(0, 43), (87, 100)]), ("bored", [(43, 57)]), ("normal", [(57, 62)]), ("happy", [(62, 87)])])
    say(sc, 322, 44, "ふわぁ…", "b1s", D, 45, 56)
    note(sc, 322, 32, "！", "b1n", D, 61, 69, 15)
    return sc, "ひとりで遊ぶ", "1人で遊ぶうちにゲームが眠ってしまう。床に置かれた友達のスマホに気づいて、青が呼びかける。"


# ---------- 02 製品説明：3台のスマホで、ゲームの主人公1人を動かす ----------


def together():
    D = 10
    sc = Scene(D)
    mx = 420
    x0 = mx - SW / 2
    wx = [(0, "translateX(0px)"), (46, "translateX(0px)", IO), (60, "translateX(-56px)"), (96, "translateX(-56px)"),
          (96.5, "translateX(0px)"), (100, "translateX(0px)")]
    ax = [(0, "translateX(30px)"), (14, "translateX(30px)", "linear"), (30, "translateX(62px)"), (34, "translateX(62px)", "linear"),
          (42, "translateX(96px)"), (62, "translateX(96px)", "linear"), (74, "translateX(140px)"), (96, "translateX(140px)"),
          (96.5, "translateX(30px)"), (100, "translateX(30px)")]
    ay = ([(0, "translateY(54px)")] + walk_y(14, 30, 54, 6)
          + [(34, "translateY(54px)", OUT_), (38, "translateY(28px)", IN), (42, "translateY(54px)")]
          + walk_y(62, 74, 54, 5) + [(79, "translateY(54px)", OUT_), (81.5, "translateY(44px)", IN), (84, "translateY(54px)"),
                                     (100, "translateY(54px)")])
    anim(sc, "w2", D, wx, box=False)
    anim(sc, "a2x", D, ax, box=False)
    anim(sc, "a2y", D, ay, box=False)
    anim(sc, "st2", D, [(0, "scale(1)"), (74, "scale(1)", OUT_), (77, "scale(1.7)", IN), (79, "scale(0)"), (96.5, "scale(0)"),
                        (98, "scale(1)"), (100, "scale(1)")])
    game = (sky() + f'<g class="w2">{ground(-10, 220) + block(78, 42)}'
            f'<g transform="translate(150 40)"><g class="st2">{art.star(0, 0, 7, GOLD)}</g></g>'
            f'<g class="a2x"><g class="a2y">{avatar(1)}</g></g></g>' + flash(sc, "fl2", D, 97))
    monitor(sc, mx, game)
    dst = (x0 - 2, 34)
    # 青：移動
    b = ([key(0, 0)] + tap(8) + [key(14, 0, 0, 0, ease=OUT_), key(16, 0, 0, 7), key(30, 0, 0, 7), key(32, 0), key(62, 0, 0, 0, ease=OUT_),
                                 key(64, 0, 0, 7), key(74, 0, 0, 7), key(76, 0)] + hop(80) + hop(88) + tap(96))
    person(sc, "b2", "blue", 150, b, D, [("normal", [(0, 8), (96, 100)]), ("stick:b2k", [(8, 80)]), ("happy", [(80, 96)])])
    anim(sc, "b2k", D, [(0, "translateX(0px)"), (14, "translateX(0px)", OUT_), (16, "translateX(12px)"), (30, "translateX(12px)", IN),
                        (32, "translateX(0px)"), (62, "translateX(0px)", OUT_), (64, "translateX(12px)"), (74, "translateX(12px)", IN),
                        (76, "translateX(0px)"), (100, "translateX(0px)")], box=False)
    stream(sc, "s2b", D, head_top(150), dst, 15, 30, BODY["blue"], lift=10)
    stream(sc, "s2c", D, head_top(150), dst, 62, 74, BODY["blue"], lift=10)
    # 緑：視点
    g = [key(0, 0)] + tap(10) + [key(45, 0, 0, 0, ease=OUT_), key(47, 0, 0, -6), key(59, 0, 0, -6), key(61, 0)] + hop(81) + hop(89) + tap(96.5)
    person(sc, "g2", "green", 205, g, D, [("normal", [(0, 10), (96.5, 100)]), ("drag:g2k", [(10, 81)]), ("happy", [(81, 96.5)])])
    anim(sc, "g2k", D, [(0, "translateX(0px)"), (44, "translateX(0px)", OUT_), (46.5, "translateX(12px)", IO), (58, "translateX(-12px)", OUT_),
                        (61, "translateX(0px)"), (100, "translateX(0px)")], box=False)
    stream(sc, "s2g", D, head_top(205), dst, 46, 60, BODY["green"], lift=10)
    # 紫：ジャンプ
    p = ([key(0, 0)] + tap(12) + [key(32, 0, 0, 0, 1, 1, OUT_), key(33, 0, 0, 0, 1.12, .86, OUT_), key(35.5, 0, -12, 0, .93, 1.1, IN),
                                  key(38, 0, 0, 0, 1.08, .92), key(40, 0)] + hop(82) + hop(90) + tap(97))
    person(sc, "p2", "purple", 260, p, D, [("normal", [(0, 12), (97, 100)]), ("button:p2k", [(12, 82)]), ("happy", [(82, 97)])])
    anim(sc, "p2k", D, [(0, "scale(1)"), (32, "scale(1)", OUT_), (33, "scale(.7)"), (35, "scale(.7)", OUT_), (37, "scale(1)"), (100, "scale(1)")])
    stream(sc, "s2p", D, head_top(260), dst, 32.5, 37.5, BODY["purple"], lift=10, travel=4)
    note(sc, 205, 34, "♪", "n2", D, 80, 94, 14)
    sc.raw(spark(x0 + 104, 18, "sp2a") + spark(x0 + 118, 30, "sp2b", s=.7))
    twinkle(sc, "sp2a", D, 75, 90)
    twinkle(sc, "sp2b", D, 77, 90)
    return sc, "みんなで1人を動かす", "3台のスマホが操作画面に変わり、移動・ジャンプ・視点を分け合って、ゲームの主人公を星まで連れていく。"


def tr(x, y):
    return f"translate({x}px,{y}px)"


def qr(x, y, s=48):
    """QRコード風の模様（読み取れる符号ではない）。"""
    m = s / 10
    out = [f'<rect x="{x - 3}" y="{y - 3}" width="{s + 6}" height="{s + 6}" rx="3" fill="#FFFFFF"/>']
    for fx, fy in ((0, 0), (7, 0), (0, 7)):
        out.append(f'<rect x="{x + fx * m + .75}" y="{y + fy * m + .75}" width="{3 * m - 1.5}" height="{3 * m - 1.5}" fill="none" '
                   f'stroke="#1B1E28" stroke-width="1.5"/><rect x="{x + (fx + 1) * m}" y="{y + (fy + 1) * m}" width="{m}" height="{m}" fill="#1B1E28"/>')
    bits = "0010110011101001011101011010010111010011011010110100101101100101101010011101"
    k = 0
    for j in range(10):
        for i in range(10):
            if (i < 3 and j < 3) or (i > 6 and j < 3) or (i < 3 and j > 6):
                continue
            if bits[k % len(bits)] == "1":
                out.append(f'<rect x="{x + i * m:.1f}" y="{y + j * m:.1f}" width="{m:.1f}" height="{m:.1f}" fill="#1B1E28"/>')
            k += 1
    return "".join(out)


# ---------- 03 特長：QRを読み取るだけで、スマホがコントローラーになる ----------


def join():
    D = 11
    sc = Scene(D)
    mx = 430
    x0 = mx - SW / 2
    names, xs, ts = art.ORDER, (150, 200, 250, 300), (6, 24, 42, 60)
    slots = [(92 + (i % 2) * 20, 24 + (i // 2) * 22) for i in range(4)]
    inner = [f'<rect width="{SW}" height="{SH}" fill="#EEF2F8"/>', qr(14, 11, 48)]
    for i, (cx, cy) in enumerate(slots):
        inner.append(f'<circle cx="{cx}" cy="{cy}" r="7" fill="none" stroke="#C5CCD8" stroke-width="2" stroke-dasharray="3 2.5"/>')
        inner.append(f'<g class="j3s{i}"><circle cx="{cx}" cy="{cy}" r="7.5" fill="{BODY[names[i]]}"/>'
                     f'<path d="M{cx - 3.4} {cy}l2.4 2.4 4.4-4.8" fill="none" stroke="#FFFFFF" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></g>')
        t = ts[i]
        anim(sc, f"j3s{i}", D, [(0, "scale(0)"), (t + 7.5, "scale(0)", OUT_), (t + 9.5, "scale(1.25)", IO), (t + 11, "scale(1)"),
                                (93, "scale(1)", IN), (96, "scale(0)"), (100, "scale(0)")])
        sc.raw(css=f".j3s{i}{{transform:scale(0)}}")
    # 読み取り中は、QRの上を赤い線が往復する
    inner.append(f'<g class="j3q"><g class="j3l"><rect x="10" y="10" width="56" height="2.4" rx="1.2" fill="#FF4A6A"/></g></g>')
    sc.raw(css=scenes.show("j3q", D, [(t + .5, t + 7.5) for t in ts])
           + "@keyframes j3l{0%{transform:translateY(0)}100%{transform:translateY(48px)}}"
           + ".j3l{animation:j3l .55s ease-in-out infinite alternate}"
           + "@keyframes fscan{0%{transform:translateY(-26px)}100%{transform:translateY(26px)}}"
           + ".fscan{animation:fscan .55s ease-in-out infinite alternate}")
    monitor(sc, mx, "".join(inner))
    for i, (name, x, t) in enumerate(zip(names, xs, ts)):
        ks = [key(0, 0)] + tap(t) + [key(t + 3, 0, -5, 7, ease=IO), key(t + 7, 0, -5, 7, ease=IO), key(t + 8.5, 0, 0, 0)]
        ks += tap(t + 11.5) + hop(82 + i * .8, 0, 12) + hop(89 + i * .8, 0, 10) + tap(97)
        person(sc, f"j3{i}", name, x, ks, D, [("normal", [(0, t), (97, 100)]), ("finder:fscan", [(t, t + 7.5)]),
                                              ("check", [(t + 7.5, t + 11.5)]), (ROLE[name], [(t + 11.5, 97)])])
        sc.raw(spark(x + 16, G - 50, f"j3k{i}", BODY[name], .8))
        twinkle(sc, f"j3k{i}", D, t + 7.5, t + 12)
    note(sc, 225, 30, "♪", "n3", D, 81, 95, 14)
    return sc, "QRで参加", "4台のスマホが順にモニターのQRを読み取ると、画面がそれぞれの操作画面に変わり、参加の枠が埋まっていく。"


# ---------- 04 解決出来ること：ゲームが変わると、分担もスマホの持ち方も変わる ----------


def cell(x, y, c, s=8):
    return f'<rect x="{x + .5}" y="{y + .5}" width="{s - 1}" height="{s - 1}" rx="1.2" fill="{c}" stroke="#000" stroke-opacity=".25" stroke-width="1"/>'


def genres():
    D = 13.5
    sc = Scene(D)
    mx = 420
    x0 = mx - SW / 2
    A, B, C = (0, 33.3), (33.3, 66.6), (66.6, 100)
    # A：ブロックの世界
    anim(sc, "w4", D, [(0, tr(0, 0)), (20, tr(0, 0), IO), (28, tr(-22, 0)), (33, tr(-22, 0)), (100, tr(-22, 0))], box=False)
    anim(sc, "a4", D, [(0, tr(24, 54)), (4, tr(24, 54), "linear"), (14, tr(52, 54)), (15, tr(52, 54), OUT_), (18, tr(68, 30), IN),
                       (21, tr(84, 54)), (100, tr(84, 54))], box=False)
    world = (sky() + f'<g class="w4">{ground(-10, 200) + block(64, 42)}<g class="a4">{avatar(1)}</g></g>')
    # B：レース
    anim(sc, "car4", D, [(0, tr(62, 64)), (38, tr(62, 64), IO), (42, tr(46, 64), IO), (48, tr(46, 64), IO), (53, tr(78, 64), IO),
                         (59, tr(78, 64), IO), (63, tr(62, 64)), (100, tr(62, 64))], box=False)
    sc.raw(css="@keyframes rd4{to{stroke-dashoffset:-22}}.rd4{animation:rd4 .32s linear infinite}")
    fade(sc, "spd4", D, [(0, 0), (51, 0), (52, 1), (60, 1), (62, 0), (100, 0)])
    race = (f'<rect width="{SW}" height="{SH}" fill="#7CCB5E"/><rect width="{SW}" height="24" fill="{SKY}"/>'
            f'<ellipse cx="30" cy="25" rx="40" ry="8" fill="{HILL2}"/><ellipse cx="100" cy="25" rx="34" ry="7" fill="{HILL}"/>'
            '<path d="M54 24h16l48 46H6z" fill="#5A6070"/><path d="M54 24L6 70M70 24l48 46" stroke="#FFFFFF" stroke-width="2"/>'
            '<path class="rd4" d="M62 24V70" stroke="#FFE27A" stroke-width="2.4" stroke-dasharray="6 5"/>'
            '<g class="spd4"><path d="M18 40l-8 6M14 54l-9 7M106 40l8 6M110 54l9 7" stroke="#FFFFFF" stroke-width="2" stroke-linecap="round"/></g>'
            f'<g class="car4"><rect x="-15" y="-3" width="7" height="5" rx="1.5" fill="#22252E"/><rect x="8" y="-3" width="7" height="5" rx="1.5" fill="#22252E"/>'
            f'<rect x="-16" y="-12" width="32" height="11" rx="3.5" fill="{AV_SHIRT}"/><rect x="-10" y="-18" width="20" height="7" rx="2.5" fill="#2E3A55"/>'
            '<rect x="-14" y="-9" width="5" height="3" rx="1" fill="#FF4A4A"/><rect x="9" y="-9" width="5" height="3" rx="1" fill="#FF4A4A"/></g>')
    # C：落ち物パズル
    well = [f'<rect width="{SW}" height="{SH}" fill="#1E2438"/>',
            '<rect x="37" y="2" width="50" height="68" fill="#2A3150" stroke="#55608A" stroke-width="1.4"/>']
    colors = ["#FF6B6B", "#FFC93C", "#4ADE80", "#60A5FA", "#F472B6", "#FF6B6B"]
    rows = []
    for r, y in enumerate((54, 62)):
        rows.append("".join(cell(38 + c * 8, y, colors[(c + r * 2) % 6]) for c in range(6) if c != 4))
    well.append(f'<g class="row4">{"".join(rows)}</g>')
    well.append(cell(38, 46, "#60A5FA") + cell(46, 46, "#FFC93C"))
    piece_h = cell(0, 0, "#C084FC") + cell(8, 0, "#C084FC")
    piece_v = cell(0, 0, "#C084FC") + cell(0, 8, "#C084FC")
    well.append(f'<g class="ph4v"><g class="ph4">{piece_h}</g></g><g class="pv4v"><g class="pv4">{piece_v}</g></g>')
    anim(sc, "ph4", D, [(0, tr(54, 6)), (68, tr(54, 6), "linear"), (73, tr(54, 14), OUT_), (75, tr(62, 14)), (100, tr(62, 14))], box=False)
    anim(sc, "pv4", D, [(0, tr(70, 10)), (81, tr(70, 10), "linear"), (86, tr(70, 14), IN), (88.5, tr(70, 54)), (100, tr(70, 54))], box=False)
    sc.raw(css=scenes.show("ph4v", D, [(66.6, 80)]) + scenes.show("pv4v", D, [(80, 91)]))
    fade(sc, "row4", D, [(0, 1), (89.5, 1), (90.5, .2), (91.5, 1), (92.5, .2), (94, 0), (100, 0)])
    puzzle = "".join(well) + spark(62, 58, "sp4", GOLD, 1.3)
    twinkle(sc, "sp4", D, 90, 98)
    sc.raw(css=scenes.show("m4a", D, [A]) + scenes.show("m4b", D, [B]) + scenes.show("m4c", D, [C]))
    fade(sc, "fl4", D, [(0, .9), (3, 0), (31, 0), (33.3, 1), (36.5, 0), (64.5, 0), (66.6, 1), (69.5, 0), (97.5, 0), (100, .9)])
    monitor(sc, mx, f'<g class="m4a">{world}</g><g class="m4b">{race}</g><g class="m4c">{puzzle}</g>'
                    f'<rect class="fl4" width="{SW}" height="{SH}" fill="#FFFFFF"/>')
    dst = (x0 - 2, 34)

    def landscape(extra_b):
        """立ったまま → 跳んで横向きに寝かせる → 起き上がる。"""
        return ([key(32.8, 0), key(34.3, 0, 0, 0, 1.08, .9, OUT_), key(36.5, 0, -18, -45, 1, 1, IN), lie(38.6, 0, -90, OUT_), lie(39.6, 0, -86),
                 lie(40.6, 0, -90)] + extra_b
                + [lie(63.6, 0, -90, OUT_), key(65.6, 0, -18, -40, .96, 1.05, IN), key(67.6, 0, 0, 0, 1.1, .88, OUT_), key(69, 0)])

    # 青：移動 → ハンドル → 左右移動
    b = [key(0, 0), key(4, 0, 0, 6), key(14, 0, 0, 6), key(15.5, 0)]
    b += landscape([Key(42, 0, -HW, -90), Key(45, 0, -HW, -94), Key(51, 0, -HW, -86), Key(57, 0, -HW, -90)])
    b += tap(74) + tap(97)
    person(sc, "b4", "blue", 150, b, D, [("stick:b4k", [(0, 36.5), (97, 100)]), ("wheel@90:b4w", [(36.5, 65.6)]), ("lr:b4r", [(65.6, 97)])])
    anim(sc, "b4k", D, [(0, tr(0, 0)), (4, tr(0, 0), OUT_), (6, tr(12, 0)), (14, tr(12, 0), IN), (16, tr(0, 0)), (100, tr(0, 0))], box=False)
    anim(sc, "b4w", D, [(0, "rotate(0deg)"), (38, "rotate(0deg)", IO), (42, "rotate(-35deg)"), (48, "rotate(-35deg)", IO),
                        (53, "rotate(35deg)"), (59, "rotate(35deg)", IO), (63, "rotate(0deg)"), (100, "rotate(0deg)")])
    anim(sc, "b4r", D, [(0, "scale(1)"), (73, "scale(1)", OUT_), (74, "scale(.7)"), (76, "scale(1)"), (100, "scale(1)")])
    stream(sc, "s4b", D, head_top(150), dst, 4, 14, BODY["blue"], lift=10)
    stream(sc, "s4c", D, (128, G - 38), dst, 40, 60, BODY["blue"], lift=14, gap=2.4)
    stream(sc, "s4d", D, head_top(150), dst, 73, 77, BODY["blue"], lift=10, travel=4)
    # 緑：視点 → アクセル → 回転
    g = [key(0, 0), key(20, 0, 0, -5), key(28, 0, 0, -5), key(29.5, 0)] + landscape([]) + tap(80) + tap(97.3)
    person(sc, "g4", "green", 205, g, D, [("drag:g4k", [(0, 36.5), (97.3, 100)]), ("pedal@90:g4p", [(36.5, 65.6)]), ("spin:g4s", [(65.6, 97.3)])])
    anim(sc, "g4k", D, [(0, tr(0, 0)), (19, tr(0, 0), OUT_), (21, tr(12, 0), IO), (28, tr(-12, 0), OUT_), (30, tr(0, 0)), (100, tr(0, 0))], box=False)
    anim(sc, "g4p", D, [(0, "scaleY(1)"), (39, "scaleY(1)", OUT_), (41, "scaleY(.78)"), (62, "scaleY(.78)", IN), (64, "scaleY(1)"),
                        (100, "scaleY(1)")], origin="50% 100%")
    anim(sc, "g4s", D, [(0, "rotate(0deg)"), (79.5, "rotate(0deg)", IO), (82.5, "rotate(360deg)"), (100, "rotate(360deg)")])
    stream(sc, "s4g", D, head_top(205), dst, 20, 28, BODY["green"], lift=10)
    stream(sc, "s4h", D, (183, G - 38), dst, 41, 62, BODY["green"], lift=14, gap=3)
    stream(sc, "s4i", D, head_top(205), dst, 79.5, 83.5, BODY["green"], lift=10, travel=4)
    # 紫：ジャンプ → ギア → 落下
    p = [key(0, 0), key(14, 0, 0, 0, 1.12, .86, OUT_), key(16, 0, -10, 0, .94, 1.08, IN), key(18, 0)] + landscape(
        [Key(51, 0, -HW, -90, 1, 1, OUT_), Key(52, 0, -HW + 3, -90, 1.05, .9), Key(53.5, 0, -HW, -90)]) + tap(87) + tap(97.6)
    person(sc, "p4", "purple", 260, p, D, [("button:p4k", [(0, 36.5), (97.6, 100)]), ("gear@90:p4g", [(36.5, 65.6)]), ("drop:p4d", [(65.6, 97.6)])])
    anim(sc, "p4k", D, [(0, "scale(1)"), (13.5, "scale(1)", OUT_), (14.5, "scale(.7)"), (17, "scale(1)"), (100, "scale(1)")])
    anim(sc, "p4g", D, [(0, "scale(1)"), (50.5, "scale(1)", OUT_), (51.5, "scale(.7)"), (54, "scale(1)"), (100, "scale(1)")])
    anim(sc, "p4d", D, [(0, tr(0, 0)), (86.5, tr(0, 0), OUT_), (87.5, tr(0, 8)), (90, tr(0, 0)), (100, tr(0, 0))], box=False)
    stream(sc, "s4p", D, head_top(260), dst, 13.5, 17.5, BODY["purple"], lift=10, travel=4)
    stream(sc, "s4q", D, (238, G - 38), dst, 50.5, 54.5, BODY["purple"], lift=14, travel=4)
    stream(sc, "s4r", D, head_top(260), dst, 86.5, 90.5, BODY["purple"], lift=10, travel=4)
    return sc, "ゲームごとの分担", "ブロックの世界、レース、落ち物パズルと、ゲームが変わるたびに、スマホの操作画面と持ち方も変わる。"


# ---------- 05 試遊での反応：息が合わずに笑い、合わせて成功する ----------


def playtest():
    D = 12
    sc = Scene(D)
    mx = 420
    x0 = mx - SW / 2
    anim(sc, "a5", D, [(0, tr(18, 54)), (6, tr(18, 54), "linear"), (20, tr(54, 54)), (20.1, tr(54, 54), "linear"), (26, tr(66, 84)),
                       (56, tr(18, 54)), (66, tr(18, 54), "linear"), (76, tr(50, 54)), (76.1, tr(50, 54), "linear"),
                       (84, tr(92, 54)), (84.1, tr(92, 54), "linear"), (89, tr(104, 54)), (100, tr(104, 54))], box=False)
    anim(sc, "a5y", D, [(0, tr(0, 0)), (20, tr(0, 0), IN), (26, tr(0, 0)), (76, tr(0, 0), OUT_), (80, tr(0, -26), IN), (84, tr(0, 0)),
                        (100, tr(0, 0))], box=False)
    fade(sc, "a5o", D, [(0, 1), (25.5, 1), (26, 0), (56, 0), (57, 1), (58, 0), (59, 1), (60, 0), (61, 1), (100, 1)])
    anim(sc, "st5", D, [(0, "scale(1)"), (88, "scale(1)", OUT_), (90.5, "scale(1.7)", IN), (92.5, "scale(0)"), (97, "scale(0)"),
                        (99, "scale(1)"), (100, "scale(1)")])
    game = (sky() + ground(-10, 58) + ground(82, SW + 10) + f'<rect x="58" y="54" width="24" height="20" fill="#3B2A1E"/>'
            f'<g transform="translate(108 42)"><g class="st5">{art.star(0, 0, 7, GOLD)}</g></g>'
            f'<g class="a5o"><g class="a5"><g class="a5y">{avatar(1)}</g></g></g>' + flash(sc, "fl5", D, 98))
    monitor(sc, mx, game)
    dst = (x0 - 2, 34)
    # 青：移動。2回目は「せーの！」
    b = [key(0, 0), key(6, 0, 0, 7), key(20, 0, 0, 7), key(22, 0)] + [key(26, 0, -4, 0, .95, 1.06), key(28, 0)]
    b += buzz(34, 46, 0) + [key(62, 0)] + [key(66, 0, 0, 7), key(76, 0, 0, 7), key(78, 0)] + hop(86, 0, 16) + hop(92, 0, 10)
    person(sc, "b5", "blue", 150, b, D, [("stick:b5k", [(0, 26), (55, 86), (98, 100)]), ("surprised", [(26, 33)]), ("happy", [(33, 55), (86, 98)])])
    anim(sc, "b5k", D, [(0, tr(0, 0)), (6, tr(0, 0), OUT_), (8, tr(12, 0)), (20, tr(12, 0), IN), (22, tr(0, 0)), (66, tr(0, 0), OUT_),
                        (68, tr(12, 0)), (76, tr(12, 0), IN), (78, tr(0, 0)), (100, tr(0, 0))], box=False)
    stream(sc, "s5b", D, head_top(150), dst, 6, 20, BODY["blue"], lift=10)
    stream(sc, "s5c", D, head_top(150), dst, 66, 76, BODY["blue"], lift=10)
    say(sc, 150, 44, "せーの！", "b5s", D, 58, 66)
    # 緑：笑い転げて、起き上がる
    g = [key(0, 0), key(26, 0, -4, 0, .95, 1.06), key(28, 0), key(34, 0, 0, 0)] + buzz(34, 38, 0, 1.4)
    g += [key(38.5, 0, 0, -12, ease=IN), lie(41, 8, -90, OUT_), lie(42, 7, -86)] + [Key(round(43 + k * .7, 2), 7 + (1.2 if k % 2 else -1.2), -HW,
                                                                                    -90 + (3 if k % 2 else -3), 1, 1, "linear", "linear") for k in range(12)]
    g += [lie(51.5, 7, -90, OUT_), key(54, 0, -12, 0, .94, 1.08, IN), key(56, 0, 0, 0, 1.08, .92), key(58, 0)] + hop(87, 0, 16) + hop(93, 0, 10)
    person(sc, "g5", "green", 205, g, D, [("drag", [(0, 26), (56, 87), (98, 100)]), ("surprised", [(26, 33)]), ("happy", [(33, 56), (87, 98)])])
    say(sc, 190, 60, "あはは", "g5s", D, 41, 51)
    say(sc, 205, 44, "ナイス！", "g5n", D, 88, 97)
    # 紫：ジャンプ。1回目は遅れる
    p = ([key(0, 0), key(24.5, 0, 0, 0, 1.12, .86, OUT_), key(26.5, 0, -8, 0, .94, 1.08, IN), key(28.5, 0)] + buzz(34, 46, 0)
         + [key(73.5, 0, 0, 0, 1.12, .86, OUT_), key(75.5, 0, -12, 0, .94, 1.08, IN), key(78, 0)] + hop(86.5, 0, 16) + hop(92.5, 0, 10))
    person(sc, "p5", "purple", 260, p, D, [("button:p5k", [(0, 27), (55, 86.5), (98, 100)]), ("surprised", [(27, 33)]),
                                           ("happy", [(33, 55), (86.5, 98)])])
    anim(sc, "p5k", D, [(0, "scale(1)"), (24, "scale(1)", OUT_), (25, "scale(.7)"), (27, "scale(1)"), (73, "scale(1)", OUT_), (74, "scale(.7)"),
                        (76, "scale(1)"), (100, "scale(1)")])
    stream(sc, "s5p", D, head_top(260), dst, 24.5, 28.5, BODY["purple"], lift=10, travel=4)
    stream(sc, "s5q", D, head_top(260), dst, 72.5, 76.5, BODY["purple"], lift=10, travel=4)
    say(sc, 260, 44, "あっ", "p5s", D, 26, 34)
    sc.raw(spark(x0 + 92, 16, "sp5a") + spark(x0 + 116, 26, "sp5b", s=.7))
    twinkle(sc, "sp5a", D, 89, 97)
    twinkle(sc, "sp5b", D, 90, 97)
    return sc, "息を合わせる", "1回目はジャンプが遅れて主人公が穴に落ち、みんなで笑い転げる。「せーの！」で合わせた2回目は成功する。"


# ---------- 06 今後の展望：離れた場所の友達も、同じ主人公を動かす ----------


def remote():
    D = 10
    sc = Scene(D)
    mx = 262
    x0 = mx - SW / 2
    hx = 486
    # 遠くの家と、そこにいる赤
    sc.raw(f'<path d="M{hx - 24} {G}V{G - 30}l24-20 24 20V{G}z" fill="#FFF4DA" stroke="#C9A36A" stroke-width="1.6" stroke-linejoin="round"/>'
           f'<path d="M{hx - 30} {G - 27}l30-25 30 25" fill="none" stroke="#E2725B" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>'
           f'<rect x="{hx + 6}" y="{G - 30}" width="11" height="10" rx="1.5" fill="#9BD3F2" stroke="#C9A36A" stroke-width="1.2"/>')
    # 遠くからの通信の道（点線の弧）
    arc = f"M432 {G - 50}Q350 -18 {x0 + SW + 6} 22"
    fade(sc, "arc6", D, [(0, 0), (14, 0), (20, .75), (90, .75), (95, 0), (100, 0)])
    sc.raw(f'<path class="arc6" d="{arc}" fill="none" stroke="#FF1D00" stroke-width="2" stroke-dasharray="1 6" stroke-linecap="round"/>')
    # ゲーム
    anim(sc, "a6", D, [(0, tr(20, 54)), (4, tr(20, 54), "linear"), (14, tr(42, 54)), (40, tr(42, 54), "linear"), (46, tr(58, 54)),
                       (60, tr(58, 54), "linear"), (66, tr(78, 54)), (97, tr(78, 54)), (97.5, tr(20, 54)), (100, tr(20, 54))], box=False)
    anim(sc, "a6y", D, [(0, tr(0, 0)), (40, tr(0, 0), OUT_), (43, tr(0, -24), IN), (46, tr(0, -12)), (60, tr(0, -12), OUT_),
                        (63, tr(0, -36), IN), (66, tr(0, -24)), (82, tr(0, -24), OUT_), (84, tr(0, -32), IN), (86, tr(0, -24)),
                        (97, tr(0, -24)), (97.5, tr(0, 0)), (100, tr(0, 0))], box=False)
    anim(sc, "bd6", D, [(0, "scale(0)"), (22, "scale(0)", OUT_), (24.5, "scale(1.3)", IO), (26, "scale(1)"), (92, "scale(1)", IN),
                        (95, "scale(0)"), (100, "scale(0)")])
    sc.raw(css=".bd6{transform:scale(0)}")
    game = (sky() + ground(-10, SW + 10) + block(52, 42) + block(72, 42) + block(72, 30)
            + f'<g class="a6"><g class="a6y">{avatar(1)}</g></g>'
            + f'<g class="bd6"><circle cx="{SW - 10}" cy="10" r="6" fill="#FF1D00" stroke="#FFFFFF" stroke-width="1.5"/></g>'
            + flash(sc, "fl6", D, 98))
    monitor(sc, mx, game)
    dst = (x0 - 2, 34)
    # 青と緑：手元で遊ぶ。赤が加わると、そちらを向いて喜ぶ
    for cid, name, x, ui in (("b6", "blue", 120, "stick"), ("g6", "green", 170, "drag")):
        d = .6 if name == "green" else 0
        ks = [key(0, 0), key(4, 0, 0, 6 if name == "blue" else -4), key(14, 0, 0, 6 if name == "blue" else -4), key(16, 0)]
        ks += [key(23 + d, 0, 0, 10, ease=OUT_)] + hop(25 + d, 0, 12, 10) + hop(31 + d, 0, 9, 10) + [key(40 + d, 0)]
        ks += hop(80 + d, 0, 14) + hop(86 + d, 0, 10)
        person(sc, cid, name, x, ks, D, [(ui, [(0, 24), (40, 80), (95, 100)]), ("happy", [(24, 40), (80, 95)])])
    stream(sc, "s6b", D, head_top(120), dst, 4, 14, BODY["blue"], lift=10)
    # 赤：家から参加して、ジャンプを担当する
    r = ([key(0, 0)] + tap(10) + [key(20, 0)] + hop(27, 0, 12, -8) + [key(36, 0)]
         + [key(39, 0, 0, 0, 1.12, .86, OUT_), key(41, 0, -10, 0, .94, 1.08, IN), key(43, 0)]
         + [key(59, 0, 0, 0, 1.12, .86, OUT_), key(61, 0, -10, 0, .94, 1.08, IN), key(63, 0)] + hop(81, 0, 14) + hop(87, 0, 10) + tap(95))
    person(sc, "r6", "red", 432, r, D, [("normal", [(0, 10), (95, 100)]), ("button:r6k", [(10, 27), (35, 81)]), ("happy", [(27, 35), (81, 95)])])
    anim(sc, "r6k", D, [(0, "scale(1)"), (39, "scale(1)", OUT_), (40, "scale(.7)"), (42, "scale(1)"), (59, "scale(1)", OUT_), (60, "scale(.7)"),
                        (62, "scale(1)"), (100, "scale(1)")])
    for k, (a, b) in enumerate(((14, 22), (39, 45), (59, 65))):
        for j in range(3):
            flight(sc, f"r6f{k}{j}", D, (432, G - 50), (x0 + SW + 4, 22), a + j * .7, b + j * .7, 40, dot(BODY["red"], 3.4 - j * .6))
    note(sc, 145, 32, "♪", "n6", D, 79, 93, 14)
    return sc, "離れていても", "遠くの家にいる赤も、通信の道でつながって同じ主人公のジャンプを担当する。合流したら、みんなで喜ぶ。"


# ---------- 07 注力したこと：P1のスマホがリモコンになり、ゲームを選んで始める ----------


def tile(x, y, kind, s=30):
    out = [f'<rect x="{x}" y="{y}" width="{s}" height="{s}" rx="4" fill="#323A57"/>']
    if kind == "world":
        out.append(f'<rect x="{x}" y="{y}" width="{s}" height="{s}" rx="4" fill="{SKY}"/>'
                   f'<rect x="{x}" y="{y + 20}" width="{s}" height="{s - 20}" fill="{DIRT}"/><rect x="{x}" y="{y + 20}" width="{s}" height="3" fill="{GRASS}"/>'
                   f'<g transform="translate({x + 12} {y + 20}) scale(.62)">{avatar(1)}</g>')
    elif kind == "race":
        out.append(f'<rect x="{x}" y="{y}" width="{s}" height="{s}" rx="4" fill="#7CCB5E"/>'
                   f'<path d="M{x + 12} {y + 4}h6l9 {s - 4}H{x + 3}z" fill="#5A6070"/>'
                   f'<rect x="{x + 9}" y="{y + 18}" width="12" height="6" rx="2" fill="{AV_SHIRT}"/>')
    else:
        out.append(f'<rect x="{x}" y="{y}" width="{s}" height="{s}" rx="4" fill="#3A4470"/>'
                   + cell(x + 7, y + 18, "#FF6B6B", 6) + cell(x + 13, y + 18, "#FFC93C", 6) + cell(x + 19, y + 18, "#4ADE80", 6)
                   + cell(x + 13, y + 6, "#C084FC", 6) + cell(x + 13, y + 12, "#C084FC", 6))
    return "".join(out)


def remocon():
    D = 11
    sc = Scene(D)
    mx = 430
    x0 = mx - SW / 2
    tiles = [(10, 18, "world"), (47, 18, "race"), (84, 18, "puzzle")]
    # ランチャーの画面：カーソルが動いて、左のゲームを選ぶ
    anim(sc, "cur7", D, [(0, tr(96, 56)), (10, tr(96, 56), IO), (17, tr(68, 40), IO), (21, tr(68, 40), IO), (26, tr(28, 38)),
                         (100, tr(28, 38))], box=False)
    anim(sc, "cl7", D, [(0, "scale(1)"), (28, "scale(1)", OUT_), (29, "scale(.8)"), (31, "scale(1)"), (100, "scale(1)")])
    fade(sc, "hl7", D, [(0, 0), (24, 0), (25, 1), (34, 1), (35, 0), (100, 0)])
    anim(sc, "zm7", D, [(0, "translate(0px,0px) scale(1)"), (31, "translate(0px,0px) scale(1)", IN),
                        (35, "translate(-42px,-104px) scale(4.2)"), (100, "translate(-42px,-104px) scale(4.2)")], box=False)
    launcher = (f'<rect width="{SW}" height="{SH}" fill="#20263A"/>'
                f'<rect x="10" y="7" width="40" height="5" rx="2.5" fill="#55608A"/>'
                + "".join(tile(x, y, k) for x, y, k in tiles[1:])
                + f'<rect class="hl7" x="7" y="15" width="36" height="36" rx="6" fill="none" stroke="#FFFFFF" stroke-width="2.5"/>'
                + f'<g class="zm7">{tile(*tiles[0])}</g>'
                + '<g class="cur7"><g class="cl7"><path d="M0 0v13l3.6-3.4 2.6 5.6 2.6-1.2-2.6-5.4H11z" fill="#FFFFFF" stroke="#1B1E28" '
                  'stroke-width="1.2" stroke-linejoin="round"/></g></g>')
    # 選んだゲーム：「START」のあと、3人で遊ぶ
    anim(sc, "a7", D, [(0, tr(24, 54)), (58, tr(24, 54), "linear"), (70, tr(56, 54)), (71, tr(56, 54), OUT_), (74.5, tr(70, 30), IN),
                       (78, tr(84, 54)), (100, tr(84, 54))], box=False)
    anim(sc, "go7", D, [(0, "scale(0)"), (38, "scale(0)", OUT_), (41, "scale(1.15)", IO), (43, "scale(1)"), (52, "scale(1)", IN),
                        (55, "scale(0)"), (100, "scale(0)")])
    sc.raw(css=".go7{transform:scale(0)}")
    game = (sky() + ground(-10, SW + 10) + block(64, 42) + f'<g class="a7">{avatar(1)}</g>'
            + f'<g class="go7"><rect x="22" y="20" width="80" height="30" rx="8" fill="#FFFFFF" stroke="#C03BFF" stroke-width="2"/>'
            + art.text(62, 43, "START", 22, "#6F3BFF", cls="rnd", weight=800, anchor="middle") + "</g>")
    sc.raw(css=scenes.show("m7a", D, [(0, 36), (98, 100)]) + scenes.show("m7b", D, [(36, 98)]))
    monitor(sc, mx, f'<g class="m7a">{launcher}</g><g class="m7b">{game}</g>' + flash(sc, "fl7", D, 98))
    dst = (x0 - 2, 34)
    # 青（P1）：タッチパッドでカーソルを動かし、選んだら移動のスティックに持ち替える
    b = [key(0, 0)] + tap(6) + [key(10, 0, 0, -4), key(17, 0, 0, 4), key(21, 0, 0, 4), key(26, 0, 0, -4), key(27, 0)]
    b += [key(28, 0, 0, 0, 1.06, .92, OUT_), key(30, 0, 0, 0)] + tap(48) + [key(58, 0, 0, 6), key(70, 0, 0, 6), key(72, 0)] + hop(84) + hop(90) + tap(97)
    person(sc, "b7", "blue", 170, b, D, [("normal", [(0, 6), (97, 100)]), ("pad:b7k", [(6, 48)]), ("stick:b7s", [(48, 84)]), ("happy", [(84, 97)])])
    anim(sc, "b7k", D, [(0, tr(0, 0)), (10, tr(0, 0), IO), (17, tr(-8, -8), IO), (21, tr(-8, -8), IO), (26, tr(-20, -10)), (28, tr(-20, -10), OUT_),
                        (29, "translate(-20px,-10px) scale(.7)"), (31, tr(-20, -10)), (46, tr(-20, -10)), (100, tr(-20, -10))], box=False)
    anim(sc, "b7s", D, [(0, tr(0, 0)), (58, tr(0, 0), OUT_), (60, tr(12, 0)), (70, tr(12, 0), IN), (72, tr(0, 0)), (100, tr(0, 0))], box=False)
    stream(sc, "s7a", D, head_top(170), dst, 10, 29, BODY["blue"], lift=10, gap=2)
    stream(sc, "s7b", D, head_top(170), dst, 58, 70, BODY["blue"], lift=10)
    # 緑と紫：ゲームが始まると、それぞれの操作画面になる
    g = [key(0, 0)] + tap(44) + hop(84.6) + hop(90.6) + tap(97.3)
    person(sc, "g7", "green", 225, g, D, [("normal", [(0, 44), (97.3, 100)]), ("drag", [(44, 84.6)]), ("happy", [(84.6, 97.3)])])
    p = ([key(0, 0)] + tap(46) + [key(70, 0, 0, 0, 1.12, .86, OUT_), key(72, 0, -10, 0, .94, 1.08, IN), key(74, 0)]
         + hop(85.2) + hop(91.2) + tap(97.6))
    person(sc, "p7", "purple", 280, p, D, [("normal", [(0, 46), (97.6, 100)]), ("button:p7k", [(46, 85.2)]), ("happy", [(85.2, 97.6)])])
    anim(sc, "p7k", D, [(0, "scale(1)"), (69.5, "scale(1)", OUT_), (70.5, "scale(.7)"), (73, "scale(1)"), (100, "scale(1)")])
    stream(sc, "s7p", D, head_top(280), dst, 70, 74, BODY["purple"], lift=10, travel=4)
    note(sc, 225, 32, "♪", "n7", D, 83, 95, 14)
    return sc, "スマホだけで始める", "P1のスマホがタッチパッドのリモコンになり、カーソルでゲームを選んで「START」。そのまま3人で遊び始める。"


# ---------- 08 技術仕様書：PCのWi-Fiに、スマホが直接つながる ----------


def wifi_badge(x, y, color, cls):
    """電波の扇形。3本の弧を、下から順に点ける。"""
    out = [f'<circle cx="{x}" cy="{y}" r="2.2" fill="#C5CCD8"/>']
    lit = [f'<circle cx="{x}" cy="{y}" r="2.4" fill="{color}"/>']
    for i, rr in enumerate((6, 10.5, 15)):
        d = f"M{x - rr * .72:.1f} {y - rr * .7:.1f}A{rr} {rr} 0 0 1 {x + rr * .72:.1f} {y - rr * .7:.1f}"
        out.append(f'<path d="{d}" fill="none" stroke="#C5CCD8" stroke-width="2.8" stroke-linecap="round"/>')
        lit.append(f'<path class="{cls}{i}" d="{d}" fill="none" stroke="{color}" stroke-width="2.8" stroke-linecap="round"/>')
    return "".join(out) + f'<g class="{cls}">{lit[0]}</g>' + "".join(lit[1:])


def hotspot():
    D = 9
    sc = Scene(D)
    mx = 300
    # PCから広がる電波の輪
    rings = "".join(f'<circle class="rg8" style="animation-delay:{-k * .8:.1f}s" cx="{mx}" cy="40" r="40" fill="none" stroke="#22C4FA" '
                    'stroke-width="1.6"/>' for k in range(3))
    sc.raw(rings, "@keyframes rg8{0%{transform:scale(.6);opacity:.55}100%{transform:scale(3.2);opacity:0}}"
                  ".rg8{animation:rg8 2.4s ease-out infinite;transform-box:fill-box;transform-origin:50% 50%}")
    icon = (f'<rect width="{SW}" height="{SH}" fill="#273049"/>'
            + "".join(f'<path class="wf8" style="animation-delay:{i * .2:.1f}s" d="M{62 - r * .72:.1f} {50 - r * .7:.1f}A{r} {r} 0 0 1 '
                      f'{62 + r * .72:.1f} {50 - r * .7:.1f}" fill="none" stroke="#FFFFFF" stroke-width="5" stroke-linecap="round"/>'
                      for i, r in enumerate((11, 21, 31)))
            + '<circle cx="62" cy="50" r="4.5" fill="#FFFFFF"/>')
    sc.raw(css="@keyframes wf8{0%,100%{opacity:.35}30%,60%{opacity:1}}.wf8{animation:wf8 1.6s ease-in-out infinite}")
    monitor(sc, mx, icon)
    people = (("blue", 150), ("green", 205), ("purple", 395), ("red", 450))
    for i, (name, x) in enumerate(people):
        t = 8 + i * 9
        c = f"w8{i}"
        sc.raw(wifi_badge(x, G - 54, BODY[name], c))
        sc.raw(css=scenes.show(c, D, [(t, 94)]) + "".join(scenes.show(f"{c}{j}", D, [(t + j * 2.2, 94)]) for j in range(3)))
        side = 1 if x < mx else -1
        ks = [key(0, 0, 0, -5 * side), key(4, 0, 0, 5 * side), key(t, 0, 0, -5 * side), key(t + 4.4, 0, 0, 0)] + tap(t + 6.6)
        ks += hop(52 + i * .7, 0, 14) + hop(59 + i * .7, 0, 10) + tap(68 + i * 1.5) + [key(94, 0), key(97, 0, 0, -5 * side)]
        person(sc, f"h8{i}", name, x, ks, D, [("normal", [(0, t + 6.6), (95, 100)]), ("happy", [(t + 6.6, 68 + i * 1.5)]),
                                              (ROLE[name], [(68 + i * 1.5, 95)])])
    return sc, "Wi-Fiでつながる", "PCが出すWi-Fiの電波を、4台のスマホが順につかむ。電波が満タンになると、みんなで跳ねて喜ぶ。"


# ---------- 09 システム構成：確実に届ける便と、速く届ける便 ----------


def envelope(color):
    return (f'<rect x="-9" y="-6.5" width="18" height="13" rx="2" fill="#FFFFFF" stroke="{color}" stroke-width="1.8"/>'
            f'<path d="M-8 -5l8 6 8-6" fill="none" stroke="{color}" stroke-width="1.6" stroke-linejoin="round"/>')


def lanes():
    D = 9
    sc = Scene(D)
    mx = 420
    x0 = mx - SW / 2
    bx, gx = 150, 230
    # 2本の道：上は封筒が弧を描く道（WebSocket）、下は小さな点が速く流れる道（WebRTC DataChannel）
    up = f"M{bx} {G - 52}Q{(bx + x0) / 2} -6 {x0 - 4} 22"
    low_y = G - 26
    sc.raw(f'<path d="{up}" fill="none" stroke="#9AA3B5" stroke-width="1.6" stroke-dasharray="1 5" stroke-linecap="round" opacity=".7"/>'
           f'<path d="M{gx + 18} {low_y}H{x0 - 6}" stroke="#9AA3B5" stroke-width="1.6" stroke-dasharray="1 5" stroke-linecap="round" opacity=".7"/>')
    # 下の道：途切れなく流れる点
    dots = "".join(f'<circle class="ln9" style="animation-delay:{-k * .09:.2f}s" cx="{gx + 18}" cy="{low_y}" r="2.6" fill="{BODY["green"]}" '
                   'stroke="#FFFFFF" stroke-width="1"/>' for k in range(8))
    sc.raw(f'<g class="lnv9">{dots}</g>',
           f"@keyframes ln9{{0%{{transform:translateX(0);opacity:0}}10%{{opacity:1}}90%{{opacity:1}}100%{{transform:translateX({x0 - 8 - gx - 18}px);opacity:0}}}}"
           ".ln9{animation:ln9 .72s linear infinite}" + scenes.show("lnv9", D, [(4, 92)]))
    # ゲーム：緑の視点に合わせて景色がなめらかに流れる
    anim(sc, "w9", D, [(0, tr(0, 0), IO), (25, tr(-24, 0), IO), (50, tr(0, 0), IO), (75, tr(-24, 0), IO), (100, tr(0, 0))], box=False)
    anim(sc, "ok9", D, [(0, "scale(0)"), (29, "scale(0)", OUT_), (31.5, "scale(1.3)", IO), (33, "scale(1)"), (42, "scale(1)", IN),
                        (44, "scale(0)"), (100, "scale(0)")])
    sc.raw(css=".ok9{transform:scale(0)}")
    game = (sky() + f'<g class="w9">{ground(-10, 170) + block(40, 42) + block(96, 42) + block(96, 30) + block(140, 42)}</g>'
            + f'<g transform="translate(62 54)">{avatar(1)}</g>'
            + f'<g class="ok9"><circle cx="{SW - 12}" cy="12" r="8" fill="#2DA44E" stroke="#FFFFFF" stroke-width="1.5"/>'
            + f'<path d="M{SW - 16} 12l3 3 5.5-6" fill="none" stroke="#FFFFFF" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></g>')
    monitor(sc, mx, game)
    # 上の道：青が封筒を投げ、PCが受け取ったら返事の封筒が2人に届く
    flight(sc, "e9", D, (bx, G - 54), (x0 - 2, 22), 9, 29, 8, envelope(BODY["blue"]), spin=-20)
    flight(sc, "e9b", D, (x0 - 2, 22), (bx, G - 54), 50, 66, 8, envelope("#2DA44E"), spin=20)
    flight(sc, "e9g", D, (x0 - 2, 22), (gx, G - 54), 52, 66, 6, envelope("#2DA44E"), spin=20)
    b = [key(0, 0), key(6, 0, 0, -6, 1.04, .95), key(9, 0, -8, 8, .95, 1.06, IN), key(11.5, 0, 0, 0, 1.06, .94), key(13, 0)]
    b += [key(64, 0), key(66, 0, 0, 0, 1.1, .88, OUT_)] + hop(67, 0, 10) + [key(92, 0)]
    person(sc, "b9", "blue", bx, b, D, [("normal", [(0, 66), (92, 100)]), ("happy", [(66, 92)])])
    g = [key(0, 0, 0, -4), key(25, 0, 0, 4), key(50, 0, 0, -4), key(66, 0, 0, 2), key(67.5, 0, 0, 0, 1.1, .88, OUT_), key(70, 0, -8, 0, .95, 1.06, IN),
         key(72.5, 0, 0, 0, 1.06, .94), key(75, 0, 0, 4), key(100, 0, 0, -4)]
    person(sc, "g9", "green", gx, g, D, [("drag:g9k", [(0, 100)])])
    anim(sc, "g9k", D, [(0, tr(12, 0), IO), (25, tr(-12, 0), IO), (50, tr(12, 0), IO), (75, tr(-12, 0), IO), (100, tr(12, 0))], box=False)
    return sc, "2本の道", "青の封筒（確実に届けたい状態）は弧の道でPCへ届き、返事が返ってくる。緑の視点は、下の道を小さな点で速く流れ続ける。"


# ---------- 10 活用した技術：技術のブロックを積むと、PCのゲームが動き出す ----------


def tech_block(kind):
    """技術のブロック（中心が原点、幅26・高さ22）。歯車＝Rust、原子＝React、双方向の矢印＝WebRTC。"""
    color = {"gear": "#E5733A", "atom": "#22A6CE", "link": "#7A5AF5"}[kind]
    out = [f'<rect x="-13" y="-11" width="26" height="22" rx="4" fill="{color}" stroke="#000" stroke-opacity=".2" stroke-width="1.2"/>']
    w = 'fill="none" stroke="#FFFFFF" stroke-linecap="round" stroke-linejoin="round"'
    if kind == "gear":
        teeth = "".join(f'<rect x="-1.6" y="-8.3" width="3.2" height="3.4" rx=".8" fill="#FFFFFF" transform="rotate({a})"/>' for a in range(0, 360, 45))
        out.append(f'{teeth}<circle r="5.6" {w} stroke-width="1.8"/><circle r="1.8" fill="#FFFFFF"/>')
    elif kind == "atom":
        out.append("".join(f'<ellipse rx="8.6" ry="3.2" {w} stroke-width="1.5" transform="rotate({a})"/>' for a in (0, 60, 120))
                   + '<circle r="1.8" fill="#FFFFFF"/>')
    else:
        out.append(f'<path d="M-7 -3h13l-3.5-3.5M7 3H-6l3.5 3.5" {w} stroke-width="1.8"/>')
    return "".join(out)


def build():
    D = 11
    sc = Scene(D)
    mx = 440
    x0 = mx - SW / 2
    tx = 330  # 積み上げる場所
    order = (("blue", 130, "gear", 8), ("green", 185, "atom", 26), ("purple", 240, "link", 44))
    for i, (name, x, kind, t) in enumerate(order):
        land = t + 10
        y = G - 11 - 22 * i
        head = G - 44 - 12
        # 頭の上に載せたブロック → 投げる → 塔に載る
        sc.raw(f'<g class="hb10{i}"><g transform="translate({x} {head})">{tech_block(kind)}</g></g>')
        fade(sc, f"hb10{i}", D, [(0, 0), (1, 0), (3, 1), (t - .6, 1), (t - .4, 0), (100, 0)])
        flight(sc, f"tb10{i}", D, (x, head), (tx, y), t - .5, land, 30 - i * 6, tech_block(kind), spin=360)
        sc.raw(f'<g class="st10{i}"><g class="sq10{i}"><g transform="translate({tx} {y})">{tech_block(kind)}</g></g></g>')
        fade(sc, f"st10{i}", D, [(0, 0), (land - .2, 0), (land, 1), (92, 1), (95, 0), (100, 0)])
        anim(sc, f"sq10{i}", D, [(0, "scale(1,1)"), (land, "scale(1.15,.8)", OUT_), (land + 2, "scale(.95,1.05)"), (land + 3.5, "scale(1,1)"),
                                 (100, "scale(1,1)")], origin="50% 100%")
        sc.add(dust(tx, y + 11, f"du10{i}", D, land))
        ks = [key(0, 0), key(t - 3, 0, 0, -4, 1.08, .9, OUT_), key(t - .5, 0, -8, 8, .94, 1.08, IN), key(t + 2, 0, 0, 0, 1.06, .92, OUT_), key(t + 4, 0)]
        ks += hop(68 + i * .7, 0, 14) + hop(75 + i * .7, 0, 10) + [key(96, 0)]
        person(sc, f"c10{i}", name, x, ks, D, [("normal", [(0, 66), (90, 100)]), ("happy", [(66, 90)])])
    # 塔がそろうと、ケーブルで電気が流れてモニターが点く
    cable = f"M{tx + 13} {G - 50}C{tx + 40} {G - 50} {tx + 30} {G - 2} {mx - 21} {G - 2}"
    fade(sc, "cb10", D, [(0, 0), (56, 0), (58, 1), (92, 1), (95, 0), (100, 0)])
    sc.raw(f'<path class="cb10" d="{cable}" fill="none" stroke="#5A6072" stroke-width="2.4" stroke-linecap="round"/>')
    for k in range(3):
        flight(sc, f"el10{k}", D, (tx + 16, G - 50), (mx - 22, G - 4), 57 + k * 1.2, 61 + k * 1.2, 0, dot(GOLD, 2.8))
    anim(sc, "a10", D, [(0, tr(62, 54)), (66, tr(62, 54), OUT_), (68.5, tr(62, 44), IN), (71, tr(62, 54), OUT_), (73.5, tr(62, 44), IN),
                        (76, tr(62, 54)), (100, tr(62, 54))], box=False)
    fade(sc, "off10", D, [(0, 1), (61, 1), (62, .3), (63, .9), (64.5, 0), (93, 0), (96, 1), (100, 1)])
    game = (sky() + ground(-10, SW + 10) + block(22, 42) + block(96, 42) + f'<g class="a10">{avatar(1)}</g>'
            + f'<rect class="off10" width="{SW}" height="{SH}" fill="#0B0C10"/>')
    monitor(sc, mx, game)
    note(sc, 185, 32, "♪", "n10", D, 67, 84, 14)
    sc.raw(spark(x0 + 100, 18, "sp10"))
    twinkle(sc, "sp10", D, 64, 76)
    return sc, "技術を積み上げる", "歯車（Rust）・原子（React）・双方向の矢印（WebRTC）のブロックを順に投げて積むと、電気が流れてPCのゲームが動き出す。"


# ---------- 11 独自技術：AIがゲームの操作を3つに分けて、スマホに配る ----------


def card(name):
    c = BODY[name]
    e = art.CHARS[name]["eye"]
    inner = {"blue": f'<circle r="5.5" fill="none" stroke="{e}" stroke-width="1.8"/><circle r="2.6" fill="{e}"/>',
             "green": f'<rect x="-5" y="-6.5" width="10" height="13" rx="2.5" fill="none" stroke="{e}" stroke-width="1.8"/><circle r="2.2" fill="{e}"/>',
             "purple": f'<circle r="5.2" fill="{e}"/>'}[name]
    return (f'<rect x="-9" y="-12" width="18" height="24" rx="3.5" fill="#0B0C10" stroke="{c}" stroke-width="2"/>{inner}')


def assign():
    D = 11
    sc = Scene(D)
    mx = 420
    x0 = mx - SW / 2
    names = ("blue", "green", "purple")
    xs = (150, 205, 260)
    # 9個のキー（ゲームの操作）がばらばらに並ぶ → AIが光る → 3列に分かれて色が付く
    start = [(16, 12), (52, 40), (96, 18), (34, 50), (74, 10), (104, 48), (14, 34), (62, 24), (88, 32)]
    goal = [(c * 36 + 20, r * 15 + 15) for c in range(3) for r in range(3)]
    keys = []
    for k, ((sx, sy), (gx, gy)) in enumerate(zip(start, goal)):
        col = names[k // 3]
        d = (k % 3) * .8 + (k // 3) * .4
        anim(sc, f"k11{k}", D, [(0, tr(sx, sy)), (18 + d, tr(sx, sy), IO), (27 + d, tr(gx, gy)), (92, tr(gx, gy), IO), (98, tr(sx, sy)),
                                (100, tr(sx, sy))], box=False)
        fade(sc, f"kc11{k}", D, [(0, 0), (20 + d, 0), (26 + d, 1), (92, 1), (97, 0), (100, 0)])
        keys.append(f'<g class="k11{k}"><rect x="-6.5" y="-5.5" width="13" height="11" rx="2.5" fill="#C9D1E0"/>'
                    f'<rect class="kc11{k}" x="-6.5" y="-5.5" width="13" height="11" rx="2.5" fill="{BODY[col]}"/>'
                    '<rect x="-4" y="-3.2" width="8" height="2" rx="1" fill="#FFFFFF" opacity=".55"/></g>')
    anim(sc, "ai11", D, [(0, "scale(0) rotate(0deg)"), (8, "scale(0) rotate(0deg)", OUT_), (12, "scale(1.4) rotate(90deg)", IO),
                         (20, "scale(1.1) rotate(180deg)", IN), (26, "scale(0) rotate(270deg)"), (100, "scale(0) rotate(270deg)")])
    sc.raw(css=".ai11{transform:scale(0)}")
    inner = (f'<rect width="{SW}" height="{SH}" fill="#20263A"/>' + "".join(keys)
             + f'<g transform="translate(62 35)"><g class="ai11"><path d="{SPARK}" transform="scale(2.6)" fill="{GOLD}"/>'
               f'<path d="{SPARK}" transform="translate(13 -10) scale(1.1)" fill="#FFFFFF"/></g></g>')
    monitor(sc, mx, inner)
    # 列ごとのカードが、それぞれのスマホへ飛んでいく
    for i, (name, x) in enumerate(zip(names, xs)):
        a = 36 + i * 7
        land = a + 9
        flight(sc, f"cd11{i}", D, (x0 + 20 + i * 36, 30), (x, G - 26), a, land, 16, card(name), spin=-360)
        ks = [key(0, 0), key(a + 2, 0, 0, 0, 1, 1, OUT_), key(a + 6, 0, -3, 4)] + tap(land + .6)
        ks += [key(land + 6, 0, 0, 0, 1.06, .9, OUT_), key(land + 8, 0), key(land + 10, 0, 0, 0, 1.06, .9, OUT_), key(land + 12, 0)]
        ks += hop(80 + i * .7, 0, 14) + hop(86 + i * .7, 0, 10) + tap(97)
        person(sc, f"r11{i}", name, x, ks, D, [("normal", [(0, land + .6), (97, 100)]), (ROLE[name], [(land + .6, 80 + i * .7)]),
                                               ("happy", [(80 + i * .7, 97)])])
    note(sc, 205, 32, "♪", "n11", D, 79, 94, 14)
    return sc, "AIが分担を配る", "ばらばらのキーをAIが3つのまとまりに分け、カードにしてスマホへ配る。受け取ったスマホは、それぞれの操作画面になる。"
