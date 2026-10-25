"""原案PNGを変更せず、指定領域内のベタ色から外接矩形を測る。Pillowは開発時だけ使用。"""
from pathlib import Path
from PIL import Image
import json, hashlib, sys

source = Path(sys.argv[1] if len(sys.argv) > 1 else 'C:/Users/kumes/Downloads/Recooplay素材')
out = Path(__file__).resolve().parents[2] / 'docs/design/evidence/pc-fidelity-reference.json'
cyan = (23,193,255)
purple = (204,51,255)
black = (0,0,0)
gray = (217,217,217)
cases = [('join','QRコード、人数表示.png'),('game','選択画面.png'),('roles','分担.png'),('preparing','準備.png'),('ready','準備完了.png')]
data = {}
for key, file in cases:
    im = Image.open(source/file).convert('RGB')
    assert im.size == (1920,1080)
    regions = {
        'title': ((35,130,530,365) if key=='join' else (35,395,530,530) if key in ['preparing','ready'] else (50,210,530,380) if key=='game' else (50,285,530,380), [cyan] if key in ['join','ready'] else [purple] if key=='preparing' else [black]),
    }
    if key=='join':
        regions.update(cta=((100,370,450,490),[cyan]),bubble=((100,520,460,645),[cyan]),qr=((70,645,490,1030),[gray]))
    if key in ['preparing','ready']:
        regions['cta']=((100,565,450,695),[cyan])
    if key in ['join','preparing','ready']:
        regions.update(badges=((600,60,1500,135),[cyan,purple]),info=((600,135,1500,380),[cyan,purple]),characters=((600,420,1500,1080),[gray]))
    if key=='game':
        regions.update(panel=((600,0,1900,1040),[cyan]),rule=((50,380,510,395),[black]),description=((50,440,530,580),[black]),secondary=((50,630,540,740),[black]),cta=((50,760,540,850),[black]))
    if key=='roles':
        regions.update(band=((600,40,1900,310),[black]),characters=((600,390,1900,965),[gray,(134,232,241)]),rule=((50,388,510,405),[black]),description=((50,480,530,570),[black]),secondary=((50,655,530,750),[black]))
    elements = {}
    for name,(roi,colors) in regions.items():
        crop=im.crop(roi)
        mask=Image.new('1',crop.size)
        mask.putdata([p in colors for p in crop.getdata()])
        box=mask.getbbox()
        if box:
            x,y,x2,y2=box
            elements[name]={'rect':[x+roi[0],y+roi[1],x2-x,y2-y],'method':'領域内の指定ベタ色の画素外接矩形','roi':list(roi),'colors':['#%02X%02X%02X'%c for c in colors]}
    data[key]={'file':file,'sha256':hashlib.sha256((source/file).read_bytes()).hexdigest(),'size':list(im.size),'elements':elements}
out.write_text(json.dumps(data,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({k:{n:e['rect'] for n,e in v['elements'].items()} for k,v in data.items()},ensure_ascii=False))
