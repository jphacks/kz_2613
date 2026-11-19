# README用の図版

[公開素材一覧](../README.md) ／ [製品README](../../README.md)

製品READMEで使う図版です。4色のスマホ型キャラクター（P1青・P2緑・P3紫・P4赤）は、アプリの [キャラクター画像](../../apps/web/public/assets/characters/) をもとにSVGで描き直しています。

| ファイル | 内容 |
|:--|:--|
| `hero-*.svg` | 冒頭の見出し画像（作品名・キャッチコピー・4体のキャラクター） |
| `flow-*.svg` | 遊ぶまでの4ステップ |
| `pipeline-*.svg` | 操作の自動検出から分担AI、スマホ画面への配分までの流れ |
| `footer-*.svg` | 末尾の締めの画像 |
| `divider.svg` | 章の区切り（4色のカプセルが中央のキャラクターへ流れ込む） |
| `char-*.svg` | キャラクター単体（表・試遊者の声で使用） |
| `system-architecture.webp` | [システム構成図](../images/recooplay-system-architecture.webp) の余白を詰めたもの |

`-light`／`-dark` はGitHubのテーマ、`-narrow-` はスマホなど幅700px以下の画面用で、READMEの `<picture>` が切り替えます。

## フォント

`<img>` で表示したSVGは外部のフォントを読めません。そのため、ヒーローと締めの文字は、使う字だけに絞ったフォントをSVGに埋め込んでいます。ほかの図の文字は、閲覧者の端末の日本語フォントで表示します。

| フォント | 使う場所 | ライセンス |
|:--|:--|:--|
| M PLUS Rounded 1c（Bold・ExtraBold） | ヒーローの文字、締めの説明文 | [SIL Open Font License 1.1](fonts/OFL-MPLUSRounded1c.txt) |
| Yusei Magic | 締めの「さあ、みんなで遊ぼう！」 | [SIL Open Font License 1.1](fonts/OFL-YuseiMagic.txt) |

どちらも [google/fonts](https://github.com/google/fonts) の固定した版から取得します。キャラクターのまばたきなどの動きは、OSで「視差効果を減らす」を選んだ閲覧者には止まります。

## 作り直し方

SVGは手で編集せず、生成スクリプトを直してから書き出します。フォントの切り出しに `fontTools` を使います。初回はフォントを `data/local/readme-fonts/`（Git対象外）へ取得します。

```
python scripts/readme/build_art.py
```

数値や受賞名を変えるときは、README本文と画像の代替テキスト（`alt`）も合わせて直します。
