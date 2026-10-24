# 初期開発Issue計画

2026-10-24。既存Issueを全状態で検索した後に登録。実装と実機検証を分離する。
P0はデモ成立、P1は体験改善、P2は将来バックログ。依存Issue完了後にblockedを外す。
Phase 0の完了証拠はBUILD_LOG.mdとGitHub Actionsを参照。以降の機能・実機検証は未完了。

| ID | Issue | 成果物 | 優先度/種別/対象 | 前提 |
|---|---|---|---|---|
| S0 | [#1](https://github.com/jphacks/kz_2613/issues/1) | [Phase 0][P0] リポジトリ初期環境を安全に統合する | P0/infra/host | なし |
| S1 | [#2](https://github.com/jphacks/kz_2613/issues/2) | [Phase 0][P0] Python 3.12 APIの起動・ヘルスチェックを確立する | P0/infra/host | [#1](https://github.com/jphacks/kz_2613/issues/1) |
| S2 | [#3](https://github.com/jphacks/kz_2613/issues/3) | [Phase 0][P0] Reactの型検査・テスト・静的ビルド配信を確立する | P0/infra/web | [#1](https://github.com/jphacks/kz_2613/issues/1), [#2](https://github.com/jphacks/kz_2613/issues/2) |
| S3 | [#4](https://github.com/jphacks/kz_2613/issues/4) | [Phase 0][P0] CI・共通開発ルールとIssue運用を整備する | P0/infra/host | [#2](https://github.com/jphacks/kz_2613/issues/2), [#3](https://github.com/jphacks/kz_2613/issues/3) |
| V0 | [#5](https://github.com/jphacks/kz_2613/issues/5) | [Phase 1][P0] 明示操作でのみ実行するWindows入力プローブを用意する | P0/feature/input | [#4](https://github.com/jphacks/kz_2613/issues/4) |
| V1 | [#6](https://github.com/jphacks/kz_2613/issues/6) | [Phase 1][P0] SendInputキー入力をMinecraft実機で検証する | P0/test/input | [#5](https://github.com/jphacks/kz_2613/issues/5) |
| V2 | [#7](https://github.com/jphacks/kz_2613/issues/7) | [Phase 1][P0] 左右クリックと長押し解放をMinecraft実機で検証する | P0/test/input | [#5](https://github.com/jphacks/kz_2613/issues/5) |
| V3 | [#8](https://github.com/jphacks/kz_2613/issues/8) | [Phase 1][P0] 相対マウス視点操作の成立性をMinecraft実機で検証する | P0/test/input | [#5](https://github.com/jphacks/kz_2613/issues/5) |
| V4 | [#9](https://github.com/jphacks/kz_2613/issues/9) | [Phase 1][P0] Windowsホットスポットと上流なしLAN接続を検証する | P0/test/network | [#4](https://github.com/jphacks/kz_2613/issues/4) |
| V5 | [#10](https://github.com/jphacks/kz_2613/issues/10) | [Phase 1][P0] Android・iPhoneの基本Web表示とPointer Eventsを検証する | P0/test/web | [#4](https://github.com/jphacks/kz_2613/issues/4) |
| B0 | [#11](https://github.com/jphacks/kz_2613/issues/11) | [Phase 2][P0] WebSocketメッセージ契約と接続管理を実装する | P0/feature/network | [#4](https://github.com/jphacks/kz_2613/issues/4) |
| B1 | [#12](https://github.com/jphacks/kz_2613/issues/12) | [Phase 2][P0] セッション生成・参加トークン管理を実装する | P0/feature/host | [#11](https://github.com/jphacks/kz_2613/issues/11) |
| B2 | [#13](https://github.com/jphacks/kz_2613/issues/13) | [Phase 2][P0] 接続順でホスト・P1/P2/P3を固定する | P0/feature/host | [#12](https://github.com/jphacks/kz_2613/issues/12) |
| B3 | [#14](https://github.com/jphacks/kz_2613/issues/14) | [Phase 2][P0] 再接続で元の枠・ホスト権を復元する | P0/feature/host | [#13](https://github.com/jphacks/kz_2613/issues/13) |
| B4 | [#15](https://github.com/jphacks/kz_2613/issues/15) | [Phase 2][P0] 操作モードの状態機械と世代更新を実装する | P0/feature/host | [#13](https://github.com/jphacks/kz_2613/issues/13) |
| B5 | [#16](https://github.com/jphacks/kz_2613/issues/16) | [Phase 2][P0] 役割・モード・管理操作の認可を実装する | P0/feature/host | [#15](https://github.com/jphacks/kz_2613/issues/15), [#12](https://github.com/jphacks/kz_2613/issues/12) |
| B6 | [#17](https://github.com/jphacks/kz_2613/issues/17) | [Phase 2][P0] 保持キー・ボタンと入力所有状態を管理する | P0/feature/input | [#16](https://github.com/jphacks/kz_2613/issues/16) |
| B7 | [#18](https://github.com/jphacks/kz_2613/issues/18) | [Phase 2][P0] 心拍・通信断・終了時の全入力解放を実装する | P0/feature/input | [#17](https://github.com/jphacks/kz_2613/issues/17), [#14](https://github.com/jphacks/kz_2613/issues/14) |
| B8 | [#19](https://github.com/jphacks/kz_2613/issues/19) | [Phase 2][P0] 対象ゲームウィンドウのフォーカス監視を実装する | P0/feature/input | [#18](https://github.com/jphacks/kz_2613/issues/18), [#6](https://github.com/jphacks/kz_2613/issues/6), [#7](https://github.com/jphacks/kz_2613/issues/7), [#8](https://github.com/jphacks/kz_2613/issues/8) |
| B9 | [#20](https://github.com/jphacks/kz_2613/issues/20) | [Phase 2][P0] 検証済みSendInputアダプターを入力エンジンへ接続する | P0/feature/input | [#19](https://github.com/jphacks/kz_2613/issues/19), [#6](https://github.com/jphacks/kz_2613/issues/6), [#7](https://github.com/jphacks/kz_2613/issues/7), [#8](https://github.com/jphacks/kz_2613/issues/8) |
| B10 | [#21](https://github.com/jphacks/kz_2613/issues/21) | [Phase 2][P0] PCからの緊急停止・セッション終了を実装する | P0/feature/host | [#18](https://github.com/jphacks/kz_2613/issues/18) |
| B11 | [#22](https://github.com/jphacks/kz_2613/issues/22) | [Phase 2][P0] 停止理由・接続状態のローカル診断を実装する | P0/feature/host | [#18](https://github.com/jphacks/kz_2613/issues/18), [#19](https://github.com/jphacks/kz_2613/issues/19) |
| B12 | [#23](https://github.com/jphacks/kz_2613/issues/23) | [Phase 2][P0] LANの3ブラウザHTTP・WebSocketを検証する | P0/test/network | [#16](https://github.com/jphacks/kz_2613/issues/16), [#9](https://github.com/jphacks/kz_2613/issues/9), [#10](https://github.com/jphacks/kz_2613/issues/10) |
| W0 | [#24](https://github.com/jphacks/kz_2613/issues/24) | [Phase 3][P0] 役割・接続状態と再接続UIを実装する | P0/feature/web | [#14](https://github.com/jphacks/kz_2613/issues/14) |
| W1 | [#25](https://github.com/jphacks/kz_2613/issues/25) | [Phase 3][P0] Pointer Eventsの共通押下・解放処理を実装する | P0/feature/web | [#24](https://github.com/jphacks/kz_2613/issues/24), [#18](https://github.com/jphacks/kz_2613/issues/18) |
| W2 | [#26](https://github.com/jphacks/kz_2613/issues/26) | [Phase 3][P0] ホスト用の矢印・Enter・Escリモコンを実装する | P0/feature/web | [#25](https://github.com/jphacks/kz_2613/issues/25), [#16](https://github.com/jphacks/kz_2613/issues/16) |
| W3 | [#27](https://github.com/jphacks/kz_2613/issues/27) | [Phase 3][P0] P1の十字キーとダッシュを実装する | P0/feature/web | [#25](https://github.com/jphacks/kz_2613/issues/25), [#16](https://github.com/jphacks/kz_2613/issues/16) |
| W4 | [#28](https://github.com/jphacks/kz_2613/issues/28) | [Phase 3][P0] P2の方向ボタン視点コントローラーを実装する | P0/feature/web | [#25](https://github.com/jphacks/kz_2613/issues/25), [#16](https://github.com/jphacks/kz_2613/issues/16) |
| W5 | [#29](https://github.com/jphacks/kz_2613/issues/29) | [Phase 3][P0] P3のアクションとホットバーUIを実装する | P0/feature/web | [#25](https://github.com/jphacks/kz_2613/issues/25), [#16](https://github.com/jphacks/kz_2613/issues/16) |
| W6 | [#30](https://github.com/jphacks/kz_2613/issues/30) | [Phase 3][P0] ホストStart・Pause・Resumeと3人条件のUIを実装する | P0/feature/web | [#26](https://github.com/jphacks/kz_2613/issues/26), [#27](https://github.com/jphacks/kz_2613/issues/27), [#28](https://github.com/jphacks/kz_2613/issues/28), [#29](https://github.com/jphacks/kz_2613/issues/29), [#15](https://github.com/jphacks/kz_2613/issues/15) |
| W7 | [#31](https://github.com/jphacks/kz_2613/issues/31) | [Phase 3][P0] Android・iPhoneで全コントローラーを実機検証する | P0/test/web | [#30](https://github.com/jphacks/kz_2613/issues/30), [#20](https://github.com/jphacks/kz_2613/issues/20), [#23](https://github.com/jphacks/kz_2613/issues/23) |
| D0 | [#32](https://github.com/jphacks/kz_2613/issues/32) | [Phase 4][P0] 参加用QR・URL・人数画面を実装する | P0/feature/desktop | [#13](https://github.com/jphacks/kz_2613/issues/13) |
| D1 | [#33](https://github.com/jphacks/kz_2613/issues/33) | [Phase 4][P0] 手動起動を許容するゲーム選択画面を実装する | P0/feature/desktop | [#32](https://github.com/jphacks/kz_2613/issues/32) |
| D2 | [#34](https://github.com/jphacks/kz_2613/issues/34) | [Phase 4][P0] 3人の操作分担確認画面を実装する | P0/feature/desktop | [#33](https://github.com/jphacks/kz_2613/issues/33) |
| D3 | [#35](https://github.com/jphacks/kz_2613/issues/35) | [Phase 4][P0] Minecraftへの移行・復帰時もセッションを維持する | P0/feature/desktop | [#34](https://github.com/jphacks/kz_2613/issues/34), [#19](https://github.com/jphacks/kz_2613/issues/19), [#30](https://github.com/jphacks/kz_2613/issues/30) |
| D4 | [#36](https://github.com/jphacks/kz_2613/issues/36) | [Phase 4][P0] pywebviewデスクトップGUIとブラウザ代替を実装する | P0/feature/desktop | [#35](https://github.com/jphacks/kz_2613/issues/35) |
| D5 | [#37](https://github.com/jphacks/kz_2613/issues/37) | [Phase 4][P0] フォーカス切替とPC GUIの実機検証を行う | P0/test/desktop | [#36](https://github.com/jphacks/kz_2613/issues/36), [#20](https://github.com/jphacks/kz_2613/issues/20) |
| E0 | [#38](https://github.com/jphacks/kz_2613/issues/38) | [Phase 5][P0] 3台同時操作と役割・管理権のE2Eを検証する | P0/test/host | [#31](https://github.com/jphacks/kz_2613/issues/31), [#37](https://github.com/jphacks/kz_2613/issues/37) |
| E1 | [#39](https://github.com/jphacks/kz_2613/issues/39) | [Phase 5][P0] 切断・再接続・緊急停止の障害試験を行う | P0/test/input | [#38](https://github.com/jphacks/kz_2613/issues/38), [#21](https://github.com/jphacks/kz_2613/issues/21) |
| E2 | [#40](https://github.com/jphacks/kz_2613/issues/40) | [Phase 5][P0] Minecraft協力プレイの反復デモを検証する | P0/test/host | [#39](https://github.com/jphacks/kz_2613/issues/39) |
| E3 | [#41](https://github.com/jphacks/kz_2613/issues/41) | [Phase 5][P0] Windows onedir配布パッケージを作る | P0/infra/desktop | [#36](https://github.com/jphacks/kz_2613/issues/36), [#39](https://github.com/jphacks/kz_2613/issues/39) |
| E4 | [#42](https://github.com/jphacks/kz_2613/issues/42) | [Phase 5][P0] ゲーム画面・名称・デモ素材の利用条件を確認する | P0/docs/desktop | [#4](https://github.com/jphacks/kz_2613/issues/4) |
| E5 | [#43](https://github.com/jphacks/kz_2613/issues/43) | [Phase 5][P0] READMEと発表デモ・当日復旧手順を整備する | P0/docs/host | [#40](https://github.com/jphacks/kz_2613/issues/40), [#41](https://github.com/jphacks/kz_2613/issues/41), [#42](https://github.com/jphacks/kz_2613/issues/42) |
| P11 | [#44](https://github.com/jphacks/kz_2613/issues/44) | [Phase 6][P1] P1移動を仮想スティックへ拡張する | P1/feature/web | [#40](https://github.com/jphacks/kz_2613/issues/40) |
| P12 | [#45](https://github.com/jphacks/kz_2613/issues/45) | [Phase 6][P1] P2視点をスワイプ・感度調整へ拡張する | P1/feature/web | [#40](https://github.com/jphacks/kz_2613/issues/40) |
| P13 | [#46](https://github.com/jphacks/kz_2613/issues/46) | [Phase 6][P1] ホストリモコンにタッチパッド・クリック・Eキーを追加する | P1/feature/web | [#40](https://github.com/jphacks/kz_2613/issues/40) |
| P14 | [#47](https://github.com/jphacks/kz_2613/issues/47) | [Phase 6][P1] Pause中の役割指定・交換を実装する | P1/feature/host | [#40](https://github.com/jphacks/kz_2613/issues/40) |
| P15 | [#48](https://github.com/jphacks/kz_2613/issues/48) | [Phase 6][P1] PCゲーム一覧を矢印・Enter・Escで選択可能にする | P1/feature/desktop | [#40](https://github.com/jphacks/kz_2613/issues/40) |
| P16 | [#49](https://github.com/jphacks/kz_2613/issues/49) | [Phase 6][P1] ゲーム起動パスの手動登録を追加する | P1/feature/desktop | [#40](https://github.com/jphacks/kz_2613/issues/40) |
| P17 | [#50](https://github.com/jphacks/kz_2613/issues/50) | [Phase 6][P1] 操作ボタン配置とキー割当の編集を追加する | P1/feature/web | [#47](https://github.com/jphacks/kz_2613/issues/47) |
| P18 | [#51](https://github.com/jphacks/kz_2613/issues/51) | [Phase 6][P1] QR参加案内・Ready表示と開始前の説明を改善する | P1/feature/web | [#40](https://github.com/jphacks/kz_2613/issues/40) |
| P19 | [#52](https://github.com/jphacks/kz_2613/issues/52) | [Phase 6][P1] 横画面・安全領域と操作フィードバックを改善する | P1/feature/web | [#40](https://github.com/jphacks/kz_2613/issues/40) |
| P110 | [#53](https://github.com/jphacks/kz_2613/issues/53) | [Phase 6][P1] ゲーム別入力プリセットをローカル保存する | P1/feature/host | [#40](https://github.com/jphacks/kz_2613/issues/40) |
| P21 | [#54](https://github.com/jphacks/kz_2613/issues/54) | [Phase 7][P2] ローカルランチャー情報からゲーム候補を検出する | P2/feature/desktop | [#49](https://github.com/jphacks/kz_2613/issues/49) |
| P22 | [#55](https://github.com/jphacks/kz_2613/issues/55) | [Phase 7][P2] Minecraftランチャー検出と起動支援を追加する | P2/feature/desktop | [#49](https://github.com/jphacks/kz_2613/issues/49) |
| P23 | [#56](https://github.com/jphacks/kz_2613/issues/56) | [Phase 7][P2] 任意のPCアプリの手動登録を一般化する | P2/feature/desktop | [#49](https://github.com/jphacks/kz_2613/issues/49) |
| P24 | [#57](https://github.com/jphacks/kz_2613/issues/57) | [Phase 7][P2] 2〜4人の可変人数と役割枠を設計・実装する | P2/feature/host | [#47](https://github.com/jphacks/kz_2613/issues/47) |
| P25 | [#58](https://github.com/jphacks/kz_2613/issues/58) | [Phase 7][P2] 操作量・重要度に基づく役割提案を試作する | P2/feature/host | [#57](https://github.com/jphacks/kz_2613/issues/57) |
| P26 | [#59](https://github.com/jphacks/kz_2613/issues/59) | [Phase 7][P2] ジャイロ等の身体的入力を実験する | P2/feature/web | [#53](https://github.com/jphacks/kz_2613/issues/53) |
| P27 | [#60](https://github.com/jphacks/kz_2613/issues/60) | [Phase 7][P2] 入力プロファイルから操作UIを生成する | P2/feature/web | [#53](https://github.com/jphacks/kz_2613/issues/53), [#50](https://github.com/jphacks/kz_2613/issues/50) |
| P28 | [#61](https://github.com/jphacks/kz_2613/issues/61) | [Phase 7][P2] Minecraft以外の1タイトルで入力対応を検証する | P2/test/input | [#53](https://github.com/jphacks/kz_2613/issues/53) |
| P29 | [#62](https://github.com/jphacks/kz_2613/issues/62) | [Phase 7][P2] 終了後の役割交換とリトライ導線を追加する | P2/feature/web | [#47](https://github.com/jphacks/kz_2613/issues/47) |
| P210 | [#63](https://github.com/jphacks/kz_2613/issues/63) | [Phase 7][P2] ローカル接続のワンタップ化・Legacy APを調査する | P2/feature/network | [#9](https://github.com/jphacks/kz_2613/issues/9), [#40](https://github.com/jphacks/kz_2613/issues/40) |

## 各Issueの作業・完了条件

### S0 — [#1](https://github.com/jphacks/kz_2613/issues/1)

## 概要
[Phase 0][P0] リポジトリ初期環境を安全に統合する

## 背景・関連要件
要件ID: ENV-01, NFR-12
- docs/requirements/requirements-v0.2.md
- docs/decisions/2026-10-24-user-decisions.md
- docs/architecture/system-design.md
- docs/architecture/validation-gates.md

## 作業内容
- [ ] README・LICENSE保持、構造・ignore・共有仕様を確認する
- [ ] verify_overlayとコミット対象の確認結果をBUILD_LOGへ残す

## 完了条件
- [ ] README・LICENSE保持、構造・ignore・共有仕様を確認する
- [ ] verify_overlayとコミット対象の確認結果をBUILD_LOGへ残す
- [ ] 関連テストまたは手動試験の実行コマンド・観測結果を記録する
- [ ] 必要な共通文書とdocs/handoff/BUILD_LOG.mdを更新する

## 依存関係
なし

## 備考
設計案[H]/[P]は確定事項と区別し、変更理由をdocs/decisions/へ残す。


### S1 — [#2](https://github.com/jphacks/kz_2613/issues/2)

## 概要
[Phase 0][P0] Python 3.12 APIの起動・ヘルスチェックを確立する

## 背景・関連要件
要件ID: ENV-01, NFR-12
- docs/requirements/requirements-v0.2.md
- docs/decisions/2026-10-24-user-decisions.md
- docs/architecture/system-design.md
- docs/architecture/validation-gates.md

## 作業内容
- [ ] venvと固定依存を整備しpytest/ruffを実行する
- [ ] healthはscaffoldでgame_input_ready=false、再現手順を記録する

## 完了条件
- [ ] venvと固定依存を整備しpytest/ruffを実行する
- [ ] healthはscaffoldでgame_input_ready=false、再現手順を記録する
- [ ] 関連テストまたは手動試験の実行コマンド・観測結果を記録する
- [ ] 必要な共通文書とdocs/handoff/BUILD_LOG.mdを更新する

## 依存関係
[#1](https://github.com/jphacks/kz_2613/issues/1)

## 備考
設計案[H]/[P]は確定事項と区別し、変更理由をdocs/decisions/へ残す。


### S2 — [#3](https://github.com/jphacks/kz_2613/issues/3)

## 概要
[Phase 0][P0] Reactの型検査・テスト・静的ビルド配信を確立する

## 背景・関連要件
要件ID: NFR-11, NFR-12
- docs/requirements/requirements-v0.2.md
- docs/decisions/2026-10-24-user-decisions.md
- docs/architecture/system-design.md
- docs/architecture/validation-gates.md

## 作業内容
- [ ] npm lockを生成しcheck/Vitest/build、FastAPI配信を確認する
- [ ] PC・スマホひな形とローカルJS/CSSを確認し記録する

## 完了条件
- [ ] npm lockを生成しcheck/Vitest/build、FastAPI配信を確認する
- [ ] PC・スマホひな形とローカルJS/CSSを確認し記録する
- [ ] 関連テストまたは手動試験の実行コマンド・観測結果を記録する
- [ ] 必要な共通文書とdocs/handoff/BUILD_LOG.mdを更新する

## 依存関係
[#1](https://github.com/jphacks/kz_2613/issues/1), [#2](https://github.com/jphacks/kz_2613/issues/2)

## 備考
設計案[H]/[P]は確定事項と区別し、変更理由をdocs/decisions/へ残す。


### S3 — [#4](https://github.com/jphacks/kz_2613/issues/4)

## 概要
[Phase 0][P0] CI・共通開発ルールとIssue運用を整備する

## 背景・関連要件
要件ID: NFR-12
- docs/requirements/requirements-v0.2.md
- docs/decisions/2026-10-24-user-decisions.md
- docs/architecture/system-design.md
- docs/architecture/validation-gates.md

## 作業内容
- [ ] npm ci、Python/TS検証、PR/Issueテンプレートと共通運用を整備する
- [ ] GitHub Actionsの成功とIssue計画・BUILD_LOGを記録する

## 完了条件
- [ ] npm ci、Python/TS検証、PR/Issueテンプレートと共通運用を整備する
- [ ] GitHub Actionsの成功とIssue計画・BUILD_LOGを記録する
- [ ] 関連テストまたは手動試験の実行コマンド・観測結果を記録する
- [ ] 必要な共通文書とdocs/handoff/BUILD_LOG.mdを更新する

## 依存関係
[#2](https://github.com/jphacks/kz_2613/issues/2), [#3](https://github.com/jphacks/kz_2613/issues/3)

## 備考
設計案[H]/[P]は確定事項と区別し、変更理由をdocs/decisions/へ残す。


### V0 — [#5](https://github.com/jphacks/kz_2613/issues/5)

## 概要
[Phase 1][P0] 明示操作でのみ実行するWindows入力プローブを用意する

## 背景・関連要件
要件ID: ENV-01, ENV-02, FR-026, FR-035
- docs/requirements/requirements-v0.2.md
- docs/decisions/2026-10-24-user-decisions.md
- docs/architecture/system-design.md
- docs/architecture/validation-gates.md

## 作業内容
- [ ] Windows限定、対象確認、手動arming、非常停止とfinally全解放を備える独立プローブを実装する
- [ ] 起動時やimport時に入力を送らずmockで安全経路を確認し実機手順を記す

## 完了条件
- [ ] Windows限定、対象確認、手動arming、非常停止とfinally全解放を備える独立プローブを実装する
- [ ] 起動時やimport時に入力を送らずmockで安全経路を確認し実機手順を記す
- [ ] 関連テストまたは手動試験の実行コマンド・観測結果を記録する
- [ ] 必要な共通文書とdocs/handoff/BUILD_LOG.mdを更新する

## 依存関係
[#4](https://github.com/jphacks/kz_2613/issues/4)

## 備考
設計案[H]/[P]は確定事項と区別し、変更理由をdocs/decisions/へ残す。


### V1 — [#6](https://github.com/jphacks/kz_2613/issues/6)

## 概要
[Phase 1][P0] SendInputキー入力をMinecraft実機で検証する

## 背景・関連要件
要件ID: FR-020, FR-022, FR-023, FR-026, G-02
- docs/requirements/requirements-v0.2.md
- docs/decisions/2026-10-24-user-decisions.md
- docs/architecture/system-design.md
- docs/architecture/validation-gates.md

## 作業内容
- [ ] 操作者が明示開始しWASD/Ctrl/Space/Shift/1〜9のdown/upを観測する
- [ ] G1-AのPC・ゲーム版・設定と停止動作、失敗時の代替を記録する

## 完了条件
- [ ] 操作者が明示開始しWASD/Ctrl/Space/Shift/1〜9のdown/upを観測する
- [ ] G1-AのPC・ゲーム版・設定と停止動作、失敗時の代替を記録する
- [ ] 関連テストまたは手動試験の実行コマンド・観測結果を記録する
- [ ] 必要な共通文書とdocs/handoff/BUILD_LOG.mdを更新する

## 依存関係
[#5](https://github.com/jphacks/kz_2613/issues/5)

## 備考
実機検証。端末・OS/ブラウザ・Minecraft版・ネットワーク・実施日/操作者・実測結果を記録する。未実施は未検証とする。


### V2 — [#7](https://github.com/jphacks/kz_2613/issues/7)

## 概要
[Phase 1][P0] 左右クリックと長押し解放をMinecraft実機で検証する

## 背景・関連要件
要件ID: FR-022, FR-030, G-02
- docs/requirements/requirements-v0.2.md
- docs/decisions/2026-10-24-user-decisions.md
- docs/architecture/system-design.md
- docs/architecture/validation-gates.md

## 作業内容
- [ ] 操作者の明示開始で左右down/up・採掘/設置と長押しを検証する
- [ ] G1-Bで実際の押下と解放を観測しゲーム版・設定・結果を残す

## 完了条件
- [ ] 操作者の明示開始で左右down/up・採掘/設置と長押しを検証する
- [ ] G1-Bで実際の押下と解放を観測しゲーム版・設定・結果を残す
- [ ] 関連テストまたは手動試験の実行コマンド・観測結果を記録する
- [ ] 必要な共通文書とdocs/handoff/BUILD_LOG.mdを更新する

## 依存関係
[#5](https://github.com/jphacks/kz_2613/issues/5)

## 備考
実機検証。端末・OS/ブラウザ・Minecraft版・ネットワーク・実施日/操作者・実測結果を記録する。未実施は未検証とする。


### V3 — [#8](https://github.com/jphacks/kz_2613/issues/8)

## 概要
[Phase 1][P0] 相対マウス視点操作の成立性をMinecraft実機で検証する

## 背景・関連要件
要件ID: FR-021, FR-026, G-03
- docs/requirements/requirements-v0.2.md
- docs/decisions/2026-10-24-user-decisions.md
- docs/architecture/system-design.md
- docs/architecture/validation-gates.md

## 作業内容
- [ ] ABSOLUTEを使わないdx/dyを手動開始して上下左右の視点を観測する
- [ ] G1-Cの正確な版・感度・観測結果とGo/No-Goを記録し不成立なら設計を再検討する

## 完了条件
- [ ] ABSOLUTEを使わないdx/dyを手動開始して上下左右の視点を観測する
- [ ] G1-Cの正確な版・感度・観測結果とGo/No-Goを記録し不成立なら設計を再検討する
- [ ] 関連テストまたは手動試験の実行コマンド・観測結果を記録する
- [ ] 必要な共通文書とdocs/handoff/BUILD_LOG.mdを更新する

## 依存関係
[#5](https://github.com/jphacks/kz_2613/issues/5)

## 備考
実機検証。端末・OS/ブラウザ・Minecraft版・ネットワーク・実施日/操作者・実測結果を記録する。未実施は未検証とする。


### V4 — [#9](https://github.com/jphacks/kz_2613/issues/9)

## 概要
[Phase 1][P0] Windowsホットスポットと上流なしLAN接続を検証する

## 背景・関連要件
要件ID: ENV-06, ENV-07, ENV-09, NFR-01, G-01, G-07, AT-17
- docs/requirements/requirements-v0.2.md
- docs/decisions/2026-10-24-user-decisions.md
- docs/architecture/system-design.md
- docs/architecture/validation-gates.md

## 作業内容
- [ ] PC無線NICと3台、上流を外したHTTP接続・ホットスポット起動を試す
- [ ] G2-Aに実測を残し不成立時はローカルAPの代替手順を記録する

## 完了条件
- [ ] PC無線NICと3台、上流を外したHTTP接続・ホットスポット起動を試す
- [ ] G2-Aに実測を残し不成立時はローカルAPの代替手順を記録する
- [ ] 関連テストまたは手動試験の実行コマンド・観測結果を記録する
- [ ] 必要な共通文書とdocs/handoff/BUILD_LOG.mdを更新する

## 依存関係
[#4](https://github.com/jphacks/kz_2613/issues/4)

## 備考
実機検証。端末・OS/ブラウザ・Minecraft版・ネットワーク・実施日/操作者・実測結果を記録する。未実施は未検証とする。


### V5 — [#10](https://github.com/jphacks/kz_2613/issues/10)

## 概要
[Phase 1][P0] Android・iPhoneの基本Web表示とPointer Eventsを検証する

## 背景・関連要件
要件ID: ENV-04, NFR-02, NFR-07, G-05, AT-18
- docs/requirements/requirements-v0.2.md
- docs/decisions/2026-10-24-user-decisions.md
- docs/architecture/system-design.md
- docs/architecture/validation-gates.md

## 作業内容
- [ ] Android ChromeとiPhone Safariでローカルページ、押下/解放/複数指/非表示の試験用ページを検証する
- [ ] 端末・版・回転・長押しの差異を記録し本番3台WS試験とは区別する

## 完了条件
- [ ] Android ChromeとiPhone Safariでローカルページ、押下/解放/複数指/非表示の試験用ページを検証する
- [ ] 端末・版・回転・長押しの差異を記録し本番3台WS試験とは区別する
- [ ] 関連テストまたは手動試験の実行コマンド・観測結果を記録する
- [ ] 必要な共通文書とdocs/handoff/BUILD_LOG.mdを更新する

## 依存関係
[#4](https://github.com/jphacks/kz_2613/issues/4)

## 備考
実機検証。端末・OS/ブラウザ・Minecraft版・ネットワーク・実施日/操作者・実測結果を記録する。未実施は未検証とする。


### B0 — [#11](https://github.com/jphacks/kz_2613/issues/11)

## 概要
[Phase 2][P0] WebSocketメッセージ契約と接続管理を実装する

## 背景・関連要件
要件ID: FR-002, NFR-15
- docs/requirements/requirements-v0.2.md
- docs/decisions/2026-10-24-user-decisions.md
- docs/architecture/system-design.md
- docs/architecture/validation-gates.md

## 作業内容
- [ ] protocolVersion/type/seq/epochを型付けし接続・送受信・不正サイズ/形式の制限を実装する
- [ ] 正常通信と不正フレーム・切断処理のテストと契約文書を追加する

## 完了条件
- [ ] protocolVersion/type/seq/epochを型付けし接続・送受信・不正サイズ/形式の制限を実装する
- [ ] 正常通信と不正フレーム・切断処理のテストと契約文書を追加する
- [ ] 関連テストまたは手動試験の実行コマンド・観測結果を記録する
- [ ] 必要な共通文書とdocs/handoff/BUILD_LOG.mdを更新する

## 依存関係
[#4](https://github.com/jphacks/kz_2613/issues/4)

## 備考
設計案[H]/[P]は確定事項と区別し、変更理由をdocs/decisions/へ残す。


### B1 — [#12](https://github.com/jphacks/kz_2613/issues/12)

## 概要
[Phase 2][P0] セッション生成・参加トークン管理を実装する

## 背景・関連要件
要件ID: FR-001, ROLE-05, NFR-09
- docs/requirements/requirements-v0.2.md
- docs/decisions/2026-10-24-user-decisions.md
- docs/architecture/system-design.md
- docs/architecture/validation-gates.md

## 作業内容
- [ ] 単一セッションと推測困難な参加コード/端末トークンを生成しサーバーで検証する
- [ ] 無効・失効トークンを拒否し秘密が応答ログや永続ファイルへ漏れないことをテストする

## 完了条件
- [ ] 単一セッションと推測困難な参加コード/端末トークンを生成しサーバーで検証する
- [ ] 無効・失効トークンを拒否し秘密が応答ログや永続ファイルへ漏れないことをテストする
- [ ] 関連テストまたは手動試験の実行コマンド・観測結果を記録する
- [ ] 必要な共通文書とdocs/handoff/BUILD_LOG.mdを更新する

## 依存関係
[#11](https://github.com/jphacks/kz_2613/issues/11)

## 備考
設計案[H]/[P]は確定事項と区別し、変更理由をdocs/decisions/へ残す。


### B2 — [#13](https://github.com/jphacks/kz_2613/issues/13)

## 概要
[Phase 2][P0] 接続順でホスト・P1/P2/P3を固定する

## 背景・関連要件
要件ID: ROLE-01, ROLE-02, ROLE-03, FR-003, FR-004, FR-007, AT-02
- docs/requirements/requirements-v0.2.md
- docs/decisions/2026-10-24-user-decisions.md
- docs/architecture/system-design.md
- docs/architecture/validation-gates.md

## 作業内容
- [ ] 最初をホスト兼P1、続いてP2/P3とし4台目を拒否する
- [ ] 同時参加でも重複枠なく、切断による繰上げ・ホスト移譲が起きないことをテストする

## 完了条件
- [ ] 最初をホスト兼P1、続いてP2/P3とし4台目を拒否する
- [ ] 同時参加でも重複枠なく、切断による繰上げ・ホスト移譲が起きないことをテストする
- [ ] 関連テストまたは手動試験の実行コマンド・観測結果を記録する
- [ ] 必要な共通文書とdocs/handoff/BUILD_LOG.mdを更新する

## 依存関係
[#12](https://github.com/jphacks/kz_2613/issues/12)

## 備考
設計案[H]/[P]は確定事項と区別し、変更理由をdocs/decisions/へ残す。


### B3 — [#14](https://github.com/jphacks/kz_2613/issues/14)

## 概要
[Phase 2][P0] 再接続で元の枠・ホスト権を復元する

## 背景・関連要件
要件ID: ROLE-04, ROLE-05, FR-006, FR-017, NFR-08, AT-12
- docs/requirements/requirements-v0.2.md
- docs/decisions/2026-10-24-user-decisions.md
- docs/architecture/system-design.md
- docs/architecture/validation-gates.md

## 作業内容
- [ ] 接続と参加者識別を分けトークンで元枠へ復帰させ、有効期限と競合接続の扱いを定義する
- [ ] 別端末の枠奪取や自動再開を拒否するテストと手動リセット手順を記す

## 完了条件
- [ ] 接続と参加者識別を分けトークンで元枠へ復帰させ、有効期限と競合接続の扱いを定義する
- [ ] 別端末の枠奪取や自動再開を拒否するテストと手動リセット手順を記す
- [ ] 関連テストまたは手動試験の実行コマンド・観測結果を記録する
- [ ] 必要な共通文書とdocs/handoff/BUILD_LOG.mdを更新する

## 依存関係
[#13](https://github.com/jphacks/kz_2613/issues/13)

## 備考
設計案[H]/[P]は確定事項と区別し、変更理由をdocs/decisions/へ残す。


### B4 — [#15](https://github.com/jphacks/kz_2613/issues/15)

## 概要
[Phase 2][P0] 操作モードの状態機械と世代更新を実装する

## 背景・関連要件
要件ID: FR-005, FR-012, FR-013, FR-014, FR-015, FR-016, SM-01, SM-02, SM-03, SM-04, SM-05, AT-04, AT-08, AT-09
- docs/requirements/requirements-v0.2.md
- docs/decisions/2026-10-24-user-decisions.md
- docs/architecture/system-design.md
- docs/architecture/validation-gates.md

## 作業内容
- [ ] 待機/ホストRemote/Coop/Pause/再接続待ち/ホスト断/終了を定義し3人条件とepoch更新を実装する
- [ ] 全遷移をテストしPauseがEsc自動送信やゲーム内時間停止を意味しないことを文書化する

## 完了条件
- [ ] 待機/ホストRemote/Coop/Pause/再接続待ち/ホスト断/終了を定義し3人条件とepoch更新を実装する
- [ ] 全遷移をテストしPauseがEsc自動送信やゲーム内時間停止を意味しないことを文書化する
- [ ] 関連テストまたは手動試験の実行コマンド・観測結果を記録する
- [ ] 必要な共通文書とdocs/handoff/BUILD_LOG.mdを更新する

## 依存関係
[#13](https://github.com/jphacks/kz_2613/issues/13)

## 備考
設計案[H]/[P]は確定事項と区別し、変更理由をdocs/decisions/へ残す。


### B5 — [#16](https://github.com/jphacks/kz_2613/issues/16)

## 概要
[Phase 2][P0] 役割・モード・管理操作の認可を実装する

## 背景・関連要件
要件ID: FR-025, NFR-09, NFR-15, AT-14
- docs/requirements/requirements-v0.2.md
- docs/decisions/2026-10-24-user-decisions.md
- docs/architecture/system-design.md
- docs/architecture/validation-gates.md

## 作業内容
- [ ] 接続から参加者を解決しホスト管理権と担当アクションをサーバー側で検証する
- [ ] 偽装role/host、旧epoch/seq、過大delta、担当外キーを拒否する負例テストを追加する

## 完了条件
- [ ] 接続から参加者を解決しホスト管理権と担当アクションをサーバー側で検証する
- [ ] 偽装role/host、旧epoch/seq、過大delta、担当外キーを拒否する負例テストを追加する
- [ ] 関連テストまたは手動試験の実行コマンド・観測結果を記録する
- [ ] 必要な共通文書とdocs/handoff/BUILD_LOG.mdを更新する

## 依存関係
[#15](https://github.com/jphacks/kz_2613/issues/15), [#12](https://github.com/jphacks/kz_2613/issues/12)

## 備考
設計案[H]/[P]は確定事項と区別し、変更理由をdocs/decisions/へ残す。


### B6 — [#17](https://github.com/jphacks/kz_2613/issues/17)

## 概要
[Phase 2][P0] 保持キー・ボタンと入力所有状態を管理する

## 背景・関連要件
要件ID: FR-024, FR-030, NFR-05, AT-07
- docs/requirements/requirements-v0.2.md
- docs/decisions/2026-10-24-user-decisions.md
- docs/architecture/system-design.md
- docs/architecture/validation-gates.md

## 作業内容
- [ ] 所有者ごとのdown/upを集約し重複down・順序逆転・重ね入力を安全に扱う
- [ ] mock driverで複数参加者の同時操作と状態解放をテストする

## 完了条件
- [ ] 所有者ごとのdown/upを集約し重複down・順序逆転・重ね入力を安全に扱う
- [ ] mock driverで複数参加者の同時操作と状態解放をテストする
- [ ] 関連テストまたは手動試験の実行コマンド・観測結果を記録する
- [ ] 必要な共通文書とdocs/handoff/BUILD_LOG.mdを更新する

## 依存関係
[#16](https://github.com/jphacks/kz_2613/issues/16)

## 備考
設計案[H]/[P]は確定事項と区別し、変更理由をdocs/decisions/へ残す。


### B7 — [#18](https://github.com/jphacks/kz_2613/issues/18)

## 概要
[Phase 2][P0] 心拍・通信断・終了時の全入力解放を実装する

## 背景・関連要件
要件ID: FR-031, FR-032, FR-033, FR-036, SM-06, NFR-04, AT-10, AT-11, AT-16
- docs/requirements/requirements-v0.2.md
- docs/decisions/2026-10-24-user-decisions.md
- docs/architecture/system-design.md
- docs/architecture/validation-gates.md

## 作業内容
- [ ] 心拍/入力リース期限、切断・例外・終了・epoch変更で全解放し明示再開を待つ
- [ ] 時計を制御したテストでup欠落・ホスト断・古い入力再送から復帰しないことを確認する

## 完了条件
- [ ] 心拍/入力リース期限、切断・例外・終了・epoch変更で全解放し明示再開を待つ
- [ ] 時計を制御したテストでup欠落・ホスト断・古い入力再送から復帰しないことを確認する
- [ ] 関連テストまたは手動試験の実行コマンド・観測結果を記録する
- [ ] 必要な共通文書とdocs/handoff/BUILD_LOG.mdを更新する

## 依存関係
[#17](https://github.com/jphacks/kz_2613/issues/17), [#14](https://github.com/jphacks/kz_2613/issues/14)

## 備考
設計案[H]/[P]は確定事項と区別し、変更理由をdocs/decisions/へ残す。


### B8 — [#19](https://github.com/jphacks/kz_2613/issues/19)

## 概要
[Phase 2][P0] 対象ゲームウィンドウのフォーカス監視を実装する

## 背景・関連要件
要件ID: FR-034, NFR-06, G-04, AT-15
- docs/requirements/requirements-v0.2.md
- docs/decisions/2026-10-24-user-decisions.md
- docs/architecture/system-design.md
- docs/architecture/validation-gates.md

## 作業内容
- [ ] PID/HWND等で意図した対象を確認し対象外/不明時には入力ゲートを閉じ全解放する
- [ ] mockで切替レースと未知対象をテストし手動フォーカス確認の代替を記す

## 完了条件
- [ ] PID/HWND等で意図した対象を確認し対象外/不明時には入力ゲートを閉じ全解放する
- [ ] mockで切替レースと未知対象をテストし手動フォーカス確認の代替を記す
- [ ] 関連テストまたは手動試験の実行コマンド・観測結果を記録する
- [ ] 必要な共通文書とdocs/handoff/BUILD_LOG.mdを更新する

## 依存関係
[#18](https://github.com/jphacks/kz_2613/issues/18), [#6](https://github.com/jphacks/kz_2613/issues/6), [#7](https://github.com/jphacks/kz_2613/issues/7), [#8](https://github.com/jphacks/kz_2613/issues/8)

## 備考
設計案[H]/[P]は確定事項と区別し、変更理由をdocs/decisions/へ残す。


### B9 — [#20](https://github.com/jphacks/kz_2613/issues/20)

## 概要
[Phase 2][P0] 検証済みSendInputアダプターを入力エンジンへ接続する

## 背景・関連要件
要件ID: FR-020, FR-021, FR-022, FR-023, FR-026
- docs/requirements/requirements-v0.2.md
- docs/decisions/2026-10-24-user-decisions.md
- docs/architecture/system-design.md
- docs/architecture/validation-gates.md

## 作業内容
- [ ] Windows APIをHTTP/WSから分離しキー/クリック/相対視点を固定Minecraftプリセットへ変換する
- [ ] API失敗を成功扱いせず解放経路をmock検証し非Windowsで明確に利用不可とする

## 完了条件
- [ ] Windows APIをHTTP/WSから分離しキー/クリック/相対視点を固定Minecraftプリセットへ変換する
- [ ] API失敗を成功扱いせず解放経路をmock検証し非Windowsで明確に利用不可とする
- [ ] 関連テストまたは手動試験の実行コマンド・観測結果を記録する
- [ ] 必要な共通文書とdocs/handoff/BUILD_LOG.mdを更新する

## 依存関係
[#19](https://github.com/jphacks/kz_2613/issues/19), [#6](https://github.com/jphacks/kz_2613/issues/6), [#7](https://github.com/jphacks/kz_2613/issues/7), [#8](https://github.com/jphacks/kz_2613/issues/8)

## 備考
設計案[H]/[P]は確定事項と区別し、変更理由をdocs/decisions/へ残す。


### B10 — [#21](https://github.com/jphacks/kz_2613/issues/21)

## 概要
[Phase 2][P0] PCからの緊急停止・セッション終了を実装する

## 背景・関連要件
要件ID: FR-035, FR-036, NFR-05
- docs/requirements/requirements-v0.2.md
- docs/decisions/2026-10-24-user-decisions.md
- docs/architecture/system-design.md
- docs/architecture/validation-gates.md

## 作業内容
- [ ] スマホ回線に依存しないPC停止経路とトークン失効を含む明示終了を用意する
- [ ] 回線停止・例外時にも全解放し古いセッション入力を拒否するテストと手順を追加する

## 完了条件
- [ ] スマホ回線に依存しないPC停止経路とトークン失効を含む明示終了を用意する
- [ ] 回線停止・例外時にも全解放し古いセッション入力を拒否するテストと手順を追加する
- [ ] 関連テストまたは手動試験の実行コマンド・観測結果を記録する
- [ ] 必要な共通文書とdocs/handoff/BUILD_LOG.mdを更新する

## 依存関係
[#18](https://github.com/jphacks/kz_2613/issues/18)

## 備考
設計案[H]/[P]は確定事項と区別し、変更理由をdocs/decisions/へ残す。


### B11 — [#22](https://github.com/jphacks/kz_2613/issues/22)

## 概要
[Phase 2][P0] 停止理由・接続状態のローカル診断を実装する

## 背景・関連要件
要件ID: NFR-13, NFR-14
- docs/requirements/requirements-v0.2.md
- docs/decisions/2026-10-24-user-decisions.md
- docs/architecture/system-design.md
- docs/architecture/validation-gates.md

## 作業内容
- [ ] モード/接続/対象/タイムアウト/停止理由をPC向けに提示し最小ログへ記録する
- [ ] トークン・個人情報・詳細入力履歴を外部送信せず伏せるテストを追加する

## 完了条件
- [ ] モード/接続/対象/タイムアウト/停止理由をPC向けに提示し最小ログへ記録する
- [ ] トークン・個人情報・詳細入力履歴を外部送信せず伏せるテストを追加する
- [ ] 関連テストまたは手動試験の実行コマンド・観測結果を記録する
- [ ] 必要な共通文書とdocs/handoff/BUILD_LOG.mdを更新する

## 依存関係
[#18](https://github.com/jphacks/kz_2613/issues/18), [#19](https://github.com/jphacks/kz_2613/issues/19)

## 備考
設計案[H]/[P]は確定事項と区別し、変更理由をdocs/decisions/へ残す。


### B12 — [#23](https://github.com/jphacks/kz_2613/issues/23)

## 概要
[Phase 2][P0] LANの3ブラウザHTTP・WebSocketを検証する

## 背景・関連要件
要件ID: FR-002, ENV-03, NFR-01, G2-B, AT-01, AT-17
- docs/requirements/requirements-v0.2.md
- docs/decisions/2026-10-24-user-decisions.md
- docs/architecture/system-design.md
- docs/architecture/validation-gates.md

## 作業内容
- [ ] 信頼LAN限定のbind/firewall手順で3台のHTTP/WS参加を試験する
- [ ] 上流回線なしで3台が接続しサーバー認可される結果と端末版を記録する

## 完了条件
- [ ] 信頼LAN限定のbind/firewall手順で3台のHTTP/WS参加を試験する
- [ ] 上流回線なしで3台が接続しサーバー認可される結果と端末版を記録する
- [ ] 関連テストまたは手動試験の実行コマンド・観測結果を記録する
- [ ] 必要な共通文書とdocs/handoff/BUILD_LOG.mdを更新する

## 依存関係
[#16](https://github.com/jphacks/kz_2613/issues/16), [#9](https://github.com/jphacks/kz_2613/issues/9), [#10](https://github.com/jphacks/kz_2613/issues/10)

## 備考
実機検証。端末・OS/ブラウザ・Minecraft版・ネットワーク・実施日/操作者・実測結果を記録する。未実施は未検証とする。


### W0 — [#24](https://github.com/jphacks/kz_2613/issues/24)

## 概要
[Phase 3][P0] 役割・接続状態と再接続UIを実装する

## 背景・関連要件
要件ID: FR-004, FR-006, FR-007, NFR-08
- docs/requirements/requirements-v0.2.md
- docs/decisions/2026-10-24-user-decisions.md
- docs/architecture/system-design.md
- docs/architecture/validation-gates.md

## 作業内容
- [ ] サーバー確定の役割・人数・モード・拒否理由・再接続待機を表示する
- [ ] 切断中に操作せず元枠復帰し、トークンをURL/ログへ出さないテストを追加する

## 完了条件
- [ ] サーバー確定の役割・人数・モード・拒否理由・再接続待機を表示する
- [ ] 切断中に操作せず元枠復帰し、トークンをURL/ログへ出さないテストを追加する
- [ ] 関連テストまたは手動試験の実行コマンド・観測結果を記録する
- [ ] 必要な共通文書とdocs/handoff/BUILD_LOG.mdを更新する

## 依存関係
[#14](https://github.com/jphacks/kz_2613/issues/14)

## 備考
設計案[H]/[P]は確定事項と区別し、変更理由をdocs/decisions/へ残す。


### W1 — [#25](https://github.com/jphacks/kz_2613/issues/25)

## 概要
[Phase 3][P0] Pointer Eventsの共通押下・解放処理を実装する

## 背景・関連要件
要件ID: FR-031, NFR-07
- docs/requirements/requirements-v0.2.md
- docs/decisions/2026-10-24-user-decisions.md
- docs/architecture/system-design.md
- docs/architecture/validation-gates.md

## 作業内容
- [ ] pointerdown/up/cancel、capture、複数指、visibility/pagehideで保持状態を解放する
- [ ] 取消・指の領域外移動・非表示・送信失敗をVitestで検証しサーバー監視も併用する

## 完了条件
- [ ] pointerdown/up/cancel、capture、複数指、visibility/pagehideで保持状態を解放する
- [ ] 取消・指の領域外移動・非表示・送信失敗をVitestで検証しサーバー監視も併用する
- [ ] 関連テストまたは手動試験の実行コマンド・観測結果を記録する
- [ ] 必要な共通文書とdocs/handoff/BUILD_LOG.mdを更新する

## 依存関係
[#24](https://github.com/jphacks/kz_2613/issues/24), [#18](https://github.com/jphacks/kz_2613/issues/18)

## 備考
設計案[H]/[P]は確定事項と区別し、変更理由をdocs/decisions/へ残す。


### W2 — [#26](https://github.com/jphacks/kz_2613/issues/26)

## 概要
[Phase 3][P0] ホスト用の矢印・Enter・Escリモコンを実装する

## 背景・関連要件
要件ID: HOST-01, HOST-02, HOST-04, HOST-06, HOST-07, HOST-08, HOST-09, FR-010, FR-011, AT-03
- docs/requirements/requirements-v0.2.md
- docs/decisions/2026-10-24-user-decisions.md
- docs/architecture/system-design.md
- docs/architecture/validation-gates.md

## 作業内容
- [ ] PC画面を見て使う同一リモコンを開始前/Pause後に表示する
- [ ] Coop中は単独リモコン入力を無効化し非ホスト操作を拒否するテストを追加する

## 完了条件
- [ ] PC画面を見て使う同一リモコンを開始前/Pause後に表示する
- [ ] Coop中は単独リモコン入力を無効化し非ホスト操作を拒否するテストを追加する
- [ ] 関連テストまたは手動試験の実行コマンド・観測結果を記録する
- [ ] 必要な共通文書とdocs/handoff/BUILD_LOG.mdを更新する

## 依存関係
[#25](https://github.com/jphacks/kz_2613/issues/25), [#16](https://github.com/jphacks/kz_2613/issues/16)

## 備考
設計案[H]/[P]は確定事項と区別し、変更理由をdocs/decisions/へ残す。


### W3 — [#27](https://github.com/jphacks/kz_2613/issues/27)

## 概要
[Phase 3][P0] P1の十字キーとダッシュを実装する

## 背景・関連要件
要件ID: FR-020, AT-05
- docs/requirements/requirements-v0.2.md
- docs/decisions/2026-10-24-user-decisions.md
- docs/architecture/system-design.md
- docs/architecture/validation-gates.md

## 作業内容
- [ ] WASD相当の十字キー、対角2方向とCtrlダッシュを意味的アクションで送信する
- [ ] 同時押下・解放・役割外無効とPause時初期化をテストする

## 完了条件
- [ ] WASD相当の十字キー、対角2方向とCtrlダッシュを意味的アクションで送信する
- [ ] 同時押下・解放・役割外無効とPause時初期化をテストする
- [ ] 関連テストまたは手動試験の実行コマンド・観測結果を記録する
- [ ] 必要な共通文書とdocs/handoff/BUILD_LOG.mdを更新する

## 依存関係
[#25](https://github.com/jphacks/kz_2613/issues/25), [#16](https://github.com/jphacks/kz_2613/issues/16)

## 備考
設計案[H]/[P]は確定事項と区別し、変更理由をdocs/decisions/へ残す。


### W4 — [#28](https://github.com/jphacks/kz_2613/issues/28)

## 概要
[Phase 3][P0] P2の方向ボタン視点コントローラーを実装する

## 背景・関連要件
要件ID: FR-021, AT-06
- docs/requirements/requirements-v0.2.md
- docs/decisions/2026-10-24-user-decisions.md
- docs/architecture/system-design.md
- docs/architecture/validation-gates.md

## 作業内容
- [ ] 上下左右ボタンから上限付き方向操作を送り固定tickの相対移動へ結びつける
- [ ] 解放・Pauseで停止し過大deltaを抑制するテストを追加する

## 完了条件
- [ ] 上下左右ボタンから上限付き方向操作を送り固定tickの相対移動へ結びつける
- [ ] 解放・Pauseで停止し過大deltaを抑制するテストを追加する
- [ ] 関連テストまたは手動試験の実行コマンド・観測結果を記録する
- [ ] 必要な共通文書とdocs/handoff/BUILD_LOG.mdを更新する

## 依存関係
[#25](https://github.com/jphacks/kz_2613/issues/25), [#16](https://github.com/jphacks/kz_2613/issues/16)

## 備考
設計案[H]/[P]は確定事項と区別し、変更理由をdocs/decisions/へ残す。


### W5 — [#29](https://github.com/jphacks/kz_2613/issues/29)

## 概要
[Phase 3][P0] P3のアクションとホットバーUIを実装する

## 背景・関連要件
要件ID: FR-022, FR-023, AT-05, AT-06
- docs/requirements/requirements-v0.2.md
- docs/decisions/2026-10-24-user-decisions.md
- docs/architecture/system-design.md
- docs/architecture/validation-gates.md

## 作業内容
- [ ] Space/Shift/左右クリック/1〜9の意味的操作を短押し・長押し対応で送信する
- [ ] 複数指とボタン解放・モード変更時初期化を検証する

## 完了条件
- [ ] Space/Shift/左右クリック/1〜9の意味的操作を短押し・長押し対応で送信する
- [ ] 複数指とボタン解放・モード変更時初期化を検証する
- [ ] 関連テストまたは手動試験の実行コマンド・観測結果を記録する
- [ ] 必要な共通文書とdocs/handoff/BUILD_LOG.mdを更新する

## 依存関係
[#25](https://github.com/jphacks/kz_2613/issues/25), [#16](https://github.com/jphacks/kz_2613/issues/16)

## 備考
設計案[H]/[P]は確定事項と区別し、変更理由をdocs/decisions/へ残す。


### W6 — [#30](https://github.com/jphacks/kz_2613/issues/30)

## 概要
[Phase 3][P0] ホストStart・Pause・Resumeと3人条件のUIを実装する

## 背景・関連要件
要件ID: HOST-05, FR-005, FR-012, FR-013, FR-014, FR-015, FR-016
- docs/requirements/requirements-v0.2.md
- docs/decisions/2026-10-24-user-decisions.md
- docs/architecture/system-design.md
- docs/architecture/validation-gates.md

## 作業内容
- [ ] ホスト管理操作と人数/対象準備による無効理由を表示する
- [ ] 2人以下で開始不可、再接続だけで自動再開しないことと旧押下消去をテストする

## 完了条件
- [ ] ホスト管理操作と人数/対象準備による無効理由を表示する
- [ ] 2人以下で開始不可、再接続だけで自動再開しないことと旧押下消去をテストする
- [ ] 関連テストまたは手動試験の実行コマンド・観測結果を記録する
- [ ] 必要な共通文書とdocs/handoff/BUILD_LOG.mdを更新する

## 依存関係
[#26](https://github.com/jphacks/kz_2613/issues/26), [#27](https://github.com/jphacks/kz_2613/issues/27), [#28](https://github.com/jphacks/kz_2613/issues/28), [#29](https://github.com/jphacks/kz_2613/issues/29), [#15](https://github.com/jphacks/kz_2613/issues/15)

## 備考
設計案[H]/[P]は確定事項と区別し、変更理由をdocs/decisions/へ残す。


### W7 — [#31](https://github.com/jphacks/kz_2613/issues/31)

## 概要
[Phase 3][P0] Android・iPhoneで全コントローラーを実機検証する

## 背景・関連要件
要件ID: NFR-02, NFR-07, G-05, AT-18
- docs/requirements/requirements-v0.2.md
- docs/decisions/2026-10-24-user-decisions.md
- docs/architecture/system-design.md
- docs/architecture/validation-gates.md

## 作業内容
- [ ] 実装済み各役割で長押し/複数指/回転/キャンセル/画面ロックを試す
- [ ] 両OSの端末・版・観測結果と残留入力の有無を記録する

## 完了条件
- [ ] 実装済み各役割で長押し/複数指/回転/キャンセル/画面ロックを試す
- [ ] 両OSの端末・版・観測結果と残留入力の有無を記録する
- [ ] 関連テストまたは手動試験の実行コマンド・観測結果を記録する
- [ ] 必要な共通文書とdocs/handoff/BUILD_LOG.mdを更新する

## 依存関係
[#30](https://github.com/jphacks/kz_2613/issues/30), [#20](https://github.com/jphacks/kz_2613/issues/20), [#23](https://github.com/jphacks/kz_2613/issues/23)

## 備考
実機検証。端末・OS/ブラウザ・Minecraft版・ネットワーク・実施日/操作者・実測結果を記録する。未実施は未検証とする。


### D0 — [#32](https://github.com/jphacks/kz_2613/issues/32)

## 概要
[Phase 4][P0] 参加用QR・URL・人数画面を実装する

## 背景・関連要件
要件ID: FR-001, FR-004, ENV-05
- docs/requirements/requirements-v0.2.md
- docs/decisions/2026-10-24-user-decisions.md
- docs/architecture/system-design.md
- docs/architecture/validation-gates.md

## 作業内容
- [ ] 選択したLANインターフェースの参加URL/QRと役割別接続状態をPCに表示する
- [ ] localhostをスマホURLにせずWi-Fi接続QRとの違いと秘密の扱いを明記する

## 完了条件
- [ ] 選択したLANインターフェースの参加URL/QRと役割別接続状態をPCに表示する
- [ ] localhostをスマホURLにせずWi-Fi接続QRとの違いと秘密の扱いを明記する
- [ ] 関連テストまたは手動試験の実行コマンド・観測結果を記録する
- [ ] 必要な共通文書とdocs/handoff/BUILD_LOG.mdを更新する

## 依存関係
[#13](https://github.com/jphacks/kz_2613/issues/13)

## 備考
設計案[H]/[P]は確定事項と区別し、変更理由をdocs/decisions/へ残す。


### D1 — [#33](https://github.com/jphacks/kz_2613/issues/33)

## 概要
[Phase 4][P0] 手動起動を許容するゲーム選択画面を実装する

## 背景・関連要件
要件ID: ENV-08, ENV-09, HOST-08, FR-018
- docs/requirements/requirements-v0.2.md
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


### D2 — [#34](https://github.com/jphacks/kz_2613/issues/34)

## 概要
[Phase 4][P0] 3人の操作分担確認画面を実装する

## 背景・関連要件
要件ID: FR-004, ROLE-01, ROLE-02
- docs/requirements/requirements-v0.2.md
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


### D3 — [#35](https://github.com/jphacks/kz_2613/issues/35)

## 概要
[Phase 4][P0] Minecraftへの移行・復帰時もセッションを維持する

## 背景・関連要件
要件ID: FR-018, HOST-10, AT-13
- docs/requirements/requirements-v0.2.md
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


### D4 — [#36](https://github.com/jphacks/kz_2613/issues/36)

## 概要
[Phase 4][P0] pywebviewデスクトップGUIとブラウザ代替を実装する

## 背景・関連要件
要件ID: NFR-11, NFR-12, G4-A
- docs/requirements/requirements-v0.2.md
- docs/decisions/2026-10-24-user-decisions.md
- docs/architecture/system-design.md
- docs/architecture/validation-gates.md

## 作業内容
- [ ] pywebviewをmain thread、Uvicornを単一workerで起動し静的資産をローカル配信する
- [ ] 終了時の安全停止とWebView2不可時のlocalhostブラウザ代替を検証する

## 完了条件
- [ ] pywebviewをmain thread、Uvicornを単一workerで起動し静的資産をローカル配信する
- [ ] 終了時の安全停止とWebView2不可時のlocalhostブラウザ代替を検証する
- [ ] 関連テストまたは手動試験の実行コマンド・観測結果を記録する
- [ ] 必要な共通文書とdocs/handoff/BUILD_LOG.mdを更新する

## 依存関係
[#35](https://github.com/jphacks/kz_2613/issues/35)

## 備考
設計案[H]/[P]は確定事項と区別し、変更理由をdocs/decisions/へ残す。


### D5 — [#37](https://github.com/jphacks/kz_2613/issues/37)

## 概要
[Phase 4][P0] フォーカス切替とPC GUIの実機検証を行う

## 背景・関連要件
要件ID: FR-034, G1-D, G4-A, G-04, G-08, AT-03, AT-15
- docs/requirements/requirements-v0.2.md
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


### E0 — [#38](https://github.com/jphacks/kz_2613/issues/38)

## 概要
[Phase 5][P0] 3台同時操作と役割・管理権のE2Eを検証する

## 背景・関連要件
要件ID: FR-024, G3-A, AT-01, AT-02, AT-04, AT-05, AT-06, AT-07, AT-08, AT-09, AT-14
- docs/requirements/requirements-v0.2.md
- docs/decisions/2026-10-24-user-decisions.md
- docs/architecture/system-design.md
- docs/architecture/validation-gates.md

## 作業内容
- [ ] 3人で移動+視点+アクション、2人Start拒否とホスト限定Pause/Resumeを試す
- [ ] 実機構成、遅延の中央値/上位分位、主観的操作性を記録する

## 完了条件
- [ ] 3人で移動+視点+アクション、2人Start拒否とホスト限定Pause/Resumeを試す
- [ ] 実機構成、遅延の中央値/上位分位、主観的操作性を記録する
- [ ] 関連テストまたは手動試験の実行コマンド・観測結果を記録する
- [ ] 必要な共通文書とdocs/handoff/BUILD_LOG.mdを更新する

## 依存関係
[#31](https://github.com/jphacks/kz_2613/issues/31), [#37](https://github.com/jphacks/kz_2613/issues/37)

## 備考
実機検証。端末・OS/ブラウザ・Minecraft版・ネットワーク・実施日/操作者・実測結果を記録する。未実施は未検証とする。


### E1 — [#39](https://github.com/jphacks/kz_2613/issues/39)

## 概要
[Phase 5][P0] 切断・再接続・緊急停止の障害試験を行う

## 背景・関連要件
要件ID: G3-B, G-06, AT-10, AT-11, AT-12, AT-15, AT-16
- docs/requirements/requirements-v0.2.md
- docs/decisions/2026-10-24-user-decisions.md
- docs/architecture/system-design.md
- docs/architecture/validation-gates.md

## 作業内容
- [ ] 長押し中のWi-Fi断/ホスト断/タブ閉鎖/ロック/強制停止を試し元枠復帰を確認する
- [ ] 全キー解放・自動再開なし・トークン失効とPC停止の証拠を残す

## 完了条件
- [ ] 長押し中のWi-Fi断/ホスト断/タブ閉鎖/ロック/強制停止を試し元枠復帰を確認する
- [ ] 全キー解放・自動再開なし・トークン失効とPC停止の証拠を残す
- [ ] 関連テストまたは手動試験の実行コマンド・観測結果を記録する
- [ ] 必要な共通文書とdocs/handoff/BUILD_LOG.mdを更新する

## 依存関係
[#38](https://github.com/jphacks/kz_2613/issues/38), [#21](https://github.com/jphacks/kz_2613/issues/21)

## 備考
実機検証。端末・OS/ブラウザ・Minecraft版・ネットワーク・実施日/操作者・実測結果を記録する。未実施は未検証とする。


### E2 — [#40](https://github.com/jphacks/kz_2613/issues/40)

## 概要
[Phase 5][P0] Minecraft協力プレイの反復デモを検証する

## 背景・関連要件
要件ID: ENV-08, NFR-03, NFR-10, NFR-16, NFR-18, G5, AT-19
- docs/requirements/requirements-v0.2.md
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


### E3 — [#41](https://github.com/jphacks/kz_2613/issues/41)

## 概要
[Phase 5][P0] Windows onedir配布パッケージを作る

## 背景・関連要件
要件ID: NFR-11, NFR-12, G4-B
- docs/requirements/requirements-v0.2.md
- docs/decisions/2026-10-24-user-decisions.md
- docs/architecture/system-design.md
- docs/architecture/validation-gates.md

## 作業内容
- [ ] PyInstaller onedirにReact distと必要ランタイムを同梱する
- [ ] Python未導入WindowsでWebView2有無・起動/終了/ローカル資産配信を検証しセットアップを更新する

## 完了条件
- [ ] PyInstaller onedirにReact distと必要ランタイムを同梱する
- [ ] Python未導入WindowsでWebView2有無・起動/終了/ローカル資産配信を検証しセットアップを更新する
- [ ] 関連テストまたは手動試験の実行コマンド・観測結果を記録する
- [ ] 必要な共通文書とdocs/handoff/BUILD_LOG.mdを更新する

## 依存関係
[#36](https://github.com/jphacks/kz_2613/issues/36), [#39](https://github.com/jphacks/kz_2613/issues/39)

## 備考
設計案[H]/[P]は確定事項と区別し、変更理由をdocs/decisions/へ残す。


### E4 — [#42](https://github.com/jphacks/kz_2613/issues/42)

## 概要
[Phase 5][P0] ゲーム画面・名称・デモ素材の利用条件を確認する

## 背景・関連要件
要件ID: NFR-17, G-09
- docs/requirements/requirements-v0.2.md
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


### E5 — [#43](https://github.com/jphacks/kz_2613/issues/43)

## 概要
[Phase 5][P0] READMEと発表デモ・当日復旧手順を整備する

## 背景・関連要件
要件ID: NFR-10, NFR-12, NFR-16, AT-19
- docs/requirements/requirements-v0.2.md
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


### P11 — [#44](https://github.com/jphacks/kz_2613/issues/44)

## 概要
[Phase 6][P1] P1移動を仮想スティックへ拡張する

## 背景・関連要件
要件ID: EN-101
- docs/requirements/requirements-v0.2.md
- docs/decisions/2026-10-24-user-decisions.md
- docs/architecture/system-design.md
- docs/architecture/validation-gates.md

## 作業内容
- [ ] 斜め移動とデッドゾーンのある仮想スティックを追加する
- [ ] D-pad代替を維持し複数指/解放/Android/iPhoneを検証する

## 完了条件
- [ ] 斜め移動とデッドゾーンのある仮想スティックを追加する
- [ ] D-pad代替を維持し複数指/解放/Android/iPhoneを検証する
- [ ] 関連テストまたは手動試験の実行コマンド・観測結果を記録する
- [ ] 必要な共通文書とdocs/handoff/BUILD_LOG.mdを更新する

## 依存関係
[#40](https://github.com/jphacks/kz_2613/issues/40)

## 備考
設計案[H]/[P]は確定事項と区別し、変更理由をdocs/decisions/へ残す。 P0完了後のバックログ。今回の初期構築では実装しない。


### P12 — [#45](https://github.com/jphacks/kz_2613/issues/45)

## 概要
[Phase 6][P1] P2視点をスワイプ・感度調整へ拡張する

## 背景・関連要件
要件ID: EN-102
- docs/requirements/requirements-v0.2.md
- docs/decisions/2026-10-24-user-decisions.md
- docs/architecture/system-design.md
- docs/architecture/validation-gates.md

## 作業内容
- [ ] 領域内の相対スワイプと感度設定、delta上限を追加する
- [ ] 画面端・取消・Safariで飛びや残留移動がないことを検証する

## 完了条件
- [ ] 領域内の相対スワイプと感度設定、delta上限を追加する
- [ ] 画面端・取消・Safariで飛びや残留移動がないことを検証する
- [ ] 関連テストまたは手動試験の実行コマンド・観測結果を記録する
- [ ] 必要な共通文書とdocs/handoff/BUILD_LOG.mdを更新する

## 依存関係
[#40](https://github.com/jphacks/kz_2613/issues/40)

## 備考
設計案[H]/[P]は確定事項と区別し、変更理由をdocs/decisions/へ残す。 P0完了後のバックログ。今回の初期構築では実装しない。


### P13 — [#46](https://github.com/jphacks/kz_2613/issues/46)

## 概要
[Phase 6][P1] ホストリモコンにタッチパッド・クリック・Eキーを追加する

## 背景・関連要件
要件ID: HOST-03, EN-103
- docs/requirements/requirements-v0.2.md
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


### P14 — [#47](https://github.com/jphacks/kz_2613/issues/47)

## 概要
[Phase 6][P1] Pause中の役割指定・交換を実装する

## 背景・関連要件
要件ID: ROLE-06, EN-104
- docs/requirements/requirements-v0.2.md
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


### P15 — [#48](https://github.com/jphacks/kz_2613/issues/48)

## 概要
[Phase 6][P1] PCゲーム一覧を矢印・Enter・Escで選択可能にする

## 背景・関連要件
要件ID: EN-105
- docs/requirements/requirements-v0.2.md
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


### P16 — [#49](https://github.com/jphacks/kz_2613/issues/49)

## 概要
[Phase 6][P1] ゲーム起動パスの手動登録を追加する

## 背景・関連要件
要件ID: EN-106
- docs/requirements/requirements-v0.2.md
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


### P17 — [#50](https://github.com/jphacks/kz_2613/issues/50)

## 概要
[Phase 6][P1] 操作ボタン配置とキー割当の編集を追加する

## 背景・関連要件
要件ID: EN-107
- docs/requirements/requirements-v0.2.md
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


### P18 — [#51](https://github.com/jphacks/kz_2613/issues/51)

## 概要
[Phase 6][P1] QR参加案内・Ready表示と開始前の説明を改善する

## 背景・関連要件
要件ID: EN-108
- docs/requirements/requirements-v0.2.md
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


### P19 — [#52](https://github.com/jphacks/kz_2613/issues/52)

## 概要
[Phase 6][P1] 横画面・安全領域と操作フィードバックを改善する

## 背景・関連要件
要件ID: EN-109
- docs/requirements/requirements-v0.2.md
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


### P110 — [#53](https://github.com/jphacks/kz_2613/issues/53)

## 概要
[Phase 6][P1] ゲーム別入力プリセットをローカル保存する

## 背景・関連要件
要件ID: EN-110
- docs/requirements/requirements-v0.2.md
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


### P21 — [#54](https://github.com/jphacks/kz_2613/issues/54)

## 概要
[Phase 7][P2] ローカルランチャー情報からゲーム候補を検出する

## 背景・関連要件
要件ID: FUT-201
- docs/requirements/requirements-v0.2.md
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


### P22 — [#55](https://github.com/jphacks/kz_2613/issues/55)

## 概要
[Phase 7][P2] Minecraftランチャー検出と起動支援を追加する

## 背景・関連要件
要件ID: FUT-202
- docs/requirements/requirements-v0.2.md
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


### P23 — [#56](https://github.com/jphacks/kz_2613/issues/56)

## 概要
[Phase 7][P2] 任意のPCアプリの手動登録を一般化する

## 背景・関連要件
要件ID: FUT-203
- docs/requirements/requirements-v0.2.md
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


### P24 — [#57](https://github.com/jphacks/kz_2613/issues/57)

## 概要
[Phase 7][P2] 2〜4人の可変人数と役割枠を設計・実装する

## 背景・関連要件
要件ID: ROLE-07, FUT-204
- docs/requirements/requirements-v0.2.md
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


### P25 — [#58](https://github.com/jphacks/kz_2613/issues/58)

## 概要
[Phase 7][P2] 操作量・重要度に基づく役割提案を試作する

## 背景・関連要件
要件ID: FUT-205, NFR-18
- docs/requirements/requirements-v0.2.md
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


### P26 — [#59](https://github.com/jphacks/kz_2613/issues/59)

## 概要
[Phase 7][P2] ジャイロ等の身体的入力を実験する

## 背景・関連要件
要件ID: FUT-206
- docs/requirements/requirements-v0.2.md
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


### P27 — [#60](https://github.com/jphacks/kz_2613/issues/60)

## 概要
[Phase 7][P2] 入力プロファイルから操作UIを生成する

## 背景・関連要件
要件ID: FUT-207
- docs/requirements/requirements-v0.2.md
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


### P28 — [#61](https://github.com/jphacks/kz_2613/issues/61)

## 概要
[Phase 7][P2] Minecraft以外の1タイトルで入力対応を検証する

## 背景・関連要件
要件ID: ENV-10, FUT-208
- docs/requirements/requirements-v0.2.md
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


### P29 — [#62](https://github.com/jphacks/kz_2613/issues/62)

## 概要
[Phase 7][P2] 終了後の役割交換とリトライ導線を追加する

## 背景・関連要件
要件ID: FUT-209
- docs/requirements/requirements-v0.2.md
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


### P210 — [#63](https://github.com/jphacks/kz_2613/issues/63)

## 概要
[Phase 7][P2] ローカル接続のワンタップ化・Legacy APを調査する

## 背景・関連要件
要件ID: FUT-210
- docs/requirements/requirements-v0.2.md
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
