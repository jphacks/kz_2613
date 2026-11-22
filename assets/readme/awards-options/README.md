# 受賞結果のカード：比較用の案（第4回）

第3回の路線図の案を、指摘をもとに直しました。

## 前回からの変更

- **赤はキャラクターにせず、点のまま見出しに残します。** チームの3体（青・緑・紫）だけが出てきます。Hack Day の2つ（勝者・切符）はチームのものなのでグラデーション、Award Day の3つの賞は受け取るキャラクターの色にしました。
- **PC版も新幹線にしました。** スマホ版と同じ小さな新幹線が、路線の上を走ります。3体が乗り込むと、窓がそれぞれの色で光ります。
- **路線は、PC版もスマホ版も東京駅の先へ続けました。** 路線がカードの端まで通ることで受賞の欄の枠組みにもなり、3体を降ろした新幹線は路線の先へ走り去ります。
- **画面の表示が重ならないようにしました。** 3体の画面は、手にしたものを順に映します：王冠（Hack Day の勝者）→ 切符 → それぞれの賞。
- **最後に点へ戻る動きに余裕を持たせました。** 見出しへ1体ずつ戻って並び、そろって跳ねてから、1体ずつ点に戻ります（戻り始めてから全員が点になるまで約5秒）。

## 路線図と新幹線

カードを金沢と東京を結ぶ路線図にする。青・緑・紫の3体がチーム（赤は点のまま見出しに残る）。3体が観客賞の文字に乗ると王冠が光り、画面に王冠が映る（Hack Day の勝者）。決勝進出では、3人分の切符が1枚ずつ飛んできて画面の王冠が切符に変わり、灰色だった路線が金沢から東京まで光って開通する。3体は小さな新幹線に乗り込み（窓がそれぞれの色で光る）、路線を走って東京駅へ。それぞれの賞を受け取ると、画面の切符がその賞に変わる。最後は見出しへ戻って並び、そろって跳ねてから、1体ずつ点に戻る。

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
