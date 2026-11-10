# PR再レビュー・統合準備（2026-11-11）

正本main：155e01c。Claudeのブランチ・worktreeは変更せず、専用worktreeで実行。mainへの新たなマージ承認は未取得。

| PR | 検証SHA | 結果と次の行動 |
|---|---|---|
| #284 | 27c4131 | 元の2順序問題は独立試験成功。追加P1が3件：新look先着時の旧補間混入（期待5/実105）、新down保持時の旧連打キュー再生（down2回）、markなし旧版の旧look復活（90）。指摘 https://github.com/jphacks/kz_2613/pull/284#issuecomment-6774488372 。修正待ち。main競合の専用解消済みを修正済みと混同しない |
| #313 | ea44ed1 | 親27c4131の祖先関係確認。mainとの5ファイル競合を両方保持。通常Rust150成功・2ignored、probe4、通信62/62、Web成功。独立順序試験3成功・3失敗が親と同じで保留。親修正後に再取り込みが必要 |
| #314 | 797f211 | 独立仮想時計3件、Rust150成功・2ignored、probe4、通信60/60、Web型・ビルド・回帰成功。前面喪失・残り時間・旧期限拒否・Pause/切断/緊急停止・枠番号巡回・旧入力拒否を確認。Issue #161 Openを維持 |
| #324 | cf7cd3c | 時計修正のない旧Draft。#314との相違は時計とログのみ。二重統合を防ぐためマージせずClose済み |
| #321 | 257f53f | 元の独立再現が成功へ転じ、追加6系列も成功。4009で確認・診断・要求を破棄、一時断で確認を保持し再接続後epoch19でENDを送信。実Chrome DOMで2モーダル閉鎖・終了案内の最前面表示を確認。iPhone・実Tauri×終了が残り、Refs #302へ整理 |
| #311 | 75b96a1 | base main。ホスト限定・協力中拒否・前面化失敗・ゲーム終了後1回復帰のコードと回帰成功。実Tauri/全画面は未確認、Issue #292 Open |
| #315 | 31e9319 | #311依存。専用統合枝で競合解消。緊急停止未登録時の拒否を元の独立試験で再確認。#311との経路移動で全解放し旧epoch・参加者の入力を拒否。実ランチャー実入力は未確認、Issue #287 Open |

## 統合候補と検証

#314→#311→#315→#321の祖先を保持した専用統合枝を作成。#284・#313は含めない。PhoneGameのcanOpenApp/rotation、受信型、画面・fixtureのrotationNotice/offline、画面回帰の各観点を両方保持して競合解消。

組合せ：Rust157成功・2ignored（独立時計3件＋ランチャー2件を含む）、probe4成功、release build成功、通信60/60、quit/EOFの全解放・終了4009成功。Web型・ビルド、product-web、静的5画面、独立終端6系列成功。実Chrome 390×844のDOM描画で終了案内が画面全体の最前面になり、2つのdialog:modalが0になったことを確認（端末受入ではない）。

実スマホ2〜4人で2周期以上、iPhone、Minecraft実入力、Wi-Fi断/復帰・実ホットキー、実Tauri前面化、実Minecraftランチャーのプレイ操作は未確認。#161/#292/#287/#302はOpenを維持。コード先行統合にはユーザー承認と統合CI成功が必要。

## 再現と再開

#284/#313の独立試験は https://github.com/jphacks/kz_2613/blob/67d61c7/apps/host-rs/src/review_resume_tests.rs 。`cargo test --offline --release --locked --manifest-path apps/host-rs/Cargo.toml review_resume_`（dry-run）。候補の独立試験はreview_rotation_tests.rsとreview-terminal-regression.mjs。Rust targetはreview-integration-20261111専用のdata/local/review-target-20261111を使用し、別worktreeと共有しない。

次：統合CIと承認を待つ間に#325を独立レビュー。#284/#313の修正push時に6系列を再実行。承認後のみ、承認されたSHAの範囲を順次マージし、最新main・CI・Issue状態を毎段階確認する。
