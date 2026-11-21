"""READMEの図（showcase.py）のスマホ画面に埋め込む、画面だけの録画を作る。

python screens.py <録画のあるフォルダ>
- role-p1.mp4 / role-p2.mp4 / role-p3.mp4（rec_role.mjs で録った協力プレイ中の担当画面）→ role-p1-move.webp など
- rec-b-phone.mp4（rec_b.mjs で録ったP1のリモコン）→ remote-screen.webp
枠・文字は足さない。指の位置の円だけ重ねる（視点パッドは画面自体が指の位置に丸を出すので重ねない）。
最初のコマは触る前の画面にして、少し長く止める。図の中の録画を動かさない環境ではこのコマが出る。
"""
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image

sys.argv = [sys.argv[0], "a", "screen"] + sys.argv[1:]  # compose.py の部品を使う
import compose  # noqa: E402
from compose import FPS, K, draw_touch, encode, read_frames, touches  # noqa: E402

SRC = Path(sys.argv[3]) if len(sys.argv) > 3 else Path(".")
OUT = Path(__file__).resolve().parents[3] / "assets" / "readme" / "recordings"
W = 340


def first_change(video, crop, size, limit=12.0):
    """録画の最初のコマから見た目が変わる時刻（秒）。最初の指の操作で変わる。"""
    times = [i / 30 for i in range(int(limit * 30))]
    fr = read_frames(video, times, crop, size)
    base = fr[0].astype(int)
    for t, f in zip(times, fr):
        if np.abs(f.astype(int) - base).max(axis=2).mean() > 1.5:
            return t
    raise SystemExit(f"変化が見つからない：{video}")


def clip(video, log, top, height, t_from, t_to, circle=True, out=None, hold=(1.0, 0.8)):
    """video の t_from〜t_to 秒を、幅 W の画面だけの録画にする。log の時刻は録画の秒に直したもの。"""
    crop = f"1080:{height}:0:{top}"
    h = round(W * height / 1080)
    times = [t_from + k / FPS for k in range(int((t_to - t_from) * FPS))]
    shots = read_frames(video, times, crop, (W, h))
    frames = []
    for t, a in zip(times, shots):
        im = Image.fromarray(a).convert("RGBA")
        if circle:
            pos, alpha = touches(log, t * 1000)
            im = draw_touch(im, pos, alpha, W / 384)
        frames.append(im)
    durs = [1 / FPS] * len(frames)
    durs[0], durs[-1] = hold
    compose.LAYOUT = "screen"  # 背景を透明にしない
    encode(frames, str(out), durs)
    print(out.name, len(frames), W, h, out.stat().st_size)


def role(name, out, circle=True):
    meta = json.loads((SRC / f"{name}.json").read_text())
    top = round(meta["oy"] * K)
    height = round(meta["innerHeight"] * K)
    video = str(SRC / f"{name}.mp4")
    log = meta["log"]
    first = [e for e in log if e[0] == "d"][0][1]
    t_touch = first_change(video, f"1080:{height}:0:{top}", (54, round(54 * height / 1080))) - 0.05
    # ページの時刻（ms）を録画の時刻（ms）に直す
    vlog = [[k, (t - first) + t_touch * 1000, x, y] for k, t, x, y, *_ in log]
    last_up = max(t for k, t, *_ in vlog if k == "u") / 1000
    clip(video, vlog, top, height, max(0, t_touch - 0.7), last_up + 0.6, circle, OUT / out)


def remote():
    """P1のリモコン（rec_b の録画）。ゲームを選んでから「ゲームを起動する」を押すまで。"""
    sync = json.loads((SRC / "rec-b-sync.json").read_text())
    data = json.loads((SRC / "rec-b-marks.json").read_text())
    first = sync["log_first_down"]
    vlog = [[k, (t - first) + sync["phone_hl"] * 1000, x, y] for k, t, x, y, *_ in data["log"]]
    marks = dict(data["marks"])
    # 「ゲームを起動する」のタップ（4回目の左クリック）の後まで
    taps = [t for k, t, x, y in vlog if k == "u" and abs(x - 104) < 80 and abs(y - 322) < 26]
    end = (taps[3] / 1000 + 0.7) if len(taps) >= 4 else sync["phone_hl"] + (marks["click-launch"] - marks["start"]) / 1000
    clip(str(SRC / "rec-b-phone.mp4"), vlog, 286, 1972, max(0, sync["phone_hl"] - 0.8), end, True, OUT / "remote-screen.webp")


if __name__ == "__main__":
    role("role-p1", "role-p1-move.webp")
    role("role-p2", "role-p2-look.webp", circle=False)
    role("role-p3", "role-p3-action.webp")
    remote()
