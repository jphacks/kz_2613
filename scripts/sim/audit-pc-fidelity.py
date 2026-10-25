"""CUA撮影の生画像・DOM計測と、変更しない原案から比較画像と矩形差を作る。採点そのものは視認監査で行う。"""
from pathlib import Path
from PIL import Image, ImageChops, ImageStat
from html import escape
import argparse, json

parser=argparse.ArgumentParser()
parser.add_argument('cycle')
parser.add_argument('--references',default='C:/Users/kumes/Downloads/Recooplay素材')
args=parser.parse_args()
evidence=Path(__file__).resolve().parents[2]/'docs/design/evidence'
directory=evidence/args.cycle
refs=json.loads((evidence/'pc-fidelity-reference.json').read_text(encoding='utf8'))
metrics=json.loads((directory/'metrics.json').read_text(encoding='utf8'))
results=[]
for record in metrics:
    name=record['screen'];width=record['width'];ref=refs[name]
    image=Image.open(directory/f'{name}-{width}.jpg').convert('RGB')
    assert image.size==(width,record['height']),f'撮影寸法不一致: {name} {image.size}'
    visible=record['elements']
    assert record['view']==name
    assert record['overflow']==record['viewport'],f'スクロール発生: {name}'
    for b in record['buttons']:
        r=b['rect']
        assert r['x']>=-.5 and r['y']>=-.5 and r['right']<=width+.5 and r['bottom']<=record['height']+.5,(name,b)
    result={'screen':name,'width':width,'capturedAt':record['capturedAt'],'checks':[]}
    if width==1920:
        source=Image.open(Path(args.references)/ref['file']).convert('RGB')
        assert source.size==image.size
        # 一切縮小せず並べる。原案のコピーにマスクや描画を加えない。
        pair=Image.new('RGB',(3840,1080))
        pair.paste(source,(0,0));pair.paste(image,(1920,0));pair.save(directory/f'{name}-comparison.jpg',quality=95,subsampling=0)
        diff=ImageChops.difference(source,image)
        diff.save(directory/f'{name}-difference.png')
        result['wholeImageMeanAbsoluteDifference']=round(sum(ImageStat.Stat(diff).mean)/3,3)
        # 色の許容幅はJPEGの量子化・アンチエイリアスのみ。マスクによる除外は行わない。
        entry=ref['elements']['title'];roi=entry['roi']
        color=tuple(int(entry['colors'][0][i:i+2],16) for i in (1,3,5))
        crop=image.crop(roi);mask=Image.new('1',crop.size)
        mask.putdata([max(abs(p[i]-color[i]) for i in range(3))<22 for p in crop.getdata()])
        box=mask.getbbox()
        if box:
            x,y,x2,y2=box
            rect=[x+roi[0],y+roi[1],x2-x,y2-y]
            target=entry['rect']
            center=[round(rect[i]+rect[i+2]/2-target[i]-target[i+2]/2,2) for i in [0,1]]
            dimensions=[round((rect[i]/target[i]-1)*100,2) for i in [2,3]]
            result['titleInk']={'reference':target,'actual':rect,'centerDelta':center,'sizeDeltaPercent':dimensions}
            result['checks'].append({'element':'見出しの着色画素','pass':all(abs(v)<=24 for v in center) and all(abs(v)<=5 for v in dimensions)})
        else:
            result['checks'].append({'element':'見出しの着色画素','pass':False,'reason':'対応する色の見出しが撮影画像にありません'})
        mapping={'panel':'.game-frame','band':'.role-band','info':'.player-info','characters':'.role-columns' if name=='roles' else '.character','cta':'#nextBtn' if name in ['join','game'] else '#blockedStart' if name=='preparing' else '#readyInstruction','qr':'.qr','rule':'.left-rule'}
        for key,selector in mapping.items():
            elements=[v for v in visible if v['selector']==selector]
            if not elements or key not in ref['elements']:continue
            rs=[v['rect'] for v in elements]
            actual=[min(r['x'] for r in rs),min(r['y'] for r in rs),max(r['right'] for r in rs)-min(r['x'] for r in rs),max(r['bottom'] for r in rs)-min(r['y'] for r in rs)]
            target=ref['elements'][key]['rect']
            center=[round(actual[i]+actual[i+2]/2-target[i]-target[i+2]/2,2) for i in [0,1]]
            dimensions=[round((actual[i]/target[i]-1)*100,2) for i in [2,3]]
            result['checks'].append({'element':key,'reference':target,'actual':[round(v,2) for v in actual],'centerDelta':center,'sizeDeltaPercent':dimensions,'pass':all(abs(v)<=24 for v in center) and all(abs(v)<=5 for v in dimensions)})
    results.append(result)
(directory/'geometry-audit.json').write_text(json.dumps(results,ensure_ascii=False,indent=2),encoding='utf8')
html=['<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>PC原案との比較</title><style>body{font:17px system-ui;margin:24px;background:#fff9ed;color:#333}h1{font-size:28px}img{display:block;max-width:100%;height:auto;border:1px solid #aaa;margin:12px 0}article{margin:32px 0;padding:20px;background:white}a{color:#075c86}details img{background:black}</style><h1>PC原案との原寸比較</h1><p>左：提供原案1920×1080 ／ 右：表示確認用の実装1920×1080。比較画像は縮小・切り取りせず3840×1080で保存。画像を開くと原寸で確認できます。実機の動作証明ではありません。</p>']
names={'join':'参加','game':'ゲーム選択','roles':'分担','preparing':'準備中','ready':'準備可能'}
for name in refs:
    html.append(f'<article><h2>{names[name]}</h2><a href="{name}-comparison.jpg"><img src="{name}-comparison.jpg" alt="{names[name]}の原案と実装"></a><p><a href="{name}-1920.jpg">実装1920×1080</a> ／ <a href="{name}-1280.jpg">実装1280×720</a></p><details><summary>差分画像（マスク・強調なし）</summary><a href="{name}-difference.png"><img src="{name}-difference.png" alt="差分"></a></details></article>')
html.append('<p>原案と現在の文字内容・人数・QR・安全導線の差も全画素の差分に含みます。画素差だけでは採点しません。計測はgeometry-audit.json、書体・文字サイズ・色・矩形はmetrics.json、評価はpc-fidelity-progress.mdをご覧ください。</p></html>')
(directory/'index.html').write_text('\n'.join(html),encoding='utf8')
failures=[{'screen':r['screen'],'element':c['element']} for r in results for c in r['checks'] if not c['pass']]
print(json.dumps({'cycle':args.cycle,'images':len(metrics),'geometryFailures':failures},ensure_ascii=False))
raise SystemExit(1 if failures else 0)
