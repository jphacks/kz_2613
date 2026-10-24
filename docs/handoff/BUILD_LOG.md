# 構築・検証ログ

成功したという結果を捏造しない。実際の環境で実行した観測結果を追記する。

## 2026-10-24 — 初期構築パッケージの作成
- パッケージ作成時に確認した `jphacks/kz_2613` のmainには、`README.md` と `LICENSE` だけが存在した。
- 根拠はユーザーとの会話、共有要件v0.2、要件書から参照するチーム議事録。
- 文書、ホスト・Webのひな形、型付きのドメイン用語、テストを追加した。
- ZIP作成自体ではリポジトリ変更やpushを行っていない。
- **実機ゲートは未実施。** Windowsホットスポット・Minecraft相対視点・iPhone/Androidのセッションは、実装と実機試験が終わるまで対応済みとしない。
- 初期ファイルの統合後、実施した環境構築・検証の証拠を下に追記する。

## パッケージ作成環境での確認（Windows実機ではない）
- `python scripts/verify_overlay.py`：成功、必須9パスを確認。
- ホストの `python -m compileall`：成功。
- `python -m pytest apps/host/tests`：成功、3件。
- フロントの `npm install --package-lock-only`：レジストリへ到達できずタイムアウト。lockは未生成で、**フロントのビルド・テストは未実施**。対象PCでCodex・開発者が解消する必要がある。
- Windows 11・Minecraft・Android・iPhoneの実機試験ではない。

## 2026-10-24 — Windows初期構築・Issue運用開始

### 環境と統合
- Windows 11 Home x64、10.0.26300（26H2）。Python 3.12.14 / pip 25.0.1、Node.js 22.15.0 / npm 11.16.0。
- `py -0p` は登録済みPythonなし、PATHのPythonは3.11だったため、利用可能な3.12.14を明示して `apps/host/.venv` を作成した。標準clone手順はSETUP_WINDOWS.mdを参照。
- bootstrapのSTART_HEREと指定された9文書を読了し、MANIFEST.sha256の37件が一致した後にrepo_overlayの中身だけを統合した。
- 元の作業ツリーはclean。リモートmainは18コミット先行していたためfetchして内容を確認し、`c59b066`へfast-forwardした。README.md・LICENSEは最新mainと内容差分なし。
- `.gitignore` でvenv、node_modules、dist、.env、ローカル状態を除外。初期構築ヘルパーとIssue登録の一時ファイルはvenv内に置き、コミットに含めない。
- 提供済み依存のみを導入。Python解決結果をconstraints-core.txt、npm解決結果をpackage-lock.jsonへ記録。新規production依存は追加なし。

### 追加・変更
- apps/host: health-only scaffold、型付き語彙・未実装driver、pytest、固定依存、ビルド済みHTML/JS/CSSの配信テスト。
- apps/web: React/TS/Vite/Tailwindひな形、lockfile、PC/スマホ表示を確認する2件のVitest。既存の算術sanityテストを置換。
- CI: Python 3.12をWindows/Ubuntuで検証。Node 22でnpm ci、型検査、Vitest、build、build後pytestを実行。
- .editorconfig/.gitattributes/.gitignore、Issue/PRテンプレート、共有要件・設計・判断、Windows手順、共通運用、Issue計画を追加。
- 共通仕様はdocsへ集約。AGENTSから共通運用を参照し、CLAUDEからAGENTSと同一仕様を参照する。

### 実行した検証
| 場所 | コマンド・操作 | 結果 |
|---|---|---|
| root | `python scripts/verify_overlay.py` | PASS（最終17パス） |
| apps/host | `python -m pip install -e ".[dev]"` | PASS。解決結果をconstraintsへ固定 |
| apps/host | `python -m pip check` | PASS、依存不整合なし |
| apps/host | `python -m pytest -q --require-web-build` | 成功、4件 |
| apps/host | `python -m ruff check .` | 成功 |
| apps/host | `python -m ruff format --check .` | 成功、10ファイル |
| apps/web | `npm install --no-audit --no-fund` | PASS、lock生成 |
| apps/web | `npm ci --no-audit --no-fund` | PASS、lockから再インストール |
| apps/web | `npm run check` | 成功、TypeScriptの厳格な型検査 |
| apps/web | `npm test` | PASS、最終2 tests（PC/スマホの未実装表示） |
| apps/web | `npm run build` | PASS、Vite 7.3.7、apps/web/distへローカルHTML/CSS/JS生成 |
| apps/host | `python -m uvicorn recoop_host.app:app --host 127.0.0.1 --port 8000` | PASS、起動ログ確認 |
| localhost | 実HTTP `/api/health` | 200、status=ok / phase=scaffold / game_input_ready=false / session_ready=false |
| localhost | in-app browserで`/`と`/?view=desktop`を確認 | PASS、ReactのPC/スマホ表示と未実装の注意書きを確認。PC表示のスクリーンショットを目視確認 |
| static test | HTMLから参照する全JS/CSSのGET | PASS、全て同じPCの/assets/、外部CDN不要 |
| root | 要件IDとIssue計画の照合 | PASS、129 IDに対応。実装の完了ではなく追跡先の網羅確認 |
| root | `git check-ignore` / `git diff origin/main -- README.md LICENSE` | PASS、環境生成物除外と既存2ファイル保持 |

### GitHub・作業計画
- リポジトリ: https://github.com/jphacks/kz_2613
- 既存Issueは全状態で0件。P0/P1/P2、種別、対象、blocked、needs-device-testラベルを追加。
- Phase 0: #1 リポジトリ、#2 API、#3 web統合、#4 CI/運用。
- 合計63件（P0 43件、P1 10件、P2 10件）を登録。全件の番号・URL・重複なしをGitHubから再取得して確認した。
- 完全なIssue一覧・URL・優先順位・依存関係・各完了条件は [ISSUE_PLAN.md](ISSUE_PLAN.md) を参照。
- 初期構築コミット [`7327b5e`](https://github.com/jphacks/kz_2613/commit/7327b5ec4acf46e00c0f97f96aafa4fe2a9650ff) をmainへ通常push成功（強制push・保護解除なし）。
- [GitHub Actions #40082069275](https://github.com/jphacks/kz_2613/actions/runs/40082069275): **SUCCESS**。host (windows-latest)、host (ubuntu-latest)、webの全3ジョブ成功。webジョブではnpm ci・型検査・2件のVitest・build・4件の配信統合pytestを確認。
- 成功証拠を付けてPhase 0の#1〜#4をクローズ。#5/#9/#10/#11/#42は前提を満たしたためblockedを解除。残り59件は未完了で保持。

### 観測した問題と残り
- 通常サンドボックスのネットワーク・プロセス制限では認証失敗表示、DNSエラー、ensurepip失敗やpytest/uvicorn待機が発生。権限付き実行で認証と導入・テスト・起動が成功した。認証情報はソースへ保存していない。
- GitHub Issue登録途中に一時通信タイムアウト。登録済みIssueを再検索し重複を避けて続行した。
- 現在のStarlette TestClientはhttpx利用に非推奨警告を1件出すが、全テストは成功。将来依存更新時にhttpx2移行を検討する。今回のために新依存を追加しない。
- npm 11.16はesbuildの未承認install-script警告を表示するが、npm ciとVite buildは成功。追加のapprove-scripts操作は行っていない。
- Pythonの専用型チェッカーは提供構成にない。Pythonはruffとpytest、TypeScriptはtsc strictで検証。
- Minecraft/SendInput/3台同時プレイ/ホットスポット/Android/iPhone/WebView2/配布物の実機ゲートは全て未実施。OS入力は送信していない。
- 次に推奨: [#5](https://github.com/jphacks/kz_2613/issues/5) 明示開始・非常停止付き入力プローブの用意。続く#6〜#8でMinecraftへのキー・クリック・相対視点の成立性を最優先で確かめる。今回この実装には着手しない。

## 2026-10-24 — 資料・開発時の使用言語を日本語へ統一

- ユーザーの新しい明示指示に従い、Markdown資料、コミットの件名・本文、PRのタイトル・本文を日本語で記述するルールを `AGENTS.md` に追加した。
- CodexとClaude Codeが同じルールを参照するよう、`CLAUDE.md`、共通運用、PRテンプレートを更新した。
- 英語だった共通ルール、ホスト・Web向けルール、設計・技術判断・実機ゲート・Windows構築手順・初期依頼文・統合確認・作成時ログを日本語化した。READMEの画像説明と要件書の参考資料見出しも日本語へ変更した。
- コマンド・API名・識別子・ファイル名・URLは原表記を保持した。コードと依存は変更していない。
- 検証：`python scripts/verify_overlay.py` は必須17パスを確認して成功。追跡中のMarkdown全20件のUTF-8、コードブロックの対応、空文書がないこと、変更前のURL保持を確認した。`git diff --check` も成功。
