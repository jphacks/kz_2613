# React製品構成の自己レビューと標準化

## 判断前の事実

2026-11-09、ユーザーはPR #274の総合自己レビューと改善を依頼した。比較開始時のmainは `c271ebe2335af9bdff5f30d58304a30d74f847f7`、PRは `9947391eb430dcc949877170e926b20e6a9d303b`。両者を `data/local/review-baseline-main`・`review-baseline-pr` の独立worktreeへ保存した。作業開始時の作業ツリーはクリーン。

Reactの製品画面はTSXだが、入力・接続・表示判断は `apps/web-static/` のJSに依存する。`allowJs:true/checkJs:false` により、その内部はstrict検査されない。スマホの操作部には別React root、PCランタイムには旧DOM rendererが残る。入力の保持と通信をReact stateへ移す理由はないが、これらを製品の正本として維持する理由もない。

Open PRは #273 と #274。#273はダークスキンの無効ボタンとBUILD_LOGを変更する。受入記録は旧mainの証拠であり、今回のReact実機受入へ転用しない。スキンの同じ不具合は今回の画面でも確認・対応し、重複をPR説明に記載する。

## 採用する構成

- `apps/web/src/` を製品コードの正本にし、UI、表示モデル、入力、接続、通信境界をstrict TypeScriptで検査する。依存追加は不要。
- UIの低頻度状態は外部storeのsnapshotをReactが購読する。接続・認可・epochの正本はセッション。PCホストの状態は受信snapshotであり、UIが認可を決めない。
- 入力エンジンはReactに依存しない。Pointer Events→保持元の統合→型付き入力→同じiseqのRTC/WS→Rustという流れを維持する。視点累積値・lseq・33ms周期、最低押下/解放などの既存定数を変えない。
- 操作レイアウトは操作IDに結び付いたデータ。担当割当・物理出力と分離し、プレイと非入力プレビューで共通React部品を使う。保存スキーマ・編集UIの完成は #271 / #50 の範囲。
- Reactは構造と表示テキストを所有する。入力エンジンが所有するDOMは押下中クラス・ノブ・パッドなど高頻度の局所表現に限り、型付き参照で結ぶ。エンジンの開始/破棄を対にし、再描画で多重登録しない。
- JSONはunknownで受信し、実行時検証を通した判別共用体だけを適用する。Rustの認可・旧epoch拒否は維持。#272の全面型生成は別だが、今回使う境界の型欠落は今回修正する。

## 保全と切替

旧画面・旧エンジンは比較用資産として明示的に分離し、製品bundleからの参照をなくす。履歴上の正確な基準点は上記2コミットで固定する。標準URLとTauriは、回帰・実機比較・配布検証後にPRブランチで切り替える。mainのマージ、Issue close、正式リリースはしない。

不合格なら標準切替を進めず、比較worktreeと元コミットから再現する。他人の変更をresetしない。iPhoneを用意できないというユーザー判断は継続し、その未確認だけを理由に今回のPR標準化を停止しない。Minecraft・実指・複数実端末の受入は合格と報告しない。

## 実装・検証順序

1. A=旧main、B=変更前PRの旧画面、C=変更前PRのReactを固定し、同じAndroid/Chrome/ホストexe/接続/操作で各60秒×3回を測る。順序を交互にし、試行ごとにホスト・タブ・統計を作り直す。
2. 入力・保持・接続・通信から表示判断・ランタイムへ移す。既存のアルゴリズム回帰試験とstrict検査を段階ごとに実行する。
3. Reactの構造所有・cleanup・表示と操作の分離を修正し、同じ試験を製品TS側にも適用する。
4. D=エンジン移行後を同条件で比較。端末内時間、ACK RTT、同一ホスト内の処理時間を分ける。異なる時計を差し引かず、計測できない区間は未確認とする。
5. 全レビュー項目を根拠付きで判定し、標準化後のAndroid/Tauri/オフライン資産/zip/CIを再検証する。

USB reverseの結果はWi-Fi性能ではない。CDPのタッチは実指ではない。dry-runの出力時間はMinecraft反応時間ではない。短い試行で長時間の性能を保証しない。測定による負荷も全条件に共通にする。

## 最終構成と採用結果

上記の方針を実装し、PRブランチでReactを標準にした。製品の入力・通信・接続・モデル・ランタイムをTSへ移した理由は、重要な製品コードへstrict検査と明示的な寿命を適用し、旧DOM描画との二重責務を解消するためである。型付け自体による高速化は採用理由にしない。本番依存の追加はない。

| 責務 | 正本 | 状態・寿命 |
|---|---|---|
| 製品HTML/ビルド | `apps/web/pages/`、`apps/web/vite.config.js` | Vite生成物は編集しない |
| UI/共通操作部 | `phone/PhoneApp.tsx`・`Controller.tsx`、`pc/PcApp.tsx`・各部品 | Reactが要素構造・文言を所有 |
| 低頻度の表示 | `phone/view.ts`、`pc/model.ts`、`store.ts` | snapshotを購読。診断telemetryは同期flushしない |
| 純粋モデル/操作定義 | `model/`、`controller-layout.ts`、`contracts.ts` | ゲーム操作・担当・表示・部品を分離 |
| 高頻度入力 | `input/` | Pointer Events、保持元、stick/pad、releaseAll。React state外 |
| 通信/認可の境界 | `transport/` | unknown受信→実行時検証→型付きmessage。セッションとepochが正本 |
| 結合と破棄 | `phone/runtime.ts`・`pc/runtime.ts`、`input/lifetime.ts` | 接続/購読/タイマーの開始とdispose、停止時全解放 |
| ホスト/PCアプリ | Rust `main.rs`、Tauri `main.rs` | `/`・`/app`がReact、OS入力と認可は既存Rustのまま |
| 比較・復元 | `apps/web-static/LEGACY.md` | 明示した旧URL・固定worktree。製品TSから参照しない |

`39e4c5d`で移行、`48f180a`でAPI境界を補完、`df7e3eb`でACK/input経路の診断同期描画を除去。`53b0f59`で標準化、`0d43517`で標準資産試験の起動通知とCLI境界を補完した。後続の補助試験修正と資料は同じPRへ反映する。

[総合レビュー](../acceptance/2026-11-09-pr274-self-review.md) の206項目と[Android性能報告](../acceptance/2026-11-09-react-performance.md) に根拠・制限を残した。A〜E各60秒×3回の比較、標準URLのAndroid、Tauri実窓、通常権限ビルド、repo外zip、CIが成功した範囲で標準化を採用する。iPhoneを利用できないことだけを理由には保留しないが、実指・Minecraft・緊急停止実操作などの安全受入は完了していない。

#50/#271の編集/保存、#272のRustとの全面型生成、#157/#264の追加計測を今回完成したとは扱わない。mainマージ・Issue close・正式リリース・Award Day安定版の更新は行わない。

## Wi-Fiを製品評価の前提にする追記

2026-11-09の[ユーザー判断](2026-11-09-wifi-product-baseline.md)に従い、PR #274の標準化・性能改善は実Wi-Fi上の旧版/新版、RTC+WS/WS-only、修正前/後を中心に評価する。USBの既存試行は開発用の履歴として保持し、追加USB対Wi-Fi比較を完了条件にしない。#276はWi-Fi内の観測区間・計測負荷の統一へ変更し、#275/#277もWi-Fiの利用・障害復旧を対象とする。
