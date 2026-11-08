"""原PNG・SVG・縮小PNG・ICOの外観保持を照合する（開発用Pillow）。"""
import argparse
import base64
import ctypes
import hashlib
from pathlib import Path
import struct
import xml.etree.ElementTree as ET

from PIL import Image, ImageDraw


root = Path(__file__).resolve().parents[2]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--source', type=Path, help='提供PNGとのバイト一致も検証する')
parser.add_argument('--exe', type=Path, help='Windows EXE内のICOリソースも照合する')
parser.add_argument('--preview', type=Path, help='明暗背景・縮小表示の比較PNGを保存する')
args = parser.parse_args()
icons = root / 'apps/desktop/icons'
original = (icons / 'icon-source.png').read_bytes()
if args.source:
    assert original == args.source.read_bytes(), '提供PNGと原画像が異なります'
source = Image.open(icons / 'icon-source.png').convert('RGBA')
assert source.width == source.height
assert source.getchannel('A').getextrema() == (0, 255), '透過が失われています'

svg = ET.parse(icons / 'icon.svg').getroot()
assert svg.attrib['viewBox'] == f'0 0 {source.width} {source.height}'
embedded = svg.find('{http://www.w3.org/2000/svg}image')
assert embedded.attrib['width'] == str(source.width)
assert embedded.attrib['height'] == str(source.height)
href = embedded.attrib['{http://www.w3.org/1999/xlink}href']
assert href.startswith('data:image/png;base64,')
assert base64.b64decode(href.split(',', 1)[1], validate=True) == original

outputs = {
    'apps/desktop/icons/32x32.png': 32,
    'apps/desktop/icons/128x128.png': 128,
    'apps/desktop/icons/icon.png': 256,
    'apps/web-static/assets/icon.png': 192,
    'apps/web-static/assets/apple-touch-icon.png': 180,
    'apps/desktop/ui/assets/icon.png': 192,
}
for path, size in outputs.items():
    with Image.open(root / path) as actual:
        expected = source.resize((size, size), Image.Resampling.LANCZOS)
        assert actual.mode == 'RGBA' and actual.size == expected.size, path
        assert actual.tobytes() == expected.tobytes(), path

sizes = [16, 24, 32, 48, 64, 128, 256]
ico = Image.open(icons / 'icon.ico')
assert ico.ico.sizes() == {(s, s) for s in sizes}
for size in sizes:
    actual = ico.ico.getimage((size, size)).convert('RGBA')
    expected = source.resize((size, size), Image.Resampling.LANCZOS)
    assert actual.tobytes() == expected.tobytes(), f'ICO {size}px'

if args.exe:
    # ディスク上のPEをデータとして読む。EXEのコードは実行しない。
    kernel = ctypes.WinDLL('kernel32', use_last_error=True)
    kernel.LoadLibraryExW.argtypes = [ctypes.c_wchar_p, ctypes.c_void_p, ctypes.c_uint]
    kernel.LoadLibraryExW.restype = ctypes.c_void_p
    kernel.FindResourceW.argtypes = [ctypes.c_void_p, ctypes.c_void_p, ctypes.c_void_p]
    kernel.FindResourceW.restype = ctypes.c_void_p
    kernel.SizeofResource.argtypes = [ctypes.c_void_p, ctypes.c_void_p]
    kernel.SizeofResource.restype = ctypes.c_uint
    kernel.LoadResource.argtypes = [ctypes.c_void_p, ctypes.c_void_p]
    kernel.LoadResource.restype = ctypes.c_void_p
    kernel.LockResource.argtypes = [ctypes.c_void_p]
    kernel.LockResource.restype = ctypes.c_void_p
    kernel.FreeLibrary.argtypes = [ctypes.c_void_p]
    module = kernel.LoadLibraryExW(str(args.exe.resolve()), None, 2)
    assert module, f'EXEを読めません: {ctypes.get_last_error()}'

    def resource(name, kind):
        ref = kernel.FindResourceW(module, name, kind)
        assert ref, f'リソースがありません: {kind}/{name}'
        length = kernel.SizeofResource(module, ref)
        pointer = kernel.LockResource(kernel.LoadResource(module, ref))
        assert pointer and length
        return ctypes.string_at(pointer, length)

    try:
        # tauri-winresのアプリアイコンのグループIDは32512。
        group = resource(32512, 14)
        count = struct.unpack_from('<H', group, 4)[0]
        assert count == len(sizes)
        data = (icons / 'icon.ico').read_bytes()
        for i in range(count):
            group_entry = struct.unpack_from('<BBBBHHIH', group, 6 + i * 14)
            ico_entry = struct.unpack_from('<BBBBHHII', data, 6 + i * 16)
            # WindowsのリソースコンパイラーはICOのplanes=0を1へ正規化する。
            assert group_entry[:4] == ico_entry[:4] and group_entry[5:7] == ico_entry[5:7], f'EXEアイコンの項目{i}'
            assert group_entry[4] == (ico_entry[4] or 1), f'EXEアイコンのplanes{i}'
            length, offset = ico_entry[6:]
            assert resource(group_entry[7], 3) == data[offset:offset + length], f'EXEアイコンの画像{i}'
    finally:
        kernel.FreeLibrary(module)
    print(f'EXE: {count}サイズのリソースがICOと完全一致')

if args.preview:
    preview = Image.new('RGB', (720, 320), 'white')
    draw = ImageDraw.Draw(preview)
    for row, color in enumerate(['#ffffff', '#202124']):
        y = row * 160
        draw.rectangle((0, y, 719, y + 159), fill=color)
        text_color = '#202124' if row == 0 else '#ffffff'
        x = 12
        for size in sizes:
            label = f'{size}px' if size <= 128 else f'{size}px -> 128px'
            draw.text((x, y + 8), label, fill=text_color)
            display = min(size, 128)
            image = ico.ico.getimage((size, size)).convert('RGBA')
            if size > display:
                image = image.resize((display, display), Image.Resampling.LANCZOS)
            preview.paste(image, (x, y + 28), image)
            x += max(display, 48) + 18
    args.preview.parent.mkdir(parents=True, exist_ok=True)
    preview.save(args.preview)

print(f'原画像: {source.width}x{source.height} RGBA / SHA-256 {hashlib.sha256(original).hexdigest()}')
print('合格: 原PNG埋め込みSVG・PNG 6件・ICO 7サイズ（原画像からの縮小と全画素一致）')
