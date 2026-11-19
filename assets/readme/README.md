# README用の図版

[公開素材一覧](../README.md) ／ [製品README](../../README.md)

製品READMEで使う図版です。4色のスマホ型キャラクター（P1青・P2緑・P3紫・P4赤）は、アプリの [キャラクター画像](../../apps/web/public/assets/characters/) をもとにSVGで描き直しています。

| ファイル | 内容 |
|:--|:--|
| `hero-*.svg` | 冒頭の見出し画像（作品名・キャッチコピー・4体のキャラクター） |
| `awards-*.svg` | JPHACKS 2026の受賞結果 |
| `stats-*.svg` | 試遊アンケート・遅延・検出系統数・人数の4つの数値 |
| `flow-*.svg` | 遊ぶまでの4ステップ |
| `pipeline-*.svg` | 操作の自動検出から分担AI、スマホ画面への配分までの流れ |
| `footer-*.svg` | 末尾の締めの画像 |
| `divider.svg` | 章の区切り |
| `char-*.svg` | キャラクター単体（表・試遊者の声で使用） |
| `system-architecture.webp` | [システム構成図](../images/recooplay-system-architecture.webp) の余白を詰めたもの |

`-light`／`-dark` はGitHubのテーマ、`-narrow-` はスマホなど幅700px以下の画面用で、READMEの `<picture>` が切り替えます。SVGの文字は閲覧者の端末の日本語フォントで表示します。キャラクターのまばたきなどの動きは、OSで「視差効果を減らす」を選んだ閲覧者には止まります。

## 作り直し方

SVGは手で編集せず、生成スクリプトを直してから書き出します。依存するパッケージはありません。

```
python scripts/readme/build_art.py
```

数値や受賞名を変えるときは、README本文と画像の代替テキスト（`alt`）も合わせて直します。
