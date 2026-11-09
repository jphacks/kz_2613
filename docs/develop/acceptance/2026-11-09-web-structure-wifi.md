# Web構成整理のAndroid実Wi-Fi比較（2026-11-09）

#279 の移行前とPR-A/B/CをAndroid 1台・実Wi-Fi・dry-runで比較した。各版の最終試行は16項目合格。ボタン入力は各224件すべて受理され、欠落・重複受理・未ACKは0。実OS入力・実指・Minecraftの受入ではない。

## 条件と再現

Windows 11、Android 16、Chrome、Windows Wi-Fi Direct / mobile hotspot。同じ認可済み端末と利用者指定のprivate設定を使い、実行前にPC/Androidの現在アドレスとの一致を検証した。HTTP/WS/RTCはWi-Fi、USB ADB forward/CDPは操作・観測だけ。USBテザリングとADB reverseは不使用。各版は作業ツリーがcleanな状態で実行した。

```powershell
node scripts/device/android-dry-run.mjs --bin <対応するホストexe> --sha256 <SHA-256> --adb <adb.exe> --wifi-network <private.json> --benchmark-ms 60000 --condition pr279-<条件> --trial <試行番号>
```

各条件のボタン試行60秒（48周期・6パターン）と視点試行60秒。試行番号は中断も含む。実行中は一時的に縦向きへ固定し、finallyで元のaccelerometer_rotation=1 / user_rotation=0へ復元した。新しいコンパイル・zip圧縮は比較中に実行していない。

| 条件 | ソースコミット | 最終試行 | 合格数 | 送信/受理 | 欠落/重複受理/未ACK |
|---|---|---:|---:|---:|---|
| before | `6ad3153ba4826bf82f06bc1bef77cb31b01eb30d` | 1 | 16/16 | 224/224 | 0/0/0 |
| pr-a | `9642c2c40c664b45c83bfbd9cd0f39f91e21f845` | 2 | 16/16 | 224/224 | 0/0/0 |
| pr-b | `ae98b05ce7569e80c0eaa26032fd55a924aa01c4` | 4 | 16/16 | 224/224 | 0/0/0 |
| pr-c | `66159e606710db799ee7690da2b079ae3bc30742` | 4 | 16/16 | 224/224 | 0/0/0 |

beforeはlegacy-js-last-with-reactの現参照先（mainの履歴更新後、旧ee77270とtree一致）。PR-A/B/CはそれぞれDraft #281/#282/#283。ホストexeのSHA-256、runnerコミット・モジュールハッシュ、原summaryのSHA-256、全16項目の判定、経路証明の集計は[metrics.json](evidence/web-structure-wifi/metrics.json)を参照。接続情報・端末識別子・生ログ・スクリーンショットは公開しない。

## 時間と視点の観測値

値はms。ACK RTTは製品handlerを通るACKの観測値で、ゲームの応答時間ではない。端末とPCの時計差から片方向遅延を求めていない。

| 条件 | down→送信 p95 | up→送信 p95 | ACK RTT p95 | 視点送信間隔 p95 | 送信側200ms以上 | ホストRTC到着200ms以上 | lookLost |
|---|---:|---:|---:|---:|---:|---:|---:|
| before | 25.0 | 26.7 | 121.6 | 35.1 | 0 | 11 | 398 |
| pr-a | 28.1 | 26.5 | 112.0 | 63.8 | 0 | 2 | 373 |
| pr-b | 28.1 | 23.3 | 109.2 | 63.5 | 0 | 4 | 360 |
| pr-c | 26.6 | 26.9 | 109.0 | 64.2 | 0 | 6 | 324 |

視点のlookLostはホストが観測したlseqの飛びの累積で、0ではない。累積座標の差分を使う既存方式は変更していないが、ボタンの欠落0から視点通信も無欠落とは判断しない。各版で完走した測定は1回ずつで、無線条件やCDP処理のばらつきを分離できないため、性能の改善・同等性や製品の遅延受入を結論しない。

## 中断と再試行

| 条件・試行 | 結果 |
|---|---|
| PR-A 1 | LANの新文書HTTP応答待ちで中断。操作試験未実施。原因は確定していない。既存Firewall規則は読み取り時に許可状態。 |
| PR-B 2 | 選択ICE候補対の双方向payloadを確認できず、経路証明で不合格。性能測定前に中断。 |
| PR-B 3 | 反復入力後の単指ボタンで期待したdown/upがなく不合格。原画像に拡大・横切れ、反復入力イベントの大半にcontrol=nullを確認。座標ずれによる空白への連続タッチとブラウザーズームが疑われる。 |

失敗記録を保持し、製品コード・試験判定・入力定数を変えず、新しい専用タブで再試行した。最後のPR-B 4とPR-C 4は全16項目合格。上記の失敗を含め、試験開始時の経路確立とCDP座標の安定性には制約が残る。

## 残る実機ゲート

実Windows入力による疑似ゲーム照合、実ホットキー・Alt+Tab、iPhone、実指、複数実端末、Minecraft実入力、実無線断、別PC配布受入は未実施。dry-runの成功をこれらの合格へ読み替えない。
