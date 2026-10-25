# Re:Cooplay 写真・UIギャラリー

[製品README](../README.md) ／ [資料一覧](README.md) ／ [動作確認](verification.md)

実際のプレイ写真と、2026年10月25日時点の**表示検証キャプチャ**を分けて掲載しています。

## Hack Dayでの実プレイ

<div align="center">
  <img src="../assets/images/recooplay-hackday-play.webp" width="720" alt="Hack Dayで3人が各自のスマホからPCゲームを共同操作する実プレイ写真">
  <p><sub>3人が同じPC画面を見ながら、各自のスマートフォンで共同操作している様子</sub></p>
</div>

ゲームはそのまま、遊び方を変える。**1キャラクターの移動・視点・アクションを分担**して、声を掛け合いながら遊びます。

## スマホのコントローラー（3人プレイ例）

<table>
  <tr><th align="center">P1 移動</th><th align="center">P2 視点</th><th align="center">P3 アクション</th></tr>
  <tr>
    <td><img src="../artifacts/improved-ui/final/phone-402x874-move.jpg" width="210" alt="移動担当の表示検証画像"></td>
    <td><img src="../artifacts/improved-ui/final/phone-402x874-look.jpg" width="210" alt="視点担当の表示検証画像"></td>
    <td><img src="../artifacts/improved-ui/final/phone-402x874-action.jpg" width="210" alt="アクション担当の表示検証画像"></td>
  </tr>
</table>

**注：** これらは模擬状態による画面表示の記録であり、Android・iPhone実機で撮影した写真ではありません。PR #110で2〜4人の分担処理が追加されましたが、この3枚は**3人向けUIの撮影時点の記録**です。

## PCから参加・ゲーム選択・開始まで

1. PCに参加画面とQRコードを表示
2. スマホで参加し、PC側でゲームを選択
3. 担当する操作を確認
4. ホストが明示的にReadyして、共同操作を開始

<details>
<summary>PCアプリの表示検証画面（4枚）を見る</summary>

| 参加画面 | ゲーム選択 |
|:--:|:--:|
| <img src="../artifacts/improved-ui/final/pc-1920-join.jpg" width="400" alt="PC参加画面"> | <img src="../artifacts/improved-ui/final/pc-1920-game.jpg" width="400" alt="PCゲーム選択画面"> |
| 操作分担 | Ready待ち |
| <img src="../artifacts/improved-ui/final/pc-1920-roles.jpg" width="400" alt="PC操作分担画面"> | <img src="../artifacts/improved-ui/final/pc-1920-ready.jpg" width="400" alt="PC Ready待ち画面"> |

</details>

ゲーム選択や参加人数の画面は、その後のPR #108・#110で変更されています。**最新UIとの完全一致を主張する画像ではありません。**

## 詳細な画面・試験資料

- [104画面の表示検証結果](../artifacts/improved-ui/README.md)（画像の採寸・表示条件）
- [PC/スマホUI比較ギャラリー](../artifacts/improved-ui/index.html)（HTML。GitHub上ではダウンロードが必要な場合があります）
- [デザイン資料](design/README.md)
- [動作・検証状況](verification.md)

**デモ動画の視聴可能な公開URLは未掲載**です。公開できる映像が確認できたときに追加します。金沢会場での**Hack Day Audience Award**受賞写真も、出典と公開可否を確認してから追加します。
