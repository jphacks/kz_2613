# Re:Cooplay — 開発エージェント向け共通ルール

## 使用言語

- ユーザーへの回答、Markdown資料の見出し・本文・表・図の説明は日本語で記述する。
- コミットメッセージの件名・本文、PRのタイトル・本文・レビュー説明はすべて日本語で記述する。
- コミットメッセージの例：`開発環境を初期構築する`、`参加者の再接続処理を修正する`。
- 製品名、API名、コード識別子、ファイル名・パス、URL、要件ID、実行コマンドは正確な原表記を維持する。
- `Closes #123` など、GitHubが解釈する構文はそのまま使用してよい。
- CodexとClaude Codeの両方に適用する。詳細な運用は `docs/handoff/DEVELOPMENT_WORKFLOW.md` を参照する。

## 目的・情報の優先順位

- 製品は**改造していない既存PCゲームへローカルの協力操作を追加する仕組み**。最初の対象は**Windows 11のMinecraft Java Edition**。スマホ3台で1キャラクターを操作する（P1移動、P2視点、P3アクション）。
- 計画前に `docs/requirements/requirements-v0.3.md` を読む。観測事実と採用判断の区別は `docs/decisions/2026-10-24-prototype-validated.md`、技術構成は `docs/decisions/tech-stack.md`、通信契約は `docs/architecture/protocol.md` を参照する。
- 情報の優先順位は**今後を含む新しい明示的なユーザー判断 > ユーザー確定事項 > チームのアイデア議事録 > 仮の実装提案**。[E]は試作品での観測事実を示す区分で、指示の優先順位ではない。観測記録は保持し、採用する仕様は最新のユーザー判断に従う。
- 開発上の優先順位は**実際に動くこと・再現可能なデモ > UIの自由度 > 開発速度 > 拡張性**。

## 実装上の制約

- JPHACKSの `README.md` と `LICENSE` は置き換えない。既存内容を保持し、指示がある場合にREADMEを慎重に追記する。
- ユーザーから明示的な依頼がない限り、GitHub・共有ドライブ・Slackへの書き込みや外部への提出は行わない。依頼されたローカル編集・テストは実施してよい。
- 実機試験と証拠なしに、ハードウェアやMinecraftとの互換性を検証済みと報告しない。
- リポジトリ内の `apps/host`（Python）と `apps/web`（React）は**初期環境のひな形**で、動作するゲームコントローラーではない。検証済みの挙動はリポジトリ外のNode.js参照実装にあり、Rust版ホストへ移植中。未実装処理は明確に失敗させ、何もしない入力ドライバーを成功扱いしない。
- 接続と操作の認可はサーバーで行う。スマホ自身がホストや役割を指定できるようにしない。MVPでは最初の接続端末がホスト兼P1。
- Pause・切断・対象フォーカス喪失・セッションやepochの変更・終了時は、入力送信を停止して合成した全キーとマウスボタンを解放する。安全性が不明なら入力を許可しない。
- P0では外部クラウド中継・アカウント・テレメトリー・インターネットCDN・MinecraftのMOD・特権ドライバーを導入しない。スマホへのゲーム映像配信も行わない。

## 技術構成（試作品の実機検証に基づく。詳細は `docs/decisions/tech-stack.md`）

- Windows入力：Win32 `SendInput`（スキャンコードのキー、相対マウス移動、左右ボタン、ホイール）、`timeBeginPeriod(1)`。疑似ゲーム画面で検証済み、Minecraftでは**未検証**。
- PCホスト：**Rust**（tokio＋axum、状態はhubスレッド1本、`windows` crate、WebRTCは `datachannel`＝libdatachannel）。Node.js参照実装を比較対象とする。Rust版はPC上のシミュレーションのみ実施済みで、Rust実機・Minecraft・Tauriは未検証。
- 通信：ローカルWi-Fi。**WebSocket（JSON、本体）＋WebRTC DataChannel（順序保証・再送なしの速達便）**。STUN/TURNとインターネットは使わない。Windowsモバイルホットスポットを使い、代替はローカルAP。
- 画面：ビルド不要の静的HTML/CSS/JavaScript（スマホ、ダッシュボード、疑似ゲーム画面）、Pointer Events。React化は任意で、行う場合も通信契約を守る。PCアプリの枠はTauri（未検証）、代替はブラウザ。
- 入力処理の定数（最低押下60ms・最低解放50ms・視点30Hz・補間4ms・切断判定4秒など）は実測に基づくため、根拠なく変えない。
- 検証：プロトコル単位のシミュレーション（`RECOOPLAY_DRY_RUN=1`）、疑似ゲーム画面による実入力の照合、Android・iPhone・Windowsの実機試験。

- MVPの画面はNode.js試作品で実機確認した静的HTML/CSS/JavaScriptを基準とする。Reactは任意。現在の `apps/web/` にはReactひな形が残っており、試作品の取り込みは後続作業。
- 協力プレイから一時停止へ移るときは、切断者だけでなく全参加者の合成キー・マウスボタンを直ちに解放する。最低押下時間・連打キューより安全停止を優先し、待機中の入力キュー・視点の未処理分を破棄する。再開時は旧押下を復元せず、新しい押下から始める。
- 試作品では自動復帰ONで、通信切断後15秒以内に全員が戻ると復帰する挙動を3回確認した。これは観測事実であり、Minecraft実運用での採用判断ではない。実運用の自動復帰の初期値・許可条件は未決定で、安全確認後にユーザーが判断する。ホストの明示PAUSEは設定のON/OFFによらず自動復帰しない。
- 実ゲームの入力先ウィンドウ確認とPCの緊急停止は未実装の安全要件として保持する。

## ディレクトリ構成・実装方針

- `apps/host/`：API、状態機械、Windows入力の境界、Windowsアプリの起動処理。
- `apps/web/`：スマホ・PCのWeb画面と共通コンポーネント。
- `docs/`：共有要件、判断、設計、検証の証拠。
- `scripts/`：再実行可能な開発用コマンド。
- メッセージの型と契約バージョンを明示する。OS入力をHTTP/WebSocketハンドラーから分離する。
- 未実装のひな形があるという理由だけで機能を追加しない。P0を先に進める。

## 作業手順

1. リポジトリと既存の変更を確認する。他の人の作業を破棄しない。
2. 複雑な変更では短い計画と未検証の前提を示す。
3. 最小限の一連の処理を実装し、対象を絞ったテストを追加する。
4. テストを実行し、コマンドと結果を `docs/handoff/BUILD_LOG.md` に記録する。実行できなければ理由を明示する。
5. 技術判断と根拠を記録する。要件の変更はユーザーが確認した場合だけ行う。

## 初期構築後のコマンド

- ホスト：Python 3.12の仮想環境を作成後、`cd apps/host && python -m pip install -c constraints-core.txt -e ".[dev]" && python -m pytest`
- ヘルスチェック用の起動：`cd apps/host && python -m uvicorn recoop_host.app:app --reload --host 127.0.0.1 --port 8000`
- Web：`cd apps/web && npm ci && npm run check && npm test && npm run build`
- Windowsの構築手順は `docs/handoff/SETUP_WINDOWS.md`、Issue・ブランチ・PRの共通運用は `docs/handoff/DEVELOPMENT_WORKFLOW.md` に従う。
