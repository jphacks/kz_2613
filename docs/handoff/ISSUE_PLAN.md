# 開発Issue計画 — 観測事実と未完了条件の整理

PR #65はユーザー承認後にmainへマージ済み（58c5c6f）。この計画はその要件v0.3・設計と今回の明示指示に合わせたPR #66の修正案。
[E]はNode試作品の観測区分で、今後の明示的なユーザー判断を優先する。RustはPC上のシミュレーションのみ実施済み。Minecraft・Tauri・Rust実機は未検証。

## 完了判定と反映範囲

- #1〜#4の初期構築だけが既存の完了。#5・#23・#31は元の完了条件に未確認事項が残るため未完了で保持する。#10も端末別の記録を確認するまで完了扱いしない。
- #28は方針変更によるクローズ候補で、今回は閉じない。PR #66のmainマージとIssueの一括クローズは別途ユーザーの実施前確認が必要。
- 新規Issueは実在する番号を登録済み：N1=[#67](https://github.com/jphacks/kz_2613/issues/67)、N3=[#68](https://github.com/jphacks/kz_2613/issues/68)、N2=[#69](https://github.com/jphacks/kz_2613/issues/69)、N4=[#70](https://github.com/jphacks/kz_2613/issues/70)。N1等は計画内の識別子でありIssue番号ではない。
- 試作品取り込み #67 → 代替CI #68 → Rust実機比較 #69の順とする。#69には安全なプローブ #5も必要。旧ひな形の削除は代替CI準備後に #68 で行い、#67へ相互依存させない。
- 自動復帰の実運用初期値・使用条件は未決定。ホストPAUSEは常に非自動。通信切断はON/OFF・期限内/外・全員の復帰と入力解放を分けて検証する。
- 各Issueの状況は観測記録と受入条件を照合する。現行GitHubへの本文・依存関係の同期結果はBUILD_LOGとPR #66へ記録する。

## 一覧

| ID | Issue | 成果物 | 優先度/種別/対象 | 前提 | 状況 |
|---|---|---|---|---|---|
| S0 | [#1](https://github.com/jphacks/kz_2613/issues/1) | [Phase 0][P0] リポジトリ初期環境を安全に統合する | P0/infra/host | なし | 完了（既存の初期構築） |
| S1 | [#2](https://github.com/jphacks/kz_2613/issues/2) | [Phase 0][P0] Python 3.12 APIの起動・ヘルスチェックを確立する | P0/infra/host | [#1](https://github.com/jphacks/kz_2613/issues/1) | 完了（既存の初期構築） |
| S2 | [#3](https://github.com/jphacks/kz_2613/issues/3) | [Phase 0][P0] Reactの型検査・テスト・静的ビルド配信を確立する | P0/infra/web | [#1](https://github.com/jphacks/kz_2613/issues/1), [#2](https://github.com/jphacks/kz_2613/issues/2) | 完了（既存の初期構築） |
| S3 | [#4](https://github.com/jphacks/kz_2613/issues/4) | [Phase 0][P0] CI・共通開発ルールとIssue運用を整備する | P0/infra/host | [#2](https://github.com/jphacks/kz_2613/issues/2), [#3](https://github.com/jphacks/kz_2613/issues/3) | 完了（既存の初期構築） |
| N1 | [#67](https://github.com/jphacks/kz_2613/issues/67) | [Phase 1][P0] 試作品・Rust版・静的画面と比較用シミュレーションを取り込む | P0/infra/host | PR #65はユーザー承認後にmainへマージ済み。取り込みは別の実装作業とする。 | 未完了 |
| N2 | [#69](https://github.com/jphacks/kz_2613/issues/69) | [Phase 1][P0] Rust版を実機3台でNode参照実装と比較する | P0/test/host | [#67](https://github.com/jphacks/kz_2613/issues/67), [#68](https://github.com/jphacks/kz_2613/issues/68), #5 | 未完了 |
| N3 | [#68](https://github.com/jphacks/kz_2613/issues/68) | [Phase 1][P0] Rustと通信シミュレーションへCIを移行する | P0/infra/host | [#67](https://github.com/jphacks/kz_2613/issues/67) | 未完了 |
| V0 | [#5](https://github.com/jphacks/kz_2613/issues/5) | [Phase 1][P0] 明示操作でのみ実行するWindows入力プローブを用意する | P0/feature/input | [#4](https://github.com/jphacks/kz_2613/issues/4), [#67](https://github.com/jphacks/kz_2613/issues/67) | 一部確認・未完了 |
| V1 | [#6](https://github.com/jphacks/kz_2613/issues/6) | [Phase 1][P0] SendInputキー入力をMinecraft実機で検証する | P0/test/input | [#5](https://github.com/jphacks/kz_2613/issues/5) | 未完了 |
| V2 | [#7](https://github.com/jphacks/kz_2613/issues/7) | [Phase 1][P0] 左右クリック・長押し・ホイールをMinecraft実機で検証する | P0/test/input | [#5](https://github.com/jphacks/kz_2613/issues/5) | 未完了 |
| V3 | [#8](https://github.com/jphacks/kz_2613/issues/8) | [Phase 1][P0] 相対マウス視点操作の成立性をMinecraft実機で検証する | P0/test/input | [#5](https://github.com/jphacks/kz_2613/issues/5) | 未完了 |
| V4 | [#9](https://github.com/jphacks/kz_2613/issues/9) | [Phase 1][P0] Windowsホットスポットと上流なしLAN接続を検証する | P0/test/network | なし | 未完了 |
| V5 | [#10](https://github.com/jphacks/kz_2613/issues/10) | [Phase 1][P0] Android・iPhoneの基本Web表示とPointer Eventsを検証する | P0/test/web | なし | 一部確認・未完了 |
| B0 | [#11](https://github.com/jphacks/kz_2613/issues/11) | [Phase 2][P0] 通信契約v1（WebSocket＋WebRTC）に版番号を付けて維持する | P0/feature/network | [#67](https://github.com/jphacks/kz_2613/issues/67) | 未完了 |
| B1 | [#12](https://github.com/jphacks/kz_2613/issues/12) | [Phase 2][P0] 再接続用トークンをサーバー発行の推測困難な値にする | P0/feature/host | [#67](https://github.com/jphacks/kz_2613/issues/67) | 未完了 |
| B2 | [#13](https://github.com/jphacks/kz_2613/issues/13) | [Phase 2][P0] 接続順でホスト・P1/P2/P3を固定する | P0/feature/host | [#67](https://github.com/jphacks/kz_2613/issues/67), [#69](https://github.com/jphacks/kz_2613/issues/69) | 取り込み・再確認待ち |
| B3 | [#14](https://github.com/jphacks/kz_2613/issues/14) | [Phase 2][P0] 再接続で元の枠・ホスト権を復元する | P0/feature/host | [#67](https://github.com/jphacks/kz_2613/issues/67), [#69](https://github.com/jphacks/kz_2613/issues/69) | 取り込み・再確認待ち |
| B4 | [#15](https://github.com/jphacks/kz_2613/issues/15) | [Phase 2][P0] 状態機械にepochを追加し旧状態の遅延入力を拒否する | P0/feature/host | [#67](https://github.com/jphacks/kz_2613/issues/67) | 未完了 |
| B5 | [#16](https://github.com/jphacks/kz_2613/issues/16) | [Phase 2][P0] 役割・モード・管理操作の認可を実装する | P0/feature/host | [#67](https://github.com/jphacks/kz_2613/issues/67), [#69](https://github.com/jphacks/kz_2613/issues/69) | 取り込み・再確認待ち |
| B6 | [#17](https://github.com/jphacks/kz_2613/issues/17) | [Phase 2][P0] 保持キー・ボタンと入力所有状態を管理する | P0/feature/input | [#67](https://github.com/jphacks/kz_2613/issues/67), [#69](https://github.com/jphacks/kz_2613/issues/69) | 取り込み・再確認待ち |
| B7 | [#18](https://github.com/jphacks/kz_2613/issues/18) | [Phase 2][P0] 心拍・通信断・終了時の全入力解放を実装する | P0/feature/input | [#67](https://github.com/jphacks/kz_2613/issues/67), [#69](https://github.com/jphacks/kz_2613/issues/69) | 取り込み・再確認待ち |
| B8 | [#19](https://github.com/jphacks/kz_2613/issues/19) | [Phase 2][P0] onモードで前面ウィンドウがMinecraftか確認して注入する | P0/feature/input | [#67](https://github.com/jphacks/kz_2613/issues/67), [#6](https://github.com/jphacks/kz_2613/issues/6) | 未完了 |
| B9 | [#20](https://github.com/jphacks/kz_2613/issues/20) | [Phase 2][P0] 検証済みSendInputアダプターを入力エンジンへ接続する | P0/feature/input | [#67](https://github.com/jphacks/kz_2613/issues/67), [#69](https://github.com/jphacks/kz_2613/issues/69) | 取り込み・再確認待ち |
| B10 | [#21](https://github.com/jphacks/kz_2613/issues/21) | [Phase 2][P0] スマホ回線に依存しないPCの緊急停止を実装する | P0/feature/host | [#67](https://github.com/jphacks/kz_2613/issues/67) | 未完了 |
| B11 | [#22](https://github.com/jphacks/kz_2613/issues/22) | [Phase 2][P0] 診断ログからIP・端末情報・clientIdを除く | P0/feature/host | [#67](https://github.com/jphacks/kz_2613/issues/67) | 未完了 |
| B12 | [#23](https://github.com/jphacks/kz_2613/issues/23) | [Phase 2][P0] LANの3ブラウザHTTP・WebSocket・WebRTCを検証する | P0/test/network | [#67](https://github.com/jphacks/kz_2613/issues/67), [#69](https://github.com/jphacks/kz_2613/issues/69), [#16](https://github.com/jphacks/kz_2613/issues/16), [#9](https://github.com/jphacks/kz_2613/issues/9), [#10](https://github.com/jphacks/kz_2613/issues/10) | 一部確認・未完了 |
| N4 | [#70](https://github.com/jphacks/kz_2613/issues/70) | [Phase 2][P1] 無線が不安定な端末の診断と案内を整備する | P1/feature/network | [#67](https://github.com/jphacks/kz_2613/issues/67) | 未完了 |
| W0 | [#24](https://github.com/jphacks/kz_2613/issues/24) | [Phase 3][P0] 役割・接続状態と再接続UIを実装する | P0/feature/web | [#67](https://github.com/jphacks/kz_2613/issues/67), [#69](https://github.com/jphacks/kz_2613/issues/69) | 取り込み・再確認待ち |
| W1 | [#25](https://github.com/jphacks/kz_2613/issues/25) | [Phase 3][P0] Pointer Eventsの共通押下・解放処理を実装する | P0/feature/web | [#67](https://github.com/jphacks/kz_2613/issues/67), [#69](https://github.com/jphacks/kz_2613/issues/69) | 取り込み・再確認待ち |
| W2 | [#26](https://github.com/jphacks/kz_2613/issues/26) | [Phase 3][P0] ホスト用の矢印・Enter・Escリモコンを実装する | P0/feature/web | [#67](https://github.com/jphacks/kz_2613/issues/67), [#69](https://github.com/jphacks/kz_2613/issues/69) | 取り込み・再確認待ち |
| W3 | [#27](https://github.com/jphacks/kz_2613/issues/27) | [Phase 3][P0] P1の移動スティック・ジャンプ・スニーク・ダッシュを実装する | P0/feature/web | [#67](https://github.com/jphacks/kz_2613/issues/67), [#69](https://github.com/jphacks/kz_2613/issues/69) | 取り込み・再確認待ち |
| W4 | [#28](https://github.com/jphacks/kz_2613/issues/28) | [Phase 3][P0] P2の方向ボタン視点コントローラーを実装する | P0/feature/web | なし | 方針変更・クローズ候補（未実施） |
| W5 | [#29](https://github.com/jphacks/kz_2613/issues/29) | [Phase 3][P0] P3の攻撃・使う・持ち物・インベントリ・捨てるを実装する | P0/feature/web | [#67](https://github.com/jphacks/kz_2613/issues/67), [#69](https://github.com/jphacks/kz_2613/issues/69) | 取り込み・再確認待ち |
| W6 | [#30](https://github.com/jphacks/kz_2613/issues/30) | [Phase 3][P0] ホストSTART・PAUSE・RESUME・ENDと開始条件のUIを実装する | P0/feature/web | [#67](https://github.com/jphacks/kz_2613/issues/67), [#69](https://github.com/jphacks/kz_2613/issues/69) | 取り込み・再確認待ち |
| W7 | [#31](https://github.com/jphacks/kz_2613/issues/31) | [Phase 3][P0] Android・iPhoneで全コントローラーを実機検証する | P0/test/web | [#69](https://github.com/jphacks/kz_2613/issues/69), [#30](https://github.com/jphacks/kz_2613/issues/30), [#20](https://github.com/jphacks/kz_2613/issues/20), [#23](https://github.com/jphacks/kz_2613/issues/23) | 一部確認・未完了 |
| D0 | [#32](https://github.com/jphacks/kz_2613/issues/32) | [Phase 4][P0] 参加用QR・URL・人数画面を実装する | P0/feature/desktop | [#67](https://github.com/jphacks/kz_2613/issues/67), [#69](https://github.com/jphacks/kz_2613/issues/69) | 取り込み・再確認待ち |
| D1 | [#33](https://github.com/jphacks/kz_2613/issues/33) | [Phase 4][P0] 手動起動を許容するゲーム選択画面を実装する | P0/feature/desktop | [#32](https://github.com/jphacks/kz_2613/issues/32) | 未完了 |
| D2 | [#34](https://github.com/jphacks/kz_2613/issues/34) | [Phase 4][P0] 3人の操作分担確認画面を実装する | P0/feature/desktop | [#33](https://github.com/jphacks/kz_2613/issues/33) | 未完了 |
| D3 | [#35](https://github.com/jphacks/kz_2613/issues/35) | [Phase 4][P0] Minecraftへの移行・復帰時もセッションを維持する | P0/feature/desktop | [#34](https://github.com/jphacks/kz_2613/issues/34), [#19](https://github.com/jphacks/kz_2613/issues/19), [#30](https://github.com/jphacks/kz_2613/issues/30) | 未完了 |
| D4 | [#36](https://github.com/jphacks/kz_2613/issues/36) | [Phase 4][P0] Tauri（WebView2）のPCアプリ枠とブラウザ代替を実装する | P0/feature/desktop | [#67](https://github.com/jphacks/kz_2613/issues/67), [#68](https://github.com/jphacks/kz_2613/issues/68) | 未完了 |
| D5 | [#37](https://github.com/jphacks/kz_2613/issues/37) | [Phase 4][P0] フォーカス切替とPC GUIの実機検証を行う | P0/test/desktop | [#36](https://github.com/jphacks/kz_2613/issues/36), [#20](https://github.com/jphacks/kz_2613/issues/20) | 未完了 |
| E0 | [#38](https://github.com/jphacks/kz_2613/issues/38) | [Phase 5][P0] 3台同時操作と役割・管理権のE2Eを検証する | P0/test/host | [#31](https://github.com/jphacks/kz_2613/issues/31), [#37](https://github.com/jphacks/kz_2613/issues/37) | 未完了 |
| E1 | [#39](https://github.com/jphacks/kz_2613/issues/39) | [Phase 5][P0] 切断・再接続・緊急停止の障害試験を行う | P0/test/input | [#38](https://github.com/jphacks/kz_2613/issues/38), [#21](https://github.com/jphacks/kz_2613/issues/21), [#19](https://github.com/jphacks/kz_2613/issues/19), [#12](https://github.com/jphacks/kz_2613/issues/12), [#15](https://github.com/jphacks/kz_2613/issues/15), [#18](https://github.com/jphacks/kz_2613/issues/18) | 未完了 |
| E2 | [#40](https://github.com/jphacks/kz_2613/issues/40) | [Phase 5][P0] Minecraft協力プレイの反復デモを検証する | P0/test/host | [#39](https://github.com/jphacks/kz_2613/issues/39) | 未完了 |
| E3 | [#41](https://github.com/jphacks/kz_2613/issues/41) | [Phase 5][P0] Windows配布パッケージ（Tauriバンドル）を作る | P0/infra/desktop | [#36](https://github.com/jphacks/kz_2613/issues/36), [#39](https://github.com/jphacks/kz_2613/issues/39) | 未完了 |
| E4 | [#42](https://github.com/jphacks/kz_2613/issues/42) | [Phase 5][P0] ゲーム画面・名称・デモ素材の利用条件を確認する | P0/docs/desktop | [#4](https://github.com/jphacks/kz_2613/issues/4) | 未完了 |
| E5 | [#43](https://github.com/jphacks/kz_2613/issues/43) | [Phase 5][P0] READMEと発表デモ・当日復旧手順を整備する | P0/docs/host | [#40](https://github.com/jphacks/kz_2613/issues/40), [#41](https://github.com/jphacks/kz_2613/issues/41), [#42](https://github.com/jphacks/kz_2613/issues/42) | 未完了 |
| P11 | [#44](https://github.com/jphacks/kz_2613/issues/44) | [Phase 6][P0] P1移動を仮想スティックへ拡張する | P0/feature/web | [#67](https://github.com/jphacks/kz_2613/issues/67), [#69](https://github.com/jphacks/kz_2613/issues/69) | 取り込み・再確認待ち |
| P12 | [#45](https://github.com/jphacks/kz_2613/issues/45) | [Phase 6][P0] P2視点をスワイプ・感度調整へ拡張する | P0/feature/web | [#67](https://github.com/jphacks/kz_2613/issues/67), [#69](https://github.com/jphacks/kz_2613/issues/69) | 取り込み・再確認待ち |
| P13 | [#46](https://github.com/jphacks/kz_2613/issues/46) | [Phase 6][P1] ホストリモコンにタッチパッド・クリック・Eキーを追加する | P1/feature/web | [#40](https://github.com/jphacks/kz_2613/issues/40) | 未完了 |
| P14 | [#47](https://github.com/jphacks/kz_2613/issues/47) | [Phase 6][P1] Pause中の役割指定・交換を実装する | P1/feature/host | [#40](https://github.com/jphacks/kz_2613/issues/40) | 未完了 |
| P15 | [#48](https://github.com/jphacks/kz_2613/issues/48) | [Phase 6][P1] PCゲーム一覧を矢印・Enter・Escで選択可能にする | P1/feature/desktop | [#40](https://github.com/jphacks/kz_2613/issues/40) | 未完了 |
| P16 | [#49](https://github.com/jphacks/kz_2613/issues/49) | [Phase 6][P1] ゲーム起動パスの手動登録を追加する | P1/feature/desktop | [#40](https://github.com/jphacks/kz_2613/issues/40) | 未完了 |
| P17 | [#50](https://github.com/jphacks/kz_2613/issues/50) | [Phase 6][P1] 操作ボタン配置とキー割当の編集を追加する | P1/feature/web | [#47](https://github.com/jphacks/kz_2613/issues/47) | 未完了 |
| P18 | [#51](https://github.com/jphacks/kz_2613/issues/51) | [Phase 6][P1] QR参加案内・Ready表示と開始前の説明を改善する | P1/feature/web | [#40](https://github.com/jphacks/kz_2613/issues/40) | 未完了 |
| P19 | [#52](https://github.com/jphacks/kz_2613/issues/52) | [Phase 6][P1] 横画面・安全領域と操作フィードバックを改善する | P1/feature/web | [#40](https://github.com/jphacks/kz_2613/issues/40) | 未完了 |
| P110 | [#53](https://github.com/jphacks/kz_2613/issues/53) | [Phase 6][P1] ゲーム別入力プリセットをローカル保存する | P1/feature/host | [#40](https://github.com/jphacks/kz_2613/issues/40) | 未完了 |
| P21 | [#54](https://github.com/jphacks/kz_2613/issues/54) | [Phase 7][P2] ローカルランチャー情報からゲーム候補を検出する | P2/feature/desktop | [#49](https://github.com/jphacks/kz_2613/issues/49) | 未完了 |
| P22 | [#55](https://github.com/jphacks/kz_2613/issues/55) | [Phase 7][P2] Minecraftランチャー検出と起動支援を追加する | P2/feature/desktop | [#49](https://github.com/jphacks/kz_2613/issues/49) | 未完了 |
| P23 | [#56](https://github.com/jphacks/kz_2613/issues/56) | [Phase 7][P2] 任意のPCアプリの手動登録を一般化する | P2/feature/desktop | [#49](https://github.com/jphacks/kz_2613/issues/49) | 未完了 |
| P24 | [#57](https://github.com/jphacks/kz_2613/issues/57) | [Phase 7][P2] 2〜4人の可変人数と役割枠を設計・実装する | P2/feature/host | [#47](https://github.com/jphacks/kz_2613/issues/47) | 未完了 |
| P25 | [#58](https://github.com/jphacks/kz_2613/issues/58) | [Phase 7][P2] 操作量・重要度に基づく役割提案を試作する | P2/feature/host | [#57](https://github.com/jphacks/kz_2613/issues/57) | 未完了 |
| P26 | [#59](https://github.com/jphacks/kz_2613/issues/59) | [Phase 7][P2] ジャイロ等の身体的入力を実験する | P2/feature/web | [#53](https://github.com/jphacks/kz_2613/issues/53) | 未完了 |
| P27 | [#60](https://github.com/jphacks/kz_2613/issues/60) | [Phase 7][P2] 入力プロファイルから操作UIを生成する | P2/feature/web | [#53](https://github.com/jphacks/kz_2613/issues/53), [#50](https://github.com/jphacks/kz_2613/issues/50) | 未完了 |
| P28 | [#61](https://github.com/jphacks/kz_2613/issues/61) | [Phase 7][P2] Minecraft以外の1タイトルで入力対応を検証する | P2/test/input | [#53](https://github.com/jphacks/kz_2613/issues/53) | 未完了 |
| P29 | [#62](https://github.com/jphacks/kz_2613/issues/62) | [Phase 7][P2] 終了後の役割交換とリトライ導線を追加する | P2/feature/web | [#47](https://github.com/jphacks/kz_2613/issues/47) | 未完了 |
| P210 | [#63](https://github.com/jphacks/kz_2613/issues/63) | [Phase 7][P2] ローカル接続のワンタップ化・Legacy APを調査する | P2/feature/network | [#9](https://github.com/jphacks/kz_2613/issues/9), [#40](https://github.com/jphacks/kz_2613/issues/40) | 未完了 |

## 各Issueの作業・完了条件

### S0 — [#1](https://github.com/jphacks/kz_2613/issues/1)

## 概要
[Phase 0][P0] リポジトリ初期環境を安全に統合する

## 背景・関連要件
要件ID: ENV-01, NFR-12
- docs/requirements/requirements-v0.3.md
- docs/decisions/2026-10-24-user-decisions.md
- docs/architecture/system-design.md
- docs/architecture/validation-gates.md

## 作業内容
- [x] README・LICENSE保持、構造・ignore・共有仕様を確認する
- [x] verify_overlayとコミット対象の確認結果をBUILD_LOGへ残す

## 完了条件
- [x] README・LICENSE保持、構造・ignore・共有仕様を確認する
- [x] verify_overlayとコミット対象の確認結果をBUILD_LOGへ残す
- [x] 関連テストまたは手動試験の実行コマンド・観測結果を記録する
- [x] 必要な共通文書とdocs/handoff/BUILD_LOG.mdを更新する

## 依存関係
なし

## 備考
設計案[H]/[P]は確定事項と区別し、変更理由をdocs/decisions/へ残す。

## 完了証拠
- 初期構築: https://github.com/jphacks/kz_2613/commit/7327b5ec4acf46e00c0f97f96aafa4fe2a9650ff
- GitHub Actions（Windows/Ubuntu/web統合、全ジョブ成功）: https://github.com/jphacks/kz_2613/actions/runs/40082069275
- コマンド・環境・画面確認: docs/handoff/BUILD_LOG.md
- Minecraft入力や実機ゲートの完了は含まない。

### S1 — [#2](https://github.com/jphacks/kz_2613/issues/2)

## 概要
[Phase 0][P0] Python 3.12 APIの起動・ヘルスチェックを確立する

## 背景・関連要件
要件ID: ENV-01, NFR-12
- docs/requirements/requirements-v0.3.md
- docs/decisions/2026-10-24-user-decisions.md
- docs/architecture/system-design.md
- docs/architecture/validation-gates.md

## 作業内容
- [x] venvと固定依存を整備しpytest/ruffを実行する
- [x] healthはscaffoldでgame_input_ready=false、再現手順を記録する

## 完了条件
- [x] venvと固定依存を整備しpytest/ruffを実行する
- [x] healthはscaffoldでgame_input_ready=false、再現手順を記録する
- [x] 関連テストまたは手動試験の実行コマンド・観測結果を記録する
- [x] 必要な共通文書とdocs/handoff/BUILD_LOG.mdを更新する

## 依存関係
[#1](https://github.com/jphacks/kz_2613/issues/1)

## 備考
設計案[H]/[P]は確定事項と区別し、変更理由をdocs/decisions/へ残す。

## 完了証拠
- 初期構築: https://github.com/jphacks/kz_2613/commit/7327b5ec4acf46e00c0f97f96aafa4fe2a9650ff
- GitHub Actions（Windows/Ubuntu/web統合、全ジョブ成功）: https://github.com/jphacks/kz_2613/actions/runs/40082069275
- コマンド・環境・画面確認: docs/handoff/BUILD_LOG.md
- Minecraft入力や実機ゲートの完了は含まない。

### S2 — [#3](https://github.com/jphacks/kz_2613/issues/3)

## 概要
[Phase 0][P0] Reactの型検査・テスト・静的ビルド配信を確立する

## 背景・関連要件
要件ID: NFR-11, NFR-12
- docs/requirements/requirements-v0.3.md
- docs/decisions/2026-10-24-user-decisions.md
- docs/architecture/system-design.md
- docs/architecture/validation-gates.md

## 作業内容
- [x] npm lockを生成しcheck/Vitest/build、FastAPI配信を確認する
- [x] PC・スマホひな形とローカルJS/CSSを確認し記録する

## 完了条件
- [x] npm lockを生成しcheck/Vitest/build、FastAPI配信を確認する
- [x] PC・スマホひな形とローカルJS/CSSを確認し記録する
- [x] 関連テストまたは手動試験の実行コマンド・観測結果を記録する
- [x] 必要な共通文書とdocs/handoff/BUILD_LOG.mdを更新する

## 依存関係
[#1](https://github.com/jphacks/kz_2613/issues/1), [#2](https://github.com/jphacks/kz_2613/issues/2)

## 備考
設計案[H]/[P]は確定事項と区別し、変更理由をdocs/decisions/へ残す。

## 完了証拠
- 初期構築: https://github.com/jphacks/kz_2613/commit/7327b5ec4acf46e00c0f97f96aafa4fe2a9650ff
- GitHub Actions（Windows/Ubuntu/web統合、全ジョブ成功）: https://github.com/jphacks/kz_2613/actions/runs/40082069275
- コマンド・環境・画面確認: docs/handoff/BUILD_LOG.md
- Minecraft入力や実機ゲートの完了は含まない。

### S3 — [#4](https://github.com/jphacks/kz_2613/issues/4)

## 概要
[Phase 0][P0] CI・共通開発ルールとIssue運用を整備する

## 背景・関連要件
要件ID: NFR-12
- docs/requirements/requirements-v0.3.md
- docs/decisions/2026-10-24-user-decisions.md
- docs/architecture/system-design.md
- docs/architecture/validation-gates.md

## 作業内容
- [x] npm ci、Python/TS検証、PR/Issueテンプレートと共通運用を整備する
- [x] GitHub Actionsの成功とIssue計画・BUILD_LOGを記録する

## 完了条件
- [x] npm ci、Python/TS検証、PR/Issueテンプレートと共通運用を整備する
- [x] GitHub Actionsの成功とIssue計画・BUILD_LOGを記録する
- [x] 関連テストまたは手動試験の実行コマンド・観測結果を記録する
- [x] 必要な共通文書とdocs/handoff/BUILD_LOG.mdを更新する

## 依存関係
[#2](https://github.com/jphacks/kz_2613/issues/2), [#3](https://github.com/jphacks/kz_2613/issues/3)

## 備考
設計案[H]/[P]は確定事項と区別し、変更理由をdocs/decisions/へ残す。

## 完了証拠
- 初期構築: https://github.com/jphacks/kz_2613/commit/7327b5ec4acf46e00c0f97f96aafa4fe2a9650ff
- GitHub Actions（Windows/Ubuntu/web統合、全ジョブ成功）: https://github.com/jphacks/kz_2613/actions/runs/40082069275
- コマンド・環境・画面確認: docs/handoff/BUILD_LOG.md
- Minecraft入力や実機ゲートの完了は含まない。

### N1 — [#67](https://github.com/jphacks/kz_2613/issues/67)

## 概要
[Phase 1][P0] 試作品・Rust版・静的画面と比較用シミュレーションを取り込む

## 背景・関連要件
PR #65の要件v0.3・通信契約と、PR #66のIssue計画に対応する。AT-22、NFR-11/12、G4-C。PR #65は承認・main反映済み、PR #66はマージ承認待ち。

## 作業内容
- [ ] Node.js参照実装、Rust版ホスト、静的HTML/CSS/JavaScript、シミュレーションをレビュー可能な形でリポジトリへ追加する
- [ ] 依存・起動・設定例を記録し、秘密情報を除く。設定例へ実ゲームの自動復帰初期値を決定済みとして書かない
- [ ] RECOOPLAY_DRY_RUN=1でNode/Rustの権限・時間処理・切断・視点・二重経路・復帰設定を比較する
- [ ] 既存Python/Reactひな形と既存CIを残して追加し、削除・置換はN3で代替CIの準備後に行う
- [ ] 取り込みだけでMinecraft・Tauri・Rust実機を検証済みにしない

## 完了条件
- [ ] Node.js参照実装、Rust版ホスト、静的HTML/CSS/JavaScript、シミュレーションをレビュー可能な形でリポジトリへ追加する
- [ ] 依存・起動・設定例を記録し、秘密情報を除く。設定例へ実ゲームの自動復帰初期値を決定済みとして書かない
- [ ] RECOOPLAY_DRY_RUN=1でNode/Rustの権限・時間処理・切断・視点・二重経路・復帰設定を比較する
- [ ] 既存Python/Reactひな形と既存CIを残して追加し、削除・置換はN3で代替CIの準備後に行う
- [ ] 取り込みだけでMinecraft・Tauri・Rust実機を検証済みにしない
- [ ] 実行コマンド・観測結果・コミットをBUILD_LOGへ記録する
- [ ] 必要な設計・構築手順を更新する

## 依存関係
PR #65はユーザー承認後にmainへマージ済み。取り込みは別の実装作業とする。

## 備考
今回はIssueの作成・整理だけを行う。実装・実機試験は未着手。mainへのマージとIssueの一括クローズはユーザー確認前に行わない。

**管理状態：** 未完了で保持する。観測事実だけで完了扱いせず、Issueのクローズは実施前にユーザーへ確認する。

### N2 — [#69](https://github.com/jphacks/kz_2613/issues/69)

## 概要
[Phase 1][P0] Rust版を実機3台でNode参照実装と比較する

## 背景・関連要件
PR #65の要件v0.3・通信契約と、PR #66のIssue計画に対応する。AT-22、NFR-11/12、G4-C。PR #65は承認・main反映済み、PR #66はマージ承認待ち。

## 作業内容
- [ ] 取り込み済みコミット・起動手順を固定し、明示開始と独立した停止手段を準備する
- [ ] Android/iPhoneを含む3台でHTTP・WS・WebRTC、役割、START/PAUSE/RESUME/ENDを疑似ゲーム画面で比較する
- [ ] 1人の切断時にも全参加者の合成キー・マウスボタンが解放され、待機入力と視点が破棄されることを確認する
- [ ] 復帰設定ON/OFF、15秒の期限内/外、ホストPAUSEを分け、旧押下が戻らないことを確認する
- [ ] Rust実機結果をNodeの観測と区別して記録する。Minecraftでの自動復帰初期値・使用条件は決定しない

## 完了条件
- [ ] 取り込み済みコミット・起動手順を固定し、明示開始と独立した停止手段を準備する
- [ ] Android/iPhoneを含む3台でHTTP・WS・WebRTC、役割、START/PAUSE/RESUME/ENDを疑似ゲーム画面で比較する
- [ ] 1人の切断時にも全参加者の合成キー・マウスボタンが解放され、待機入力と視点が破棄されることを確認する
- [ ] 復帰設定ON/OFF、15秒の期限内/外、ホストPAUSEを分け、旧押下が戻らないことを確認する
- [ ] Rust実機結果をNodeの観測と区別して記録する。Minecraftでの自動復帰初期値・使用条件は決定しない
- [ ] 実行コマンド・観測結果・コミットをBUILD_LOGへ記録する
- [ ] 必要な設計・構築手順を更新する

## 依存関係
[#67](https://github.com/jphacks/kz_2613/issues/67), [#68](https://github.com/jphacks/kz_2613/issues/68), #5

## 備考
今回はIssueの作成・整理だけを行う。実装・実機試験は未着手。mainへのマージとIssueの一括クローズはユーザー確認前に行わない。

**管理状態：** 未完了で保持する。観測事実だけで完了扱いせず、Issueのクローズは実施前にユーザーへ確認する。

### N3 — [#68](https://github.com/jphacks/kz_2613/issues/68)

## 概要
[Phase 1][P0] Rustと通信シミュレーションへCIを移行する

## 背景・関連要件
PR #65の要件v0.3・通信契約と、PR #66のIssue計画に対応する。AT-22、NFR-11/12、G4-C。PR #65は承認・main反映済み、PR #66はマージ承認待ち。

## 作業内容
- [ ] 取り込んだRustのビルド・テストとNode/Rust比較シミュレーションをGitHub Actionsで実行する
- [ ] CIは入力注入なしとし、ゲームや実機の合格を代用しない
- [ ] 代替チェックの成功後に旧Python/Reactひな形の削除・置換と構造確認・セットアップ手順の更新を同じPRで行う
- [ ] mainのCIを途中で壊す削除を先行しない。Reactは任意で、静的画面をMVPの基準にする

## 完了条件
- [ ] 取り込んだRustのビルド・テストとNode/Rust比較シミュレーションをGitHub Actionsで実行する
- [ ] CIは入力注入なしとし、ゲームや実機の合格を代用しない
- [ ] 代替チェックの成功後に旧Python/Reactひな形の削除・置換と構造確認・セットアップ手順の更新を同じPRで行う
- [ ] mainのCIを途中で壊す削除を先行しない。Reactは任意で、静的画面をMVPの基準にする
- [ ] 実行コマンド・観測結果・コミットをBUILD_LOGへ記録する
- [ ] 必要な設計・構築手順を更新する

## 依存関係
[#67](https://github.com/jphacks/kz_2613/issues/67)

## 備考
今回はIssueの作成・整理だけを行う。実装・実機試験は未着手。mainへのマージとIssueの一括クローズはユーザー確認前に行わない。

**管理状態：** 未完了で保持する。観測事実だけで完了扱いせず、Issueのクローズは実施前にユーザーへ確認する。

### V0 — [#5](https://github.com/jphacks/kz_2613/issues/5)

## 概要
[Phase 1][P0] 明示操作でのみ実行するWindows入力プローブを用意する

## 状況（今回の整合性確認）
**未完了・クローズしない。** 元のIssue #5の条件を維持する。Node試作品のoff/test/onと疑似ゲーム画面への注入は観測済みだが、対象確認・独立した非常停止・finally全解放・起動/import時非送信・mock安全経路を満たす成果物と証拠は未確認。

## 背景・関連要件
- docs/requirements/requirements-v0.3.md
- docs/decisions/2026-10-24-prototype-validated.md
- docs/architecture/system-design.md
- docs/architecture/protocol.md
- docs/architecture/validation-gates.md
要件ID: ENV-01, ENV-02, FR-026, FR-034, FR-035

## 作業内容
- [ ] Windows限定、対象確認、手動arming、非常停止とfinally全解放を備える独立プローブを実装する
- [ ] 起動時やimport時に入力を送らずmockで安全経路を確認し実機手順を記す
- [ ] 注入off/test/onの存在を、入力先確認と独立した非常停止が完成した証拠としない

## 完了条件
- [ ] Windows限定、対象確認、手動arming、非常停止とfinally全解放を備える独立プローブを実装する
- [ ] 起動時やimport時に入力を送らずmockで安全経路を確認し実機手順を記す
- [ ] 注入off/test/onの存在を、入力先確認と独立した非常停止が完成した証拠としない
- [ ] 実行コマンド・対象コミット・実測結果をBUILD_LOGに記録する
- [ ] 必要な共通文書を更新し、未確認条件を完了扱いしない

## 依存関係
[#4](https://github.com/jphacks/kz_2613/issues/4), [#67](https://github.com/jphacks/kz_2613/issues/67)

## 備考
本Issueのプローブ内の対象確認・停止を先に満たす。製品全体のフォーカス監視 #19と緊急停止 #21も未実装の別成果物として残し、相互依存の循環を作らない。操作者の明示開始前にOS入力を送らない。

**管理状態：** 未完了で保持する。観測事実だけで完了扱いせず、Issueのクローズは実施前にユーザーへ確認する。

### V1 — [#6](https://github.com/jphacks/kz_2613/issues/6)

## 概要
[Phase 1][P0] SendInputキー入力をMinecraft実機で検証する

## 状況（2026-10-24）
疑似ゲーム画面では検証済み。Minecraftでは未実施。

## 背景・関連要件
要件ID: FR-011, FR-020, FR-022, FR-026, G1-A
- docs/requirements/requirements-v0.3.md
- docs/decisions/2026-10-24-prototype-validated.md
- docs/architecture/system-design.md
- docs/architecture/protocol.md
- docs/architecture/validation-gates.md

## 作業内容
- [ ] 試作品（Rust版またはNode参照実装）の `on` モードで、Minecraftを前面にして試す
- [ ] P1：移動スティック（W/A/S/D、斜め）、ジャンプ（Space）、スニーク（Shift）、ダッシュ（Ctrl）が働き、離すと止まることを確認する
- [ ] P3：インベントリ（E）、捨てる（Q）。ホスト：メニューでの矢印・Enter・Esc
- [ ] Minecraftの版・キー割当・設定を記録する

## 完了条件
- [ ] 試作品（Rust版またはNode参照実装）の `on` モードで、Minecraftを前面にして試す
- [ ] P1：移動スティック（W/A/S/D、斜め）、ジャンプ（Space）、スニーク（Shift）、ダッシュ（Ctrl）が働き、離すと止まることを確認する
- [ ] P3：インベントリ（E）、捨てる（Q）。ホスト：メニューでの矢印・Enter・Esc
- [ ] Minecraftの版・キー割当・設定を記録する
- [ ] 各キーの押下・解放がゲームに反映される（最低押下60msで取りこぼしがない）
- [ ] 関連テストまたは手動試験の実行コマンド・観測結果を記録する
- [ ] 必要な共通文書とdocs/handoff/BUILD_LOG.mdを更新する

## 依存関係
[#5](https://github.com/jphacks/kz_2613/issues/5)

## 備考
実機検証。端末・OS/ブラウザ・Minecraft版・ネットワーク・実施日/操作者・実測結果を記録する。未実施は未検証とする。

安全なプローブ #5 の完了後に、操作者が明示開始して実施する。試作品の注入成功だけでMinecraftの合格を主張しない。

**管理状態：** 未完了で保持する。観測事実だけで完了扱いせず、Issueのクローズは実施前にユーザーへ確認する。

### V2 — [#7](https://github.com/jphacks/kz_2613/issues/7)

## 概要
[Phase 1][P0] 左右クリック・長押し・ホイールをMinecraft実機で検証する

## 状況（2026-10-24）
疑似ゲーム画面では、長押しによる採掘・設置・ホイールを検証済み。Minecraftでは未実施。

## 背景・関連要件
要件ID: FR-022, FR-023, FR-030, G1-B
- docs/requirements/requirements-v0.3.md
- docs/decisions/2026-10-24-prototype-validated.md
- docs/architecture/system-design.md
- docs/architecture/protocol.md
- docs/architecture/validation-gates.md

## 作業内容
- [ ] P3の攻撃（左クリック）の長押しで採掘し、使う・置く（右クリック）で設置する
- [ ] 持ち物◀▶（ホイール±1）でホットバーが切り替わることを確認する

## 完了条件
- [ ] P3の攻撃（左クリック）の長押しで採掘し、使う・置く（右クリック）で設置する
- [ ] 持ち物◀▶（ホイール±1）でホットバーが切り替わることを確認する
- [ ] 押下・解放・長押し・ホイールがゲームに反映され、離すと止まる
- [ ] 関連テストまたは手動試験の実行コマンド・観測結果を記録する
- [ ] 必要な共通文書とdocs/handoff/BUILD_LOG.mdを更新する

## 依存関係
[#5](https://github.com/jphacks/kz_2613/issues/5)

## 備考
実機検証。端末・OS/ブラウザ・Minecraft版・ネットワーク・実施日/操作者・実測結果を記録する。未実施は未検証とする。

安全なプローブ #5 の完了後に、操作者が明示開始して実施する。試作品の注入成功だけでMinecraftの合格を主張しない。

**管理状態：** 未完了で保持する。観測事実だけで完了扱いせず、Issueのクローズは実施前にユーザーへ確認する。

### V3 — [#8](https://github.com/jphacks/kz_2613/issues/8)

## 概要
[Phase 1][P0] 相対マウス視点操作の成立性をMinecraft実機で検証する

## 状況（2026-10-24）
疑似ゲーム画面ではマウス固定中に視点が回った。Minecraftでは未実施。

## 背景・関連要件
要件ID: FR-021, EN-102, G1-C
- docs/requirements/requirements-v0.3.md
- docs/decisions/2026-10-24-prototype-validated.md
- docs/architecture/system-design.md
- docs/architecture/protocol.md
- docs/architecture/validation-gates.md

## 作業内容
- [ ] P2のドラッグで、カーソルが飛ばずに視点が回ることを確認する
- [ ] MinecraftのRaw InputのON/OFFと、Windowsの「ポインターの精度を高める」で感度がどう変わるかを記録する
- [ ] 推奨する感度（スマホ側0.5〜6）と、補間（30〜120ms）の体感を記録する

## 完了条件
- [ ] P2のドラッグで、カーソルが飛ばずに視点が回ることを確認する
- [ ] MinecraftのRaw InputのON/OFFと、Windowsの「ポインターの精度を高める」で感度がどう変わるかを記録する
- [ ] 推奨する感度（スマホ側0.5〜6）と、補間（30〜120ms）の体感を記録する
- [ ] 視点が滑らかに回り、推奨の設定が記録されている
- [ ] 関連テストまたは手動試験の実行コマンド・観測結果を記録する
- [ ] 必要な共通文書とdocs/handoff/BUILD_LOG.mdを更新する

## 依存関係
[#5](https://github.com/jphacks/kz_2613/issues/5)

## 備考
実機検証。端末・OS/ブラウザ・Minecraft版・ネットワーク・実施日/操作者・実測結果を記録する。未実施は未検証とする。

安全なプローブ #5 の完了後に、操作者が明示開始して実施する。試作品の注入成功だけでMinecraftの合格を主張しない。

**管理状態：** 未完了で保持する。観測事実だけで完了扱いせず、Issueのクローズは実施前にユーザーへ確認する。

### V4 — [#9](https://github.com/jphacks/kz_2613/issues/9)

## 概要
[Phase 1][P0] Windowsホットスポットと上流なしLAN接続を検証する

## 状況（2026-10-24）
上流回線がある状態では、3台の同時接続とHTTP・WebSocket・WebRTCを検証済み。上流回線なしは未実施。

## 背景・関連要件
要件ID: ENV-07, ENV-09, G2-A, AT-17
- docs/requirements/requirements-v0.3.md
- docs/decisions/2026-10-24-prototype-validated.md
- docs/architecture/system-design.md
- docs/architecture/protocol.md
- docs/architecture/validation-gates.md

## 作業内容
- [ ] PCの上流（Wi-Fi・有線）を外した状態で、ホットスポットを起動できるか確認する
- [ ] 起動中に上流を外しても維持されるか確認する
- [ ] できない場合は、ローカルAP・ルーターへの切り替え手順を記録する

## 完了条件
- [ ] PCの上流（Wi-Fi・有線）を外した状態で、ホットスポットを起動できるか確認する
- [ ] 起動中に上流を外しても維持されるか確認する
- [ ] できない場合は、ローカルAP・ルーターへの切り替え手順を記録する
- [ ] 上流回線なしで3台が参加して操作できる、または代替の構成が記録されている
- [ ] 関連テストまたは手動試験の実行コマンド・観測結果を記録する
- [ ] 必要な共通文書とdocs/handoff/BUILD_LOG.mdを更新する

## 依存関係
なし

## 備考
実機検証。端末・OS/ブラウザ・Minecraft版・ネットワーク・実施日/操作者・実測結果を記録する。未実施は未検証とする。

**管理状態：** 未完了で保持する。観測事実だけで完了扱いせず、Issueのクローズは実施前にユーザーへ確認する。

### V5 — [#10](https://github.com/jphacks/kz_2613/issues/10)

## 概要
[Phase 1][P0] Android・iPhoneの基本Web表示とPointer Eventsを検証する

## 状況（2026-10-24）
**一部確認・未完了。** Node試作品の接続・操作は観測済み。元の完了条件にある回転・非表示・長押し等の端末別記録を確認し、不足条件を追試する。

## 背景・関連要件
要件ID: ENV-04, NFR-02, NFR-07
- docs/requirements/requirements-v0.3.md
- docs/decisions/2026-10-24-prototype-validated.md
- docs/architecture/system-design.md
- docs/architecture/protocol.md
- docs/architecture/validation-gates.md

## 完了証拠
- Android 10 Chrome×2、iOS 18.7 Safari×2で、コントローラーの表示・長押し・複数の指（同時押し）・pointercancel・画面の非表示時の解放を確認した
- 詳細：docs/handoff/BUILD_LOG.md「通信試作品による実機検証」

## 残る完了条件
- [ ] 元のIssueにある両OSの押下・解放・複数指・非表示・回転・長押しの試験結果を記録する
- [ ] 端末・OS・ブラウザの版と手順、残留入力の有無を記録する

**管理状態：** 未完了で保持する。観測事実だけで完了扱いせず、Issueのクローズは実施前にユーザーへ確認する。

### B0 — [#11](https://github.com/jphacks/kz_2613/issues/11)

## 概要
[Phase 2][P0] 通信契約v1（WebSocket＋WebRTC）に版番号を付けて維持する

## 状況（2026-10-24）
契約は docs/architecture/protocol.md にまとめた。Node参照実装とRust版で実装済み。

## 背景・関連要件
要件ID: FR-037, FR-038, NFR-15
- docs/requirements/requirements-v0.3.md
- docs/decisions/2026-10-24-prototype-validated.md
- docs/architecture/system-design.md
- docs/architecture/protocol.md
- docs/architecture/validation-gates.md

## 作業内容
- [ ] `hello`・`welcome` に `protocolVersion` を加え、版が合わない場合は理由を返して接続を閉じる
- [ ] シミュレーションを契約のテストとして位置づけ、契約を変えるときは protocol.md とテストを同時に更新する規則を定める

## 完了条件
- [ ] `hello`・`welcome` に `protocolVersion` を加え、版が合わない場合は理由を返して接続を閉じる
- [ ] シミュレーションを契約のテストとして位置づけ、契約を変えるときは protocol.md とテストを同時に更新する規則を定める
- [ ] 版の不一致を検出でき、シミュレーションが契約のテストとして実行される
- [ ] 関連テストまたは手動試験の実行コマンド・観測結果を記録する
- [ ] 必要な共通文書とdocs/handoff/BUILD_LOG.mdを更新する

## 依存関係
[#67](https://github.com/jphacks/kz_2613/issues/67)

**管理状態：** 未完了で保持する。観測事実だけで完了扱いせず、Issueのクローズは実施前にユーザーへ確認する。

### B1 — [#12](https://github.com/jphacks/kz_2613/issues/12)

## 概要
[Phase 2][P0] 再接続用トークンをサーバー発行の推測困難な値にする

## 状況（2026-10-24）
現在は端末で生成した `clientId` で再接続している。推測困難なトークンとホストの再認証は未実装。

## 背景・関連要件
要件ID: ROLE-05, NFR-09, NFR-13
- docs/requirements/requirements-v0.3.md
- docs/decisions/2026-10-24-prototype-validated.md
- docs/architecture/system-design.md
- docs/architecture/protocol.md
- docs/architecture/validation-gates.md

## 作業内容
- [ ] `welcome` でランダムなトークン（128bit以上）を発行し、端末に保存させる
- [ ] 再接続はトークンで照合し、他の端末が枠を乗っ取れないようにする
- [ ] トークンをログに残さない

## 完了条件
- [ ] `welcome` でランダムなトークン（128bit以上）を発行し、端末に保存させる
- [ ] 再接続はトークンで照合し、他の端末が枠を乗っ取れないようにする
- [ ] トークンをログに残さない
- [ ] トークンなし・不一致の再接続が拒否され、正しいトークンで元の枠へ戻る
- [ ] 関連テストまたは手動試験の実行コマンド・観測結果を記録する
- [ ] 必要な共通文書とdocs/handoff/BUILD_LOG.mdを更新する

## 依存関係
[#67](https://github.com/jphacks/kz_2613/issues/67)

**管理状態：** 未完了で保持する。観測事実だけで完了扱いせず、Issueのクローズは実施前にユーザーへ確認する。

### B2 — [#13](https://github.com/jphacks/kz_2613/issues/13)

## 概要
[Phase 2][P0] 接続順でホスト・P1/P2/P3を固定する

## 状況（2026-10-24）
**取り込み待ち。** 仕様は試作品（Node.js参照実装）で実装・実機確認済み。Rust版ホストへ移植済みで、PC上のシミュレーションでは参照実装と一致した。リポジトリへの取り込み（N1）と実機の再確認（N2）で完了とする。

## 背景・関連要件
要件ID: ROLE-01, ROLE-03, FR-003, FR-007, AT-02
- docs/requirements/requirements-v0.3.md
- docs/decisions/2026-10-24-prototype-validated.md
- docs/architecture/system-design.md
- docs/architecture/protocol.md
- docs/architecture/validation-gates.md

## 作業内容
- [ ] N1でRust版ホスト・静的画面をリポジトリへ取り込む
- [ ] 取り込んだコードで、関連する受入試験をシミュレーションと実機で再確認する

## 完了条件
- [ ] N1でRust版ホスト・静的画面をリポジトリへ取り込む
- [ ] 取り込んだコードで、関連する受入試験をシミュレーションと実機で再確認する
- [ ] 関連テストまたは手動試験の実行コマンド・観測結果を記録する
- [ ] 必要な共通文書とdocs/handoff/BUILD_LOG.mdを更新する

## 依存関係
[#67](https://github.com/jphacks/kz_2613/issues/67), [#69](https://github.com/jphacks/kz_2613/issues/69)

**管理状態：** 未完了で保持する。観測事実だけで完了扱いせず、Issueのクローズは実施前にユーザーへ確認する。

### B3 — [#14](https://github.com/jphacks/kz_2613/issues/14)

## 概要
[Phase 2][P0] 再接続で元の枠・ホスト権を復元する

## 状況（2026-10-24）
**取り込み待ち。** 仕様は試作品（Node.js参照実装）で実装・実機確認済み。Rust版ホストへ移植済みで、PC上のシミュレーションでは参照実装と一致した。リポジトリへの取り込み（N1）と実機の再確認（N2）で完了とする。

## 背景・関連要件
要件ID: ROLE-04, FR-006, FR-019, AT-12
- docs/requirements/requirements-v0.3.md
- docs/decisions/2026-10-24-prototype-validated.md
- docs/architecture/system-design.md
- docs/architecture/protocol.md
- docs/architecture/validation-gates.md

## 作業内容
- [ ] N1でRust版ホスト・静的画面をリポジトリへ取り込む
- [ ] 取り込んだコードで、関連する受入試験をシミュレーションと実機で再確認する

## 完了条件
- [ ] N1でRust版ホスト・静的画面をリポジトリへ取り込む
- [ ] 取り込んだコードで、関連する受入試験をシミュレーションと実機で再確認する
- [ ] 関連テストまたは手動試験の実行コマンド・観測結果を記録する
- [ ] 必要な共通文書とdocs/handoff/BUILD_LOG.mdを更新する

## 依存関係
[#67](https://github.com/jphacks/kz_2613/issues/67), [#69](https://github.com/jphacks/kz_2613/issues/69)

**管理状態：** 未完了で保持する。観測事実だけで完了扱いせず、Issueのクローズは実施前にユーザーへ確認する。

### B4 — [#15](https://github.com/jphacks/kz_2613/issues/15)

## 概要
[Phase 2][P0] 状態機械にepochを追加し旧状態の遅延入力を拒否する

## 状況（2026-10-24）
3状態（lobby・coop・paused）と停止理由、状態変更時の全解放は実装・検証済み。`epoch` は未実装。

## 背景・関連要件
要件ID: SM-02, SM-05, NFR-15
- docs/requirements/requirements-v0.3.md
- docs/decisions/2026-10-24-prototype-validated.md
- docs/architecture/system-design.md
- docs/architecture/protocol.md
- docs/architecture/validation-gates.md

## 作業内容
- [ ] 状態が変わるたびに `epoch` を増やし、`game` で通知する
- [ ] `input`・`look` に `epoch` を付け、古い値の入力を拒否する

## 完了条件
- [ ] 状態が変わるたびに `epoch` を増やし、`game` で通知する
- [ ] `input`・`look` に `epoch` を付け、古い値の入力を拒否する
- [ ] PAUSE・RESUMEの直前に送られた入力が、新しい状態で処理されないことを試験で確認する
- [ ] 関連テストまたは手動試験の実行コマンド・観測結果を記録する
- [ ] 必要な共通文書とdocs/handoff/BUILD_LOG.mdを更新する

## 依存関係
[#67](https://github.com/jphacks/kz_2613/issues/67)

**管理状態：** 未完了で保持する。観測事実だけで完了扱いせず、Issueのクローズは実施前にユーザーへ確認する。

### B5 — [#16](https://github.com/jphacks/kz_2613/issues/16)

## 概要
[Phase 2][P0] 役割・モード・管理操作の認可を実装する

## 状況（2026-10-24）
**取り込み待ち。** 仕様は試作品（Node.js参照実装）で実装・実機確認済み。Rust版ホストへ移植済みで、PC上のシミュレーションでは参照実装と一致した。リポジトリへの取り込み（N1）と実機の再確認（N2）で完了とする。

## 背景・関連要件
要件ID: FR-025, HOST-05, NFR-09, AT-14
- docs/requirements/requirements-v0.3.md
- docs/decisions/2026-10-24-prototype-validated.md
- docs/architecture/system-design.md
- docs/architecture/protocol.md
- docs/architecture/validation-gates.md

## 作業内容
- [ ] N1でRust版ホスト・静的画面をリポジトリへ取り込む
- [ ] 取り込んだコードで、関連する受入試験をシミュレーションと実機で再確認する

## 完了条件
- [ ] N1でRust版ホスト・静的画面をリポジトリへ取り込む
- [ ] 取り込んだコードで、関連する受入試験をシミュレーションと実機で再確認する
- [ ] 関連テストまたは手動試験の実行コマンド・観測結果を記録する
- [ ] 必要な共通文書とdocs/handoff/BUILD_LOG.mdを更新する

## 依存関係
[#67](https://github.com/jphacks/kz_2613/issues/67), [#69](https://github.com/jphacks/kz_2613/issues/69)

**管理状態：** 未完了で保持する。観測事実だけで完了扱いせず、Issueのクローズは実施前にユーザーへ確認する。

### B6 — [#17](https://github.com/jphacks/kz_2613/issues/17)

## 概要
[Phase 2][P0] 保持キー・ボタンと入力所有状態を管理する

## 状況（2026-10-24）
**取り込み待ち。** 仕様は試作品（Node.js参照実装）で実装・実機確認済み。Rust版ホストへ移植済みで、PC上のシミュレーションでは参照実装と一致した。リポジトリへの取り込み（N1）と実機の再確認（N2）で完了とする。

## 背景・関連要件
要件ID: FR-030, FR-037, AT-07, AT-20
- docs/requirements/requirements-v0.3.md
- docs/decisions/2026-10-24-prototype-validated.md
- docs/architecture/system-design.md
- docs/architecture/protocol.md
- docs/architecture/validation-gates.md

## 作業内容
- [ ] N1でRust版ホスト・静的画面をリポジトリへ取り込む
- [ ] 取り込んだコードで、関連する受入試験をシミュレーションと実機で再確認する

## 完了条件
- [ ] N1でRust版ホスト・静的画面をリポジトリへ取り込む
- [ ] 取り込んだコードで、関連する受入試験をシミュレーションと実機で再確認する
- [ ] 関連テストまたは手動試験の実行コマンド・観測結果を記録する
- [ ] 必要な共通文書とdocs/handoff/BUILD_LOG.mdを更新する

## 依存関係
[#67](https://github.com/jphacks/kz_2613/issues/67), [#69](https://github.com/jphacks/kz_2613/issues/69)

**管理状態：** 未完了で保持する。観測事実だけで完了扱いせず、Issueのクローズは実施前にユーザーへ確認する。

### B7 — [#18](https://github.com/jphacks/kz_2613/issues/18)

## 概要
[Phase 2][P0] 心拍・通信断・終了時の全入力解放を実装する

## 状況（2026-10-24）
**取り込み待ち。** 仕様は試作品（Node.js参照実装）で実装・実機確認済み。Rust版ホストへ移植済みで、PC上のシミュレーションでは参照実装と一致した。リポジトリへの取り込み（N1）と実機の再確認（N2）で完了とする。

## 背景・関連要件
要件ID: FR-031, FR-032, FR-033, FR-036, FR-039, SM-06, AT-10, AT-11, AT-16
- docs/requirements/requirements-v0.3.md
- docs/decisions/2026-10-24-prototype-validated.md
- docs/architecture/system-design.md
- docs/architecture/protocol.md
- docs/architecture/validation-gates.md

## 作業内容
- [ ] N1でRust版ホスト・静的画面をリポジトリへ取り込む
- [ ] 取り込んだコードで、関連する受入試験をシミュレーションと実機で再確認する

## 完了条件
- [ ] N1でRust版ホスト・静的画面をリポジトリへ取り込む
- [ ] 取り込んだコードで、関連する受入試験をシミュレーションと実機で再確認する
- [ ] 関連テストまたは手動試験の実行コマンド・観測結果を記録する
- [ ] 必要な共通文書とdocs/handoff/BUILD_LOG.mdを更新する

## 依存関係
[#67](https://github.com/jphacks/kz_2613/issues/67), [#69](https://github.com/jphacks/kz_2613/issues/69)

## 追加の安全条件
- [ ] 一時停止への遷移では切断枠だけでなく全参加者のキー・マウスボタンを即時解放する
- [ ] 最低押下時間より安全停止を優先し、待機入力と視点を破棄する
- [ ] 全員が同時保持した切断試験の結果をNode/Rust実機別に記録する

**管理状態：** 未完了で保持する。観測事実だけで完了扱いせず、Issueのクローズは実施前にユーザーへ確認する。

### B8 — [#19](https://github.com/jphacks/kz_2613/issues/19)

## 概要
[Phase 2][P0] onモードで前面ウィンドウがMinecraftか確認して注入する

## 状況（2026-10-24）
`test` モード（疑似ゲーム画面の選択中だけ注入）は実装・検証済み。`on` モードは前面のウィンドウへ無条件に注入する。

## 背景・関連要件
要件ID: FR-034, NFR-06, G1-D, AT-15
- docs/requirements/requirements-v0.3.md
- docs/decisions/2026-10-24-prototype-validated.md
- docs/architecture/system-design.md
- docs/architecture/protocol.md
- docs/architecture/validation-gates.md

## 作業内容
- [ ] 前面のウィンドウのプロセス（`javaw.exe` など）とタイトルを確認し、一致するときだけ注入する
- [ ] 外れたら全解放し、ダッシュボードとホストに対象の状態を表示する

## 完了条件
- [ ] 前面のウィンドウのプロセス（`javaw.exe` など）とタイトルを確認し、一致するときだけ注入する
- [ ] 外れたら全解放し、ダッシュボードとホストに対象の状態を表示する
- [ ] Wを押したまま他のウィンドウへ切り替えても、誤入力やキーの押しっぱなしが起きない
- [ ] 関連テストまたは手動試験の実行コマンド・観測結果を記録する
- [ ] 必要な共通文書とdocs/handoff/BUILD_LOG.mdを更新する

## 依存関係
[#67](https://github.com/jphacks/kz_2613/issues/67), [#6](https://github.com/jphacks/kz_2613/issues/6)

**管理状態：** 未完了で保持する。観測事実だけで完了扱いせず、Issueのクローズは実施前にユーザーへ確認する。

### B9 — [#20](https://github.com/jphacks/kz_2613/issues/20)

## 概要
[Phase 2][P0] 検証済みSendInputアダプターを入力エンジンへ接続する

## 状況（2026-10-24）
**取り込み待ち。** 仕様は試作品（Node.js参照実装）で実装・実機確認済み。Rust版ホストへ移植済みで、PC上のシミュレーションでは参照実装と一致した。リポジトリへの取り込み（N1）と実機の再確認（N2）で完了とする。

Minecraftが入力を受け付けるかは #6〜#8 で確認する。

## 背景・関連要件
要件ID: FR-026, NFR-05
- docs/requirements/requirements-v0.3.md
- docs/decisions/2026-10-24-prototype-validated.md
- docs/architecture/system-design.md
- docs/architecture/protocol.md
- docs/architecture/validation-gates.md

## 作業内容
- [ ] N1でRust版ホスト・静的画面をリポジトリへ取り込む
- [ ] 取り込んだコードで、関連する受入試験をシミュレーションと実機で再確認する

## 完了条件
- [ ] N1でRust版ホスト・静的画面をリポジトリへ取り込む
- [ ] 取り込んだコードで、関連する受入試験をシミュレーションと実機で再確認する
- [ ] 関連テストまたは手動試験の実行コマンド・観測結果を記録する
- [ ] 必要な共通文書とdocs/handoff/BUILD_LOG.mdを更新する

## 依存関係
[#67](https://github.com/jphacks/kz_2613/issues/67), [#69](https://github.com/jphacks/kz_2613/issues/69)

**管理状態：** 未完了で保持する。観測事実だけで完了扱いせず、Issueのクローズは実施前にユーザーへ確認する。

### B10 — [#21](https://github.com/jphacks/kz_2613/issues/21)

## 概要
[Phase 2][P0] スマホ回線に依存しないPCの緊急停止を実装する

## 状況（2026-10-24）
ダッシュボードの注入OFF・リセットでの全解放は実装・検証済み。Rust版はCtrl+Cで全解放してから終了する（未検証）。

## 背景・関連要件
要件ID: FR-035, FR-036
- docs/requirements/requirements-v0.3.md
- docs/decisions/2026-10-24-prototype-validated.md
- docs/architecture/system-design.md
- docs/architecture/protocol.md
- docs/architecture/validation-gates.md

## 作業内容
- [ ] PCのグローバルなホットキーで、全解放と注入OFFを行う
- [ ] Ctrl+C・ウィンドウを閉じる・異常終了で押しっぱなしが残らないことを実機で確認する

## 完了条件
- [ ] PCのグローバルなホットキーで、全解放と注入OFFを行う
- [ ] Ctrl+C・ウィンドウを閉じる・異常終了で押しっぱなしが残らないことを実機で確認する
- [ ] スマホ・ダッシュボードが応答しない状態でも、PCのキー操作で入力を止められる
- [ ] 関連テストまたは手動試験の実行コマンド・観測結果を記録する
- [ ] 必要な共通文書とdocs/handoff/BUILD_LOG.mdを更新する

## 依存関係
[#67](https://github.com/jphacks/kz_2613/issues/67)

**管理状態：** 未完了で保持する。観測事実だけで完了扱いせず、Issueのクローズは実施前にユーザーへ確認する。

### B11 — [#22](https://github.com/jphacks/kz_2613/issues/22)

## 概要
[Phase 2][P0] 診断ログからIP・端末情報・clientIdを除く

## 状況（2026-10-24）
ダッシュボード（接続・状態・経路・遅延・停止理由）とJSONLログは実装・検証済み。ログにIP・端末情報・clientIdを記録している。

## 背景・関連要件
要件ID: NFR-13, NFR-14
- docs/requirements/requirements-v0.3.md
- docs/decisions/2026-10-24-prototype-validated.md
- docs/architecture/system-design.md
- docs/architecture/protocol.md
- docs/architecture/validation-gates.md

## 作業内容
- [ ] ログのIP・端末情報・clientIdを、匿名化した値（枠名と端末の種類）に置き換える
- [ ] ダッシュボードの表示はPC本体だけに限る現状を維持する

## 完了条件
- [ ] ログのIP・端末情報・clientIdを、匿名化した値（枠名と端末の種類）に置き換える
- [ ] ダッシュボードの表示はPC本体だけに限る現状を維持する
- [ ] ログを確認し、IP・端末情報・識別子が含まれないことを確認する
- [ ] 関連テストまたは手動試験の実行コマンド・観測結果を記録する
- [ ] 必要な共通文書とdocs/handoff/BUILD_LOG.mdを更新する

## 依存関係
[#67](https://github.com/jphacks/kz_2613/issues/67)

**管理状態：** 未完了で保持する。観測事実だけで完了扱いせず、Issueのクローズは実施前にユーザーへ確認する。

### B12 — [#23](https://github.com/jphacks/kz_2613/issues/23)

## 概要
[Phase 2][P0] LANの3ブラウザHTTP・WebSocket・WebRTCを検証する

## 状況（今回の整合性確認）
**一部確認・未完了。** Node試作品では上流回線ありの3台接続を観測した。元のIssue #23にある上流回線なしの3台接続、信頼LAN限定のbind/firewallとサーバー認可の検証を省略しない。

## 背景・関連要件
- docs/requirements/requirements-v0.3.md
- docs/decisions/2026-10-24-prototype-validated.md
- docs/architecture/system-design.md
- docs/architecture/protocol.md
- docs/architecture/validation-gates.md
要件ID: FR-002, ENV-03, NFR-01, G2-B, AT-01, AT-17

## 作業内容
- [ ] 信頼LAN限定のbind/firewall手順で3台のHTTP/WS参加を試験する
- [ ] 上流回線なしで3台が接続しサーバー認可される結果と端末版を記録する
- [ ] 取り込み済みRustでWebRTC併用・WS代替も確認し、Node実機とRust実機の結果を分ける

## 完了条件
- [ ] 信頼LAN限定のbind/firewall手順で3台のHTTP/WS参加を試験する
- [ ] 上流回線なしで3台が接続しサーバー認可される結果と端末版を記録する
- [ ] 取り込み済みRustでWebRTC併用・WS代替も確認し、Node実機とRust実機の結果を分ける
- [ ] 実行コマンド・対象コミット・実測結果をBUILD_LOGに記録する
- [ ] 必要な共通文書を更新し、未確認条件を完了扱いしない

## 依存関係
[#67](https://github.com/jphacks/kz_2613/issues/67), [#69](https://github.com/jphacks/kz_2613/issues/69), [#16](https://github.com/jphacks/kz_2613/issues/16), [#9](https://github.com/jphacks/kz_2613/issues/9), [#10](https://github.com/jphacks/kz_2613/issues/10)

## 備考
上流なしの確認は #9 の記録を再利用してよいが、未実施のまま本Issueを閉じない。

**管理状態：** 未完了で保持する。観測事実だけで完了扱いせず、Issueのクローズは実施前にユーザーへ確認する。

### N4 — [#70](https://github.com/jphacks/kz_2613/issues/70)

## 概要
[Phase 2][P1] 無線が不安定な端末の診断と案内を整備する

## 背景・関連要件
PR #65の要件v0.3・通信契約と、PR #66のIssue計画に対応する。AT-22、NFR-11/12、G4-C。PR #65は承認・main反映済み、PR #66はマージ承認待ち。

## 作業内容
- [ ] 接続経路・到着間隔・復帰回数から通信の途切れを診断する
- [ ] 省電力・Wi-Fi帯域等の手動確認を案内し、個別端末への効果は実測して記録する
- [ ] IP・端末識別子・トークンを公開ログへ記録せず、設定を無断で変更しない

## 完了条件
- [ ] 接続経路・到着間隔・復帰回数から通信の途切れを診断する
- [ ] 省電力・Wi-Fi帯域等の手動確認を案内し、個別端末への効果は実測して記録する
- [ ] IP・端末識別子・トークンを公開ログへ記録せず、設定を無断で変更しない
- [ ] 実行コマンド・観測結果・コミットをBUILD_LOGへ記録する
- [ ] 必要な設計・構築手順を更新する

## 依存関係
[#67](https://github.com/jphacks/kz_2613/issues/67)

## 備考
今回はIssueの作成・整理だけを行う。実装・実機試験は未着手。mainへのマージとIssueの一括クローズはユーザー確認前に行わない。

**管理状態：** 未完了で保持する。観測事実だけで完了扱いせず、Issueのクローズは実施前にユーザーへ確認する。

### W0 — [#24](https://github.com/jphacks/kz_2613/issues/24)

## 概要
[Phase 3][P0] 役割・接続状態と再接続UIを実装する

## 状況（2026-10-24）
**取り込み待ち。** 仕様は試作品（Node.js参照実装）で実装・実機確認済み。Rust版ホストへ移植済みで、PC上のシミュレーションでは参照実装と一致した。リポジトリへの取り込み（N1）と実機の再確認（N2）で完了とする。

## 背景・関連要件
要件ID: FR-004, NFR-14
- docs/requirements/requirements-v0.3.md
- docs/decisions/2026-10-24-prototype-validated.md
- docs/architecture/system-design.md
- docs/architecture/protocol.md
- docs/architecture/validation-gates.md

## 作業内容
- [ ] N1でRust版ホスト・静的画面をリポジトリへ取り込む
- [ ] 取り込んだコードで、関連する受入試験をシミュレーションと実機で再確認する

## 完了条件
- [ ] N1でRust版ホスト・静的画面をリポジトリへ取り込む
- [ ] 取り込んだコードで、関連する受入試験をシミュレーションと実機で再確認する
- [ ] 関連テストまたは手動試験の実行コマンド・観測結果を記録する
- [ ] 必要な共通文書とdocs/handoff/BUILD_LOG.mdを更新する

## 依存関係
[#67](https://github.com/jphacks/kz_2613/issues/67), [#69](https://github.com/jphacks/kz_2613/issues/69)

**管理状態：** 未完了で保持する。観測事実だけで完了扱いせず、Issueのクローズは実施前にユーザーへ確認する。

### W1 — [#25](https://github.com/jphacks/kz_2613/issues/25)

## 概要
[Phase 3][P0] Pointer Eventsの共通押下・解放処理を実装する

## 状況（2026-10-24）
**取り込み待ち。** 仕様は試作品（Node.js参照実装）で実装・実機確認済み。Rust版ホストへ移植済みで、PC上のシミュレーションでは参照実装と一致した。リポジトリへの取り込み（N1）と実機の再確認（N2）で完了とする。

## 背景・関連要件
要件ID: FR-031, NFR-07
- docs/requirements/requirements-v0.3.md
- docs/decisions/2026-10-24-prototype-validated.md
- docs/architecture/system-design.md
- docs/architecture/protocol.md
- docs/architecture/validation-gates.md

## 作業内容
- [ ] N1でRust版ホスト・静的画面をリポジトリへ取り込む
- [ ] 取り込んだコードで、関連する受入試験をシミュレーションと実機で再確認する

## 完了条件
- [ ] N1でRust版ホスト・静的画面をリポジトリへ取り込む
- [ ] 取り込んだコードで、関連する受入試験をシミュレーションと実機で再確認する
- [ ] 関連テストまたは手動試験の実行コマンド・観測結果を記録する
- [ ] 必要な共通文書とdocs/handoff/BUILD_LOG.mdを更新する

## 依存関係
[#67](https://github.com/jphacks/kz_2613/issues/67), [#69](https://github.com/jphacks/kz_2613/issues/69)

**管理状態：** 未完了で保持する。観測事実だけで完了扱いせず、Issueのクローズは実施前にユーザーへ確認する。

### W2 — [#26](https://github.com/jphacks/kz_2613/issues/26)

## 概要
[Phase 3][P0] ホスト用の矢印・Enter・Escリモコンを実装する

## 状況（2026-10-24）
**取り込み待ち。** 仕様は試作品（Node.js参照実装）で実装・実機確認済み。Rust版ホストへ移植済みで、PC上のシミュレーションでは参照実装と一致した。リポジトリへの取り込み（N1）と実機の再確認（N2）で完了とする。

## 背景・関連要件
要件ID: HOST-02, HOST-04, FR-010
- docs/requirements/requirements-v0.3.md
- docs/decisions/2026-10-24-prototype-validated.md
- docs/architecture/system-design.md
- docs/architecture/protocol.md
- docs/architecture/validation-gates.md

## 作業内容
- [ ] N1でRust版ホスト・静的画面をリポジトリへ取り込む
- [ ] 取り込んだコードで、関連する受入試験をシミュレーションと実機で再確認する

## 完了条件
- [ ] N1でRust版ホスト・静的画面をリポジトリへ取り込む
- [ ] 取り込んだコードで、関連する受入試験をシミュレーションと実機で再確認する
- [ ] 関連テストまたは手動試験の実行コマンド・観測結果を記録する
- [ ] 必要な共通文書とdocs/handoff/BUILD_LOG.mdを更新する

## 依存関係
[#67](https://github.com/jphacks/kz_2613/issues/67), [#69](https://github.com/jphacks/kz_2613/issues/69)

**管理状態：** 未完了で保持する。観測事実だけで完了扱いせず、Issueのクローズは実施前にユーザーへ確認する。

### W3 — [#27](https://github.com/jphacks/kz_2613/issues/27)

## 概要
[Phase 3][P0] P1の移動スティック・ジャンプ・スニーク・ダッシュを実装する

## 状況（2026-10-24）
**取り込み待ち。** 仕様は試作品（Node.js参照実装）で実装・実機確認済み。Rust版ホストへ移植済みで、PC上のシミュレーションでは参照実装と一致した。リポジトリへの取り込み（N1）と実機の再確認（N2）で完了とする。

旧題「P1の十字キーとダッシュを実装する」。操作割当の変更（要件定義v0.3 3.2）により、8方向の移動スティックとジャンプ・スニークを含める。

## 背景・関連要件
要件ID: 3.2, FR-020, EN-101
- docs/requirements/requirements-v0.3.md
- docs/decisions/2026-10-24-prototype-validated.md
- docs/architecture/system-design.md
- docs/architecture/protocol.md
- docs/architecture/validation-gates.md

## 作業内容
- [ ] N1でRust版ホスト・静的画面をリポジトリへ取り込む
- [ ] 取り込んだコードで、関連する受入試験をシミュレーションと実機で再確認する

## 完了条件
- [ ] N1でRust版ホスト・静的画面をリポジトリへ取り込む
- [ ] 取り込んだコードで、関連する受入試験をシミュレーションと実機で再確認する
- [ ] 関連テストまたは手動試験の実行コマンド・観測結果を記録する
- [ ] 必要な共通文書とdocs/handoff/BUILD_LOG.mdを更新する

## 依存関係
[#67](https://github.com/jphacks/kz_2613/issues/67), [#69](https://github.com/jphacks/kz_2613/issues/69)

**管理状態：** 未完了で保持する。観測事実だけで完了扱いせず、Issueのクローズは実施前にユーザーへ確認する。

### W4 — [#28](https://github.com/jphacks/kz_2613/issues/28)

## 概要
[Phase 3][P0] P2の方向ボタン視点コントローラーを実装する

## 状況（2026-10-24）
**方針変更によるクローズ候補（未実施）。** ユーザーの実施前確認を待つ。P2の視点は、ドラッグ領域による相対移動（#45、要件定義v0.3でP0へ取り込み）を実機で検証して採用した。

## 背景・関連要件
要件ID: FR-021, EN-102
- docs/requirements/requirements-v0.3.md
- docs/decisions/2026-10-24-prototype-validated.md
- docs/architecture/system-design.md
- docs/architecture/protocol.md
- docs/architecture/validation-gates.md

**管理状態：** 未完了で保持する。観測事実だけで完了扱いせず、Issueのクローズは実施前にユーザーへ確認する。

### W5 — [#29](https://github.com/jphacks/kz_2613/issues/29)

## 概要
[Phase 3][P0] P3の攻撃・使う・持ち物・インベントリ・捨てるを実装する

## 状況（2026-10-24）
**取り込み待ち。** 仕様は試作品（Node.js参照実装）で実装・実機確認済み。Rust版ホストへ移植済みで、PC上のシミュレーションでは参照実装と一致した。リポジトリへの取り込み（N1）と実機の再確認（N2）で完了とする。

旧題「P3のアクションとホットバーUIを実装する」。ホットバーの1〜9はホイールによる前後の切り替えに変更し、E・Qを追加した。

## 背景・関連要件
要件ID: 3.2, FR-022, FR-023
- docs/requirements/requirements-v0.3.md
- docs/decisions/2026-10-24-prototype-validated.md
- docs/architecture/system-design.md
- docs/architecture/protocol.md
- docs/architecture/validation-gates.md

## 作業内容
- [ ] N1でRust版ホスト・静的画面をリポジトリへ取り込む
- [ ] 取り込んだコードで、関連する受入試験をシミュレーションと実機で再確認する

## 完了条件
- [ ] N1でRust版ホスト・静的画面をリポジトリへ取り込む
- [ ] 取り込んだコードで、関連する受入試験をシミュレーションと実機で再確認する
- [ ] 関連テストまたは手動試験の実行コマンド・観測結果を記録する
- [ ] 必要な共通文書とdocs/handoff/BUILD_LOG.mdを更新する

## 依存関係
[#67](https://github.com/jphacks/kz_2613/issues/67), [#69](https://github.com/jphacks/kz_2613/issues/69)

**管理状態：** 未完了で保持する。観測事実だけで完了扱いせず、Issueのクローズは実施前にユーザーへ確認する。

### W6 — [#30](https://github.com/jphacks/kz_2613/issues/30)

## 概要
[Phase 3][P0] ホストSTART・PAUSE・RESUME・ENDと開始条件のUIを実装する

## 状況（2026-10-24）
**取り込み待ち。** 仕様は試作品（Node.js参照実装）で実装・実機確認済み。Rust版ホストへ移植済みで、PC上のシミュレーションでは参照実装と一致した。リポジトリへの取り込み（N1）と実機の再確認（N2）で完了とする。

## 背景・関連要件
要件ID: HOST-05, FR-005, FR-012〜FR-019
- docs/requirements/requirements-v0.3.md
- docs/decisions/2026-10-24-prototype-validated.md
- docs/architecture/system-design.md
- docs/architecture/protocol.md
- docs/architecture/validation-gates.md

## 作業内容
- [ ] N1でRust版ホスト・静的画面をリポジトリへ取り込む
- [ ] 取り込んだコードで、関連する受入試験をシミュレーションと実機で再確認する

## 完了条件
- [ ] N1でRust版ホスト・静的画面をリポジトリへ取り込む
- [ ] 取り込んだコードで、関連する受入試験をシミュレーションと実機で再確認する
- [ ] 関連テストまたは手動試験の実行コマンド・観測結果を記録する
- [ ] 必要な共通文書とdocs/handoff/BUILD_LOG.mdを更新する

## 依存関係
[#67](https://github.com/jphacks/kz_2613/issues/67), [#69](https://github.com/jphacks/kz_2613/issues/69)

自動復帰の実運用初期値・許可条件は未決定。ホストPAUSEはON/OFFによらず非自動、通信切断は設定・期限・安全条件を満たす場合の試験として扱う。

**管理状態：** 未完了で保持する。観測事実だけで完了扱いせず、Issueのクローズは実施前にユーザーへ確認する。

### W7 — [#31](https://github.com/jphacks/kz_2613/issues/31)

## 概要
[Phase 3][P0] Android・iPhoneで全コントローラーを実機検証する

## 状況（今回の整合性確認）
**一部確認・未完了。** 元のIssue #31の条件を維持する。Node試作品の操作照合858/858は記録されているが、回転・pointercancel・画面ロック等の個別結果とRust実機の確認は揃っていない。

## 背景・関連要件
- docs/requirements/requirements-v0.3.md
- docs/decisions/2026-10-24-prototype-validated.md
- docs/architecture/system-design.md
- docs/architecture/protocol.md
- docs/architecture/validation-gates.md
要件ID: NFR-02, NFR-07, G-05, AT-18

## 作業内容
- [ ] 実装済み各役割で長押し/複数指/回転/キャンセル/画面ロックを試す
- [ ] 両OSの端末・版・観測結果と残留入力の有無を記録する
- [ ] 各項目をAndroid/iPhone別に記録し、Nodeの過去の観測と取り込み済みRustの再試験を区別する

## 完了条件
- [ ] 実装済み各役割で長押し/複数指/回転/キャンセル/画面ロックを試す
- [ ] 両OSの端末・版・観測結果と残留入力の有無を記録する
- [ ] 各項目をAndroid/iPhone別に記録し、Nodeの過去の観測と取り込み済みRustの再試験を区別する
- [ ] 実行コマンド・対象コミット・実測結果をBUILD_LOGに記録する
- [ ] 必要な共通文書を更新し、未確認条件を完了扱いしない

## 依存関係
[#69](https://github.com/jphacks/kz_2613/issues/69), [#30](https://github.com/jphacks/kz_2613/issues/30), [#20](https://github.com/jphacks/kz_2613/issues/20), [#23](https://github.com/jphacks/kz_2613/issues/23)

## 備考
未記録の条件を推測してチェック済みにしない。Minecraftの確認は #6〜#8・#40で別途行う。

**管理状態：** 未完了で保持する。観測事実だけで完了扱いせず、Issueのクローズは実施前にユーザーへ確認する。

### D0 — [#32](https://github.com/jphacks/kz_2613/issues/32)

## 概要
[Phase 4][P0] 参加用QR・URL・人数画面を実装する

## 状況（2026-10-24）
**取り込み待ち。** 仕様は試作品（Node.js参照実装）で実装・実機確認済み。Rust版ホストへ移植済みで、PC上のシミュレーションでは参照実装と一致した。リポジトリへの取り込み（N1）と実機の再確認（N2）で完了とする。

試作品ではダッシュボード（`/host`）として実装済み。PCアプリの画面（#34・#36）へまとめるのは別の作業。

## 背景・関連要件
要件ID: FR-001, FR-008
- docs/requirements/requirements-v0.3.md
- docs/decisions/2026-10-24-prototype-validated.md
- docs/architecture/system-design.md
- docs/architecture/protocol.md
- docs/architecture/validation-gates.md

## 作業内容
- [ ] N1でRust版ホスト・静的画面をリポジトリへ取り込む
- [ ] 取り込んだコードで、関連する受入試験をシミュレーションと実機で再確認する

## 完了条件
- [ ] N1でRust版ホスト・静的画面をリポジトリへ取り込む
- [ ] 取り込んだコードで、関連する受入試験をシミュレーションと実機で再確認する
- [ ] 関連テストまたは手動試験の実行コマンド・観測結果を記録する
- [ ] 必要な共通文書とdocs/handoff/BUILD_LOG.mdを更新する

## 依存関係
[#67](https://github.com/jphacks/kz_2613/issues/67), [#69](https://github.com/jphacks/kz_2613/issues/69)

**管理状態：** 未完了で保持する。観測事実だけで完了扱いせず、Issueのクローズは実施前にユーザーへ確認する。

### D1 — [#33](https://github.com/jphacks/kz_2613/issues/33)

## 概要
[Phase 4][P0] 手動起動を許容するゲーム選択画面を実装する

## 背景・関連要件
要件ID: ENV-08, ENV-09, HOST-08, FR-018
- docs/requirements/requirements-v0.3.md
- docs/decisions/2026-10-24-user-decisions.md
- docs/architecture/system-design.md
- docs/architecture/validation-gates.md

## 作業内容
- [ ] Minecraft固定候補・未検証状態・手動準備手順をPC画面に表示する
- [ ] 自動検出や自動起動なしで選択でき対象の準備条件を説明する

## 完了条件
- [ ] Minecraft固定候補・未検証状態・手動準備手順をPC画面に表示する
- [ ] 自動検出や自動起動なしで選択でき対象の準備条件を説明する
- [ ] 関連テストまたは手動試験の実行コマンド・観測結果を記録する
- [ ] 必要な共通文書とdocs/handoff/BUILD_LOG.mdを更新する

## 依存関係
[#32](https://github.com/jphacks/kz_2613/issues/32)

## 備考
設計案[H]/[P]は確定事項と区別し、変更理由をdocs/decisions/へ残す。

**管理状態：** 未完了で保持する。観測事実だけで完了扱いせず、Issueのクローズは実施前にユーザーへ確認する。

### D2 — [#34](https://github.com/jphacks/kz_2613/issues/34)

## 概要
[Phase 4][P0] 3人の操作分担確認画面を実装する

## 背景・関連要件
要件ID: FR-004, ROLE-01, ROLE-02
- docs/requirements/requirements-v0.3.md
- docs/decisions/2026-10-24-user-decisions.md
- docs/architecture/system-design.md
- docs/architecture/validation-gates.md

## 作業内容
- [ ] 固定P1移動/P2視点/P3アクションとホスト管理権をPC画面で確認できるようにする
- [ ] 参加状態と開始可否がサーバー状態に一致する表示テストを追加する

## 完了条件
- [ ] 固定P1移動/P2視点/P3アクションとホスト管理権をPC画面で確認できるようにする
- [ ] 参加状態と開始可否がサーバー状態に一致する表示テストを追加する
- [ ] 関連テストまたは手動試験の実行コマンド・観測結果を記録する
- [ ] 必要な共通文書とdocs/handoff/BUILD_LOG.mdを更新する

## 依存関係
[#33](https://github.com/jphacks/kz_2613/issues/33)

## 備考
設計案[H]/[P]は確定事項と区別し、変更理由をdocs/decisions/へ残す。

**管理状態：** 未完了で保持する。観測事実だけで完了扱いせず、Issueのクローズは実施前にユーザーへ確認する。

### D3 — [#35](https://github.com/jphacks/kz_2613/issues/35)

## 概要
[Phase 4][P0] Minecraftへの移行・復帰時もセッションを維持する

## 背景・関連要件
要件ID: FR-018, HOST-10, AT-13
- docs/requirements/requirements-v0.3.md
- docs/decisions/2026-10-24-user-decisions.md
- docs/architecture/system-design.md
- docs/architecture/validation-gates.md

## 作業内容
- [ ] 表示先と入力権限を分離しゲーム変更・手動復帰時に全解放してホストRemoteへ戻る
- [ ] セッション/役割を保持しフォーカス未確認時は送信しないテストと手順を記す

## 完了条件
- [ ] 表示先と入力権限を分離しゲーム変更・手動復帰時に全解放してホストRemoteへ戻る
- [ ] セッション/役割を保持しフォーカス未確認時は送信しないテストと手順を記す
- [ ] 関連テストまたは手動試験の実行コマンド・観測結果を記録する
- [ ] 必要な共通文書とdocs/handoff/BUILD_LOG.mdを更新する

## 依存関係
[#34](https://github.com/jphacks/kz_2613/issues/34), [#19](https://github.com/jphacks/kz_2613/issues/19), [#30](https://github.com/jphacks/kz_2613/issues/30)

## 備考
設計案[H]/[P]は確定事項と区別し、変更理由をdocs/decisions/へ残す。

**管理状態：** 未完了で保持する。観測事実だけで完了扱いせず、Issueのクローズは実施前にユーザーへ確認する。

### D4 — [#36](https://github.com/jphacks/kz_2613/issues/36)

## 概要
[Phase 4][P0] Tauri（WebView2）のPCアプリ枠とブラウザ代替を実装する

## 状況（2026-10-24）
pywebviewの案は、PCホストのRust化により置き換えた。画面は通常のブラウザで動作を確認済み。

## 背景・関連要件
要件ID: G4-A
- docs/requirements/requirements-v0.3.md
- docs/decisions/2026-10-24-prototype-validated.md
- docs/architecture/system-design.md
- docs/architecture/protocol.md
- docs/architecture/validation-gates.md

## 作業内容
- [ ] Rust版ホストをTauri 2で包み、ダッシュボード・疑似ゲーム画面をWebView2で表示する
- [ ] Tauriが使えない場合は、通常のブラウザで `/host` と `/game` を開く

## 完了条件
- [ ] Rust版ホストをTauri 2で包み、ダッシュボード・疑似ゲーム画面をWebView2で表示する
- [ ] Tauriが使えない場合は、通常のブラウザで `/host` と `/game` を開く
- [ ] PCアプリの画面が応答し、3台の接続が維持される
- [ ] 関連テストまたは手動試験の実行コマンド・観測結果を記録する
- [ ] 必要な共通文書とdocs/handoff/BUILD_LOG.mdを更新する

## 依存関係
[#67](https://github.com/jphacks/kz_2613/issues/67), [#68](https://github.com/jphacks/kz_2613/issues/68)

**管理状態：** 未完了で保持する。観測事実だけで完了扱いせず、Issueのクローズは実施前にユーザーへ確認する。

### D5 — [#37](https://github.com/jphacks/kz_2613/issues/37)

## 概要
[Phase 4][P0] フォーカス切替とPC GUIの実機検証を行う

## 背景・関連要件
要件ID: FR-034, G1-D, G4-A, G-04, G-08, AT-03, AT-15
- docs/requirements/requirements-v0.3.md
- docs/decisions/2026-10-24-user-decisions.md
- docs/architecture/system-design.md
- docs/architecture/validation-gates.md

## 作業内容
- [ ] ゲーム/PC/他アプリ切替とホストリモコンの操作可能範囲を手動試験する
- [ ] 誤入力/残留入力なしを記録し不可能なメニューは手動PC補助を明記する

## 完了条件
- [ ] ゲーム/PC/他アプリ切替とホストリモコンの操作可能範囲を手動試験する
- [ ] 誤入力/残留入力なしを記録し不可能なメニューは手動PC補助を明記する
- [ ] 関連テストまたは手動試験の実行コマンド・観測結果を記録する
- [ ] 必要な共通文書とdocs/handoff/BUILD_LOG.mdを更新する

## 依存関係
[#36](https://github.com/jphacks/kz_2613/issues/36), [#20](https://github.com/jphacks/kz_2613/issues/20)

## 備考
実機検証。端末・OS/ブラウザ・Minecraft版・ネットワーク・実施日/操作者・実測結果を記録する。未実施は未検証とする。

**管理状態：** 未完了で保持する。観測事実だけで完了扱いせず、Issueのクローズは実施前にユーザーへ確認する。

### E0 — [#38](https://github.com/jphacks/kz_2613/issues/38)

## 概要
[Phase 5][P0] 3台同時操作と役割・管理権のE2Eを検証する

## 背景・関連要件
要件ID: FR-024, G3-A, AT-01, AT-02, AT-04, AT-05, AT-06, AT-07, AT-08, AT-09, AT-14
- docs/requirements/requirements-v0.3.md
- docs/decisions/2026-10-24-user-decisions.md
- docs/architecture/system-design.md
- docs/architecture/validation-gates.md

## 作業内容
- [ ] 3人で移動+視点+アクション、必要人数=3での2人Start拒否と試験用人数設定ごとの境界とホスト限定Pause/Resumeを試す
- [ ] 実機構成、遅延の中央値/上位分位、主観的操作性を記録する

## 完了条件
- [ ] 3人で移動+視点+アクション、必要人数=3での2人Start拒否と試験用人数設定ごとの境界とホスト限定Pause/Resumeを試す
- [ ] 実機構成、遅延の中央値/上位分位、主観的操作性を記録する
- [ ] 関連テストまたは手動試験の実行コマンド・観測結果を記録する
- [ ] 必要な共通文書とdocs/handoff/BUILD_LOG.mdを更新する

## 依存関係
[#31](https://github.com/jphacks/kz_2613/issues/31), [#37](https://github.com/jphacks/kz_2613/issues/37)

## 備考
実機検証。端末・OS/ブラウザ・Minecraft版・ネットワーク・実施日/操作者・実測結果を記録する。未実施は未検証とする。

**管理状態：** 未完了で保持する。観測事実だけで完了扱いせず、Issueのクローズは実施前にユーザーへ確認する。

### E1 — [#39](https://github.com/jphacks/kz_2613/issues/39)

## 概要
[Phase 5][P0] 切断・再接続・緊急停止の障害試験を行う

## 状況（今回の整合性確認）
**未完了。** ホストPAUSEと通信切断を区別する。15秒以内の復帰はNode試作品の観測として保持し、Minecraft実運用の初期値・使用条件は安全確認後のユーザー判断を待つ。

## 背景・関連要件
- docs/requirements/requirements-v0.3.md
- docs/decisions/2026-10-24-prototype-validated.md
- docs/architecture/system-design.md
- docs/architecture/protocol.md
- docs/architecture/validation-gates.md
要件ID: G3-B, FR-019, FR-032, FR-035, SM-04, AT-10, AT-11, AT-12, AT-15, AT-16

## 作業内容
- [ ] 全参加者がキー・マウスボタンを同時保持した状態で、Wi-Fi断・ホスト断・タブ閉鎖・ロック・強制停止を試す
- [ ] coopからpausedへの遷移で全参加者の合成キー・マウスボタンを即時解放し、連打キュー・視点の未処理分を破棄する
- [ ] ホストPAUSEでは自動復帰設定ON/OFFのどちらでも自動再開しないことを確認する
- [ ] 通信切断・設定ONでは15秒の期限内/外、P1を含む全員の復帰、WebRTC準備、対象・停止手段を分けて試す
- [ ] 通信切断・設定OFFと期限外では、接続が戻ってもホストの明示RESUMEまで再開しないことを確認する
- [ ] 復帰時に元の枠を維持し、旧押下や遅延入力が復活せず新しい押下から開始することを確認する
- [ ] トークン失効・再認証、旧epoch拒否、入力先ウィンドウ喪失、スマホ回線に依存しないPC緊急停止を試す
- [ ] Node観測・Rust実機・Minecraftの結果を分けて記録し、実運用初期値と許可条件は未決定のまま判断材料を提示する

## 完了条件
- [ ] 全参加者がキー・マウスボタンを同時保持した状態で、Wi-Fi断・ホスト断・タブ閉鎖・ロック・強制停止を試す
- [ ] coopからpausedへの遷移で全参加者の合成キー・マウスボタンを即時解放し、連打キュー・視点の未処理分を破棄する
- [ ] ホストPAUSEでは自動復帰設定ON/OFFのどちらでも自動再開しないことを確認する
- [ ] 通信切断・設定ONでは15秒の期限内/外、P1を含む全員の復帰、WebRTC準備、対象・停止手段を分けて試す
- [ ] 通信切断・設定OFFと期限外では、接続が戻ってもホストの明示RESUMEまで再開しないことを確認する
- [ ] 復帰時に元の枠を維持し、旧押下や遅延入力が復活せず新しい押下から開始することを確認する
- [ ] トークン失効・再認証、旧epoch拒否、入力先ウィンドウ喪失、スマホ回線に依存しないPC緊急停止を試す
- [ ] Node観測・Rust実機・Minecraftの結果を分けて記録し、実運用初期値と許可条件は未決定のまま判断材料を提示する
- [ ] 実行コマンド・対象コミット・実測結果をBUILD_LOGに記録する
- [ ] 必要な共通文書を更新し、未確認条件を完了扱いしない

## 依存関係
[#38](https://github.com/jphacks/kz_2613/issues/38), [#21](https://github.com/jphacks/kz_2613/issues/21), [#19](https://github.com/jphacks/kz_2613/issues/19), [#12](https://github.com/jphacks/kz_2613/issues/12), [#15](https://github.com/jphacks/kz_2613/issues/15), [#18](https://github.com/jphacks/kz_2613/issues/18)

## 備考
ONの試験は操作者が明示開始した管理下で行い、実ゲームの安全要件を省略しない。単一の『自動再開なし』を全ケースへ適用しない。

**管理状態：** 未完了で保持する。観測事実だけで完了扱いせず、Issueのクローズは実施前にユーザーへ確認する。

### E2 — [#40](https://github.com/jphacks/kz_2613/issues/40)

## 概要
[Phase 5][P0] Minecraft協力プレイの反復デモを検証する

## 背景・関連要件
要件ID: ENV-08, NFR-03, NFR-10, NFR-16, NFR-18, G5, AT-19
- docs/requirements/requirements-v0.3.md
- docs/decisions/2026-10-24-user-decisions.md
- docs/architecture/system-design.md
- docs/architecture/validation-gates.md

## 作業内容
- [ ] 事前ホットバーと固定ワールドで移動/視点/ジャンプ/設置/破壊を3人で反復する
- [ ] 版・設定と成功回数/失敗/復旧手順・参加感を記録し再現可能な短い実演を確定する

## 完了条件
- [ ] 事前ホットバーと固定ワールドで移動/視点/ジャンプ/設置/破壊を3人で反復する
- [ ] 版・設定と成功回数/失敗/復旧手順・参加感を記録し再現可能な短い実演を確定する
- [ ] 関連テストまたは手動試験の実行コマンド・観測結果を記録する
- [ ] 必要な共通文書とdocs/handoff/BUILD_LOG.mdを更新する

## 依存関係
[#39](https://github.com/jphacks/kz_2613/issues/39)

## 備考
実機検証。端末・OS/ブラウザ・Minecraft版・ネットワーク・実施日/操作者・実測結果を記録する。未実施は未検証とする。

**管理状態：** 未完了で保持する。観測事実だけで完了扱いせず、Issueのクローズは実施前にユーザーへ確認する。

### E3 — [#41](https://github.com/jphacks/kz_2613/issues/41)

## 概要
[Phase 5][P0] Windows配布パッケージ（Tauriバンドル）を作る

## 状況（2026-10-24）
PyInstallerの案は、PCホストのRust化により置き換えた。

## 背景・関連要件
要件ID: G4-B, NFR-12
- docs/requirements/requirements-v0.3.md
- docs/decisions/2026-10-24-prototype-validated.md
- docs/architecture/system-design.md
- docs/architecture/protocol.md
- docs/architecture/validation-gates.md

## 作業内容
- [ ] Tauriのバンドル、または単一のexeと静的画面一式を作る
- [ ] 開発環境のないWindows 11で起動し、ファイアウォールの許可手順を確認する

## 完了条件
- [ ] Tauriのバンドル、または単一のexeと静的画面一式を作る
- [ ] 開発環境のないWindows 11で起動し、ファイアウォールの許可手順を確認する
- [ ] 開発環境のないPCで起動し、スマホ3台が参加できる
- [ ] 関連テストまたは手動試験の実行コマンド・観測結果を記録する
- [ ] 必要な共通文書とdocs/handoff/BUILD_LOG.mdを更新する

## 依存関係
[#36](https://github.com/jphacks/kz_2613/issues/36), [#39](https://github.com/jphacks/kz_2613/issues/39)

**管理状態：** 未完了で保持する。観測事実だけで完了扱いせず、Issueのクローズは実施前にユーザーへ確認する。

### E4 — [#42](https://github.com/jphacks/kz_2613/issues/42)

## 概要
[Phase 5][P0] ゲーム画面・名称・デモ素材の利用条件を確認する

## 背景・関連要件
要件ID: NFR-17, G-09
- docs/requirements/requirements-v0.3.md
- docs/decisions/2026-10-24-user-decisions.md
- docs/architecture/system-design.md
- docs/architecture/validation-gates.md

## 作業内容
- [ ] 公式Minecraft利用条件と実際の発表素材を個別確認し必要な帰属を整理する
- [ ] 根拠URL/確認日/使用素材を記録し利用可能な素材に限定する

## 完了条件
- [ ] 公式Minecraft利用条件と実際の発表素材を個別確認し必要な帰属を整理する
- [ ] 根拠URL/確認日/使用素材を記録し利用可能な素材に限定する
- [ ] 関連テストまたは手動試験の実行コマンド・観測結果を記録する
- [ ] 必要な共通文書とdocs/handoff/BUILD_LOG.mdを更新する

## 依存関係
[#4](https://github.com/jphacks/kz_2613/issues/4)

## 備考
設計案[H]/[P]は確定事項と区別し、変更理由をdocs/decisions/へ残す。

**管理状態：** 未完了で保持する。観測事実だけで完了扱いせず、Issueのクローズは実施前にユーザーへ確認する。

### E5 — [#43](https://github.com/jphacks/kz_2613/issues/43)

## 概要
[Phase 5][P0] READMEと発表デモ・当日復旧手順を整備する

## 背景・関連要件
要件ID: NFR-10, NFR-12, NFR-16, AT-19
- docs/requirements/requirements-v0.3.md
- docs/decisions/2026-10-24-user-decisions.md
- docs/architecture/system-design.md
- docs/architecture/validation-gates.md

## 作業内容
- [ ] 既存READMEの構造を保持して製品概要/起動/実装状況と90秒デモ・代替環境を記す
- [ ] cloneからの再現と実演リハーサルを確認し未検証や制約を明記する

## 完了条件
- [ ] 既存READMEの構造を保持して製品概要/起動/実装状況と90秒デモ・代替環境を記す
- [ ] cloneからの再現と実演リハーサルを確認し未検証や制約を明記する
- [ ] 関連テストまたは手動試験の実行コマンド・観測結果を記録する
- [ ] 必要な共通文書とdocs/handoff/BUILD_LOG.mdを更新する

## 依存関係
[#40](https://github.com/jphacks/kz_2613/issues/40), [#41](https://github.com/jphacks/kz_2613/issues/41), [#42](https://github.com/jphacks/kz_2613/issues/42)

## 備考
設計案[H]/[P]は確定事項と区別し、変更理由をdocs/decisions/へ残す。

**管理状態：** 未完了で保持する。観測事実だけで完了扱いせず、Issueのクローズは実施前にユーザーへ確認する。

### P11 — [#44](https://github.com/jphacks/kz_2613/issues/44)

## 概要
[Phase 6][P0] P1移動を仮想スティックへ拡張する

## 状況（2026-10-24）
**取り込み待ち。** 仕様は試作品（Node.js参照実装）で実装・実機確認済み。Rust版ホストへ移植済みで、PC上のシミュレーションでは参照実装と一致した。リポジトリへの取り込み（N1）と実機の再確認（N2）で完了とする。

要件定義v0.3でP0へ取り込んだ（8方向の移動スティック）。#27と同時に取り込む。

## 背景・関連要件
要件ID: EN-101
- docs/requirements/requirements-v0.3.md
- docs/decisions/2026-10-24-prototype-validated.md
- docs/architecture/system-design.md
- docs/architecture/protocol.md
- docs/architecture/validation-gates.md

## 作業内容
- [ ] N1でRust版ホスト・静的画面をリポジトリへ取り込む
- [ ] 取り込んだコードで、関連する受入試験をシミュレーションと実機で再確認する

## 完了条件
- [ ] N1でRust版ホスト・静的画面をリポジトリへ取り込む
- [ ] 取り込んだコードで、関連する受入試験をシミュレーションと実機で再確認する
- [ ] 関連テストまたは手動試験の実行コマンド・観測結果を記録する
- [ ] 必要な共通文書とdocs/handoff/BUILD_LOG.mdを更新する

## 依存関係
[#67](https://github.com/jphacks/kz_2613/issues/67), [#69](https://github.com/jphacks/kz_2613/issues/69)

**管理状態：** 未完了で保持する。観測事実だけで完了扱いせず、Issueのクローズは実施前にユーザーへ確認する。

### P12 — [#45](https://github.com/jphacks/kz_2613/issues/45)

## 概要
[Phase 6][P0] P2視点をスワイプ・感度調整へ拡張する

## 状況（2026-10-24）
**取り込み待ち。** 仕様は試作品（Node.js参照実装）で実装・実機確認済み。Rust版ホストへ移植済みで、PC上のシミュレーションでは参照実装と一致した。リポジトリへの取り込み（N1）と実機の再確認（N2）で完了とする。

要件定義v0.3でP0へ取り込んだ（ドラッグ領域、感度0.5〜6、累積値の30Hz送信）。

## 背景・関連要件
要件ID: EN-102, FR-021, FR-038
- docs/requirements/requirements-v0.3.md
- docs/decisions/2026-10-24-prototype-validated.md
- docs/architecture/system-design.md
- docs/architecture/protocol.md
- docs/architecture/validation-gates.md

## 作業内容
- [ ] N1でRust版ホスト・静的画面をリポジトリへ取り込む
- [ ] 取り込んだコードで、関連する受入試験をシミュレーションと実機で再確認する

## 完了条件
- [ ] N1でRust版ホスト・静的画面をリポジトリへ取り込む
- [ ] 取り込んだコードで、関連する受入試験をシミュレーションと実機で再確認する
- [ ] 関連テストまたは手動試験の実行コマンド・観測結果を記録する
- [ ] 必要な共通文書とdocs/handoff/BUILD_LOG.mdを更新する

## 依存関係
[#67](https://github.com/jphacks/kz_2613/issues/67), [#69](https://github.com/jphacks/kz_2613/issues/69)

**管理状態：** 未完了で保持する。観測事実だけで完了扱いせず、Issueのクローズは実施前にユーザーへ確認する。

### P13 — [#46](https://github.com/jphacks/kz_2613/issues/46)

## 概要
[Phase 6][P1] ホストリモコンにタッチパッド・クリック・Eキーを追加する

## 背景・関連要件
要件ID: HOST-03, EN-103
- docs/requirements/requirements-v0.3.md
- docs/decisions/2026-10-24-user-decisions.md
- docs/architecture/system-design.md
- docs/architecture/validation-gates.md

## 作業内容
- [ ] Pause中のインベントリ等へ対象を限定したマウス操作とEを追加する
- [ ] Coop入力との排他とゲームGUI実機操作範囲を検証する

## 完了条件
- [ ] Pause中のインベントリ等へ対象を限定したマウス操作とEを追加する
- [ ] Coop入力との排他とゲームGUI実機操作範囲を検証する
- [ ] 関連テストまたは手動試験の実行コマンド・観測結果を記録する
- [ ] 必要な共通文書とdocs/handoff/BUILD_LOG.mdを更新する

## 依存関係
[#40](https://github.com/jphacks/kz_2613/issues/40)

## 備考
設計案[H]/[P]は確定事項と区別し、変更理由をdocs/decisions/へ残す。 P0完了後のバックログ。今回の初期構築では実装しない。

**管理状態：** 未完了で保持する。観測事実だけで完了扱いせず、Issueのクローズは実施前にユーザーへ確認する。

### P14 — [#47](https://github.com/jphacks/kz_2613/issues/47)

## 概要
[Phase 6][P1] Pause中の役割指定・交換を実装する

## 背景・関連要件
要件ID: ROLE-06, EN-104
- docs/requirements/requirements-v0.3.md
- docs/decisions/2026-10-24-user-decisions.md
- docs/architecture/system-design.md
- docs/architecture/validation-gates.md

## 作業内容
- [ ] ホストの明示操作と参加者への役割表示/同意で担当を変更する
- [ ] epoch更新と全解放、再接続後の整合性をテストする

## 完了条件
- [ ] ホストの明示操作と参加者への役割表示/同意で担当を変更する
- [ ] epoch更新と全解放、再接続後の整合性をテストする
- [ ] 関連テストまたは手動試験の実行コマンド・観測結果を記録する
- [ ] 必要な共通文書とdocs/handoff/BUILD_LOG.mdを更新する

## 依存関係
[#40](https://github.com/jphacks/kz_2613/issues/40)

## 備考
設計案[H]/[P]は確定事項と区別し、変更理由をdocs/decisions/へ残す。 P0完了後のバックログ。今回の初期構築では実装しない。

**管理状態：** 未完了で保持する。観測事実だけで完了扱いせず、Issueのクローズは実施前にユーザーへ確認する。

### P15 — [#48](https://github.com/jphacks/kz_2613/issues/48)

## 概要
[Phase 6][P1] PCゲーム一覧を矢印・Enter・Escで選択可能にする

## 背景・関連要件
要件ID: EN-105
- docs/requirements/requirements-v0.3.md
- docs/decisions/2026-10-24-user-decisions.md
- docs/architecture/system-design.md
- docs/architecture/validation-gates.md

## 作業内容
- [ ] PC選択UIへ明確なフォーカス順と選択状態を設ける
- [ ] ホストの基本リモコンのみで一覧へ戻り選べることを検証する

## 完了条件
- [ ] PC選択UIへ明確なフォーカス順と選択状態を設ける
- [ ] ホストの基本リモコンのみで一覧へ戻り選べることを検証する
- [ ] 関連テストまたは手動試験の実行コマンド・観測結果を記録する
- [ ] 必要な共通文書とdocs/handoff/BUILD_LOG.mdを更新する

## 依存関係
[#40](https://github.com/jphacks/kz_2613/issues/40)

## 備考
設計案[H]/[P]は確定事項と区別し、変更理由をdocs/decisions/へ残す。 P0完了後のバックログ。今回の初期構築では実装しない。

**管理状態：** 未完了で保持する。観測事実だけで完了扱いせず、Issueのクローズは実施前にユーザーへ確認する。

### P16 — [#49](https://github.com/jphacks/kz_2613/issues/49)

## 概要
[Phase 6][P1] ゲーム起動パスの手動登録を追加する

## 背景・関連要件
要件ID: EN-106
- docs/requirements/requirements-v0.3.md
- docs/decisions/2026-10-24-user-decisions.md
- docs/architecture/system-design.md
- docs/architecture/validation-gates.md

## 作業内容
- [ ] PCローカル操作で許可した起動先を登録・編集する
- [ ] スマホから任意コマンドを実行できず不正パス/失敗を説明するテストを追加する

## 完了条件
- [ ] PCローカル操作で許可した起動先を登録・編集する
- [ ] スマホから任意コマンドを実行できず不正パス/失敗を説明するテストを追加する
- [ ] 関連テストまたは手動試験の実行コマンド・観測結果を記録する
- [ ] 必要な共通文書とdocs/handoff/BUILD_LOG.mdを更新する

## 依存関係
[#40](https://github.com/jphacks/kz_2613/issues/40)

## 備考
設計案[H]/[P]は確定事項と区別し、変更理由をdocs/decisions/へ残す。 P0完了後のバックログ。今回の初期構築では実装しない。

**管理状態：** 未完了で保持する。観測事実だけで完了扱いせず、Issueのクローズは実施前にユーザーへ確認する。

### P17 — [#50](https://github.com/jphacks/kz_2613/issues/50)

## 概要
[Phase 6][P1] 操作ボタン配置とキー割当の編集を追加する

## 背景・関連要件
要件ID: EN-107
- docs/requirements/requirements-v0.3.md
- docs/decisions/2026-10-24-user-decisions.md
- docs/architecture/system-design.md
- docs/architecture/validation-gates.md

## 作業内容
- [ ] 編集中の入力停止とサーバー検証を伴う配置/キー編集を追加する
- [ ] 保存/復元と担当外入力拒否を検証する

## 完了条件
- [ ] 編集中の入力停止とサーバー検証を伴う配置/キー編集を追加する
- [ ] 保存/復元と担当外入力拒否を検証する
- [ ] 関連テストまたは手動試験の実行コマンド・観測結果を記録する
- [ ] 必要な共通文書とdocs/handoff/BUILD_LOG.mdを更新する

## 依存関係
[#47](https://github.com/jphacks/kz_2613/issues/47)

## 備考
設計案[H]/[P]は確定事項と区別し、変更理由をdocs/decisions/へ残す。 P0完了後のバックログ。今回の初期構築では実装しない。

**管理状態：** 未完了で保持する。観測事実だけで完了扱いせず、Issueのクローズは実施前にユーザーへ確認する。

### P18 — [#51](https://github.com/jphacks/kz_2613/issues/51)

## 概要
[Phase 6][P1] QR参加案内・Ready表示と開始前の説明を改善する

## 背景・関連要件
要件ID: EN-108
- docs/requirements/requirements-v0.3.md
- docs/decisions/2026-10-24-user-decisions.md
- docs/architecture/system-design.md
- docs/architecture/validation-gates.md

## 作業内容
- [ ] Wi-Fi参加とアプリ参加の区別、全員Readyと役割説明を追加する
- [ ] 初見の3人で迷わず参加しStartできるか観測する

## 完了条件
- [ ] Wi-Fi参加とアプリ参加の区別、全員Readyと役割説明を追加する
- [ ] 初見の3人で迷わず参加しStartできるか観測する
- [ ] 関連テストまたは手動試験の実行コマンド・観測結果を記録する
- [ ] 必要な共通文書とdocs/handoff/BUILD_LOG.mdを更新する

## 依存関係
[#40](https://github.com/jphacks/kz_2613/issues/40)

## 備考
設計案[H]/[P]は確定事項と区別し、変更理由をdocs/decisions/へ残す。 P0完了後のバックログ。今回の初期構築では実装しない。

**管理状態：** 未完了で保持する。観測事実だけで完了扱いせず、Issueのクローズは実施前にユーザーへ確認する。

### P19 — [#52](https://github.com/jphacks/kz_2613/issues/52)

## 概要
[Phase 6][P1] 横画面・安全領域と操作フィードバックを改善する

## 背景・関連要件
要件ID: EN-109
- docs/requirements/requirements-v0.3.md
- docs/decisions/2026-10-24-user-decisions.md
- docs/architecture/system-design.md
- docs/architecture/validation-gates.md

## 作業内容
- [ ] 横画面とsafe areaを考慮し対応端末で触覚等の補助を追加する
- [ ] 未対応端末でも操作可能で回転/ホーム領域の誤操作がないか検証する

## 完了条件
- [ ] 横画面とsafe areaを考慮し対応端末で触覚等の補助を追加する
- [ ] 未対応端末でも操作可能で回転/ホーム領域の誤操作がないか検証する
- [ ] 関連テストまたは手動試験の実行コマンド・観測結果を記録する
- [ ] 必要な共通文書とdocs/handoff/BUILD_LOG.mdを更新する

## 依存関係
[#40](https://github.com/jphacks/kz_2613/issues/40)

## 備考
設計案[H]/[P]は確定事項と区別し、変更理由をdocs/decisions/へ残す。 P0完了後のバックログ。今回の初期構築では実装しない。

**管理状態：** 未完了で保持する。観測事実だけで完了扱いせず、Issueのクローズは実施前にユーザーへ確認する。

### P110 — [#53](https://github.com/jphacks/kz_2613/issues/53)

## 概要
[Phase 6][P1] ゲーム別入力プリセットをローカル保存する

## 背景・関連要件
要件ID: EN-110
- docs/requirements/requirements-v0.3.md
- docs/decisions/2026-10-24-user-decisions.md
- docs/architecture/system-design.md
- docs/architecture/validation-gates.md

## 作業内容
- [ ] 検証済みマッピングをスキーマ検証付きJSONに保存する
- [ ] 破損/未知キー/読み込み失敗を安全に処理しMinecraft固定設定へ戻せるようにする

## 完了条件
- [ ] 検証済みマッピングをスキーマ検証付きJSONに保存する
- [ ] 破損/未知キー/読み込み失敗を安全に処理しMinecraft固定設定へ戻せるようにする
- [ ] 関連テストまたは手動試験の実行コマンド・観測結果を記録する
- [ ] 必要な共通文書とdocs/handoff/BUILD_LOG.mdを更新する

## 依存関係
[#40](https://github.com/jphacks/kz_2613/issues/40)

## 備考
設計案[H]/[P]は確定事項と区別し、変更理由をdocs/decisions/へ残す。 P0完了後のバックログ。今回の初期構築では実装しない。

**管理状態：** 未完了で保持する。観測事実だけで完了扱いせず、Issueのクローズは実施前にユーザーへ確認する。

### P21 — [#54](https://github.com/jphacks/kz_2613/issues/54)

## 概要
[Phase 7][P2] ローカルランチャー情報からゲーム候補を検出する

## 背景・関連要件
要件ID: FUT-201
- docs/requirements/requirements-v0.3.md
- docs/decisions/2026-10-24-user-decisions.md
- docs/architecture/system-design.md
- docs/architecture/validation-gates.md

## 作業内容
- [ ] Steam等のPC内メタデータを読み候補を一覧化する
- [ ] 候補発見と入力対応判定を分離し権限や保存形式が異なる場合を検証する

## 完了条件
- [ ] Steam等のPC内メタデータを読み候補を一覧化する
- [ ] 候補発見と入力対応判定を分離し権限や保存形式が異なる場合を検証する
- [ ] 関連テストまたは手動試験の実行コマンド・観測結果を記録する
- [ ] 必要な共通文書とdocs/handoff/BUILD_LOG.mdを更新する

## 依存関係
[#49](https://github.com/jphacks/kz_2613/issues/49)

## 備考
設計案[H]/[P]は確定事項と区別し、変更理由をdocs/decisions/へ残す。 P0完了後のバックログ。今回の初期構築では実装しない。

**管理状態：** 未完了で保持する。観測事実だけで完了扱いせず、Issueのクローズは実施前にユーザーへ確認する。

### P22 — [#55](https://github.com/jphacks/kz_2613/issues/55)

## 概要
[Phase 7][P2] Minecraftランチャー検出と起動支援を追加する

## 背景・関連要件
要件ID: FUT-202
- docs/requirements/requirements-v0.3.md
- docs/decisions/2026-10-24-user-decisions.md
- docs/architecture/system-design.md
- docs/architecture/validation-gates.md

## 作業内容
- [ ] ランチャー管理情報からMinecraft起動を補助する
- [ ] 認証や版の差で失敗した場合にも手動起動へ戻せるようにする

## 完了条件
- [ ] ランチャー管理情報からMinecraft起動を補助する
- [ ] 認証や版の差で失敗した場合にも手動起動へ戻せるようにする
- [ ] 関連テストまたは手動試験の実行コマンド・観測結果を記録する
- [ ] 必要な共通文書とdocs/handoff/BUILD_LOG.mdを更新する

## 依存関係
[#49](https://github.com/jphacks/kz_2613/issues/49)

## 備考
設計案[H]/[P]は確定事項と区別し、変更理由をdocs/decisions/へ残す。 P0完了後のバックログ。今回の初期構築では実装しない。

**管理状態：** 未完了で保持する。観測事実だけで完了扱いせず、Issueのクローズは実施前にユーザーへ確認する。

### P23 — [#56](https://github.com/jphacks/kz_2613/issues/56)

## 概要
[Phase 7][P2] 任意のPCアプリの手動登録を一般化する

## 背景・関連要件
要件ID: FUT-203
- docs/requirements/requirements-v0.3.md
- docs/decisions/2026-10-24-user-decisions.md
- docs/architecture/system-design.md
- docs/architecture/validation-gates.md

## 作業内容
- [ ] 未検出タイトルをPCから登録し対応状況を別管理する
- [ ] 未検証アプリを対応済みと表示せず危険な起動引数を拒否する

## 完了条件
- [ ] 未検出タイトルをPCから登録し対応状況を別管理する
- [ ] 未検証アプリを対応済みと表示せず危険な起動引数を拒否する
- [ ] 関連テストまたは手動試験の実行コマンド・観測結果を記録する
- [ ] 必要な共通文書とdocs/handoff/BUILD_LOG.mdを更新する

## 依存関係
[#49](https://github.com/jphacks/kz_2613/issues/49)

## 備考
設計案[H]/[P]は確定事項と区別し、変更理由をdocs/decisions/へ残す。 P0完了後のバックログ。今回の初期構築では実装しない。

**管理状態：** 未完了で保持する。観測事実だけで完了扱いせず、Issueのクローズは実施前にユーザーへ確認する。

### P24 — [#57](https://github.com/jphacks/kz_2613/issues/57)

## 概要
[Phase 7][P2] 2〜4人の可変人数と役割枠を設計・実装する

## 背景・関連要件
要件ID: ROLE-07, FUT-204
- docs/requirements/requirements-v0.3.md
- docs/decisions/2026-10-24-user-decisions.md
- docs/architecture/system-design.md
- docs/architecture/validation-gates.md

## 作業内容
- [ ] ゲーム別人数と可変枠を明示設定する
- [ ] 3人Minecraftの既存規則を回帰テストし人数ごとの開始条件を定義する

## 完了条件
- [ ] ゲーム別人数と可変枠を明示設定する
- [ ] 3人Minecraftの既存規則を回帰テストし人数ごとの開始条件を定義する
- [ ] 関連テストまたは手動試験の実行コマンド・観測結果を記録する
- [ ] 必要な共通文書とdocs/handoff/BUILD_LOG.mdを更新する

## 依存関係
[#47](https://github.com/jphacks/kz_2613/issues/47)

## 備考
設計案[H]/[P]は確定事項と区別し、変更理由をdocs/decisions/へ残す。 P0完了後のバックログ。今回の初期構築では実装しない。

**管理状態：** 未完了で保持する。観測事実だけで完了扱いせず、Issueのクローズは実施前にユーザーへ確認する。

### P25 — [#58](https://github.com/jphacks/kz_2613/issues/58)

## 概要
[Phase 7][P2] 操作量・重要度に基づく役割提案を試作する

## 背景・関連要件
要件ID: FUT-205, NFR-18
- docs/requirements/requirements-v0.3.md
- docs/decisions/2026-10-24-user-decisions.md
- docs/architecture/system-design.md
- docs/architecture/validation-gates.md

## 作業内容
- [ ] プレイ観測から公平性の評価軸を決め役割候補を提示する
- [ ] 自動決定せずホスト承認と参加者評価で有用性を記録する

## 完了条件
- [ ] プレイ観測から公平性の評価軸を決め役割候補を提示する
- [ ] 自動決定せずホスト承認と参加者評価で有用性を記録する
- [ ] 関連テストまたは手動試験の実行コマンド・観測結果を記録する
- [ ] 必要な共通文書とdocs/handoff/BUILD_LOG.mdを更新する

## 依存関係
[#57](https://github.com/jphacks/kz_2613/issues/57)

## 備考
設計案[H]/[P]は確定事項と区別し、変更理由をdocs/decisions/へ残す。 P0完了後のバックログ。今回の初期構築では実装しない。

**管理状態：** 未完了で保持する。観測事実だけで完了扱いせず、Issueのクローズは実施前にユーザーへ確認する。

### P26 — [#59](https://github.com/jphacks/kz_2613/issues/59)

## 概要
[Phase 7][P2] ジャイロ等の身体的入力を実験する

## 背景・関連要件
要件ID: FUT-206
- docs/requirements/requirements-v0.3.md
- docs/decisions/2026-10-24-user-decisions.md
- docs/architecture/system-design.md
- docs/architecture/validation-gates.md

## 作業内容
- [ ] 対象端末とHTTPS/権限条件を明記した限定プロトタイプを作る
- [ ] 端末差と権限拒否時のボタン代替、停止時解放を検証する

## 完了条件
- [ ] 対象端末とHTTPS/権限条件を明記した限定プロトタイプを作る
- [ ] 端末差と権限拒否時のボタン代替、停止時解放を検証する
- [ ] 関連テストまたは手動試験の実行コマンド・観測結果を記録する
- [ ] 必要な共通文書とdocs/handoff/BUILD_LOG.mdを更新する

## 依存関係
[#53](https://github.com/jphacks/kz_2613/issues/53)

## 備考
設計案[H]/[P]は確定事項と区別し、変更理由をdocs/decisions/へ残す。 P0完了後のバックログ。今回の初期構築では実装しない。

**管理状態：** 未完了で保持する。観測事実だけで完了扱いせず、Issueのクローズは実施前にユーザーへ確認する。

### P27 — [#60](https://github.com/jphacks/kz_2613/issues/60)

## 概要
[Phase 7][P2] 入力プロファイルから操作UIを生成する

## 背景・関連要件
要件ID: FUT-207
- docs/requirements/requirements-v0.3.md
- docs/decisions/2026-10-24-user-decisions.md
- docs/architecture/system-design.md
- docs/architecture/validation-gates.md

## 作業内容
- [ ] 検証済みプロファイルに基づくボタン生成と役割制限を追加する
- [ ] 不正スキーマ/未対応入力を拒否し任意OS操作の権限を広げないテストを追加する

## 完了条件
- [ ] 検証済みプロファイルに基づくボタン生成と役割制限を追加する
- [ ] 不正スキーマ/未対応入力を拒否し任意OS操作の権限を広げないテストを追加する
- [ ] 関連テストまたは手動試験の実行コマンド・観測結果を記録する
- [ ] 必要な共通文書とdocs/handoff/BUILD_LOG.mdを更新する

## 依存関係
[#53](https://github.com/jphacks/kz_2613/issues/53), [#50](https://github.com/jphacks/kz_2613/issues/50)

## 備考
設計案[H]/[P]は確定事項と区別し、変更理由をdocs/decisions/へ残す。 P0完了後のバックログ。今回の初期構築では実装しない。

**管理状態：** 未完了で保持する。観測事実だけで完了扱いせず、Issueのクローズは実施前にユーザーへ確認する。

### P28 — [#61](https://github.com/jphacks/kz_2613/issues/61)

## 概要
[Phase 7][P2] Minecraft以外の1タイトルで入力対応を検証する

## 背景・関連要件
要件ID: ENV-10, FUT-208
- docs/requirements/requirements-v0.3.md
- docs/decisions/2026-10-24-user-decisions.md
- docs/architecture/system-design.md
- docs/architecture/validation-gates.md

## 作業内容
- [ ] 候補1タイトルを選び利用条件と注入/フォーカス/停止を実機検証する
- [ ] 対応を一般化せず版・設定・制約とGo/No-Goを記録する

## 完了条件
- [ ] 候補1タイトルを選び利用条件と注入/フォーカス/停止を実機検証する
- [ ] 対応を一般化せず版・設定・制約とGo/No-Goを記録する
- [ ] 関連テストまたは手動試験の実行コマンド・観測結果を記録する
- [ ] 必要な共通文書とdocs/handoff/BUILD_LOG.mdを更新する

## 依存関係
[#53](https://github.com/jphacks/kz_2613/issues/53)

## 備考
実機検証。端末・OS/ブラウザ・Minecraft版・ネットワーク・実施日/操作者・実測結果を記録する。未実施は未検証とする。 P0完了後のバックログ。今回の初期構築では実装しない。

**管理状態：** 未完了で保持する。観測事実だけで完了扱いせず、Issueのクローズは実施前にユーザーへ確認する。

### P29 — [#62](https://github.com/jphacks/kz_2613/issues/62)

## 概要
[Phase 7][P2] 終了後の役割交換とリトライ導線を追加する

## 背景・関連要件
要件ID: FUT-209
- docs/requirements/requirements-v0.3.md
- docs/decisions/2026-10-24-user-decisions.md
- docs/architecture/system-design.md
- docs/architecture/validation-gates.md

## 作業内容
- [ ] セッションを維持し安全停止後に役割交換して再挑戦できるようにする
- [ ] 旧保持入力が復活せず全員の担当表示が揃うことを検証する

## 完了条件
- [ ] セッションを維持し安全停止後に役割交換して再挑戦できるようにする
- [ ] 旧保持入力が復活せず全員の担当表示が揃うことを検証する
- [ ] 関連テストまたは手動試験の実行コマンド・観測結果を記録する
- [ ] 必要な共通文書とdocs/handoff/BUILD_LOG.mdを更新する

## 依存関係
[#47](https://github.com/jphacks/kz_2613/issues/47)

## 備考
設計案[H]/[P]は確定事項と区別し、変更理由をdocs/decisions/へ残す。 P0完了後のバックログ。今回の初期構築では実装しない。

**管理状態：** 未完了で保持する。観測事実だけで完了扱いせず、Issueのクローズは実施前にユーザーへ確認する。

### P210 — [#63](https://github.com/jphacks/kz_2613/issues/63)

## 概要
[Phase 7][P2] ローカル接続のワンタップ化・Legacy APを調査する

## 背景・関連要件
要件ID: FUT-210
- docs/requirements/requirements-v0.3.md
- docs/decisions/2026-10-24-user-decisions.md
- docs/architecture/system-design.md
- docs/architecture/validation-gates.md

## 作業内容
- [ ] 標準ホットスポットの実測を踏まえWindows APIとLegacy APの対応可否を調査する
- [ ] 利用可能な構成と手動復旧手順を記録し標準Wi-Fi接続を代替として残す

## 完了条件
- [ ] 標準ホットスポットの実測を踏まえWindows APIとLegacy APの対応可否を調査する
- [ ] 利用可能な構成と手動復旧手順を記録し標準Wi-Fi接続を代替として残す
- [ ] 関連テストまたは手動試験の実行コマンド・観測結果を記録する
- [ ] 必要な共通文書とdocs/handoff/BUILD_LOG.mdを更新する

## 依存関係
[#9](https://github.com/jphacks/kz_2613/issues/9), [#40](https://github.com/jphacks/kz_2613/issues/40)

## 備考
設計案[H]/[P]は確定事項と区別し、変更理由をdocs/decisions/へ残す。 P0完了後のバックログ。今回の初期構築では実装しない。

**管理状態：** 未完了で保持する。観測事実だけで完了扱いせず、Issueのクローズは実施前にユーザーへ確認する。

## 2026-10-25 UI実装の依存関係

最新の実装指示は `2026-10-25-ui-implementation-execution.md`。旧バックログの段階・Ready記述と異なる箇所は以下を優先する。

| Issue | 今回の役割 | 前提・未完了条件 |
| --- | --- | --- |
| #88 | preparingとホストだけの明示Ready | 最初の機能PR #90。新手順の実機受入は未実施 |
| #46 | P1タッチパッドとPC／ゲームへの排他的な操作 | #88の上に機能PR #91。実メニュー操作は未実機検証 |
| #89 | 共通パレットとPC・スマホ同時刷新 | #88・#46の上にUI PR。6種類の縦サイズを確認。実機受入は残る |
| #51 | QR案内・3人接続とホストReadyの区別 | #89へ取り込み。初見3人による観測は残る |
| #52 | 縦画面の可変サイズ・safe area・回転停止 | #89へ取り込み。Android/iPhoneでの実測は残る |
| #49 | 一般のローカル起動パス・ランチャー探索 | 今回は追加しない。対象の既存ウィンドウ前面化と手動起動への案内のみ |

新Issueの番号はGitHubで実際に発行された #88・#89を使う。マージ前にIssueを閉じない。機械試験・表示確認を実機合格へ読み替えない。
