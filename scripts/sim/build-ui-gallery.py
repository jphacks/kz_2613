"""保存済みの撮影証拠から日本語の比較ギャラリーを作る。画像の加工はしない。"""
from pathlib import Path
import hashlib
import html
import json

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "artifacts/improved-ui"
metrics = json.loads((OUT / "final/metrics.json").read_text(encoding="utf-8"))
pc_labels = {"join": "参加・接続", "game": "ゲーム選択", "roles": "分担確認", "preparing": "準備中", "ready": "Ready待ち", "coop": "協力プレイ", "paused": "一時停止", "target": "入力先が前面でない", "emergency": "緊急停止", "settings": "操作設定", "connection": "接続方法"}
phone_labels = {"host": "ホスト操作", "host-preparing": "ホストの準備・明示Ready", "host-paused": "ホストの停止・再開", "wait-p2": "P2接続・待機", "wait-p3": "P3準備待機", "paused-p2": "P2一時停止", "move": "P1移動", "look": "P2視点", "action": "P3アクション", "generated-p1": "操作定義によるP1", "generated-p2": "操作定義によるP2", "generated-p3": "操作定義によるP3", "connecting": "接続前", "full": "満員", "version": "版不一致", "token": "参加情報の不一致", "rotate": "横向きで入力停止", "diagnostics": "接続・診断"}

def figure(src, caption):
    return f'<figure><a href="{html.escape(src)}"><img loading="lazy" src="{html.escape(src)}" alt="{html.escape(caption)}"></a><figcaption>{html.escape(caption)}</figcaption></figure>'

parts = ['<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>改良後UIの原案・実装比較</title>', '<style>body{margin:0 auto;padding:24px;max-width:1600px;font-family:system-ui;color:#252525;background:#fffdf6}h1{font-size:28px}p{line-height:1.7}nav{display:flex;gap:16px;flex-wrap:wrap}section{margin:32px 0}summary{cursor:pointer;font-weight:bold;padding:16px;background:#e9faff;border:1px solid #17c1ff;border-radius:12px}figure{margin:0;min-width:0}img{display:block;width:100%;height:auto;border:1px solid #ddd}figcaption{padding:8px;font-size:14px}.pair{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin:16px 0}.phones{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:20px;margin:16px 0}.phones img{max-height:580px;object-fit:contain;background:#f4f4f4}a{color:#075c86}@media(max-width:800px){.pair{grid-template-columns:1fr}body{padding:16px}}</style>', '<h1>改良後UIの原案・実装比較</h1><p>PC・スマホの最終104画面。クリックすると原寸画像を開きます。撮影は表示専用の模擬状態で、実機・Minecraft・Rustとの画面連携の新規合格を示すものではありません。接続前だけ通信スクリプトを省いた初期DOMを撮影しました。</p><nav><a href="#compare">原案との対応</a><a href="#pc">全PC画面</a><a href="#phone">全スマホ画面</a><a href="final/metrics.json">実測JSON</a><a href="README.md">監査結果</a></nav>', '<section id="compare"><h2>原案との対応</h2><p>4人表示は現行仕様の3人表示に置換。Readyはホストだけが明示実行します。キャラクターの色は担当に追従し、必要な安全案内は残しています。正式フォント・編集元がないため、文字形の完全一致は未確認です。</p>']
for key in ["join", "game", "roles", "preparing", "ready"]:
    parts.append(f'<h3>{pc_labels[key]}</h3><div class="pair">' + figure(f"reference/pc-{key}.png", "改良後原案 1920×1080") + figure(f"final/pc-1920-{key}.jpg", "実装 1920×1080") + '</div>')
parts.append('<h3>スマホ接続画面</h3><p>待機ボタン・担当表示の状態差を含む2原案と実装。原案の自由配置編集を追加せず、ホストのReady後に自動で担当操作へ進みます。</p><div class="phones">' + figure('reference/phone-wait.png', '原案：ホスト待ち') + figure('reference/phone-connected.png', '原案：担当決定後') + figure('final/phone-402x874-wait-p2.jpg', '実装：P2・視点の担当待機') + '</div></section><section id="pc"><h2>全PC画面</h2>')
for width in [1920, 1280]:
    parts.append(f'<details><summary>{width}×{1080 if width == 1920 else 720}・11画面</summary>')
    for key, label in pc_labels.items():
        parts.append(figure(f"final/pc-{width}-{key}.jpg", label))
    parts.append('</details>')
parts.append('</section><section id="phone"><h2>全スマホ画面</h2>')
for size in ["320x568", "360x640", "360x780", "390x844", "402x874", "430x932", "874x402"]:
    group = [m for m in metrics if m["name"].startswith(f"phone-{size}-")]
    parts.append(f'<details><summary>{size.replace("x", "×")}・{len(group)}画面</summary><div class="phones">')
    for m in group:
        key = m["name"].removeprefix(f"phone-{size}-")
        parts.append(figure(f'final/{m["name"]}.jpg', phone_labels[key]))
    parts.append('</div></details>')
parts.append('</section></html>')
(OUT / "index.html").write_text("\n".join(parts), encoding="utf-8")

fingerprints = []
for file in sorted((ROOT / "apps/web-static").rglob("*")):
    if file.is_file() and file.suffix in {".html", ".js", ".css", ".png"}:
        fingerprints.append({"path": file.relative_to(ROOT).as_posix(), "sha256": hashlib.sha256(file.read_bytes()).hexdigest()})
(OUT / "source-fingerprints.json").write_text(json.dumps(fingerprints, ensure_ascii=False, indent=2), encoding="utf-8")
print(f"比較ギャラリーを生成: {len(metrics)}画面、参照PNG7点、製品ファイル{len(fingerprints)}点の指紋")
