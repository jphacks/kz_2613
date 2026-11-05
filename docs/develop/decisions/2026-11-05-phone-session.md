# スマホの接続・参加状態を分離する（#178）

## 責務と依存方向

#177のhead `6c80fab` を親とし、`phone-session.js` にclientId・再接続token、現在のSocket、seq/iseq、再試行回数・停止フラグ・最終受信時刻、slot・ホスト権・game/epochを移す。これらの値をcontroller側に複製せず、更新はセッション部品の操作を通す。表示用の参加状態と接続文言も同じ部品から導出する。

セッション部品はstorage・ID生成・単調時計を引数で受け取り、DOM・タイマー・WebSocketの生成・WebRTC・Pointerを参照しない。`controller.js` は実通信のイベント、全解放・視点リセット・RTC生成破棄・DOM更新の副作用をつなぐ。`phone-view.js` は低頻度の表示、`input-owners.js` と `cooperative-input.js` は入力、`transport.js` は高速通信の実体を引き続き担当する。サーバーの認可条件をスマホ側で作り直さない。

token更新→視点リセット→RTC開始→slot/host更新→表示、game更新→epoch変更時の全解放→視点リセット→表示、切断時の全解放→RTC閉鎖→再接続判断の順序を保持する。seqは接続ごと、iseqは再接続を越え、次のhelloのnextIseqへ引き継ぐ。入力のWS/RTC二重経路・視点33ms周期・累積値・ワイヤ形式・protocolVersion 4を変更しない。

## 再現した旧Socketのopen通知

既存controllerではgame/close通知に現在のSocket照合があるが、onopenにはなかった。切断後の可視化イベントと予約再試行が重なって接続中Socketが2本でき、一方が現在の接続として入力を送った後、他方のopenが遅延するとseq・pending・pingタイマーを再初期化し、旧Socketにもhelloを送る。

```text
node scripts/sim/phone-session-test.mjs --repro-stale-open
```

世代ガード追加前の実controllerで、現在のSocketの送信seqが期待 `[1,2]` に対して実際 `[1,1]` となり、正期待のAssertionError・終了コード1を確認した。責務抽出と挙動修正を区別し、抽出のコミット `11374a6` にはこの失敗再現を残した。続く修正コミットでonopenの先頭に既存game/closeと同じ世代照合を加え、古い通知を新状態へ入れない最小差分とした。

これは接続・再接続の境界条件を担保する修正であり、新しい再接続方式や仕様を導入するものではない。接続中Socketの重複生成自体を抑えるアルゴリズム、JSONの型付き解析、タイマーの全面変更は含めない。

## 検証と限界

純粋なセッション試験は保存済みidentity/token、storage拒否、seq/iseq、server状態・epoch、backoff、終端コード、3秒の無応答境界、所有接続を確認する。既存の実controller VM試験はPointer所有・停止・epoch・画面更新・再接続・WS/RTCの契約を引き続き確認する。旧Socketのopen再現も通常の成功回帰試験へ追加し、seq・未ACK入力・pingの予定時刻・旧helloの不送信を確認する。

タイマーの実スケジューリング、実ブラウザーの接続イベント配送、Android/iPhoneの復帰、Wi-Fi断、実WebRTC、Windows実入力・Minecraftは未検証。自動試験を実機受入として扱わない。結果と実行コマンドは [BUILD_LOG.md](../handoff/BUILD_LOG.md) に記録する。

## Stackの区切り

PRは#177のブランチをbaseとする。親がmainへ統合されたら最新mainをfetchし、baseをmainへ変更する前に親由来差分が消えることを確認、必要に応じrebaseして全CI・回帰試験をやり直す。#176→#177→#178のスマホStackはここで区切り、#179のRust/Web横断境界は双方の統合・レビューとこの試験結果を確認してから着手する。
