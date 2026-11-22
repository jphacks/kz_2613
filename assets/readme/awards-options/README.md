# 受賞結果のカード：比較用の案（第3回）

第2回の案2（路線図）をもとに作り直しました。

## 前回からの変更

- **3人チームとの矛盾を解消しました。** 見出しの4色の点のうち、青・緑・紫の3体がチームで、赤は応援してくれる観客です。観客賞は、観客の赤が送る投票のハートで決まります。そのため、観客賞のタイルは赤にしました。Award Day の3つの賞は、チームの3体が1つずつ受け取ります（審査委員特別賞＝緑、Innovator認定＝紫、DMM.com賞＝青）。
- **「切符を手にした」「資格を得た」感じを強くしました。** 決勝進出のタイルが大きく光り、3人分の切符が1枚ずつ飛んできて、それぞれの画面に収まります。3体がそろって切符を掲げると、それまで灰色だった金沢→東京の路線が、金沢側から光って開通します。東京駅も光ります。
- **PC版は前回の案2の動き**（3体が連なって列車になり、路線の上を進む）のままにしました。赤は見出しの線の上を並走して見送り、東京では賞のたびにハートで応援します。
- **スマホ版は縦の路線図にしました。** 金沢駅を上、東京駅を下にして、駅の右にその日の賞を並べます。3体は小さな新幹線に乗り込み（窓が乗った3体の色で光る）、路線を下って東京駅へ行きます。
- 3体の画面は、切符を受け取ってから東京で賞を受け取るまで、切符を映したままにしました。

## 路線図（3人チームと観客）

カードを金沢と東京を結ぶ路線図にする。青・緑・紫の3体がチーム、赤は応援する観客。観客の赤が投票のハートを送ると、観客賞の王冠が光る（Hack Day の勝者）。決勝進出では、3人分の切符が1枚ずつ飛んできてそれぞれの画面に収まり、灰色だった路線が金沢から東京まで光って開通する。PCでは3体が連なって列車になり、赤は見出しの線の上を並走して見送る。スマホでは縦の路線図で、3体が新幹線に乗って下る。東京ではそれぞれ自分の賞を受け取り、赤が応援する。

### PC版

<picture><source media="(prefers-color-scheme: dark)" srcset="awards-2-dark.svg"><img src="awards-2-light.svg" alt="PC版"></picture>

### スマホ版

<picture><source media="(prefers-color-scheme: dark)" srcset="awards-2-narrow-dark.svg"><img src="awards-2-narrow-light.svg" alt="スマホ版"></picture>

### 前後とのつり合い（閲覧している画面の幅に合わせて切り替わる）

<picture><source media="(max-width: 700px) and (prefers-color-scheme: dark)" srcset="../video-cta-narrow-dark.svg"><source media="(max-width: 700px)" srcset="../video-cta-narrow-light.svg"><source media="(prefers-color-scheme: dark)" srcset="../video-cta-dark.svg"><img src="../video-cta-light.svg" alt="プロダクト紹介動画を見る"></picture>

<br>

<picture><source media="(max-width: 700px) and (prefers-color-scheme: dark)" srcset="awards-2-narrow-dark.svg"><source media="(max-width: 700px)" srcset="awards-2-narrow-light.svg"><source media="(prefers-color-scheme: dark)" srcset="awards-2-dark.svg"><img src="awards-2-light.svg" alt="案"></picture>

<br>

<picture><source media="(max-width: 700px) and (prefers-color-scheme: dark)" srcset="../heads/toc-title-narrow-dark.svg"><source media="(max-width: 700px)" srcset="../heads/toc-title-narrow-light.svg"><source media="(prefers-color-scheme: dark)" srcset="../heads/toc-title-dark.svg"><img src="../heads/toc-title-light.svg" alt="目次"></picture>

## 作り方

`python scripts/readme/awards_play.py` で、この比較用の画像（4枚）を `assets/readme/awards-options/` に書き出します。決まったら README の `awards-*.svg` を差し替えます。
