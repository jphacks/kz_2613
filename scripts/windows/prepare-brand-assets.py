"""提供画像から全体・縦横比を保って配布用のサイズとICOを生成する。Pillowは開発時のみ。"""
from pathlib import Path
from PIL import Image
import shutil

root = Path(__file__).resolve().parents[2]
icons = root / 'apps/desktop/icons'
web = root / 'apps/web-static/assets'
startup = root / 'apps/desktop/ui/assets'
startup.mkdir(exist_ok=True)
source = Image.open(icons / 'icon-source.png').convert('RGBA')
assert source.width == source.height, 'アイコンの原画像は正方形が必要です'
for name, size in [('32x32.png', 32), ('128x128.png', 128), ('icon.png', 256)]:
    source.resize((size, size), Image.Resampling.LANCZOS).save(icons / name)
source.resize((256, 256), Image.Resampling.LANCZOS).save(
    icons / 'icon.ico', sizes=[(s, s) for s in [16, 24, 32, 48, 64, 128, 256]])
source.resize((192, 192), Image.Resampling.LANCZOS).save(web / 'icon.png')
source.resize((180, 180), Image.Resampling.LANCZOS).save(web / 'apple-touch-icon.png')
shutil.copyfile(web / 'logo.png', startup / 'logo.png')
shutil.copyfile(web / 'icon.png', startup / 'icon.png')
print('ロゴ・Windows用PNG/ICO・ブラウザ用アイコンを生成しました（切り取りなし）')
