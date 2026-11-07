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
# ロゴは表示の最大（PC画面で約215px）に対して十分な960x720で配る。原画像は logo-source.png に残す
logo = Image.open(icons / 'logo-source.png').convert('RGBA').resize((960, 720), Image.Resampling.LANCZOS)
logo.save(web / 'logo.png', optimize=True)
logo.save(startup / 'logo.png', optimize=True)
shutil.copyfile(web / 'icon.png', startup / 'icon.png')
print('ロゴ・Windows用PNG/ICO・ブラウザ用アイコンを生成しました（切り取りなし）')
