# README用の図版

[公開素材一覧](../README.md) ／ [製品README](../../README.md)

製品READMEで使う図版です。デザインの狙いと判断の理由は [READMEのデザイン](../../docs/readme-design.md) にあります。4色のスマホ型キャラクター（P1青・P2緑・P3紫・P4赤）は、アプリの [キャラクター画像](../../apps/web/public/assets/characters/) をもとにSVGで描き直しています。

| ファイル | 内容 |
|:--|:--|
| `title-*.svg` | 作品名の見出し（h1）。最初はふつうの見出しに見え、少したつとキャラクターが文字の「。」と「:」で遊ぶアニメーション。文字はGitHub本体と同じフォント指定と大きさで描く（`python scripts/readme/title.py`）。GitHubは幅768px以上で横に欄を出して本文欄が狭くなるため、見出しが小さく縮まないよう、この画像だけは画面の幅1100px以下でスマホ用（`-narrow-`）に切り替える |
| `split-*.svg` | 3台のスマホが1人のキャラクターを分けて操作するアニメーション（今のREADMEでは使っていない） |
| `video-cta-*.svg` | 紹介動画のサムネイルの下に置く、YouTubeへの誘導 |
| `awards-*.svg` | 受賞結果。見出しは目次と同じ形で、カードは金沢と東京を結ぶ路線図（PCは横、スマホは縦）。約3.5秒たつと見出しの青・緑・紫の点がチームの3体になり、Hack Day の勝者 → Award Day への切符（路線の開通）→ 新幹線で東京へ → 発表と展示 → 受賞（紙吹雪）を演じて点に戻る。1周約38秒。「視差効果を減らす」の設定では止まった路線図だけを見せる（`python scripts/readme/awards_play.py`） |
| `flow-*.svg` | 遊ぶまでの4ステップ |
| `controllers-*.webp` | 3人の分担と、実際のスマホの操作の録画。`controllers-*.svg`（`docs/screenshots/device/` の撮影画像をJPEGで埋め込んだ下絵）に録画を重ねて焼き込む（[手順](../../scripts/readme/recordings/README.md#readmeの図への焼き込み)） |
| `features-*.svg` | 特長の3枚のカード |
| `genres-*.svg` | ジャンルごとの分担と体験のカード |
| `stats-*.svg` | 試遊アンケートの数字 |
| `roadmap-*.svg` | 今後の展望（まず → その先） |
| `focus-*.webp` | 注力したことの3つ（実際の画面の録画と遅延の数値）。`controllers` と同じく `focus-*.svg` から焼き込む |
| `architecture-*.svg` | システム構成図。各スマホからRustホストの受け口（WebRTC DataChannel・WebSocket）へ直接の矢印を引き、Rustホストの中の部品まで技術名で描く。P1のボタン入力がゲームに届くまでの道を、1つの点がたどってループする（SVGの `animateMotion`）。「視差効果を減らす」の設定では点を消す。段・Rustホスト・箱には、見分けるためのうすい面を敷く。図に書く事実は `apps/host-rs`・`apps/desktop`・`apps/web` のコードで確かめる |
| `evaluation-*.svg` | 分担AIの評価 |
| `pipeline-*.svg` | 操作の自動検出から分担AI、スマホ画面への配分までの流れ |
| `footer-*.svg` | 末尾の締めの画像 |
| `heads/head-*.svg` | 項目の見出し（番号・英字ラベル・見出し）の旧版。今のREADMEは `heads/play-*.svg` を使う |
| `heads/play-*.svg` | 項目の見出しの横で、スマホたちが見出しの内容を演じるアニメーション（`python scripts/readme/head_play.py`） |
| `heads/part-*.svg` | 大見出し（製品概要・開発技術） |
| `heads/toc-*.svg` | 目次の項目（グラデーションの番号＋項目名）。番号と項目名の間で折り返さないよう1枚の画像にし、項目名はGitHubのリンク色で描く |
| [`scenes/`](scenes/README.md) | 各項目の終わりに置く区切りの帯（キャラクターが遊ぶ10種類のアニメーション） |
| `system-architecture.webp` | 以前の構成図の画像（READMEでは `architecture-*.svg` に置き換えた） |

`-light`／`-dark` はGitHubのテーマ、`-narrow-` はスマホなど幅700px以下の画面用で、READMEの `<picture>` が切り替えます。図と見出しは、GitHubの本文欄と同じ幅（PCは838px、幅390pxのスマホは324px）で描き、READMEでは幅を指定せず原寸で表示します。図の文字の大きさがそのまま画面上の大きさになり、本文（16px）との比がPC版とスマホ版でそろいます。図の文字は13px以上にし、`python scripts/readme/check_text_size.py` で確かめます。

## 画像の埋め込みと配信

READMEの相対パスの画像は `raw.githubusercontent.com` から配信され、`Content-Security-Policy: default-src 'none'` と `Cache-Control: max-age=300` が付きます。`<img>` で表示したSVGは、もともと外部の画像やフォントを読み込めません。そのため、SVGの中の写真とフォントはBase64で埋め込みます。

- SVGはgzipで配信されるため、Base64による増加はほぼ打ち消されます。2026-11-21に測ると、JPEGを3枚埋め込んだ `controllers-light.svg`（main、94KB）の転送量は59KBでした。JPEGとSVGを別のファイルに分けた場合は計68KBで、2回の通信が要ります。
- 動く録画を含む図（`controllers`・`focus`）は、文字の枠をSVG、スマホ画面の枠をアニメーションWebPに切り分け（`pieces/`）、READMEで隙間なく並べて1枚の図に見せます。図ごと1本のWebPにすると文字までラスタになってぼやけるためです（2026-11-21に変更）。並べ方は `scripts/readme/recordings/pieces.py` の説明を参照してください。閲覧1回の転送量の9割以上はこのWebPです（PC版は計約1.7MB、スマホ版は計約1.0MB。そのほかのSVGは、gzipで計約150KB）。
- GitHubは `<img>` の `loading` 属性を取り除くため、遅延読み込みは指定できません。

## フォント

`<img>` で表示したSVGは外部のフォントを読めません。そのため、締めの文字は、使う字だけに絞ったフォントをSVGに埋め込んでいます。ほかの図の文字は、閲覧者の端末の日本語フォントで表示します。

| フォント | 使う場所 | ライセンス |
|:--|:--|:--|
| M PLUS Rounded 1c（Bold・ExtraBold） | 締めの説明文、区切りの帯の吹き出し | [SIL Open Font License 1.1](fonts/OFL-MPLUSRounded1c.txt) |
| Yusei Magic | 締めの「さあ、みんなで遊ぼう！」 | [SIL Open Font License 1.1](fonts/OFL-YuseiMagic.txt) |

| Anton | グラデーションの数字（項目の番号・アンケートの割合・遅延のミリ秒など）。輪郭（`<path>`）にして描く | [SIL Open Font License 1.1](fonts/OFL-Anton.txt) |
| Noto Sans（Bold・ExtraBold） | 「PART 1」「COMING SOON」。輪郭にして描く | [SIL Open Font License 1.1](fonts/OFL-NotoSans.txt) |
| Noto Sans JP（Black） | 処理の流れの図の「①②③」。輪郭にして描く | [SIL Open Font License 1.1](fonts/OFL-NotoSansJP.txt) |

どれも [google/fonts](https://github.com/google/fonts) の固定した版から取得します。キャラクターのまばたきなどの動きは、OSで「視差効果を減らす」を選んだ閲覧者には止まります。

## Safari でぼやけさせない描き方

iPhone の Safari（WebKit）は、`<img>` で表示した SVG の中の「グラデーションで塗った文字」「マスク」「フィルタ」を、いったん画像にしてから描きます。その画像は端末の倍率を考えずに作られるので、高解像度の画面ではぼやけます（2026-11-22、利用者が iPhone で見出しの番号のぼやけを確認。原因は WebKit の描き方からの推測で、WebKit の Windows 版では再現しない）。そこで、`build_art.svg()` の最後に `scripts/readme/vector.py` を通して、次のように直します。

- グラデーションで塗った `<text>` は、上の表のフォントの輪郭（`<path>`）にする。字幅で並べる所（「95.2%」の「%」、「9.0ms」の「ms」）は `vector.width()` で同じフォントの字幅を測る。
- 光彩（`filter="url(#glow)"`）は、にじみだけをフィルタで描き、元の図形はフィルタの外に重ねる。にじみはもともとぼやけた絵なので、画像になっても見た目は変わらない。
- 項目の見出しの舞台の端のフェードは、マスクの代わりに、矩形で切り抜いて端に GitHub の背景色（ライト `#FFFFFF`、ダーク `#0D1117`）のグラデーションを重ねる（`head_play.stage`）。GitHub の Dark dimmed など、ほかの背景色のテーマでは端に帯が見える。

README で画像（ラスタ）のまま表示するのは、実機の録画（`pieces/*.webp`）と紹介動画のサムネイル（PNG）だけです。

## 作り直し方

SVGは手で編集せず、生成スクリプトを直してから書き出します。フォントの切り出しに `fontTools` を使います。初回はフォントを `data/local/readme-fonts/`（Git対象外）へ取得します。

```
python scripts/readme/build_art.py
python scripts/readme/scenes.py
python scripts/readme/head_play.py
python scripts/readme/showcase.py
```

`showcase.py` は `docs/screenshots/device/` の撮影画像を縮めて埋め込むので、画面を撮り直したら書き出し直します。

数値や受賞名を変えるときは、README本文と画像の代替テキスト（`alt`）も合わせて直します。
