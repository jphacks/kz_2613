"""実機の録画（スマホ screenrecord・PC gdigrab）から、README用のアニメーションWebPを組み立てる。

python compose.py a|b wide|narrow
- 背景は透明。文字は色付きの札の上に置き、ライト・ダークどちらの背景でも読めるようにする。
- 指の位置の円は、スマホのページで記録した pointer イベントから後で重ねる（端末の「タップを表示」は録画に写らなかったため）。
"""
import json, subprocess, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter

WHICH, LAYOUT = sys.argv[1], sys.argv[2]
FPS = 12
K = 2.8125           # CSS px → 端末 px
PAGE_TOP = 286       # 端末の画面でページの上端（ステータスバーとアドレスバーの下）
PAGE_H = 1972        # ページの高さ（701 CSS px）
FONT = "C:/Windows/Fonts/NotoSansJP-VF.ttf"


def font(size, weight=700):
    f = ImageFont.truetype(FONT, size)
    try:
        f.set_variation_by_axes([weight])
    except Exception:
        pass
    return f


def read_frames(path, times, crop, size):
    """times（秒、昇順）の各時刻のコマを返す。VFRの録画も一定のfpsに直して取り出す。"""
    w, h = size
    vf = f"fps=60,crop={crop},scale={w}:{h}:flags=lanczos"
    want = [max(0, int(round(t * 60))) for t in times]
    need = set(want)
    p = subprocess.Popen(["ffmpeg", "-v", "error", "-i", path, "-vf", vf, "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], stdout=subprocess.PIPE)
    got, i, last = {}, 0, None
    n = w * h * 3
    while True:
        buf = p.stdout.read(n)
        if len(buf) < n:
            break
        if i in need:
            got[i] = np.frombuffer(buf, np.uint8).reshape(h, w, 3)
        last = buf
        i += 1
        if i > max(want):
            break
    p.kill()
    tail = np.frombuffer(last, np.uint8).reshape(h, w, 3)
    return [got.get(k, tail) for k in want]


def rounded_mask(size, r):
    m = Image.new("L", size, 0)
    ImageDraw.Draw(m).rounded_rectangle((0, 0, size[0] - 1, size[1] - 1), r, fill=255)
    return m


def phone_frame(screen, scale):
    """スマホの枠（黒いふち・角丸）に画面を入れる。"""
    w, h = screen.size
    bz = round(10 * scale)
    W, H = w + 2 * bz, h + 2 * bz
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle((0, 0, W - 1, H - 1), round(34 * scale), fill=(22, 24, 31, 255), outline=(74, 80, 98, 255), width=max(1, round(1.2 * scale)))
    img.paste(screen, (bz, bz), rounded_mask(screen.size, round(26 * scale)))
    return img


def pc_frame(screen, scale):
    w, h = screen.size
    bz = round(6 * scale)
    img = Image.new("RGBA", (w + 2 * bz, h + 2 * bz), (0, 0, 0, 0))
    ImageDraw.Draw(img).rounded_rectangle((0, 0, w + 2 * bz - 1, h + 2 * bz - 1), round(14 * scale), fill=(22, 24, 31, 255), outline=(74, 80, 98, 255), width=max(1, round(1.2 * scale)))
    img.paste(screen, (bz, bz), rounded_mask(screen.size, round(9 * scale)))
    return img


def touches(log, t_phone_ms):
    """その時刻に画面に触れている指の位置（CSS px）。離した直後は少しのあいだ薄く残す。"""
    down, pos, last_up = False, None, None
    for kind, t, x, y in log:
        if t > t_phone_ms:
            break
        if kind == "d":
            down, pos = True, (x, y)
        elif kind == "m" and down:
            pos = (x, y)
        elif kind == "u":
            down, last_up = False, (t, x, y)
    if down:
        return pos, 1.0
    if last_up and t_phone_ms - last_up[0] < 220:
        return (last_up[1], last_up[2]), 1 - (t_phone_ms - last_up[0]) / 220
    return None, 0


def draw_touch(img, pos, alpha, s):
    if not pos:
        return img
    x, y = pos[0] * s, pos[1] * s
    r = 19 * s
    layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    d.ellipse((x - r, y - r, x + r, y + r), fill=(40, 40, 52, int(95 * alpha)), outline=(255, 255, 255, int(230 * alpha)), width=max(2, round(2.5 * s)))
    return Image.alpha_composite(img.convert("RGBA"), layer)


def pill(text_, scale, fill=(36, 194, 250), ink=(6, 36, 58), size=15, max_w=None, left=False):
    f = font(round(size * scale))
    pad = round(12 * scale)
    lines = wrap(text_, f, (max_w - 2 * pad) if max_w else 10 ** 6)
    lh = round(size * 1.5 * scale)
    tw = max(f.getlength(l) for l in lines)
    W, H = int(tw + 2 * pad), int(lh * len(lines) + pad * 1.1)
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle((0, 0, W - 1, H - 1), round(H / 2 if len(lines) == 1 else 12 * scale), fill=fill + (255,))
    for k, l in enumerate(lines):
        if left:
            d.text((pad, pad * .55 + lh * (k + .5)), l, font=f, fill=ink + (255,), anchor="lm")
        else:
            d.text((W / 2, pad * .55 + lh * (k + .5)), l, font=f, fill=ink + (255,), anchor="mm")
    return img


def note_pill(text_, scale, max_w):
    p = pill(text_, scale, fill=(128, 136, 152), ink=(255, 255, 255), size=13, max_w=max_w)
    p.putalpha(p.getchannel("A").point(lambda v: int(v * .8)))
    return p


def wrap(s, f, w):
    """日本語の折り返し（読点・句点・括弧の後ろで切りやすくする簡単なもの）。"""
    out, cur = [], ""
    for ch in s:
        if f.getlength(cur + ch) > w and cur and ch not in "）」。、":  # 閉じ括弧・句読点は行頭に送らない
            cut = max(cur.rfind("、"), cur.rfind("。"), cur.rfind("）"), cur.rfind("で"), cur.rfind("を"))
            if cut >= len(cur) - 6 and cut > 0:
                out.append(cur[:cut + 1]); cur = cur[cut + 1:] + ch
            else:
                out.append(cur); cur = ch
        else:
            cur += ch
    out.append(cur)
    return out


def caption_at(caps, t):
    cur = caps[0][1]
    for start, text_ in caps:
        if t >= start:
            cur = text_
    return cur


def encode(frames, out, durations):
    import os, shutil, tempfile
    tmp = tempfile.mkdtemp(dir=".")
    for k, im in enumerate(frames):
        im.save(f"{tmp}/{k:05d}.png")
    # 長さの違うコマ（最後の静止など）は、同じコマを並べて表す
    lst = f"{tmp}/list.txt"
    with open(lst, "w") as fh:
        for k, dur in enumerate(durations):
            fh.write(f"file '{os.path.abspath(tmp)}/{k:05d}.png'\nduration {dur:.4f}\n")
        fh.write(f"file '{os.path.abspath(tmp)}/{len(frames) - 1:05d}.png'\n")
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", lst, "-fps_mode", "vfr", "-c:v", "libwebp_anim",
                    "-lossless", "0", "-quality", "72", "-compression_level", "6", "-loop", "0", "-pix_fmt", "yuv420p" if LAYOUT == "screen" else "yuva420p", out], check=True)
    shutil.rmtree(tmp)


def build_a():
    sync = json.load(open("rec-a-marks.json"))
    log = sync["log"]
    marks = dict(sync["marks"])
    # 編集の開始（鉛筆のタップ）で、帯が青に変わる時刻を録画から探して、ページの時刻と合わせる
    edit_down = [e for e in log if e[0] == "d"][0][1]
    hdr = read_frames("rec-a-phone.mp4", [i / 30 for i in range(0, 30 * 8)], f"60:40:200:{PAGE_TOP + 40}", (6, 4))
    blue = [i for i, f in enumerate(hdr) if f[..., 2].mean() > 200 and f[..., 0].mean() < 200]
    t_edit = blue[0] / 30
    up = [e for e in log if e[0] == "u"][0][1]
    off = t_edit - (up - edit_down) / 1000 - 0.03   # 押して離した直後に帯が変わる
    t0, t1 = off + 0.0 - 0.8, off + (marks["save"] - marks["edit"]) / 1000 + 2.0
    caps = [(t0, "① 鉛筆のボタンで編集を始める（編集中はゲームに送らない）"),
            (off + (marks["select-space"] - marks["edit"]) / 1000 - 0.3, "② つまみを引いて、ボタンの縦と横の大きさを変える"),
            (off + (marks["resize-w"] - marks["edit"]) / 1000 + 0.6, "③ ほかのボタンに重なると、置ける場所を点線の枠で示す。指を離すとそこに収まる"),
            (off + (marks["select-shift"] - marks["edit"]) / 1000 - 0.2, "④ 空いた所へ広げる。隣のボタンに当たると止まる"),
            (off + (marks["save"] - marks["edit"]) / 1000 - 0.3, "⑤ 保存すると、このスマホの配置になる")]
    if LAYOUT == "screen":
        return screen_a(log, marks, off, edit_down)
    scale = 2 if LAYOUT == "wide" else 2
    sw = round(270 * scale) if LAYOUT == "wide" else round(250 * scale)
    sh = round(sw * PAGE_H / 1080)
    times = [t0 + k / FPS for k in range(int((t1 - t0) * FPS))]
    shots = read_frames("rec-a-phone.mp4", times, f"1080:{PAGE_H}:0:{PAGE_TOP}", (sw, sh))
    s_css = sw / 384
    frames = []
    for t, a in zip(times, shots):
        scr = Image.fromarray(a).convert("RGBA")
        pos, alpha = touches(log, edit_down + (t - (off)) * 1000)
        scr = draw_touch(scr, pos, alpha, s_css)
        ph = phone_frame(scr, scale)
        if LAYOUT == "wide":
            W, H = round(838 * scale), ph.height + round(20 * scale)
            img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
            img.alpha_composite(ph, (round(40 * scale), round(10 * scale)))
            # 右側：手順の一覧。今の手順を色付きの札に、ほかは薄い札にする
            x0 = round(40 * scale) + ph.width + round(36 * scale)
            cur = caption_at(caps, t)
            ps = []
            for start, text_ in caps:
                on = text_ == cur
                p = pill(text_, scale, fill=(36, 194, 250) if on else (128, 136, 152), ink=(6, 36, 58) if on else (255, 255, 255), size=15, max_w=W - x0 - round(40 * scale), left=True)
                if not on:
                    p.putalpha(p.getchannel("A").point(lambda v: int(v * .45)))
                ps.append(p)
            note = pill("Android実機（Chrome）の画面を録画。指の位置の円は録画後に重ねたもの", scale, fill=(128, 136, 152), ink=(255, 255, 255), size=13, max_w=W - x0 - round(40 * scale), left=True)
            note.putalpha(note.getchannel("A").point(lambda v: int(v * .8)))
            total = sum(p.height for p in ps) + round(14 * scale) * (len(ps) - 1) + round(30 * scale) + note.height
            y = (H - total) // 2
            for p in ps:
                img.alpha_composite(p, (x0, y))
                y += p.height + round(14 * scale)
            img.alpha_composite(note, (x0, y + round(16 * scale)))
        else:
            cap = pill(caption_at(caps, t), scale, size=14, max_w=round(300 * scale))
            note = note_pill("Android実機（Chrome）の画面を録画。指の円は録画後に重ねたもの", scale, round(300 * scale))
            W = round(324 * scale)
            H = ph.height + round(26 * scale) + round(70 * scale) + note.height + round(8 * scale)
            img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
            img.alpha_composite(ph, ((W - ph.width) // 2, 0))
            img.alpha_composite(cap, ((W - cap.width) // 2, ph.height + round(14 * scale)))
            img.alpha_composite(note, ((W - note.width) // 2, H - note.height))
        frames.append(img)
    durs = [1 / FPS] * len(frames)
    durs[-1] = 2.0
    return frames, durs


def screen_a(log, marks, off, edit_down):
    """READMEの「注力したこと」の図に埋め込む、スマホの画面だけの録画（枠・文字なし）。
    最初のコマは編集を始めた直後（以前の静止画と同じ見た目）。動かない環境ではこのコマが出る。保存の直前で止めて最初へ戻る。"""
    sw = 320
    sh = round(sw * PAGE_H / 1080)
    t0 = off + 0.25
    t1 = off + (marks["save"] - marks["edit"]) / 1000 - 0.2
    times = [t0 + k / FPS for k in range(int((t1 - t0) * FPS))]
    shots = read_frames("rec-a-phone.mp4", times, f"1080:{PAGE_H}:0:{PAGE_TOP}", (sw, sh))
    frames = []
    for t, a in zip(times, shots):
        scr = Image.fromarray(a).convert("RGBA")
        pos, alpha = touches(log, edit_down + (t - off) * 1000)
        frames.append(draw_touch(scr, pos, alpha, sw / 384))
    durs = [1 / FPS] * len(frames)
    durs[0], durs[-1] = 1.2, 1.8
    return frames, durs


def build_b():
    sync = json.load(open("rec-b-sync.json"))
    log = json.load(open("rec-b-marks.json"))["log"]
    marks = dict(json.load(open("rec-b-marks.json"))["marks"])
    # PCの録画の時刻 tp を基準にする。スマホの録画の時刻 = tp - off、ページの時刻 = first_down + (スマホ時刻 - phone_hl)
    off = sync["pc_change"] - sync["phone_hl"] - 0.05
    segs = [(1.4, 22.0, 1), (22.0, 36.4, 4), (36.4, 45.6, 1)]
    tps = []
    for a, b, sp in segs:
        n = int((b - a) / sp * FPS)
        tps += [a + k * sp / FPS for k in range(n)]
    mk = lambda key: marks[key] / 1000 + 0.15
    caps = [(0, "① スマホのタッチパッドで、PCのカーソルを動かしてゲームを選ぶ"),
            (mk("click-advance") + 0.6, "② 分担を決めて、「ゲームを起動する」を押す"),
            (mk("click-launch") + 1.0, "③ ゲームのランチャーが開く（読み込みは4倍速）"),
            (36.4, "④ ランチャーの「プレイ」も、そのままスマホで押せる"),
            (44.2, "⑤ ゲームが起動する。準備ができたらスマホで分担操作開始")]
    scale = 2
    if LAYOUT == "wide":
        pw = round(560 * scale)
    else:
        pw = round(312 * scale)
    phh = round((600 if LAYOUT == "wide" else 312) * 820 / 1280 * scale) if False else round(pw * 820 / 1280)
    psw = round(phh * 1080 / PAGE_H) if LAYOUT == "wide" else round(150 * scale)
    psh = round(psw * PAGE_H / 1080)
    pcs = read_frames("rec-b-pc.mp4", tps, "1280:820:60:83", (pw, phh))
    phs = read_frames("rec-b-phone.mp4", [max(0, t - off) for t in tps], f"1080:{PAGE_H}:0:{PAGE_TOP}", (psw, psh))
    s_css = psw / 384
    import cdet
    raw = cdet.track(tps)
    cur, good = {}, None
    for tp in tps:
        v = raw.get(tp)
        if v and v[2] < 16000:
            good = (tp, v)
        if good and tp - good[0] <= 2.0:
            cur[tp] = good[1]
    frames = []
    for tp, a, b in zip(tps, pcs, phs):
        # PCのカーソルは縮小すると見えにくいので、まわりに薄い輪を重ねる（位置は録画から型合わせで求めた）
        if tp in cur:
            cx, cy, _ = cur[tp]
            k = pw / 1280
            hx, hy = (cx + 5) * k, (cy + 8) * k
            pcimg = Image.fromarray(a).convert("RGBA")
            lay = Image.new("RGBA", pcimg.size, (0, 0, 0, 0))
            rr = 17 * scale * min(1, pw / (560 * scale)) + 4
            ImageDraw.Draw(lay).ellipse((hx - rr, hy - rr, hx + rr, hy + rr), fill=(255, 214, 0, 70), outline=(255, 170, 0, 220), width=round(2.5 * scale))
            a = np.array(Image.alpha_composite(pcimg, lay).convert("RGB"))
        scr = Image.fromarray(b).convert("RGBA")
        pos, alpha = touches(log, sync["log_first_down"] + (tp - off - sync["phone_hl"]) * 1000)
        scr = draw_touch(scr, pos, alpha, s_css)
        ph = phone_frame(scr, scale * (0.8 if LAYOUT == "wide" else .6))
        pc = pc_frame(Image.fromarray(a).convert("RGBA"), scale)
        cap = pill(caption_at(caps, tp), scale, size=15 if LAYOUT == "wide" else 14, max_w=round((800 if LAYOUT == "wide" else 300) * scale))
        note = note_pill("PCアプリとAndroid実機の画面を同時に録画。指の円とカーソルの輪は録画後に重ねたもの", scale, round((800 if LAYOUT == "wide" else 300) * scale))
        if LAYOUT == "wide":
            W = round(838 * scale)
            gap = round(22 * scale)
            x0 = (W - pc.width - gap - ph.width) // 2
            H = max(pc.height, ph.height) + round(64 * scale) + note.height
            img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
            img.alpha_composite(pc, (x0, (max(pc.height, ph.height) - pc.height) // 2 + round(6 * scale)))
            img.alpha_composite(ph, (x0 + pc.width + gap, round(6 * scale)))
            img.alpha_composite(cap, ((W - cap.width) // 2, max(pc.height, ph.height) + round(20 * scale)))
            img.alpha_composite(note, ((W - note.width) // 2, H - note.height))
        else:
            W = round(324 * scale)
            H = pc.height + round(12 * scale) + ph.height + round(14 * scale) + round(84 * scale) + note.height
            img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
            img.alpha_composite(pc, ((W - pc.width) // 2, 0))
            img.alpha_composite(ph, ((W - ph.width) // 2, pc.height + round(12 * scale)))
            img.alpha_composite(cap, ((W - cap.width) // 2, pc.height + round(12 * scale) + ph.height + round(14 * scale)))
            img.alpha_composite(note, ((W - note.width) // 2, H - note.height))
        frames.append(img)
    durs = [1 / FPS] * len(frames)
    durs[-1] = 2.0
    return frames, durs


frames, durs = (build_a if WHICH == "a" else build_b)()
# 大きさをそろえる（キャプションの行数で高さが変わらないよう、最大に合わせる）
H = max(f.height for f in frames)
W = frames[0].width
frames = [f if f.height == H else (lambda c: (c.alpha_composite(f, (0, 0)), c)[1])(Image.new("RGBA", (W, H), (0, 0, 0, 0))) for f in frames]
out = f"out-{WHICH}-{LAYOUT}.webp"
encode(frames, out, durs)
frames[len(frames) // 2].save(f"out-{WHICH}-{LAYOUT}-mid.png")
print(out, len(frames), W, H)
