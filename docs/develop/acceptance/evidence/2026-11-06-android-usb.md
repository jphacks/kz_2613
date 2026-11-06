# Android USBでの実機受入記録（2026-11-06）

- 開始 13:34:15 JST。製品ソース `83c700907f0f382d08b5df9cc8ce1c2c2d274ca7`、試験スクリプト `f2665aead4c084ba0a7d4f2cc86b7de183a014ca`。製品差分がないことを確認。
- ホストexe SHA-256 `e50840be3c75f16adb346d326558b7ebbe329cfc4c9c495d3f53cb1597b1abea` を固定ビルド記録と照合。この試験では配布zipを使用していない。
- Windows PC、Android 16/API 36、Chrome 156.0.8078.79、画面1080×2392、縦向き。ADB認可・画面ON・ロックなし。Android実端末1台（P1）＋PC上の模擬WS参加者2つ（P2/P3）。
- 子ホストは `RECOOPLAY_DRY_RUN=1`、設定読込なし、疑似入力先、動的ループバックポート。監視で疑似入力先と初期 `down=[]` を確認。

リポジトリルートで [AT-D01のUSB手順](../README.md#android-usb-dry-runの再実行) に従い、`node scripts/device/android-dry-run.mjs --adb <adb.exe> --bin <照合済みexe> --sha256 <SHA-256>` を実行した。

| 操作 | 期待 | 観測・判定 |
|---|---|---|
| USB転送経由でChromeを開く | 描画、P1参加 | 接続OK、384×701 CSS px、横はみ出しなし。PASS |
| 分担確定、P1でPREPARE→READY | 準備後に協力画面 | `preparing`（epoch 3）→`coop`（epoch 4）。PASS |
| CDP単指でジャンプ | down/up各1件 | WSで両方受理。PASS |
| CDP単指でスティックを右へ動かして離す | 右down/up、残留なし | downはRTC、upはWSで受理し、`down=[]`。PASS |
| 診断画面を開閉 | ダイアログが開閉する | 開閉を確認。PASS |
| ジャンプ保持中にPause | 指の解放を送る前に全解放 | `paused`（epoch 6）、`down=[]`。PASS |
| 試験タブを再読み込み | 元の管理権へ復帰し停止状態を維持 | P1、再接続1回、`paused`。PASS |
| 終了と後片付け | タブ閉鎖、ホストと転送の終了 | タブ閉鎖応答成功、ホスト終了コード0、ADB forward/reverse各0、試験ポート待受0。PASS |

HTTPとWebSocketはADB reverseのTCP転送。ホストログはRTCの `open` と入力受理も記録した。RTCの候補アドレスや実パケット経路は採取していない。Wi-Fi構成別の通信性能はこの結果から判定しない。

生ログ、要約JSON、試験画面PNG4枚は専用worktreeのGit対象外 `data/local/device-acceptance/run-MDrhG8/` に保存。公開記録には接続トークン、端末ID、ネットワーク固有の情報を含めない。

実指での複数保持、回転・非表示、旧Socket・旧epochを意図的に送る対照試験、未処理視点の破棄、実Windows入力、実ゲームはこのUSB試験では未実施。
