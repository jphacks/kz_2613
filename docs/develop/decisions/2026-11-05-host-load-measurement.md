# ホスト内部処理の負荷計測（#174）

## 採用した境界

2026-11-05の指示に従い、PR #175の回帰試験を親として計測を進める。製品の入力・タイマー・通信処理を変えず、`hub.rs`の`cfg(test)`内から独立した`hub_measurement.rs`を読み込む。既存fixtureは必ず`Input::for_test`を使い、ゲーム検出・実Peer・ソケット・Windowsタイマー設定・Wi-Fi操作を呼ばない。通常の`cargo test`では40ms×5条件のsmokeだけを実行し、長い測定はignored試験を専用脚本から明示実行する。

製品の`Hub::run`へ常時計測を入れる案は、本番のループとイベント型を変更し、#170以降との競合を広げるため今回採らない。計測ハーネスは実際の`on_event`・`on_timer`・`record`・通知生成と、同じ`std::sync::mpsc::channel`・`tokio`のunbounded channelを使う。期限済みタイマー群→受信イベント1件という順序を再現するが、`Hub::run`そのものの試験ではない。

## 再実行

SETUP_WINDOWSのPATH・`LIBCLANG_PATH`を設定し、`cargo test --release --locked --offline --manifest-path apps/host-rs/Cargo.toml`を実行する。出力の`Running unittests src/main.rs (...)`に示された**テストexe**を専用コピーへ保存する。製品の`recooplay-host.exe`とは異なる。

```powershell
node scripts/sim/host-load-measure.mjs --test-bin <テストexeの絶対パス> --duration-ms 1000 --repeats 3 --burst 2000 --out data/local/initial.json
node scripts/sim/host-load-measure.mjs --test-bin <同じテストexe> --duration-ms 30000 --repeats 3 --burst 2000 --out data/local/long.json
```

脚本は専用試験名・結果markerを含むテストexeであることを起動前に確認し、ignored試験だけを`--exact --ignored --nocapture --test-threads=1`で実行する。製品exeの誤指定は起動せず拒否する。結果JSONにはOS/アーキテクチャ、入力条件、計測開始時のコミット・dirty状態・主要ソースのSHA-256・テストexeのSHA-256（更新後の脚本）と測定の限界を記録し、IP・端末名・トークン・実行ファイルの絶対パスを含めない。結果の単位はマイクロ秒、時計は`Instant`。性能の合格閾値は設定せず、安全停止とキュー消化をアサートする。

## 負荷条件

参加枠3人、監視接続1本。開始時にP1のW・P3の左ボタンと未処理視点量をfixtureで保持させ、停止で最低押下時間より即時解放が優先されることを確認する。停止後は旧epoch=1の入力を送り続け、その入力が再押下しないことも確認する。

| 条件 | 生成する処理と停止の位置 |
|---|---|
| `normal` | 100msごとの押下/解放、33msごとの累積視点、200msごとの3枠ping。測定期間の半分でEmergencyStop |
| `burst` | 冒頭に2,000入力を詰め、1,000件目の前へEmergencyStopを挿入。残りの時間は主にtickを観測 |
| `stalled_monitor` | 同じ冒頭バースト。監視通知のreceiverを最後まで読まない。参加者向けACKは都度消化 |
| `disconnect` | normalと同じ周期。期間の半分でP2のWsClosedを渡す。参加者切断による全解放を確認 |
| `large_log` | 冒頭に2,048文字のpayloadを持つ`record`を2,000件詰め、半分にEmergencyStopを挿入。実際のJSON化・BufWriter書込みを測る |

バースト3条件は期間中ずっと最大負荷を継続する試験ではない。入力イベントと直接recordのwork mixも異なるため、条件間の処理時間差をそのまま特定のボトルネックの因果証拠にしない。

ローカル開発PC上の測定で、他プロセス負荷・電源状態・CPU割当は制御していない。初期計測と長計測は測定時間も異なるため、差を改善効果として比較しない。

## 測定値の定義

- `queueWaitUs`：send直前に付けた時刻→dequeue直後の処理開始。`processingUs`は実ハンドラー/record呼出しの開始→終了。各分布は件数・nearest-rankのp50/p95/p99/maxを持つ。
- `stopQueueWaitUs` / `stopProcessingUs` / `stopTotalUs`：停止の待機、実処理、enqueue→内部停止完了を分離。停止直後に全出力の物理状態・所有者・キュー・予約、未処理視点/端数を確認する。1条件につき停止は1回で、p95等が複数停止を代表する分布という意味ではない。
- `lookTickLagUs`：予定時刻との差、`lookTickIntervalUs`：実呼出し間隔、`lookTickProcessingUs`：実処理時間。`recordUs`はlarge_logの直接記録、`flushUs`はハーネスが1秒ごと/終了時に行うflush。
- `eventQueuePeak` / `eventPayloadBytesPeak`：send直前の加算/dequeue直後の減算による最大滞留。bytesは入力JSON/記録payloadのみでEnum・allocator・チャネル等の総メモリではない。
- `monitorQueuePeak` / `monitorPayloadBytesPeak`：各処理境界での通知件数と消化時のJSON量。停止条件では最後まで保持したキュー全体を最後に消化。`timerHeapPeak`は同じ境界での予約数。

ハーネスの受信待ちは最大1msで、本番の「次のタイマーまで待つ」計算とは異なる。計測処理自身の時間も含む。tick間隔や停止時間を本番ループの性能値へ読み替えない。

## 初期観測・長計測と限界

[初期計測JSON](../data/host-load/initial.json)は1秒×5条件×3反復。全15条件で停止・全解放・旧入力非復元・未処理キュー消化のアサーションが成功。受信キューの観測最大は1,686件、監視受信停滞時の通知最大は1,008件。停止enqueue→内部停止完了の最大観測は7,148µsだった。これらはこの有限負荷/fixtureの観測値で、性能保証・最悪時上限・実ゲームの遅延ではない。

[長計測JSON](../data/host-load/long.json)は30秒×5条件×3反復。対象ソースは `315b06c`、開始時dirty=false、テストexeのSHA-256はJSONに記録した。全15条件・計27,975処理で停止・全解放・旧入力非復元・キュー消化のアサーションが成功した。各表の最大値は3試行中の観測最大で、最悪時保証ではない。

| 条件 | 1試行の処理件数 | 受信キュー最大件数 | 監視キュー最大件数 | 停止完了最大µs | tick間隔最大µs |
|---|---:|---:|---:|---:|---:|
| normal | 1,661 | 5 | 5 | 2,889 | 20,587 |
| burst | 2,001 | 1,664 | 6 | 8,775 | 8,514 |
| stalled_monitor | 2,001 | 1,773 | 1,008 | 6,087 | 11,047 |
| disconnect | 1,661 | 5 | 5 | 2,035 | 20,355 |
| large_log | 2,001 | 625 | 6 | 2,539 | 9,478 |

期間を通じて1秒ごとのflushを観測したが、null deviceのため実ディスク負荷とは異なる。tick間隔の観測最大20,587µsも、このfixture・待機方式・未制御のPC負荷での値であり、製品の4ms周期設定を変更する根拠にはしない。冒頭バーストと受信停滞でキュー蓄積が再現したことは確認できたが、本番の停止上限やWS送信停滞によるボトルネックの有無は未判定。

最初の長計測は利用上限停止後に実プロセス・セッションと結果ファイルが存在しないことを確認し、合格証拠へ含めず、上記条件を専用exeで再実行した。以下は未測定であり、完了扱いにしない。

- 本番`Hub::run`・HTTP/WS/RTCソケット・`socket.send().await`やOSソケットバッファの停滞。
- null device以外の実ディスク書込み、標準出力の受信停止、slow writer。既存の`BufWriter<File>`を遅いwriterへ差し替えるには追加境界が必要で、製品writerの変更は混ぜていない。
- `timeBeginPeriod`を呼ぶ製品起動後のタイマー分解能、SendInputの成否/実効果、Android/iPhone・実ゲームの遅延。
- 2人/4人、継続的に増大する無制限負荷、安全イベントの処理上限。現在の無制限キューには有限の最悪時上限を保証できない。

## 配送保証と次の測定

安全イベント・接続世代・状態変更は黙って破棄しない。押下/解放、ACK、リモコン、役割確認、命令結果は個別の意味と順序を保つ。視点累積値は同世代/epoch内、state/gameは制御通知との順序を保てる場合だけ集約候補。表示ログ・診断は欠落件数を示す間引き候補で、保存ログの保証とは分ける。今回キュー方式や配送保証は変更しない。

観測された蓄積を、ただちに実ゲームでの安全不具合や最適化の必要性へ読み替えない。次は計測位置を本番ループ/送信待ちへ広げる最小のopt-in境界を、#170〜#173の変更後にレビューする。実ディスク/slow writer・標準出力停滞を独立条件にし、同じ負荷で測定前後を比較できてから別の小PRで改善を判断する。#157の実機遅延評価や#39の実機安全試験を代替しない。

PRは#175をbaseとし、#175マージ後は最新mainとの差分とCIを確認してbaseを切り替える。mainへのマージ・Issueクローズは行わない。
