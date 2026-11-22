"""README先頭の紹介動画のサムネイルを、表示に合った大きさのWebPにする。

元の assets/images/recooplay-thumbnail.png（利用者が用意した1920×1080のPNG、約880KB）はそのまま残す。
READMEでは本文欄の幅（最大838px）で表示するので、その2倍の幅1676pxのWebPにする（約140KB）。

    python scripts/readme/thumbnail.py
"""
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "assets" / "images" / "recooplay-thumbnail.png"
OUT = SRC.with_suffix(".webp")
WIDTH = 838 * 2

im = Image.open(SRC).convert("RGB")
im = im.resize((WIDTH, round(WIDTH * im.height / im.width)), Image.LANCZOS)
im.save(OUT, "WEBP", quality=86, method=6)
print(f"wrote {OUT.relative_to(ROOT)} ({OUT.stat().st_size // 1024}KB)")
