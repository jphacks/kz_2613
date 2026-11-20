# README用の図版

[公開素材一覧](../README.md) ／ [製品README](../../README.md)

製品READMEで使う図版です。4色のスマホ型キャラクター（P1青・P2緑・P3紫・P4赤）は、アプリの [キャラクター画像](../../apps/web/public/assets/characters/) をもとにSVGで描き直しています。

| ファイル | 内容 |
|:--|:--|
| `title-*.svg` | 作品名の見出し（h1）。最初はふつうの見出しに見え、少したつとキャラクターが文字の「。」と「:」で遊ぶアニメーション。文字はGitHub本体と同じフォント指定と大きさで描く（`python scripts/readme/title.py`） |
| `split-*.svg` | 冒頭の概要文のあとのアニメーション。3台のスマホが1人のキャラクターを分けて操作する様子 |
| `flow-*.svg` | 遊ぶまでの4ステップ |
| `pipeline-*.svg` | 操作の自動検出から分担AI、スマホ画面への配分までの流れ |
| `footer-*.svg` | 末尾の締めの画像 |
| `heads/head-*.svg` | 項目の見出し（番号・英字ラベル・見出し）。見出しの文字はGitHub本体と同じフォント指定で、閲覧者の端末の標準フォントで描く |
| `heads/toc-*.svg` | 目次の項目（グラデーションの番号＋項目名）。番号と項目名の間で折り返さないよう1枚の画像にし、項目名はGitHubのリンク色で描く |
| [`scenes/`](scenes/README.md) | 各項目の終わりに置く区切りの帯（キャラクターが遊ぶ10種類のアニメーション） |
| `system-architecture.webp` | [システム構成図](../images/recooplay-system-architecture.webp) の余白を詰めたもの |

`-light`／`-dark` はGitHubのテーマ、`-narrow-` はスマホなど幅700px以下の画面用で、READMEの `<picture>` が切り替えます。図と見出しは、GitHubの本文欄と同じ幅（PCは838px、幅390pxのスマホは324px）で描き、READMEでは幅を指定せず原寸で表示します。図の文字の大きさがそのまま画面上の大きさになり、本文（16px）との比がPC版とスマホ版でそろいます。図の文字は13px以上にし、`python scripts/readme/check_text_size.py` で確かめます。

## フォント

`<img>` で表示したSVGは外部のフォントを読めません。そのため、締めの文字は、使う字だけに絞ったフォントをSVGに埋め込んでいます。ほかの図の文字は、閲覧者の端末の日本語フォントで表示します。

| フォント | 使う場所 | ライセンス |
|:--|:--|:--|
| M PLUS Rounded 1c（Bold・ExtraBold） | 締めの説明文、区切りの帯の吹き出し | [SIL Open Font License 1.1](fonts/OFL-MPLUSRounded1c.txt) |
| Yusei Magic | 締めの「さあ、みんなで遊ぼう！」 | [SIL Open Font License 1.1](fonts/OFL-YuseiMagic.txt) |

どちらも [google/fonts](https://github.com/google/fonts) の固定した版から取得します。キャラクターのまばたきなどの動きは、OSで「視差効果を減らす」を選んだ閲覧者には止まります。

## 作り直し方

SVGは手で編集せず、生成スクリプトを直してから書き出します。フォントの切り出しに `fontTools` を使います。初回はフォントを `data/local/readme-fonts/`（Git対象外）へ取得します。

```
python scripts/readme/build_art.py
python scripts/readme/scenes.py
```

数値や受賞名を変えるときは、README本文と画像の代替テキスト（`alt`）も合わせて直します。
