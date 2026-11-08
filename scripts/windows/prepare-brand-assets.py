"""提供画像から全体・縦横比を保って配布用のサイズとICOを生成する。Pillowは開発時のみ。"""
from pathlib import Path
from PIL import Image
import base64
import shutil

root = Path(__file__).resolve().parents[2]
icons = root / 'apps/desktop/icons'
web = root / 'apps/web-static/assets'
startup = root / 'apps/desktop/ui/assets'
startup.mkdir(exist_ok=True)
source_path = icons / 'icon-source.png'
source = Image.open(source_path).convert('RGBA')
assert source.width == source.height, 'アイコンの原画像は正方形が必要です'
# 自動トレースは輪郭・影を変えるため行わない。SVGには原PNGの全バイトを埋め込む。
# 外部ファイルやネットワークに依存せず、透過・余白・色・解像度を保持する。
encoded = base64.b64encode(source_path.read_bytes()).decode('ascii')
(icons / 'icon.svg').write_text(
    f'<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" '
    f'width="{source.width}" height="{source.height}" viewBox="0 0 {source.width} {source.height}">\n'
    f'  <image width="{source.width}" height="{source.height}" '
    f'xlink:href="data:image/png;base64,{encoded}"/>\n</svg>\n', encoding='utf-8')
for name, size in [('32x32.png', 32), ('128x128.png', 128), ('icon.png', 256)]:
    source.resize((size, size), Image.Resampling.LANCZOS).save(icons / name)
source.save(
    icons / 'icon.ico', sizes=[(s, s) for s in [16, 24, 32, 48, 64, 128, 256]])
source.resize((192, 192), Image.Resampling.LANCZOS).save(web / 'icon.png')
source.resize((180, 180), Image.Resampling.LANCZOS).save(web / 'apple-touch-icon.png')
# ロゴは表示の最大（PC画面で約215px）に対して十分な960x720で配る。原画像は logo-source.png に残す
logo = Image.open(icons / 'logo-source.png').convert('RGBA').resize((960, 720), Image.Resampling.LANCZOS)
logo.save(web / 'logo.png', optimize=True)
logo.save(startup / 'logo.png', optimize=True)
shutil.copyfile(web / 'icon.png', startup / 'icon.png')
print('ロゴ・Windows用PNG/ICO・ブラウザ用アイコン・原PNG埋め込みSVGを生成しました（切り取りなし）')
