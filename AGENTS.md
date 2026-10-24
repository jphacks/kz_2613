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
- 計画前に `docs/requirements/requirements-v0.2.md` を読む。後から明示された判断は `docs/decisions/2026-10-24-user-decisions.md`、仮の技術構成は `docs/decisions/tech-stack-provisional.md` を参照する。
- 情報の優先順位は**新しい明示的なユーザー判断 > ユーザー確定事項 > チームのアイデア議事録 > 仮の実装提案**。仮案をチームの確定事項へ無断で変更しない。
- 開発上の優先順位は**実際に動くこと・再現可能なデモ > UIの自由度 > 開発速度 > 拡張性**。

## 実装上の制約

- JPHACKSの `README.md` と `LICENSE` は置き換えない。既存内容を保持し、指示がある場合にREADMEを慎重に追記する。
- ユーザーから明示的な依頼がない限り、GitHub・共有ドライブ・Slackへの書き込みや外部への提出は行わない。依頼されたローカル編集・テストは実施してよい。
- 実機試験と証拠なしに、ハードウェアやMinecraftとの互換性を検証済みと報告しない。
- 現在の構成は**初期環境のひな形**。動作するゲームコントローラーではない。未実装処理は明確に失敗させ、何もしない入力ドライバーを成功扱いしない。
- 接続と操作の認可はサーバーで行う。スマホ自身がホストや役割を指定できるようにしない。MVPでは最初の接続端末がホスト兼P1。
- Pause・切断・対象フォーカス喪失・セッションやepochの変更・終了時は、入力送信を停止して合成した全キーとマウスボタンを解放する。安全性が不明なら入力を許可しない。
- P0では外部クラウド中継・アカウント・テレメトリー・インターネットCDN・MinecraftのMOD・特権ドライバーを導入しない。スマホへのゲーム映像配信も行わない。

## 仮の技術構成（変更には根拠が必要）

- Windows入力：Python `ctypes` から `SendInput` を使用する案。キーのスキャンコードと相対マウス移動を想定。Minecraftでの受理は**未検証**。
- ホスト：Python 3.12、FastAPI、Uvicorn（単一プロセス・単一ワーカー）、メモリー内セッション、ローカルJSONプロファイル。pywebview/WebView2のデスクトップ画面は任意。
- ブラウザ：React、TypeScript、Vite、Tailwind CSSと独自CSS、Pointer Events。ローカルでビルドし、Pythonから静的ファイルを配信する。
- 通信：ローカルWi-Fi、HTTP/WebSocketのJSON。Windowsモバイルホットスポットを仮採用し、代替はローカルAP。スマホからPCへのゲーム操作にインターネットを必須としない。
- 検証：pytest、Vitest、TypeScript型検査とAndroid/iPhone/Windowsの実機試験。`PyInstaller onedir` による配布は後続作業。

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
