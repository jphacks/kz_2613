"""READMEの本文の図（分担の実画面・特長・ジャンル・アンケート・展望・こだわり・構成図・評価）を生成する。

どの図も背景の色は付けず、枠線だけのカードで組む（受賞結果・目次と同じ調子）。
実際の画面は docs/screenshots/device/ の撮影画像を縮めてJPEGで埋め込み、キャラクターと同じ形のスマホの枠に入れる。
PC版は本文欄の幅838、スマホ版は324で描き、READMEでは原寸で表示する（文字は13px以上）。

    python scripts/readme/showcase.py
"""
import base64
import io
import re
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
import build_art as art  # noqa: E402
from build_art import CHARS, PC_W, PHONE_W, THEMES, text  # noqa: E402

SHOTS = art.ROOT / "docs" / "screenshots" / "device"
GAP = 16
SPARK = "M0-7Q1-1 7 0Q1 1 0 7Q-1 1-7 0Q-1-1 0-7Z"
BODY = {n: CHARS[n]["body"] for n in art.ORDER}
DARK_ON = {"blue": "#06243A", "green": "#0C3A0C", "purple": "#FFFFFF", "red": "#FFFFFF"}  # 色の上に載せる文字

# ---------- 文字の折り返し ----------

NO_START = set("、。，．）」』】！？ー…・〜ぁぃぅぇぉっゃゅょァィゥェォッャュョ％%)")


def cw(c, size):
    return size * (0.6 if ord(c) < 0x2E80 else 1.0)


BREAK_AFTER = set("、。・／）」』！？")


def lines(s, size, avail, balance=False):
    """全角1字=size、半角=0.6size で幅を見積もって折り返す。
    行頭の句読点は前の行へ送り、英数字の単語は分けず、行末の近くに「・」「、」などがあればその後ろで切る。
    balance=True なら、各行の長さがそろうように折り返す（見出し向け）。"""
    if "\n" in s:  # 改行の位置を指定した見出しは、その位置で分けてから折り返す
        return [line for part in s.split("\n") for line in lines(part, size, avail)]
    width = lambda x: sum(cw(ch, size) for ch in x)  # noqa: E731
    if balance:
        total = width(s)
        n = -(-total // avail)
        if n > 1:
            avail = min(avail, total / n + size * 1.5)
    out, cur = [], ""
    for c in s:
        if cur and width(cur + c) > avail:
            if c in NO_START:
                cur += c
                continue
            m = re.search(r"[A-Za-z0-9.%]+$", cur)
            if m and m.start() > 0 and re.match(r"[A-Za-z0-9.%]", c):
                out.append(cur[:m.start()])
                cur = cur[m.start():] + c
                continue
            k = max((i for i, ch in enumerate(cur) if ch in BREAK_AFTER), default=-1)
            if 0 <= k < len(cur) - 1 and len(cur) - 1 - k <= 6 and width(cur[:k + 1]) >= avail * .55:
                out.append(cur[:k + 1])
                cur = cur[k + 1:] + c
                continue
            out.append(cur)
            cur = c
        else:
            cur += c
    if cur:
        out.append(cur)
    return out


def para(x, y, s, size, fill, avail, lh, weight=400, anchor="start", balance=False):
    """折り返した段落。(svg, 行数) を返す。y は1行目の基準線。"""
    ls = lines(s, size, avail, balance)
    return "".join(text(x, y + i * lh, line, size, fill, cls="gh", weight=weight, anchor=anchor) for i, line in enumerate(ls)), len(ls)


def card(x, y, w, h, t, rx=14):
    return f'<rect x="{x + .75}" y="{y + .75}" width="{w - 1.5}" height="{h - 1.5}" rx="{rx}" fill="none" stroke="{t["line"]}" stroke-width="1.5"/>'


def pill(x, y, label, color, size=13, fg=None, h=24):
    """色付きの札（P1 など）。(x, y) は左上。(svg, 幅) を返す。"""
    w = sum(cw(c, size) for c in label) + 20
    fg = fg or "#FFFFFF"
    return (f'<rect x="{x}" y="{y}" width="{w:.1f}" height="{h}" rx="{h / 2}" fill="{color}"/>'
            + text(x + w / 2, y + h / 2 + size * .36, label, size, fg, cls="gh", weight=700, anchor="middle")), w


def chip(x, y, label, color, t, size=13, h=26):
    """役割の色の点が付いた、枠線だけの札。(svg, 幅) を返す。"""
    w = sum(cw(c, size) for c in label) + 34
    return (f'<rect x="{x + .5}" y="{y + .5}" width="{w - 1:.1f}" height="{h - 1}" rx="{h / 2}" fill="none" stroke="{color}" stroke-width="1.5"/>'
            f'<circle cx="{x + 13}" cy="{y + h / 2}" r="4.5" fill="{color}"/>'
            + text(x + 24, y + h / 2 + size * .36, label, size, t["ink"], cls="gh", weight=600)), w


def chips(x, y, labels, colors, t, avail, gap=8, h=26):
    """札を左から並べ、入らなければ次の行へ送る。(svg, 高さ) を返す。"""
    out, cx, cy = [], x, y
    for label, color in zip(labels, colors):
        w = sum(cw(c, 13) for c in label) + 34
        if cx > x and cx + w > x + avail:
            cx, cy = x, cy + h + 8
        s, w = chip(cx, cy, label, color, t)
        out.append(s)
        cx += w + gap
    return "".join(out), cy + h - y


# ---------- 実際の画面（キャラクターと同じ形の枠に入れる） ----------

_shot_cache = {}
_clip = [0]


def shot(name, w):
    """撮影画像を幅 w(px) に縮めたJPEGのdata URIと、縦横比（幅/高さ）。"""
    key = (name, w)
    if key not in _shot_cache:
        im = Image.open(SHOTS / name).convert("RGB")
        ratio = im.width / im.height
        im = im.resize((w, round(w / ratio)), Image.LANCZOS)
        buf = io.BytesIO()
        im.save(buf, "JPEG", quality=82, optimize=True, progressive=True)
        _shot_cache[key] = ("data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode(), ratio)
    return _shot_cache[key]


def phone(name, x, y, w, image, t):
    """幅 w の、ふつうのスマホの枠（黒いふち・角丸・上のカメラ穴）に実際の画面を入れる。(svg, 高さ) を返す。
    name は使わない（実際の画面を見せる図では、キャラクターの形にしない）。"""
    uri, ratio = shot(image, min(360, round(w * 1.6)))
    bz = max(4.0, w * .045)
    sw = w - 2 * bz
    sh = sw / ratio
    h = sh + 2 * bz
    r_out, r_in = w * .15, w * .15 - bz
    _clip[0] += 1
    cid = f"scr{_clip[0]}"
    sx0, sy0 = x + bz, y + bz
    edge = "#4A5062" if t is THEMES["dark"] else "#2A2E38"
    return (f'<rect x="{x - 1.2:.1f}" y="{y + h * .18:.1f}" width="2" height="{h * .08:.1f}" rx="1" fill="{edge}"/>'
            f'<rect x="{x + w - .8:.1f}" y="{y + h * .14:.1f}" width="2" height="{h * .12:.1f}" rx="1" fill="{edge}"/>'
            f'<rect x="{x:.1f}" y="{y:.1f}" width="{w:.1f}" height="{h:.1f}" rx="{r_out:.1f}" fill="#16181F" stroke="{edge}" stroke-width="1.2"/>'
            f'<clipPath id="{cid}"><rect x="{sx0:.1f}" y="{sy0:.1f}" width="{sw:.1f}" height="{sh:.1f}" rx="{r_in:.1f}"/></clipPath>'
            f'<image clip-path="url(#{cid})" x="{sx0:.1f}" y="{sy0:.1f}" width="{sw:.1f}" height="{sh:.1f}" '
            f'preserveAspectRatio="xMidYMid slice" href="{uri}"/>'
            f'<circle cx="{x + w / 2:.1f}" cy="{sy0 + bz * 1.1:.1f}" r="{max(2.2, w * .018):.1f}" fill="#16181F"/>'), h


def finish(W, H, b, t, alt, top=10, bottom=30):
    """図の上下に余白を取って書き出す（本文の文字と図がくっつかないように）。"""
    return art.svg(W, round(H) + top + bottom, f'<g transform="translate(0 {top})">{"".join(b)}</g>', t, alt.replace("\n", ""))


# ---------- 02 製品説明：3人の分担と、実際のスマホの画面 ----------

ROLES = [("blue", "P1", "移動", "ホスト", "phone-11-coop-move.jpg", "移動・ジャンプ・スニーク・ダッシュ", "8方向スティック＋アクションボタン"),
         ("green", "P2", "視点", None, "phone-32-p2-look.jpg", "視点・カメラ操作", "感度調整つきドラッグパッド"),
         ("purple", "P3", "アクション", None, "phone-37-p3-action.jpg", "攻撃・ブロック設置・持ち物切替・インベントリ", "左右クリック・ホイール・キーボタン")]


def role_head(x, y, name, p, role, sub, t, anchor_center=None):
    """「P1 移動 ホスト」の見出し。anchor_center を渡すと、その x を中心にそろえる。"""
    pw = sum(cw(c, 13) for c in p) + 20
    rw = sum(cw(c, 18) for c in role)
    sw_ = sum(cw(c, 13) for c in sub) + 8 if sub else 0
    total = pw + 10 + rw + sw_
    if anchor_center is not None:
        x = anchor_center - total / 2
    s, _ = pill(x, y, p, BODY[name], fg=DARK_ON[name])
    s += text(x + pw + 10, y + 18, role, 18, t["ink"], cls="gh", weight=700)
    if sub:
        s += text(x + pw + 10 + rw + 8, y + 17, sub, 13, t["muted"], cls="gh", weight=600)
    return s


def caption(W, t, title, sub):
    """図の中の小見出し（何の例か）。(svg, 高さ) を返す。"""
    s1, n1 = para(0, 18, title, 16, t["ink"], W, 23, 700)
    y = 18 + (n1 - 1) * 23
    s2, n2 = para(0, y + 22, sub, 13, t["muted"], W, 19, 600)
    y += 22 + (n2 - 1) * 19
    return s1 + s2 + f'<rect x="0" y="{y + 16}" width="{W - 14}" height="1.5" rx=".75" fill="{t["line"]}"/>', y + 40


def controllers(t, narrow=False):
    W0 = PHONE_W if narrow else PC_W
    cap, ch = caption(W0, t, "例：3人で『Minecraft』を遊ぶ場合", "各スマホには、担当する操作だけを並べたコントローラーが表示されます（実際の画面）。")
    if narrow:
        W, fw = PHONE_W, 110
        b = [cap]
        y = ch
        for name, p, role, sub, image, ops, ui in ROLES:
            s, h = phone(name, 0, y, fw, image, t)
            tx = fw + 16
            b += [s, role_head(tx, y + 8, name, p, role, sub, t)]
            s1, n1 = para(tx, y + 62, ops, 14, t["ink"], W - tx, 21, 600)
            s2, n2 = para(tx, y + 62 + n1 * 21 + 8, ui, 13, t["muted"], W - tx, 20)
            b += [s1, s2]
            y += h + 22
        H = y - 22
    else:
        W = PC_W
        colw = (W - 2 * GAP) / 3
        fw = 214
        b = [cap]
        hs = []
        for k, (name, p, role, sub, image, ops, ui) in enumerate(ROLES):
            cx = k * (colw + GAP) + colw / 2
            b.append(role_head(0, ch, name, p, role, sub, t, anchor_center=cx))
            s, h = phone(name, cx - fw / 2, ch + 40, fw, image, t)
            b.append(s)
            s1, n1 = para(cx, ch + 40 + h + 32, ops, 14, t["ink"], colw - 24, 21, 600, anchor="middle")
            s2, n2 = para(cx, ch + 40 + h + 32 + n1 * 21 + 6, ui, 13, t["muted"], colw - 24, 20, anchor="middle")
            b += [s1, s2]
            hs.append(ch + 40 + h + 32 + n1 * 21 + 6 + (n2 - 1) * 20 + 8)
        H = max(hs)
    alt = "3人で『Minecraft』を遊ぶ場合の分担と、実際のスマホの画面。" + "。".join(
        f"{p}（{role}{'・' + sub if sub else ''}）：{ops}。画面は{ui}" for _, p, role, sub, _, ops, ui in ROLES)
    return finish(W, H, b, t, alt)


# ---------- 03 特長：3枚のカード ----------

FEATURES = [("split", "purple", "1つのキャラクターを\n2〜4人で分担する",
             "移動・視点・アクションなどを分け合い、各スマホには自分の担当操作だけが並びます。ボタンの位置や大きさは持ち方に合わせて変えられ、"
             "60秒ごとに担当が入れ替わる交代ルールも選べます。"),
            ("list", "green", "選んだゲームが\nそのまま協力ゲームになる",
             "PCに入っているゲームを選ぶだけで、その操作に合った分担とコントローラーをその場で用意します。特定のタイトルに限らず、"
             "手元のPCゲームで共同操作を楽しめます。"),
            ("qr", "blue", "専用の機器も\nアプリも要らない",
             "Android・iPhoneの標準ブラウザでQRコードを読み取れば参加できます。ホストのスマホがリモコンになるので、"
             "PCのキーボードとマウスに触らずに、ゲーム選びから開始まで進められます。")]


def number(x, y, n, size=30, anchor="end"):
    return text(x, y, f"{n:02d}", size, "url(#brand)", cls="disp", weight=400, anchor=anchor)


def features(t, narrow=False):
    b = []
    if narrow:
        W, pad = PHONE_W, 18
        y = 0
        for k, (kind, color, title, body) in enumerate(FEATURES):
            s1, n1 = para(pad + 62, 30, title, 16, t["ink"], W - pad * 2 - 62 - 26, 23, 700, balance=True)
            top = max(24 + n1 * 24, 66) + 12
            s2, n2 = para(pad, top + 16, body, 14, t["muted"], W - pad * 2, 22)
            h = top + 16 + (n2 - 1) * 22 + 22
            b += [card(0, y, W, h, t), f'<g transform="translate(0 {y})">',
                  f'<g transform="translate({pad} 18) scale(.86)">{art.icon(kind, 0, 0, BODY[color], t)}</g>',
                  number(W - pad, 40, k + 1, 26), s1, s2, "</g>"]
            y += h + 12
        H = y - 12
    else:
        W, pad = PC_W, 22
        colw = (W - 2 * GAP) / 3
        parts = []
        for k, (kind, color, title, body) in enumerate(FEATURES):
            s1, n1 = para(pad, 104, title, 17, t["ink"], colw - pad * 2, 25, 700, balance=True)
            s2, n2 = para(pad, 104 + n1 * 25 + 14, body, 14, t["muted"], colw - pad * 2, 23)
            parts.append((s1, s2, 104 + n1 * 25 + 14 + (n2 - 1) * 23 + 24))
        H = max(h for _, _, h in parts)
        for k, ((kind, color, _, _), (s1, s2, _)) in enumerate(zip(FEATURES, parts)):
            x = k * (colw + GAP)
            b += [card(x, 0, colw, H, t), f'<g transform="translate({x:.1f} 0)">',
                  f'<g transform="translate({pad} 22)">{art.icon(kind, 0, 0, BODY[color], t)}</g>',
                  number(colw - pad, 52, k + 1), s1, s2, "</g>"]
    alt = "特長。" + "。".join(f"{k + 1}：{title}。{body}" for k, (_, _, title, body) in enumerate(FEATURES))
    return finish(W, H, b, t, alt)


# ---------- 04 解決出来ること：ジャンルごとのカード ----------

GENRES = [("cube", "blue", "3D空間を動くゲーム", "『Minecraft』など", ["移動・ジャンプ", "視点・カメラ", "攻撃・アイテム使用"],
           "狙った場所へ進むだけでも声掛けが要り、見慣れたワールドでの冒険や建築が共同作業になる"),
          ("ghost", "purple", "ホラー・サバイバルホラー", "『Outlast』『バイオハザード』など", ["移動", "視点・照準", "ライト・攻撃"],
           "1人では足がすくむ場面も、声を掛け合いながら進める。驚いた瞬間の悲鳴や笑いも全員で共有できる"),
          ("blocks", "green", "パズル・落ち物", "『テトリス』など", ["左右移動", "回転", "落下"],
           "「右！」「今、回して！」と息を合わせる、テンポの速いパーティーゲームになる"),
          ("wheel", "red", "レース・ドライブ", "", ["ハンドル", "アクセル・ブレーキ", "視点・ライト・ギア"],
           "まっすぐ走るだけでも、互いの呼吸を合わせる必要がある")]


def genre_icon(kind, x, y, color):
    s = 44
    w = "#FFFFFF"
    out = [f'<rect x="{x}" y="{y}" width="{s}" height="{s}" rx="12" fill="{color}"/>']
    cx, cy = x + s / 2, y + s / 2
    if kind == "cube":
        out.append(f'<path d="M{cx} {cy - 13}l12 6.5v14L{cx} {cy + 14}l-12-6.5v-14z" fill="none" stroke="{w}" stroke-width="2.6" stroke-linejoin="round"/>'
                   f'<path d="M{cx - 12} {cy - 6.5}L{cx} {cy}l12-6.5M{cx} {cy}v14" fill="none" stroke="{w}" stroke-width="2.6" stroke-linejoin="round"/>')
    elif kind == "ghost":
        out.append(f'<path d="M{cx - 11} {cy + 13}v-12a11 11 0 0 1 22 0v12l-3.7-3-3.7 3-3.6-3-3.7 3-3.6-3z" fill="{w}"/>'
                   f'<circle cx="{cx - 4.5}" cy="{cy - 1}" r="2.3" fill="{color}"/><circle cx="{cx + 4.5}" cy="{cy - 1}" r="2.3" fill="{color}"/>')
    elif kind == "blocks":
        for dx, dy in ((-12, 2), (-3, 2), (6, 2), (-3, -7), (6, -16)):
            out.append(f'<rect x="{cx + dx}" y="{cy + dy}" width="8" height="8" rx="1.5" fill="{w}"/>')
    else:
        out.append(f'<circle cx="{cx}" cy="{cy}" r="12.5" fill="none" stroke="{w}" stroke-width="3"/><circle cx="{cx}" cy="{cy}" r="3.4" fill="{w}"/>'
                   f'<path d="M{cx - 12} {cy}h8.6M{cx + 3.4} {cy}H{cx + 12}M{cx} {cy + 3.4}v9" stroke="{w}" stroke-width="3" stroke-linecap="round"/>')
    return "".join(out)


def genres(t, narrow=False):
    roles = [BODY["blue"], BODY["green"], BODY["purple"]]

    def head_h(ex, w):
        pad = 20
        if not ex:
            return pad + 44 + 16
        _, ne = para(0, 0, ex, 13, t["muted"], w - pad * 2 - 58, 19, 600)
        return max(pad + 44, pad + 40 + (ne - 1) * 19) + 16

    def one(kind, color, name, ex, split, exp, w, y_chip, y_exp):
        pad = 20
        s = [genre_icon(kind, pad, pad, BODY[color])]
        if ex:
            s.append(text(pad + 58, pad + 19, name, 17, t["ink"], cls="gh", weight=700))
            se, _ = para(pad + 58, pad + 40, ex, 13, t["muted"], w - pad * 2 - 58, 19, 600)
            s.append(se)
        else:
            s.append(text(pad + 58, pad + 28, name, 17, t["ink"], cls="gh", weight=700))
        sc, _ = chips(pad, y_chip, split, roles, t, w - pad * 2)
        s.append(sc)
        sp, n = para(pad + 14, y_exp + 4, exp, 15, t["ink"], w - pad * 2 - 14, 24, 600)
        s.append(f'<rect x="{pad}" y="{y_exp - 12}" width="3.5" height="{n * 24 + 6}" rx="1.75" fill="url(#brand)"/>{sp}')
        return "".join(s), y_exp + (n - 1) * 24 + 4 + 24

    def layout(w):
        """すべてのカードで、分担の札と説明の書き出しの高さをそろえる。"""
        y_chip = max(head_h(g[3], w) for g in GENRES)
        y_exp = y_chip + max(chips(0, 0, g[4], roles, t, w - 40)[1] for g in GENRES) + 18
        return y_chip, y_exp

    b = []
    if narrow:
        W = PHONE_W
        y = 0
        yc, ye = layout(W)
        for g in GENRES:
            s, h = one(*g, W, yc, ye)
            b += [card(0, y, W, h, t), f'<g transform="translate(0 {y})">{s}</g>']
            y += h + 12
        H = y - 12
    else:
        W = PC_W
        cwid = (W - GAP) / 2
        y = 0
        for r in range(2):
            parts = [one(*GENRES[r * 2 + c], cwid, *layout(cwid)) for c in range(2)]
            h = max(p[1] for p in parts)
            for c, (s, _) in enumerate(parts):
                x = c * (cwid + GAP)
                b += [card(x, y, cwid, h, t), f'<g transform="translate({x:.1f} {y})">{s}</g>']
            y += h + GAP
        H = y - GAP
    alt = "ジャンルと分担の例。" + "。".join(f"{name}{'（' + ex + '）' if ex else ''}：分担は{'／'.join(split)}。{exp}" for _, _, name, ex, split, exp in GENRES)
    return finish(W, H, b, t, alt)


# ---------- 05 試遊での反応：アンケートの数字 ----------

STATS = [(100, "100%", "楽しかった・\nまたこの遊び方をしてみたい", "26名全員"),
         (95.2, "95.2%", "1人で遊んだときと\n違うプレイ体験だった", "そのゲームの経験者21名中20名"),
         (84.6, "84.6%", "自分の担当操作を\n思い通りに動かせた", "22名")]


def bar(x, y, w, pct, t, h=6):
    return (f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{h / 2}" fill="{t["line"]}"/>'
            f'<rect x="{x}" y="{y}" width="{w * pct / 100:.1f}" height="{h}" rx="{h / 2}" fill="url(#brand)"/>')


def big_number(x, y, label, size, anchor="start"):
    """「95.2%」の % だけ小さくする。"""
    num = label.rstrip("%")
    w = sum(size * (.48 if c != "." else .22) for c in num)  # 表示用の細い書体の幅の見積もり
    s = text(x, y, num, size, "url(#brand)", cls="disp", weight=400, anchor=anchor)
    if label.endswith("%"):
        px = x + w + 3 if anchor == "start" else x + 3
        s += text(px, y, "%", size * .5, "url(#brand)", cls="disp", weight=400)
    return s


def stats(t, narrow=False):
    b = []
    if narrow:
        W, pad = PHONE_W, 18
        y = 0
        for pct, label, q, sub in STATS:
            s1, n1 = para(118, 32, q, 14, t["ink"], W - 118 - pad, 21, 700)
            s2, _ = para(118, 32 + n1 * 22 + 4, sub, 13, t["muted"], W - 118 - pad, 19, 600)
            h = max(32 + n1 * 22 + 4 + 18, 76) + 14
            b += [card(0, y, W, h, t), f'<g transform="translate(0 {y})">', big_number(pad, 52, label, 40), s1, s2,
                  bar(pad, h - 14, W - pad * 2, pct, t, 4), "</g>"]
            y += h + 10
        H = y - 10
    else:
        W, pad = PC_W, 22
        colw = (W - 2 * GAP) / 3
        parts = [para(pad, 108, q, 15, t["ink"], colw - pad * 2, 22, 700, balance=True) for _, _, q, _ in STATS]
        nmax = max(n for _, n in parts)
        H = 108 + nmax * 22 + 4 + 20 + 34
        for k, ((pct, label, q, sub), (s1, n1)) in enumerate(zip(STATS, parts)):
            x = k * (colw + GAP)
            s2, _ = para(pad, 108 + n1 * 22 + 4, sub, 13, t["muted"], colw - pad * 2, 19, 600)
            b += [card(x, 0, colw, H, t), f'<g transform="translate({x:.1f} 0)">', big_number(pad, 74, label, 58), s1, s2,
                  bar(pad, H - 26, colw - pad * 2, pct, t), "</g>"]
    alt = "試遊アンケート（回答者26名）の結果。" + "。".join(f"{q}：{label}（{sub}）" for _, label, q, sub in STATS)
    return finish(W, H, b, t, alt)


# ---------- 06 今後の展望：まず → その先 ----------

ROADMAP = [("NOW", "まず", "誰もが手元のPCで遊べる\nサービスとして公開する",
            "初めての人でも迷わず導入・参加できるように仕上げます。"),
           ("NEXT", "その先", "遊べるゲームと場所を広げる",
            "対応するゲームと設定形式を増やし、PCゲーム以外のプラットフォームや、離れた場所の友達と同じキャラクターを操作するオンライン対応へ広げます。")]


def roadmap_icon(k, x, y, t):
    """まず＝公開（ロケット）、その先＝広がる世界（地球）。"""
    c = BODY["blue"] if k == 0 else BODY["purple"]
    out = [f'<rect x="{x}" y="{y}" width="44" height="44" rx="12" fill="{c}"/>']
    cx, cy = x + 22, y + 22
    if k == 0:
        out.append(f'<path d="M{cx} {cy - 14}c6 4 8 11 6 19h-12c-2-8 0-15 6-19z" fill="#FFFFFF"/>'
                   f'<circle cx="{cx}" cy="{cy - 3}" r="2.6" fill="{c}"/>'
                   f'<path d="M{cx - 6} {cy + 1}l-5 6h5M{cx + 6} {cy + 1}l5 6h-5M{cx - 3} {cy + 8}l3 6 3-6" fill="#FFFFFF" stroke="#FFFFFF" stroke-width="1.5" stroke-linejoin="round"/>')
    else:
        out.append(f'<circle cx="{cx}" cy="{cy}" r="12.5" fill="none" stroke="#FFFFFF" stroke-width="2.6"/>'
                   f'<ellipse cx="{cx}" cy="{cy}" rx="5.5" ry="12.5" fill="none" stroke="#FFFFFF" stroke-width="2.2"/>'
                   f'<path d="M{cx - 12.5} {cy}h25M{cx - 10.5} {cy - 6.5}h21M{cx - 10.5} {cy + 6.5}h21" stroke="#FFFFFF" stroke-width="2"/>')
    return "".join(out)


def roadmap(t, narrow=False):
    def one(k, en, jp, title, body, w):
        pad = 22
        s = [roadmap_icon(k, pad, pad, t),
             text(pad + 58, pad + 15, en, 13, t["muted"], cls="gh", weight=700, extra=' letter-spacing="3"'),
             text(pad + 58, pad + 39, jp, 20, t["ink"], cls="gh", weight=700)]
        s1, n1 = para(pad, pad + 78, title, 16, t["ink"], w - pad * 2, 24, 700, balance=True)
        s2, n2 = para(pad, pad + 78 + n1 * 24 + 10, body, 14, t["muted"], w - pad * 2, 22)
        return "".join(s) + s1 + s2, pad + 78 + n1 * 24 + 10 + (n2 - 1) * 22 + 26

    b = []
    arrow = (lambda x, y, down=False: f'<g transform="translate({x} {y}) rotate({90 if down else 0})">'
             f'<circle r="15" fill="none" stroke="{t["line"]}" stroke-width="1.5"/>'
             f'<path d="M-5 0h10M1 -5l5 5-5 5" fill="none" stroke="url(#brand)" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></g>')
    if narrow:
        W = PHONE_W
        y = 0
        for k, r in enumerate(ROADMAP):
            s, h = one(k, *r, W)
            b += [card(0, y, W, h, t), f'<g transform="translate(0 {y})">{s}</g>']
            y += h
            if k == 0:
                b.append(arrow(W / 2, y + 22, down=True))
                y += 44
        H = y
    else:
        W = PC_W
        gap = 48
        cwid = (W - gap) / 2
        parts = [one(k, *r, cwid) for k, r in enumerate(ROADMAP)]
        H = max(h for _, h in parts)
        for k, (s, _) in enumerate(parts):
            x = k * (cwid + gap)
            b += [card(x, 0, cwid, H, t), f'<g transform="translate({x:.1f} 0)">{s}</g>']
        b.append(arrow(W / 2, H / 2))
    alt = "今後の展望。" + "。".join(f"{jp}：{title}。{body}" for _, jp, title, body in ROADMAP)
    return finish(W, H, b, t, alt)


# ---------- 07 注力したこと：3つのこだわり ----------

FOCUS = [("blue", "phone-01-host-lobby-1.jpg", "スマホだけで準備から開始まで", "P1のスマホがタッチパッド付きのリモコンになる"),
         ("green", "phone-14-layout-editor.jpg", "持ち方に合わせるUI編集", "ボタンの位置と縦横のサイズを、各スマホで変えられる")]
LATENCY = [("9.0", "ms", "Wi-Fiの往復遅延", "実機の測定・中央値"), ("26.0", "ms", "スマホの操作からPC入力まで", "推定遅延・中央値")]


def latency(x, y, w, t):
    """3つ目のこだわり（低遅延）の数値。(svg, 高さ) を返す。"""
    out = []
    yy = y
    for k, (num, unit, label, sub) in enumerate(LATENCY):
        out.append(text(x, yy + 50, num, 52, "url(#brand)", cls="disp", weight=400))
        nw = sum(52 * (.48 if c != "." else .22) for c in num)
        out.append(text(x + nw + 6, yy + 50, unit, 20, t["muted"], cls="gh", weight=700))
        s, n = para(x, yy + 76, label, 15, t["ink"], w, 22, 700)
        out.append(s + text(x, yy + 76 + n * 22, sub, 13, t["muted"], cls="gh", weight=600))
        yy += 76 + n * 22 + 34
    return "".join(out), yy - y - 34


def focus(t, narrow=False):
    b = []
    if narrow:
        W, fw = PHONE_W, 110
        y = 0
        for k, (name, image, title, sub) in enumerate(FOCUS):
            s, h = phone(name, 0, y, fw, image, t)
            tx = fw + 16
            s1, n1 = para(tx, y + 62, title, 16, t["ink"], W - tx, 23, 700, balance=True)
            s2, _ = para(tx, y + 62 + n1 * 23 + 6, sub, 13, t["muted"], W - tx, 20, 600)
            b += [s, number(tx, y + 34, k + 1, 26, "start"), s1, s2]
            y += h + 22
        s, h = latency(22, y + 70, W - 44, t)
        b += [card(0, y, W, h + 96, t), number(22, y + 38, 3, 26, "start"),
              text(62, y + 36, "違和感のない低遅延", 16, t["ink"], cls="gh", weight=700), s]
        H = y + h + 96
    else:
        # 3つとも同じ枠のカードにし、見出しの高さをそろえる
        W = PC_W
        colw = (W - 2 * GAP) / 3
        fw = 168
        top = 58
        shots = [phone(name, 0, 0, fw, image, t) for name, image, _, _ in FOCUS]
        ph = max(h for _, h in shots)
        ty = top + ph + 34
        H = 0
        for k in range(3):
            x = k * (colw + GAP)
            cx = x + colw / 2
            if k < 2:
                name, image, title, sub = FOCUS[k]
                s, h = phone(name, cx - fw / 2, top, fw, image, t)
                b.append(s)
            else:
                title, sub = "違和感のない低遅延", "PCのWi-Fiにスマホが直接つながる"
                s, h = latency(x + 28, top - 6, colw - 56, t)
                b.append(s)
            s1, n1 = para(cx, ty, title, 16, t["ink"], colw - 28, 23, 700, anchor="middle", balance=True)
            s2, n2 = para(cx, ty + n1 * 23 + 4, sub, 13, t["muted"], colw - 36, 20, 600, anchor="middle")
            b += [number(cx, 40, k + 1, 28, "middle"), s1, s2]
            H = max(H, ty + n1 * 23 + 4 + (n2 - 1) * 20 + 24)
        b = [card(k * (colw + GAP), 0, colw, H, t) for k in range(3)] + b
    alt = ("注力したこと。1：" + FOCUS[0][2] + "（" + FOCUS[0][3] + "）。2：" + FOCUS[1][2] + "（" + FOCUS[1][3] + "）。3：違和感のない低遅延。"
           + "。".join(f"{label}{num}{unit}（{sub}）" for num, unit, label, sub in LATENCY))
    return finish(W, H, b, t, alt)


# ---------- 09 システム構成 ----------


def node_icon(kind, x, y, color):
    w = "#FFFFFF"
    out = [f'<rect x="{x}" y="{y}" width="34" height="34" rx="9" fill="{color}"/>']
    cx, cy = x + 17, y + 17
    if kind == "hub":  # 入力をまとめる
        out.append(f'<circle cx="{cx}" cy="{cy}" r="4.5" fill="{w}"/>'
                   + "".join(f'<path d="M{cx + dx} {cy + dy}L{cx} {cy}" stroke="{w}" stroke-width="2.2" stroke-linecap="round"/>'
                             f'<circle cx="{cx + dx}" cy="{cy + dy}" r="2.6" fill="{w}"/>' for dx, dy in ((-10, -8), (-10, 8), (11, 0))))
    elif kind == "app":
        out.append(f'<rect x="{cx - 11}" y="{cy - 9}" width="22" height="18" rx="3" fill="none" stroke="{w}" stroke-width="2.2"/>'
                   f'<path d="M{cx - 11} {cy - 3.5}h22" stroke="{w}" stroke-width="2.2"/>')
    elif kind == "keys":
        out.append(f'<rect x="{cx - 12}" y="{cy - 7}" width="24" height="14" rx="3" fill="none" stroke="{w}" stroke-width="2.2"/>'
                   + "".join(f'<rect x="{cx - 8 + i * 5}" y="{cy - 3.5}" width="2.6" height="2.6" fill="{w}"/>' for i in range(4))
                   + f'<rect x="{cx - 6}" y="{cy + 1.5}" width="12" height="2.4" fill="{w}"/>')
    else:  # ゲーム
        out.append(f'<path d="M{cx - 9} {cy - 6}h18a6 6 0 0 1 5.5 8.5l-2 4a3.5 3.5 0 0 1-6 0l-1.5-2.5h-10l-1.5 2.5a3.5 3.5 0 0 1-6 0l-2-4A6 6 0 0 1 {cx - 9} {cy - 6}z" fill="{w}"/>'
                   f'<path d="M{cx - 8} {cy}h5M{cx - 5.5} {cy - 2.5}v5" stroke="{color}" stroke-width="2" stroke-linecap="round"/>'
                   f'<circle cx="{cx + 6}" cy="{cy}" r="1.8" fill="{color}"/>')
    return "".join(out)


NODES = {"host": ("hub", "#6F86FF", "Rustホスト", "役割・入力の統合"), "app": ("app", "#22C4FA", "PCアプリ", "Tauri・画面"),
         "api": ("keys", "#C03BFF", "Windows API", "SendInput"), "game": ("game", "#FF8A00", "既存のPCゲーム", "Minecraftなど")}


def node(key, x, y, w, t, h=62):
    kind, color, title, sub = NODES[key]
    return (card(x, y, w, h, t, 12) + node_icon(kind, x + 12, y + 14, color)
            + text(x + 56, y + 28, title, 14, t["ink"], cls="gh", weight=700) + text(x + 56, y + 47, sub, 13, t["muted"], cls="gh", weight=600))


def arrow(x0, y0, x1, y1, t, both=False):
    """矢印（線と矢じり）。"""
    import math
    a = math.atan2(y1 - y0, x1 - x0)
    def head(x, y, ang):
        p1 = (x - 8 * math.cos(ang - .45), y - 8 * math.sin(ang - .45))
        p2 = (x - 8 * math.cos(ang + .45), y - 8 * math.sin(ang + .45))
        return f'<path d="M{p1[0]:.1f} {p1[1]:.1f}L{x} {y}L{p2[0]:.1f} {p2[1]:.1f}" fill="none" stroke="{t["muted"]}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>'
    s = f'<path d="M{x0} {y0}L{x1} {y1}" stroke="{t["muted"]}" stroke-width="2" stroke-linecap="round"/>' + head(x1, y1, a)
    if both:
        s += head(x0, y0, a + math.pi)
    return s


def group(x, y, w, h, label, t):
    lw = sum(cw(c, 13) for c in label) + 24
    return (f'<rect x="{x + 1}" y="{y + 1}" width="{w - 2}" height="{h - 2}" rx="18" fill="none" stroke="url(#brand)" stroke-width="2" stroke-dasharray="6 5"/>'
            f'<rect x="{x + 20}" y="{y - 12}" width="{lw:.1f}" height="24" rx="12" fill="url(#brand)"/>'
            + text(x + 20 + lw / 2, y + 4.5, label, 13, "#FFFFFF", cls="gh", weight=700, anchor="middle"))


def phones_row(x, y, w, t):
    """3台のスマホ（キャラクター）と、その下の役割の札と名前。"""
    out = []
    for k, (name, p, role) in enumerate((("blue", "P1", "移動"), ("green", "P2", "視点"), ("purple", "P3", "アクション"))):
        cx = x + w * (k + .5) / 3
        out.append(art.char(name, cx - 26, y, .5, t, animate=False))
        out.append(f'<rect x="{cx - 17}" y="{y + 70}" width="34" height="22" rx="11" fill="{BODY[name]}"/>'
                   + text(cx, y + 85.5, p, 13, DARK_ON[name], cls="gh", weight=700, anchor="middle")
                   + text(cx, y + 112, role, 13, t["ink"], cls="gh", weight=700, anchor="middle"))
    return "".join(out)


def label(x, y, s, t, anchor="middle", muted=False):
    return text(x, y, s, 13, t["muted"] if muted else t["ink"], cls="gh", weight=600 if muted else 700, anchor=anchor)


def architecture(t, narrow=False):
    b = []
    if narrow:
        # 縦に1列：スマホ → 通信 → PCアプリ ⇅ Rustホスト → Windows API → ゲーム
        W = PHONE_W
        b += [group(0, 14, W, 146, "スマホ（ブラウザ）× 2〜4台", t), phones_row(0, 30, W, t)]
        ax0, ax1 = W / 2 - 22, W / 2 + 22
        b += [arrow(ax0, 172, ax0, 236, t), arrow(ax1, 236, ax1, 172, t),
              label(ax0 - 10, 200, "操作", t, "end"), label(ax0 - 10, 219, "WebSocket", t, "end", True),
              label(ax1 + 10, 200, "役割・準備状況", t, "start"), label(ax1 + 10, 219, "WebRTC", t, "start", True)]
        y0 = 262
        nw = W - 32
        rows = [("app", None), ("host", ("参加・準備状況", "選択・開始・停止", True)), ("api", ("統合した入力",)), ("game", ("キー・マウス操作",))]
        y = y0 + 26
        for k, (key, link) in enumerate(rows):
            if link:
                cx = 16 + nw / 2
                if len(link) == 3:
                    b += [arrow(cx - 18, y, cx - 18, y + 46, t), arrow(cx + 18, y + 46, cx + 18, y, t),
                          label(cx - 28, y + 28, link[0], t, "end"), label(cx + 28, y + 28, link[1], t, "start")]
                else:
                    b += [arrow(cx, y, cx, y + 46, t), label(cx + 12, y + 28, link[0], t, "start")]
                y += 52
            b.append(node(key, 16, y, nw, t))
            y += 62
        H = y + 18
        b.insert(0, group(0, y0, W, H - y0, "Windows PC", t))
    else:
        W = PC_W
        lw = 222
        H = 254
        b += [group(0, 14, lw, H - 14, "スマホ（ブラウザ）× 2〜4台", t), phones_row(4, 74, lw - 8, t)]
        mx0, mx1 = lw + 12, lw + 112
        mid = (mx0 + mx1) / 2
        b += [arrow(mx0, 110, mx1, 110, t), arrow(mx1, 156, mx0, 156, t),
              label(mid, 100, "操作", t), label(mid, 146, "役割・準備状況", t),
              label(mid, 190, "WebSocket", t, muted=True), label(mid, 208, "WebRTC", t, muted=True)]
        px = mx1 + 12
        pw = W - px
        b.append(group(px, 14, pw, H - 14, "Windows PC", t))
        nw = 170
        ax, bx = px + 18, px + pw - 18 - nw
        r1, r2 = 54, 170
        b += [node("host", ax, r1, nw, t), node("app", bx, r1, nw, t), node("api", ax, r2, nw, t), node("game", bx, r2, nw, t)]
        gx0, gx1 = ax + nw + 10, bx - 10
        gm = (gx0 + gx1) / 2
        b += [arrow(gx0, r1 + 22, gx1, r1 + 22, t), arrow(gx1, r1 + 42, gx0, r1 + 42, t),
              label(gm, r1 + 12, "参加・準備状況", t), label(gm, r1 + 62, "選択・開始・停止", t),
              arrow(gx0, r2 + 31, gx1, r2 + 31, t), label(gm, r2 + 21, "キー・マウス", t),
              arrow(ax + nw / 2, r1 + 66, ax + nw / 2, r2 - 4, t), label(ax + nw / 2 + 12, (r1 + 62 + r2) / 2 + 5, "統合した入力", t, "start")]
    alt = ("システム構成。スマホ（ブラウザ）2〜4台のP1移動・P2視点・P3アクションの操作を、WebSocketとWebRTCでWindows PCのRustホストへ送り、"
           "Rustホストは役割と準備状況をスマホへ返す。Rustホストは入力を統合し、Windows APIのSendInputでキーボード・マウス操作として"
           "既存のPCゲーム（Minecraftなど）へ送る。PCアプリ（Tauri）はRustホストから参加・準備状況を受け取り、ゲーム選択・開始・停止を伝える。")
    return finish(W, H, b, t, alt)


# ---------- 11 独自技術：分担AIの評価 ----------

EVAL_METRICS = ["カテゴリの正解率", "同じ人の判定", "同じまとまりの再現率", "同じ軸の判定"]
EVAL_SETS = [("GitHub の Unity・Godot の操作定義 57本", "生の名前、4組に分けた評価", [88.1, 94.5, 91.8, 94.6]),
             ("ゲームのファイルから読んだ操作 6本", "生の名前、1本ずつ外した評価", [76.0, 89.3, 75.9, 91.5])]


def evaluation(t, narrow=False):
    def one(title, sub, vals, w):
        pad = 22
        s1, n1 = para(pad, pad + 16, title, 15, t["ink"], w - pad * 2, 22, 700)
        s = [s1, text(pad, pad + 16 + n1 * 22, sub, 13, t["muted"], cls="gh", weight=600)]
        y = pad + 16 + n1 * 22 + 26
        lw = 150 if w > 340 else 0
        for m, v in zip(EVAL_METRICS, vals):
            if lw:
                s.append(text(pad, y + 14, m, 13, t["ink"], cls="gh", weight=600))
                s.append(bar(pad + lw, y + 6, w - pad * 2 - lw - 62, v, t, 8))
                s.append(text(w - pad, y + 14, f"{v:.1f}%", 16, t["ink"], cls="gh", weight=700, anchor="end"))
            else:
                s.append(text(pad, y + 8, m, 13, t["ink"], cls="gh", weight=600))
                s.append(text(w - pad, y + 8, f"{v:.1f}%", 16, t["ink"], cls="gh", weight=700, anchor="end"))
                s.append(bar(pad, y + 18, w - pad * 2, v, t, 8))
                y += 14
            y += 34
        return "".join(s), y + 6

    b = []
    if narrow:
        W = PHONE_W
        y = 0
        for st in EVAL_SETS:
            s, h = one(*st, W)
            b += [card(0, y, W, h, t), f'<g transform="translate(0 {y})">{s}</g>']
            y += h + 12
        H = y - 12
    else:
        W = PC_W
        cwid = (W - GAP) / 2
        parts = [one(*st, cwid) for st in EVAL_SETS]
        H = max(h for _, h in parts)
        for k, (s, _) in enumerate(parts):
            x = k * (cwid + GAP)
            b += [card(x, 0, cwid, H, t), f'<g transform="translate({x:.1f} 0)">{s}</g>']
    alt = "分担AIの評価（学習に使っていないゲーム、ゲームごとの平均）。" + "。".join(
        f"{title}（{sub}）：" + "、".join(f"{m}{v:.1f}%" for m, v in zip(EVAL_METRICS, vals)) for title, sub, vals in EVAL_SETS)
    return finish(W, H, b, t, alt)


# ---------- 01 背景：この製品の考え方（ひとこと） ----------

MESSAGE = ("操作を分担する不自由さが、\nそのまま新しい面白さになる。",
           "ゲーム自体は変えずに、操作する人と協力の仕方を変える。手元のゲームを、友達と集まったその場で新しい協力ゲームにします。")


def message(t, narrow=False):
    """注記の囲みではなく、大きな引用符とグラデーションの線で、この製品の考え方を示す。"""
    W = PHONE_W if narrow else PC_W
    size, lh = (18, 28) if narrow else (28, 40)
    q = 40 if narrow else 56
    tx = q + 10
    b = [text(0, q * 1.05, "“", q * 1.7, "url(#brand)", cls="disp", weight=400)]
    s1, n1 = para(tx, size + 8, MESSAGE[0], size, t["ink"], W - tx - 14, lh, 800)
    y = size + 8 + (n1 - 1) * lh + 22
    b.append(f'<rect x="{tx}" y="{y}" width="56" height="4" rx="2" fill="url(#brand)"/>')
    s2, n2 = para(tx, y + 34, MESSAGE[1], 15, t["muted"], W - tx - 14, 25, 600)
    b += [s1, s2]
    H = y + 34 + (n2 - 1) * 25 + 8
    return finish(W, H, b, t, MESSAGE[0] + MESSAGE[1], top=18, bottom=34)


# ---------- 10 活用した技術：種類ごとのカード ----------

TECH = [
    ("hub", "#6F86FF", "PCホスト", "Rust 2021（apps/host-rs）", [
        ("Tokio 1", "非同期の実行基盤。参加・入力・タイマーの状態は専用の hub スレッド1本で処理"),
        ("axum 0.8", "画面の配信（HTTP）とWebSocket"),
        ("datachannel 0.16", "libdatachannel によるWebRTC DataChannel（OpenSSLごと静的リンク）"),
        ("tokenizers 0.22", "分担AIのMiniLMトークナイザー（純Rustの機能だけ）"),
        ("flate2 1", "ゲームの pak・zip・BA2 の圧縮データの展開"),
        ("qrcode 0.14・if-addrs 0.13", "参加用URLのアドレス取得とQRコードの生成")]),
    ("keys", "#C03BFF", "Windows API", "windows クレート 0.62", [
        ("SendInput", "スキャンコードのキー・相対マウス移動・左右ボタン・ホイール"),
        ("timeBeginPeriod(1)", "タイマー分解能を1msにし、4ms周期で視点を補間"),
        ("GetForegroundWindow ほか", "入力先のゲームが前面にあるときだけ送る（EnumWindows・GetWindowThreadProcessId）"),
        ("SetForegroundWindow", "開始時にゲームを前面へ（AttachThreadInput）"),
        ("RegisterHotKey", "PCの緊急停止 Ctrl+Alt+F12"),
        ("NetworkOperatorTetheringManager", "モバイルホットスポットのON／OFF"),
        ("WLAN API・Core Audio", "協力プレイ中のWi-Fiのストリーミングモード、Bluetoothの音の出力先の検出"),
        ("レジストリ・既知のフォルダー", "ランチャーのインストール情報、Unity PlayerPrefs、ゲームの設定ファイル")]),
    ("wave", "#22C4FA", "通信", "ローカルWi-Fiだけで完結", [
        ("WebSocket（JSON）", "参加・役割・準備状況・一時停止など、確実に届けたい状態の共有"),
        ("WebRTC DataChannel", "ordered:false・maxRetransmits:0。視点（30Hz）とボタン入力の速達便。ACKのない入力は直近500ms分をまとめて送る"),
        ("Windows モバイルホットスポット", "PCのWi-Fiにスマホが直接つながる。STUN／TURN・インターネットは使わない"),
        ("契約のバージョン（現在 6）", "メッセージの型と契約のバージョンを明示し、接続時に照合して合わない画面の接続を断る")]),
    ("phone", "#5EFF5D", "スマホの画面", "apps/web（ブラウザだけで動く）", [
        ("React 19", "画面の描画。入力と通信の処理はReactの状態管理に載せない"),
        ("TypeScript 7（strict）", "スマホ・PC・overlay・診断・疑似ゲームの5画面"),
        ("Vite 8", "5画面のビルド（ES2022）"),
        ("Pointer Events", "setPointerCapture によるマルチタッチのボタン・スティック・ドラッグパッド"),
        ("Screen Orientation・Vibration", "横持ちへの切り替えと、押したときの短い振動"),
        ("localStorage", "スマホごとのボタン配置（個人レイアウト）の保存")]),
    ("spark", "#F5B400", "操作分担AI", "Re:Cooplay Preset Model v2", [
        ("paraphrase-multilingual-MiniLM-L12-v2", "操作名を384次元の意味ベクトルに。語彙を43,691語に絞り、行ごとに8ビット量子化（約40MB）"),
        ("2層Transformerエンコーダ", "104,136パラメータ（約410KB）。カテゴリ・同じ人が持つ確率・方向軸を同時に推定"),
        ("Rustでの推論", "オフライン。14操作のゲームで約80ミリ秒"),
        ("Hugging Face", "重みを固定した版で配布（CC BY-NC-ND 4.0）。読めないときは規則による分担に戻る")]),
    ("search", "#FF8A00", "ゲームの解析", "apps/host-rs/src/engines", [
        ("ランチャー 7系統", "Steam・Epic Games・GOG・Ubisoft・EA・Battle.net・Xbox（ほかにSteamのショートカット・Minecraft・手動登録）"),
        ("ゲームエンジン 19系統", "Unity・Unreal Engine 4/5・Godot 3/4・RPGツクール・WOLF RPGエディター・Source 1/2・Creation Engine・REDengine・CryEngine など"),
        ("設定リーダー 7種類", "ユーザーが変えたキー設定を読み、操作定義に重ねる"),
        ("操作定義 JSON（schema 1）", "固有の定義・自動抽出・汎用定義を同じ分担と画面生成で扱う")]),
    ("app", "#FF4A6A", "PCアプリ・動作環境", "Tauri 2（apps/desktop）", [
        ("Tauri 2・WebView2", "PCの画面。Rustホストを子プロセスとして起動・終了する"),
        ("Windows 11", "ホストとゲームを動かすPC"),
        ("Android・iPhone", "標準のブラウザ（Chrome・Safari）で参加。アプリのインストールは不要")]),
    ("check", "#2DA44E", "検証・CI", "GitHub Actions", [
        ("Node.js のシミュレーション", "dry-runのRustホストに対する通信契約・画面・入力プローブの自動試験"),
        ("cargo test", "ホストとPCアプリの単体試験（--release --locked）"),
        ("必須チェック 9件", "structure・host-rs・web・desktop・protocol・package・npm-audit・cargo-audit ×2")]),
]


def tech_icon(kind, x, y, color):
    if kind in ("hub", "keys", "app"):
        return node_icon(kind, x, y, color)
    w = "#FFFFFF"
    out = [f'<rect x="{x}" y="{y}" width="34" height="34" rx="9" fill="{color}"/>']
    cx, cy = x + 17, y + 17
    if kind == "wave":
        out.append(f'<circle cx="{cx}" cy="{cy + 6}" r="2.4" fill="{w}"/>'
                   + "".join(f'<path d="M{cx - r * .72:.1f} {cy + 6 - r * .7:.1f}A{r} {r} 0 0 1 {cx + r * .72:.1f} {cy + 6 - r * .7:.1f}" '
                             f'fill="none" stroke="{w}" stroke-width="2.4" stroke-linecap="round"/>' for r in (6, 11)))
    elif kind == "phone":
        out.append(f'<rect x="{cx - 6.5}" y="{cy - 11}" width="13" height="22" rx="3" fill="none" stroke="{w}" stroke-width="2.2"/>'
                   f'<circle cx="{cx}" cy="{cy + 6.5}" r="1.4" fill="{w}"/>')
    elif kind == "spark":
        out.append(f'<path d="{SPARK}" transform="translate({cx} {cy}) scale(1.6)" fill="{w}"/>')
    elif kind == "search":
        out.append(f'<circle cx="{cx - 2}" cy="{cy - 2}" r="7" fill="none" stroke="{w}" stroke-width="2.4"/>'
                   f'<path d="M{cx + 3} {cy + 3}l6 6" stroke="{w}" stroke-width="2.6" stroke-linecap="round"/>')
    else:
        out.append(f'<path d="M{cx - 7} {cy}l4.5 4.5 9-9.5" fill="none" stroke="{w}" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/>')
    return "".join(out)


def tech_card(kind, color, title, sub, items, w, t):
    """(svg, 高さ) を返す。項目は「名前」と「役割」の2段。"""
    pad = 20
    b = [tech_icon(kind, pad, pad, color), text(pad + 46, pad + 15, title, 16, t["ink"], cls="gh", weight=700),
         text(pad + 46, pad + 33, sub, 13, t["muted"], cls="gh", weight=600)]
    y = pad + 58
    b.append(f'<rect x="{pad}" y="{y - 8}" width="{w - pad * 2}" height="1" fill="{t["line"]}"/>')
    for name, desc in items:
        s1, n1 = para(pad, y + 16, name, 14, t["ink"], w - pad * 2, 20, 700)
        s2, n2 = para(pad, y + 16 + n1 * 20 + 2, desc, 13, t["muted"], w - pad * 2, 20, 400)
        b += [s1, s2]
        y += 16 + n1 * 20 + 2 + (n2 - 1) * 20 + 14
    return "".join(b), y + 8


def techstack(t, narrow=False):
    b = []
    if narrow:
        W = PHONE_W
        y = 0
        for kind, color, title, sub, items in TECH:
            s, h = tech_card(kind, color, title, sub, items, W, t)
            b += [card(0, y, W, h, t), f'<g transform="translate(0 {y})">{s}</g>']
            y += h + 12
        H = y - 12
    else:
        W = PC_W
        cwid = (W - GAP) / 2
        y = 0
        for r in range(0, len(TECH), 2):
            parts = [tech_card(*TECH[r + c], cwid, t) for c in range(2) if r + c < len(TECH)]
            h = max(p[1] for p in parts)
            for c, (s, _) in enumerate(parts):
                x = c * (cwid + GAP)
                b += [card(x, y, cwid, h, t), f'<g transform="translate({x:.1f} {y})">{s}</g>']
            y += h + GAP
        H = y - GAP
    alt = "活用した技術。" + "。".join(f"{title}（{sub}）：" + "、".join(f"{n}（{d}）" for n, d in items)
                                    for _, _, title, sub, items in TECH)
    return finish(W, H, b, t, alt)


FIGURES = {"controllers": controllers, "features": features, "genres": genres, "stats": stats, "roadmap": roadmap,
           "focus": focus, "architecture": architecture, "evaluation": evaluation, "message": message, "techstack": techstack}


def main():
    n = 0
    for name, make in FIGURES.items():
        for mode, t in THEMES.items():
            for suffix, narrow in (("", False), ("-narrow", True)):
                s = make(t, narrow)
                ET.fromstring(s)  # 属性の重複などがあると GitHub で画像が表示されないので、XMLとして読めることを確かめる
                (art.OUT / f"{name}{suffix}-{mode}.svg").write_text(s + "\n", encoding="utf-8", newline="\n")
                n += 1
    print(f"wrote {n} files to {art.OUT}")


if __name__ == "__main__":
    main()
