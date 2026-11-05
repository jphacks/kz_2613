# スマホ入力ライフサイクルの回帰試験（#176）

## 判断と試験境界

2026-11-05の指示に従い、最新main `b3c0e88` を基準にブラウザー側の現行動作を固定する。製品コード・操作感・通信契約は変更しない。Rustの#169とは別の変更領域であり、#175の未マージを前提条件にしない。

既存の `ui-input-test.mjs` はスティック・視点・タッチパッド・RTCの各部品、`phone-view-test.mjs` はReady・担当・停止の表示、`controller-diagnostics-test.mjs` は実controllerと診断開始時の解放・非注入通信テストを確認している。今回不足していたのは、生成された操作面からcontrollerの保持・通信・再接続までを通る一連のイベント系列と、複数指の同一操作保持である。

`scripts/sim/fixtures/phone-harness.mjs` は製品の `controller.js`、`phone-view.js`、`generated-controls.js`、`cooperative-input.js`、`stick.js`、`touchpad.js`、`transport.js`、表示関数・メトリクスを隔離VMで読み込む。DOM・単調時計・タイマー・WebSocket・RTCPeerConnectionだけを試験用へ置き換える。ソース中の関数を抽出した複製ではなく、実モジュールの制御フローとコールバックを実行する。追加依存・ビルド手順・実通信・OS入力は不要。

## 固定する系列

- 同じ指の重複down/up、複数操作の同時保持、pointercancel/lostpointercaptureの全解放。
- 非表示・縦横回転・orientationchange・pagehide・blur、診断ダイアログ開始前の解放、新規押下と視点の抑止。
- epoch変更時の旧押下と未送信視点の破棄、ゲーム・担当・実キー変更による生成画面更新時の解放。
- スティックの斜め2操作と所有していない指の無視、画面切替時の解放。
- 視点の33ms送信周期・累積量・epochごとの連番、キャンセル時の未送信量破棄。
- タッチパッドの移動上限・キャンセル・タップのクリック1組。
- ボタンのWS/RTC二重送信でのiseq/epoch一致（WSだけが持つseqとは区別）、RTC閉鎖時のWS継続。
- 切断・無応答・再接続時のtoken/nextIseq、旧押下非復元、古いSocketのgame/close通知の無視、終端コードの非再試行。
- 古いRTC候補と非同期Blob受信完了の無効化、STUNなし・非順序・再送なしの設定維持。

## 確認した不具合と失敗する再現

同一の `act:attack` ボタンへpointerId 1と2でdownし、1だけをupすると、2がまだ保持しているのに最初のupが送られる。`held` はpointerIdごとだが `sentDown` は操作名のSetであり、最初の `releasePointer` が操作全体を削除する。これは静的解析上の仮説から、実controllerを実行した再現へ進んだ事実である。実端末・実ゲームでの発生頻度は未測定。

正しい期待値（最後の保持者までupなし）をそのまま実行するコマンド：

```text
node scripts/sim/phone-lifecycle-test.mjs --repro-shared-pointer
```

現行mainでは `actual: ['down','up']` / `expected: ['down']` のAssertionErrorで終了コード1となる。これは意図した失敗再現であり、テスト成功として扱わない。

既定のCIコマンドは上記の同じ正期待を実行し、その特定のAssertionError・actual/expectedに一致することだけを既知不具合のcharacterizationとして確認する。他の例外や予期せぬ成功ではCIを通さない。既知不具合を一般的に許容したり、修正済みと報告したりしない。

```text
node scripts/sim/phone-lifecycle-test.mjs
```

#177ではPointer所有の一元化とこの早期up修正を明示し、同じ再現関数を成功すべき通常回帰試験へ切り替える。#176に製品修正は混ぜない。

## 限界と後続

最小DOMは属性・生成要素・イベントを扱うが、実ブラウザーのレイアウト、ヒット判定、Pointer Captureの自動的な配送、OSやブラウザーによるジェスチャー取消を再現しない。Blobは手動完了するPromiseで受信順を制御する。実DataChannelのネゴシエーション・無線・配送品質を試験したものでもない。

Android/iPhoneの2指操作、Pointer Captureの喪失、画面回転、バックグラウンド復帰、戻る操作・ページ終了、Wi-Fi断後の再接続とゲーム側の解放は実機未検証として残す。既存#10・#38・#39の受入を代替しない。無応答時に閉じたWSへupを送れないことと、サーバーの切断時全解放は責任を分け、後者はRust側の回帰試験で確認する。

実行結果は [BUILD_LOG.md](../handoff/BUILD_LOG.md) に記録する。
