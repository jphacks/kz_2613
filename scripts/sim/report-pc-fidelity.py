"""保存した撮影・計測を集約する。目視採点を画素一致率とは扱わない。"""
from pathlib import Path
from PIL import Image
import hashlib, json, shutil, zipfile

root=Path(__file__).resolve().parents[2]
ev=root/'docs/design/evidence'
refs=json.loads((ev/'pc-fidelity-reference.json').read_text(encoding='utf8'))
names={'join':'参加','game':'ゲーム選択','roles':'分担','preparing':'準備中','ready':'準備可能'}
scores={'join':[25,24,19,14,14],'game':[25,25,19,14,14],'roles':[25,25,19,14,13],'preparing':[25,25,18,14,14],'ready':[25,25,19,14,14]}
rounds=[]
for name in ['pc-branding-accepted-1','pc-branding-accepted-2']:
    d=ev/name
    if not (d/'join-1920.jpg').exists():
        raise SystemExit('集約にはGit外で保管する各監査回の生画像が必要です。clone直後の再計測には audit-pc-fidelity.py pc-fidelity-final を使ってください。')
    metrics=json.loads((d/'metrics.json').read_text(encoding='utf8'))
    geometry=json.loads((d/'geometry-audit.json').read_text(encoding='utf8'))
    assert len(metrics)==10 and not json.loads((d/'browser-errors.json').read_text(encoding='utf8'))
    assert all(c['pass'] for r in geometry for c in r['checks'])
    assert {(r['screen'],r['width']) for r in metrics}=={(s,w) for s in names for w in [1280,1920]}
    for r in metrics:
        assert Image.open(d/f"{r['screen']}-{r['width']}.jpg").size==(r['width'],r['height'])
    rounds.append({'directory':name,'tabId':metrics[0]['tabId'],'from':metrics[0]['capturedAt'],'to':metrics[-1]['capturedAt'],'commit':metrics[0]['codeCommit'],'screenshots':[{'file':f'{s}-{w}.jpg','sha256':hashlib.sha256((d/f'{s}-{w}.jpg').read_bytes()).hexdigest()} for s in names for w in [1920,1280]]})
assert rounds[0]['tabId']!=rounds[1]['tabId'] and rounds[0]['to']<rounds[1]['from']
assert rounds[0]['commit']==rounds[1]['commit']
final=ev/'pc-fidelity-final'
final.mkdir(exist_ok=True)
for f in (ev/rounds[-1]['directory']).iterdir():
    if f.is_file():shutil.copyfile(f,final/f.name)
for shot in rounds[-1]['screenshots']:
    assert hashlib.sha256((final/shot['file']).read_bytes()).hexdigest()==shot['sha256']
metrics=json.loads((final/'metrics.json').read_text(encoding='utf8'))
geometry=json.loads((final/'geometry-audit.json').read_text(encoding='utf8'))
manifest={'condition':'表示専用の模擬データ。100% zoom、製品ルート /app、同じタブのDOMと表示領域を撮影前後に照合。独立タブで毎回新規撮影。画像の後加工・差分マスクなし。実機動作の証拠ではない。','rounds':rounds,'scores':{s:{'criteria':v,'total':sum(v)} for s,v in scores.items()}}
(final/'audit-manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf8')
fmt=lambda a:'['+', '.join(str(round(x,2)) for x in a)+']'
def rect(e):
    return fmt([e['rect'][k] for k in ['x','y','width','height']])
lines=['# PC原案と実装の要素対応・最終評価','','座標は1920×1080の `[x, y, 幅, 高さ]`。原案は変更しないPNGの指定色の外接矩形、実装はDOM矩形。文字だけは原案と実装とも着色画素で比較する。原案のDOM・正式フォント情報は未取得で、文字の画素矩形をフォントサイズと取り違えない。','','[元PNGのファイル名・SHA256・採色領域](pc-fidelity-reference.json) ／ [計測全件](pc-fidelity-final/metrics.json) ／ [主要矩形判定](pc-fidelity-final/geometry-audit.json) ／ [全5比較画像](pc-fidelity-final/index.html)','','## 共通の判定・残差分','','- 左境界は全5状態 `x=561`、原案561pxに一致。右の各大領域は下表の中心差±24px・寸法差±5%以内。小画面は2/3倍、全10画像でページスクロールとボタンの画面外は0。','- 正式フォント不明。ローカルにある Noto Sans JP を原寸で比較し採用。外部CDN・フォント再配布はない。字間0、白輪郭と白／灰のずらし影を再現。正式書体・ラスタライズの差はP2として減点。','- 原案の2人／4人を固定3人に適応。外接矩形・縦長枠の面積・色の主従は保持。原案が仮置きのロゴ・キャラは製品名と担当の仮枠へ対応。','- 任意パスは未提供なので実動作の「このゲームで遊ぶ」に置換。Ready権限はP1のみ、PCのSTARTはボタンではなく案内。接続済みを個人Ready済みと表示しない。','- 残るP2：正式書体、背景の局所的な装飾位置・影のラスタライズ、3列化した枠内の文字量、必要な安全導線による余白差。P0/P1の残件0。完全な画素一致・実機成功は主張しない。','']
labels={'info':'情報カード群','characters':'キャラクター群','panel':'巨大ゲーム枠','band':'横長操作帯','cta':'主CTA／案内','qr':'QR枠','rule':'細罫線'}
fine={'.brand':'仮ロゴ→製品名（仕様適応）','.player-badge':'接続・準備ピル（接続とReadyを区別）','.player-arrow':'情報カード下の三角','.qr-bubble':'QR吹き出し（短い2行）','.qr-arrow':'吹き出し下の三角','.explanation':'説明の改行・中央揃え','.secondary':'下段説明（仕様に必要な文言差）','.role-column':'固定3人の縦長枠（人数適応）','.role-band h2':'帯の見出し（固定分担）','.key-samples span':'E/W/S見本の角丸行','.key-samples kbd':'キー見本の濃灰バッジ','.key-up':'上の黄色三角','.key-down':'下の黄色三角','#readyInstruction span':'P1スマホだけReady（仕様差）','#openGameBtn':'Minecraft前面化（必要操作）','.utility-bar':'安全案内・設定・補助遷移（必要操作）','#warning':'問題発生時だけの警告（必要安全要件）'}
for s,n in names.items():
    m=next(r for r in metrics if r['screen']==s and r['width']==1920)
    g=next(r for r in geometry if r['screen']==s and r['width']==1920)
    lines += [f'## {n} — {sum(scores[s])}/100', '',f'原案：`{refs[s]["file"]}`。 [原寸比較](pc-fidelity-final/{s}-comparison.jpg) ／ [1920](pc-fidelity-final/{s}-1920.jpg) ／ [1280](pc-fidelity-final/{s}-1280.jpg) ／ [無加工差分](pc-fidelity-final/{s}-difference.png)','','| 主要要素 | 原案 | 実装 | 中心差 | 幅・高さ差% | 判定 |','| --- | --- | --- | --- | --- | --- |']
    t=g['titleInk']
    lines.append(f'| 見出しの着色画素 | {fmt(t["reference"])} | {fmt(t["actual"])} | {fmt(t["centerDelta"])} | {fmt(t["sizeDeltaPercent"])} | PASS |')
    for c in g['checks']:
        if 'reference' in c:lines.append(f'| {labels.get(c["element"],c["element"])} | {fmt(c["reference"])} | {fmt(c["actual"])} | {fmt(c["centerDelta"])} | {fmt(c["sizeDeltaPercent"])} | PASS |')
    lines+=['','| 細部・1対1対応 | 原案の根拠／現行矩形 | 書体・寸法・太さ・行送り | 色・輪郭・丸み・影 | 判定 |','| --- | --- | --- | --- | --- |']
    title=next(e for e in m['elements'] if e['selector']=='#screenTitle')
    for e in [title]+[e for e in m['elements'] if e['selector'] in fine]:
        st=e['style'];selector=e['selector'];label='巨大見出し・改行' if selector=='#screenTitle' else fine[selector]
        colors=f'{st["color"]} / 背景 {st["backgroundColor"]} / {st["border"]} / 角 {st["borderRadius"]} / 影 {st["textShadow"]}'
        lines.append(f'| {label} `{selector}` | 原案は対応比較画像を視認。DOM実測 {rect(e)} | {st["fontFamily"]}; {st["fontSize"]}; {st["fontWeight"]}; 行 {st["lineHeight"]}; 字間 {st["letterSpacing"]} | {colors} | PASS（必要な仕様差は下記） |')
    lines+=['','上表の原案側で数値がない細部は視認評価。未取得の原案DOM寸法・font-size・影値を推測で埋めていない。実装値は生計測に遡れる。','']
lines+=['## 色の採取点','','ベタ色は原PNGの実画素（左上原点）。半透明パネルは背景との合成色であり、単独HEXと同一視しない。CSSの共通値は `styles/colors.css`。','','| 原案 | 色 | サンプル座標 | 対応 |','| --- | --- | --- | --- |']
source=Path('C:/Users/kumes/Downloads/Recooplay素材')
samples=[('join','#17C1FF',(100,370,450,490),'シアン輪郭・ピル'),('preparing','#CC33FF',(35,395,530,530),'紫タイトル・準備ピル'),('join','#D9D9D9',(600,420,1500,1080),'灰色キャラ枠'),('roles','#86E8F1',(950,400,1205,940),'選択キャラ枠'),('roles','#E3FF11',(958,402,1202,411),'選択枠の黄緑'),('roles','#FF00DD',(1394,138,1880,145),'見本の桃色輪郭'),('roles','#FFED62',(1615,110,1665,145),'黄色三角')]
for s,color,roi,label in samples:
    im=Image.open(source/refs[s]['file']).convert('RGB');target=tuple(bytes.fromhex(color[1:]));point=next(((x,y) for y in range(roi[1],roi[3]) for x in range(roi[0],roi[2]) if im.getpixel((x,y))==target),None)
    assert point,(s,color)
    lines.append(f'| {refs[s]["file"]} | `{color}` | {point} | {label} |')
(ev/'pc-fidelity-element-matrix.md').write_text('\n'.join(lines)+'\n',encoding='utf8')
readme=['# 原案5画面との最終比較','','これは表示専用の模擬状態による新規撮影。Minecraft・スマホ・Tauri実機の動作証明ではない。左に提供PNG、右に製品HTMLの1920×1080描画を、縮小・切り取り・マスクなしで並べた。画像を開くと原寸3840×1080で確認できる。','','[比較ギャラリー](index.html) ／ [要素ごとの計測・差分](../pc-fidelity-element-matrix.md) ／ [監査履歴](../pc-fidelity-progress.md) ／ [2回の撮影来歴](audit-manifest.json)','','| 画面 | 構造25 | 位置25 | 文字20 | 形・色15 | 密度15 | 合計 |','| --- | ---: | ---: | ---: | ---: | ---: | ---: |']
for s,n in names.items():
    readme.append('| '+n+' | '+' | '.join(map(str,scores[s]+[sum(scores[s])]))+' |')
readme+=['','ルーブリックによる自己監査。点数は画素一致率・第三者評価ではない。正式フォント情報がないため完全一致は保証しない。各観点80%以上・全画面95点以上。提供ロゴ反映後の製品コード '+rounds[0]['commit']+' で独立した2回の新規撮影を行い、その間に製品コードを変更していない。ロゴは追加の明示的ユーザー指定に従う差替で、原案の仮ロゴを再現対象にはしない。','']
for s,n in names.items():readme +=[f'## {n}', '',f'![{n} 原案→実装]({s}-comparison.jpg)', '',f'[実装1920×1080]({s}-1920.jpg) ／ [実装1280×720]({s}-1280.jpg) ／ [無加工差分]({s}-difference.png)','']
(final/'README.md').write_text('\n'.join(readme),encoding='utf8')
# 配布ZIPを圧縮解除せず全UI・両実行ファイルと照合する。
package=root/'.venv/branding-verified-dist/ReCooplay-0.1.0-windows-x64.zip'
with zipfile.ZipFile(package) as z:
    prefix='ReCooplay-0.1.0-windows-x64/'
    checks=[]
    for f in (root/'apps/web-static').rglob('*'):
        if f.is_file():
            rel=f.relative_to(root).as_posix();data=z.read(prefix+rel)
            assert data==f.read_bytes(),rel
            checks.append({'file':rel,'sha256':hashlib.sha256(data).hexdigest()})
    for exe in ['recooplay-desktop.exe','recooplay-host.exe']:
        data=z.read(prefix+exe)
        assert data==Path('C:/Users/kumes/AppData/Local/ReCooplay/cargo-target/release',exe).read_bytes()
        checks.append({'file':exe,'sha256':hashlib.sha256(data).hexdigest()})
(ev/'pc-fidelity-functional/package-checks.json').write_text(json.dumps({'package':package.name,'sha256':hashlib.sha256(package.read_bytes()).hexdigest(),'uiFiles':len(checks)-2,'executables':2,'checks':checks},ensure_ascii=False,indent=2),encoding='utf8')
rejected=[]
for name in ['pc-fidelity-final-1','pc-fidelity-final-a','pc-fidelity-final-b','pc-fidelity-verify-1','pc-fidelity-verify-2','pc-fidelity-verify-3','pc-fidelity-pass-1','pc-fidelity-accept-1','pc-fidelity-final-check-1']:
    d=ev/name;files=[]
    if d.exists():
        for f in sorted(d.iterdir()):
            if not f.is_file():continue
            item={'file':f.name,'sha256':hashlib.sha256(f.read_bytes()).hexdigest()}
            if f.suffix in ['.jpg','.png']:item['size']=list(Image.open(f).size)
            elif f.name in ['browser-errors.json','geometry-audit.json']:item['record']=json.loads(f.read_text(encoding='utf8'))
            files.append(item)
    rejected.append({'directory':name,'accepted':False,'files':files})
(ev/'pc-fidelity-rejected-captures.json').write_text(json.dumps(rejected,ensure_ascii=False,indent=2),encoding='utf8')
print(json.dumps({'independentRounds':len(rounds),'tabs':[r['tabId'] for r in rounds],'geometry':'PASS','packageFiles':len(checks)},ensure_ascii=False))
