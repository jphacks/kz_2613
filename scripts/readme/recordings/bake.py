"""READMEの図（SVG）に埋め込んだ実画面の録画を、図ごと1本のアニメーションWebPに焼き込む。

python bake.py [図の名前 ...]   （既定：controllers focus）

SVGの中に動く画像を入れると、ブラウザは画像が1コマ進むたびにSVG全体を描き直すため、
録画が複数あると重くなって止まって見える。図をラスタの1本のアニメーションにすれば、変わる所（スマホの画面）だけを描き直す。

1. SVG（showcase.py の出力。録画は最初のコマ＝触る前の画面を静止画で入れ、data-recording で録画の名前を示す）を、ヘッドレスChromeで2倍の解像度・透明の背景で撮る
2. スマホの画面の位置（<image> と角丸の clipPath）に、各録画のコマを重ねる（カメラの穴は覆わない）。録画はすべて同時に始め、短いものは最後のコマ（触っていない画面）で待つ
3. Pillow（libwebp の WebPAnimEncoder）でアニメーションWebPにする。続けて同じコマはまとめ、
   コマの間で変わった矩形だけを書く（minimize_size）。品質80は、以前の ffmpeg（libwebp_anim・品質90）より
   文字も録画も元の画像に近く（PSNRで0.5〜1.4dB上）、ファイルは21〜24%小さい（2026-11-21 の比較）。
   ffmpeg は RGB→YUV の変換を libwebp に任せず自前で行うため、同じ品質値でも劣化が大きかった
必要なもの：Chrome、Pillow（WebPのアニメーション対応）、numpy。出力は assets/readme/<図>-<版>.webp
"""
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time
import urllib.request
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageSequence

ROOT = Path(__file__).resolve().parents[3]
ART = ROOT / "assets" / "readme"
REC = ART / "recordings"
VARIANTS = ["light", "dark", "narrow-light", "narrow-dark"]
SCALE = 2
FPS = 12
QUALITY = 80
CHROME = os.environ.get("CHROME", r"C:\Program Files\Google\Chrome\Application\chrome.exe")
PORT = 9447


def load_clip(path):
    """録画のコマ（RGBA）と、各コマの終わりの時刻（秒）。"""
    im = Image.open(path)
    frames, ends, t = [], [], 0.0
    for f in ImageSequence.Iterator(im):
        frames.append(f.convert("RGBA"))
        t += (f.info.get("duration") or 1000 / FPS) / 1000
        ends.append(t)
    return frames, ends


def frame_at(clip, t):
    frames, ends = clip
    if t >= ends[-1]:
        return frames[-1]
    i = int(np.searchsorted(ends, t, side="right"))
    return frames[min(i, len(frames) - 1)]


def cdp_shot():
    """撮影に使う node の CDP スクリプト（Python に WebSocket の依存を足さない）。"""
    js = r"""
const [port, url, w, h, out] = process.argv.slice(2);
const t = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })).json();
const ws = new WebSocket(t.webSocketDebuggerUrl); await new Promise(r => ws.onopen = r);
let id = 0; const m = new Map(); ws.onmessage = e => { const d = JSON.parse(e.data); if (m.has(d.id)) { m.get(d.id)(d.result); m.delete(d.id); } };
const call = (method, params = {}) => new Promise(r => { const i = ++id; m.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
await call('Emulation.setDeviceMetricsOverride', { width: +w, height: +h, deviceScaleFactor: 2, mobile: false });
await call('Emulation.setDefaultBackgroundColorOverride', { color: { r: 0, g: 0, b: 0, a: 0 } });
await call('Page.navigate', { url }); await new Promise(r => setTimeout(r, 2500));
const s = await call('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width: +w, height: +h, scale: 1 } });
(await import('node:fs')).writeFileSync(out, Buffer.from(s.data, 'base64'));
await fetch(`http://127.0.0.1:${port}/json/close/${t.id}`); process.exit(0);
"""
    return js


def bake(name, variant, chrome_js, work):
    svg_path = ART / f"{name}-{variant}.svg"
    svg = svg_path.read_text(encoding="utf-8")
    W = float(re.search(r'<svg[^>]*\bwidth="([\d.]+)"', svg).group(1))
    H = float(re.search(r'<svg[^>]*\bheight="([\d.]+)"', svg).group(1))
    # 図の中の録画と、その位置・角丸（clipPath）。g の translate（finish の上の余白）も足す
    off = re.search(r'<g transform="translate\(0 ([\d.]+)\)">', svg)
    oy = float(off.group(1)) if off else 0.0
    spots = []
    pat = (r'<image clip-path="url\(#(\w+)\)" x="([\d.]+)" y="([\d.]+)" width="([\d.]+)" height="([\d.]+)" '
           r'data-recording="([^"]+)" [^>]*/><circle cx="([\d.]+)" cy="([\d.]+)" r="([\d.]+)"')
    for m in re.finditer(pat, svg):
        cid, x, y, w, h, rec, ccx, ccy, cr = m.groups()
        rx = float(re.search(rf'<clipPath id="{cid}"><rect [^>]*rx="([\d.]+)"', svg).group(1))
        spots.append(dict(x=float(x), y=float(y) + oy, w=float(w), h=float(h), rx=rx, clip=load_clip(REC / rec),
                          cam=(float(ccx) - float(x), float(ccy) - float(y), float(cr))))
    if not spots:
        raise SystemExit(f"録画が入っていない：{svg_path.name}")
    # SVG（録画の最初のコマを静止画で入れた版）をそのまま撮る
    (work / "static.svg").write_text(svg, encoding="utf-8")
    (work / "page.html").write_text(f'<!doctype html><html><body style="margin:0;background:transparent"><img src="static.svg" width="{W}" height="{H}" style="display:block"></body></html>', encoding="utf-8")
    base_png = work / "base.png"
    subprocess.run(["node", str(chrome_js), str(PORT), (work / "page.html").as_uri(), str(int(round(W))), str(int(round(H))), str(base_png)], check=True)
    base = Image.open(base_png).convert("RGBA")
    # 角丸のマスク（2倍）
    for s in spots:
        bw, bh = round(s["w"] * SCALE), round(s["h"] * SCALE)
        mask = Image.new("L", (bw * 4, bh * 4), 0)
        d = ImageDraw.Draw(mask)
        d.rounded_rectangle((0, 0, bw * 4 - 1, bh * 4 - 1), s["rx"] * SCALE * 4, fill=255)
        cx, cy, cr = (v * SCALE * 4 for v in s["cam"])  # 画面の上のカメラの穴は、録画で覆わない
        d.ellipse((cx - cr, cy - cr, cx + cr, cy + cr), fill=0)
        s["mask"] = mask.resize((bw, bh), Image.LANCZOS)
        s["box"] = (round(s["x"] * SCALE), round(s["y"] * SCALE), bw, bh)
    T = max(s["clip"][1][-1] for s in spots)
    n = int(round(T * FPS))
    entries, last_key = [], None
    for k in range(n):
        t = k / FPS
        key = tuple(id(frame_at(s["clip"], t)) for s in spots)
        if key == last_key:
            entries[-1][1] += 1 / FPS
            continue
        img = base.copy()
        for s in spots:
            x, y, bw, bh = s["box"]
            f = frame_at(s["clip"], t).resize((bw, bh), Image.LANCZOS)
            img.paste(f, (x, y), s["mask"])
        entries.append([img, 1 / FPS])
        last_key = key
    entries[-1][1] += 0.6  # 最後（全員が触っていない画面）で少し止める
    # コマの長さはミリ秒の整数。端数を次のコマへ繰り越し、全体の長さをずらさない
    durations, acc = [], 0.0
    for _, d in entries:
        acc += d * 1000
        durations.append(round(acc) - sum(durations))
    out = ART / f"{name}-{variant}.webp"
    frames = [e[0] for e in entries]
    frames[0].save(out, save_all=True, append_images=frames[1:], duration=durations, loop=0,
                   lossless=False, quality=QUALITY, method=6, minimize_size=True)
    print(f"{out.name}: {len(entries)}コマ {T:.1f}秒 {base.width}x{base.height} {out.stat().st_size // 1024}KB")


def main():
    names = sys.argv[1:] or ["controllers", "focus"]
    work = Path(tempfile.mkdtemp(prefix="bake-"))
    chrome_js = work / "shot.mjs"
    chrome_js.write_text(cdp_shot(), encoding="utf-8")
    proc = subprocess.Popen([CHROME, "--headless=new", f"--remote-debugging-port={PORT}", f"--user-data-dir={work / 'profile'}",
                             "--allow-file-access-from-files", "--hide-scrollbars", "about:blank"],
                            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        for _ in range(50):
            try:
                urllib.request.urlopen(f"http://127.0.0.1:{PORT}/json/version").read()
                break
            except Exception:
                time.sleep(0.2)
        for name in names:
            for v in VARIANTS:
                bake(name, v, chrome_js, work)
    finally:
        proc.kill()
        time.sleep(0.5)
        shutil.rmtree(work, ignore_errors=True)


if __name__ == "__main__":
    main()
