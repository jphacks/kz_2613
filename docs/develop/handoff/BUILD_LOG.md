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

## 2026-10-24 — 通信試作品による実機検証（リポジトリ外の参照実装）

以下はNode.js試作品について報告された過去の観測記録であり、採用方針や今後の明示的なユーザー判断より優先する規則ではない（`docs/develop/decisions/2026-10-24-prototype-validated.md`）。**Minecraftでの試験は行っていない。** 端末は端末A（Android、安定）、端末B（Android、無線が不安定）、iPhoneと呼ぶ。IPなど環境固有の値は記載しない。

### 環境
- PC：Windows 11 Home、Node.js 24.16、モバイルホットスポット（上流のWi-Fiにも接続した状態）。
- スマホ：Android 10・Chrome 155×2、iPhone・iOS 18.7・Safari×2（回によって組み合わせが異なる）。
- 試作品：Node.js参照実装（HTTP・WebSocket・WebRTC（`node-datachannel`）・SendInput（`koffi`））と、スマホ／ダッシュボード／疑似ゲーム画面の静的HTML。

### 観測結果
| 回 | 内容 | 結果 |
|---|---|---|
| 1（WebSocketのみ） | 3台の同時接続、手動入力1048件、連続送信テスト | 欠落0、順序の入れ替わり0、押しっぱなし0。往復遅延（平均/95%値/最大）：端末A 61/249/798ms、iPhone-1 44/94/1026ms、iPhone-2 27/85/123ms |
| 1 | 連打時の押下時間 | 押下と解放が5ms以内にまとめて届き、押下時間が1〜5msになるものを34回観測した（連打中に33回） → 最低押下60ms・最低解放50msを導入 |
| 2（キー注入） | `test` モード、端末A | スマホの押下126件をすべてSendInputで送信し、失敗0、押下時間は最短61ms |
| 3（疑似ゲーム画面・WebSocketのみ） | 3台・2回、照合1509件 | 受信OKが1500件。届かなかった7件の内訳は、マウス固定中のEscの解放5件と、画面の選択解除2件。遅延の中央値2ms・95%値23.5ms。端末Bは4秒を超える途絶を約20回起こし、視点の途切れは42%（端末Aは4%） |
| 4（WebRTC追加） | 3台ともWebRTCが接続（iPhone Safariを含む）、照合858件 | 受信OKが858件・届かなかったもの0。遅延の中央値2.5ms・95%値21.3ms・最大57.6ms。端末Bの視点の途切れは1.7%。往復遅延（WebSocket→WebRTC）：端末B 203/824/2015→70/182/221ms、iPhone 73/331/1756→28/83/96ms、端末A 35/94/286→41/99/119ms |
| 4 | 切断と復帰 | 切断による一時停止から自動で復帰した（3回）。スマホ側の3秒の監視で、1秒以内に再接続した |

### PC上のシミュレーション（注入なし、`RECOOPLAY_DRY_RUN=1`）
- 権限：P2の `START` は拒否された。P1の `START` で `coop` になった。協力プレイ中は矢印キーが注入されなかった。
- 連打：2ms間隔で届いた4回のタップが、押下60ms・解放50ms以上の4回の押下になった。
- 切断：押下中の切断で解放され、`paused` になった。
- 視点の補間：300px中の約300pxが滑らかに流れた（補間の端数は次へ繰り越し）。
- 入力の二重経路：二重送信は1回だけ処理された。WebRTCで欠けた押下はWebSocketの到着を待って順番どおりに処理された。視点のパケットが欠けても合計の移動量は保たれた。自動復帰が働き、ホストのPAUSE中は自動復帰しなかった。

### 未実施
- G1（Minecraft）、G2-A（上流回線なし）、G4（Tauri・配布・Rust版）、G5（デモ）。
- Rust版ホストの実機試験。

### Rust版ホスト（リポジトリ外、PC上のシミュレーションのみ）
- ビルド：Rust 1.99.1（MSVC）、Visual Studio 18のC++ツールとCMake、Strawberry Perl 5.42、libclang 18.1。`cargo build --release` に成功した（初回は約12分、警告2件）。
- Node参照実装と同じ4種のシミュレーションを、注入なしの状態で実行した。結果は参照実装と一致した。
  - 権限・連打（押下60〜62ms、解放50〜52ms）・切断時の解放
  - 視点の補間（安定した端末で300px中300px、途切れる端末で298px）
  - 二重経路・欠落・順序の入れ替わり
  - 自動復帰（ホストのPAUSE中は自動復帰しない）
- 実際のSendInputでの注入、実機3台での試験は未実施。

## PR #65の整合性整理

- 今回のユーザー明示指示を優先し、[E]を観測事実の区分へ統一した。将来のユーザー判断より優先する規則と、採用判断を捏造する表現を削除した。
- MVP画面は静的HTML/CSS/JavaScriptを基準とし、Reactは任意。現在のReactひな形と試作品の取り込み待ちを明記した。
- 協力プレイから一時停止する際の全参加者のキー・マウスボタン解放、待機入力破棄、安全停止の優先を仕様として統一した。これを実機確認済みとは記録していない。
- Node試作品の15秒以内・ON設定の復帰3回という過去の観測は保持する。Minecraft実運用の自動復帰初期値・使用条件は未決定。ホストPAUSEは自動復帰しない。
- 過去の観測ログは当時の記録であり、現在の採用判断や新たな検証成功とは区別する。
- Node実機、RustのPC上シミュレーション、Minecraft/Tauri/Rust実機の未検証状態を区別した。対象ウィンドウ確認・緊急停止は未実装の安全要件として保持した。
- 今回の変更はMarkdownのみ。OS入力・実機試験・実装コード変更は行っていない。
- ローカル検証：必須18パスの構造確認、差分チェック、UTF-8、Markdownのみの変更確認、pip依存確認、pytest 4件、ruffの検査と書式確認、TypeScript型検査、Vitest 2件、production buildがすべて成功した。
- GitHub Actionsの結果はPR #65へ記録する。mainへのマージとIssueの一括クローズは、ユーザーの実施前確認を待つ。

## PR #65の承認・反映とPR #66の整合性整理

- PR #65の最終コミット `b53aa01` は、[push検証](https://github.com/jphacks/kz_2613/actions/runs/40090625227)・[PR検証](https://github.com/jphacks/kz_2613/actions/runs/40090628580)の全ジョブが成功した。
- ユーザーから「PR #65のマージを許可する」との明示承認を受け、`58c5c6f` としてmainへマージした。PR #66のベースをmainへ更新し、そのmainを作業ブランチへ通常マージした。
- 新規Issueは #67（試作品取り込み）、#68（代替CI）、#69（Rust実機比較）、#70（端末診断）。既存Issueの全状態を検索してから作成し、実在する番号を計画へ反映した。
- 依存順は #67 → #68 → #69とし、#69には安全なプローブ #5も必要。既存Python/Reactの削除は代替CIが準備できた段階の#68で行う。今回は実装・削除を行っていない。
- #5は対象確認・手動arming・独立した非常停止・finally全解放・起動/import時非送信・mock安全経路の証拠が不足するため未完了。
- #23は上流なしの3台通信、信頼LAN限定のbind/firewall・認可の確認が不足するため未完了。#31は回転・キャンセル・画面ロック等の項目別・OS別記録とRust実機の再確認が不足するため未完了。
- #39は全参加者の停止と旧入力破棄、ホストPAUSEの非自動復帰、通信切断時の設定ON/OFF・15秒の期限内/外を分ける。Minecraft実運用の初期値・許可条件は未決定のまま保持する。
- #10も未記録条件の確認待ち、#28もクローズ候補にとどめる。新たなIssueクローズは実施していない。
- ローカル検証：67項目・重複番号なし・依存循環なし、元の#5/#23/#31の完了条件保持、#39の条件分岐、必須18パス、差分チェックが成功。追加修正はMarkdownのみで、新しい実機試験は行っていない。
- GitHubの未完了Issue 63件（既存59件・新規4件）の本文・題名・依存関係と必要なラベルを同期した。再取得して計画との本文一致を検証し、整理前後で全Issueの開閉状態が変わっていないことを確認した。#1〜#4と取り下げ済み#64の状態は保持した。
- PR #66の最終CI結果はPR本文へ記録する。PR #66のmainマージとIssueの一括クローズは、ユーザーの実施前確認を待つ。

## 2026-10-24 — #67 試作品の取り込みと通信契約シミュレーション（Claude Code）

### 取り込み
- `C:\JPHacks_Test`（リポジトリ外の通信試作品）から無改変で取り込み（コミット「試作品のNode参照実装・Rust版ホスト・静的画面をそのまま取り込む」）、続くコミットでパス解決だけを変更した。
  - `apps/host-rs/`：Rust版ホスト。`apps/node-ref/`：Node.js参照実装（比較用）。`apps/web-static/`：スマホ・ダッシュボード・疑似ゲーム画面。
  - 両ホストともリポジトリのルートの `config.json`（任意、gitignore）と `logs/`（gitignore）を使い、画面は `apps/web-static/` を共通で配信する。
  - 追加した環境変数：`RECOOPLAY_LOG_DIR`（ログの出力先）、`RECOOPLAY_NO_CONFIG=1`（`config.json` を読まない）。
- `config.example.json` は試作品のもの（port・wifiのみ）。自動復帰の初期値は記載していない（実運用の初期値は未決定）。
- 既存のPython/Reactひな形とCIは残した。整理は #68。

### ビルド（Windows 11 Home、Rust 1.99.1 MSVC、VS 18のCMake、Strawberry Perl、libclang）
- `cd apps/host-rs && cargo build --release`：成功（クリーンビルド9分57秒、警告2件：未使用関数 `output`、OpenSSLのPDBなしLNK4099）。
- `LIBCLANG_PATH` 未設定ではbindgenが失敗した。このPCでは `%LOCALAPPDATA%\libclang` を指定して成功。
- 試作品の `target/` をコピーして流用すると、libdatachannelのCMakeキャッシュが元の絶対パスを指すため再ビルドが失敗した。SETUP_WINDOWS.mdに注意を追記した。

### シミュレーション（`scripts/sim/protocol-sim.mjs`、注入なし）
- ホストを `RECOOPLAY_DRY_RUN=1`・`RECOOPLAY_NO_CONFIG=1` で起動し、スマホ3台とPC画面を模したWebSocketで17項目を照合する（HTTP配信、接続順の役割、4台目の拒否、helloでの枠指定の無視、START/PAUSE/RESUME/ENDの認可、役割外の操作名の無視、iseqの重複・欠番、最低押下60ms、P2のみの視点、coop中の切断で全参加者の出力を解放、自動復帰ON/OFF・ホストPAUSEの非自動復帰、pausedのリモコン、注入OFFでの解放、4秒の切断判定）。
- `node scripts/sim/protocol-sim.mjs`（Rust）：**17/17合格**。
- `node scripts/sim/protocol-sim.mjs --target node`（`apps/node-ref` で `npm ci` 後）：**17/17合格**。
- WebRTC経路と、15秒の期限切れ後の自動復帰はこのシミュレーションでは扱っていない。
- **未検証：** Rust版の実際のSendInput、スマホ実機3台、Minecraft、Tauri。

## 2026-10-24 — #11 通信契約の版番号（Claude Code）
- Rust版ホスト：`hello` の `protocolVersion` が `1` でない（欠落・別の値・文字列）場合、`{type:"error", code:"protocol_version", protocolVersion:1}` を返して4005で閉じ、枠を割り当てない。`welcome` に `protocolVersion` を追加。
- スマホ画面：`hello` に `protocolVersion: 1` を付ける。`error`/4005を受けたら再接続をやめ、再読み込みを案内する。
- protocol.mdに版と変更規則（文書・シミュレーション・版を同じPRで更新）を追記した。
- 検証：`cargo build --release` 成功（警告は既存の2件のみ）。`node scripts/sim/protocol-sim.mjs` **18/18合格**（版不一致3パターンを追加）。`--target node` は試作品のまま **17/17合格**（Rust版で追加した契約は対象外）。`node scripts/sim/check-static-pages.mjs` で3画面のスクリプトの構文を確認。
- スマホ実機での表示確認は未実施。

## 2026-10-24 — #12 再接続用トークン（Claude Code）
- Rust版ホスト：新しい枠を割り当てるとき、OSの乱数（`getrandom` 0.3、既存の依存ツリーと同じ版）で128bitのトークンを発行し、`welcome` で返す。同じ `clientId` の再接続はトークンが一致した場合だけ元の枠へ戻す。なし・不一致は `error`（`bad_token`）と4006で拒否し、元の接続には影響しない。比較は全体を比べてから判定する。乱数を得られない場合は参加を断る（1011）。
- トークンは状態スナップショット・ログに含めない（拒否時のログは枠名のみ）。
- スマホ画面：トークンをlocalStorageに保存し、`hello` で提示する。4006では再接続をやめ、PCでのリセットを案内する。
- 検証：`cargo build --release` 成功（既存の警告2件のみ）。`node scripts/sim/protocol-sim.mjs` **21/21合格**（トークンの形式・枠ごとの重複なし、トークンなし・ゼロ・他枠のトークンでの乗っ取り拒否と元接続の維持、PC画面へのメッセージとJSONLログにトークンが出ないことを追加）。`--target node` **17/17合格**。
- スマホ実機での再接続（画面の再読み込み・Wi-Fi断）は未実施。

## 2026-10-24 — #15 epoch（Claude Code）
- Rust版ホスト：進行の変更（`set_phase`）とリセットで `epoch` を1増やし、`game` に含める。`input` の `epoch` が現在と違う（なしを含む）場合は番号を消費して `ack`（`stale: true`）だけ返し、押下・解放とも処理しない（ログは `stale_input`）。`look` も同様に移動量を捨てる（累積値の基準は更新）。
- スマホ画面：`input`・`look` に最新の `game.epoch` を付ける。
- 検証：`cargo build --release` 成功（既存の警告2件のみ）。`node scripts/sim/protocol-sim.mjs` を3回連続で **22/22合格**。追加した試験：PAUSE直前（coop）に押した `LEFT` がpaused後に届いても ← キーにならない、RESUME直前（paused）に押した `LEFT` がcoop後に届いても A キーにならない、pausedのときの `look` をcoopで反映しない、`epoch` なしの入力を処理しない、現在の `epoch` は処理する。`--target node` **17/17合格**。
- 試験の途中で、前の試験で押したままのWが一時停止で解放される（正しい挙動）のを誤検出したため、試験側を「押下の注入がないこと」の確認に直した。
- スマホ実機での確認は未実施。

## 2026-10-24 — #22 診断ログの匿名化（Claude Code）
- Rust版ホスト：`join`・`reconnect`・`reject_full` のログから `ip`・`ua`・`clientId` を除き、枠名と端末の種類（User-Agentから判定した `iOS`/`Android`/`Windows`/`other`）だけを記録する。PC画面向けの状態スナップショットからも `clientId` を除いた。ダッシュボードの端末・IP表示はループバック限定のまま維持する（ログには書かない）。
- 検証：`cargo build --release` 成功。`node scripts/sim/protocol-sim.mjs` **23/23合格**（JSONLログに `clientId`・IP・User-Agent・項目名 `ip`/`ua`/`clientId` が含まれず、`join` に `slot`・`device` があることを追加）。`--target node` **17/17合格**。
- 実機のログ（スマホ3台）での確認は未実施。

## 2026-10-24 — PR #74の視点累積値をepochごとに分離（Codex）

- 旧epochの視点が失われた後、新epochの累積値に混入する問題を修正。スマホ・ホスト双方で視点の累積値と順序番号を0へ戻し、スマホの未送信移動量を破棄する。別epochのパケットは順序番号・累積値の基準にも反映しない。
- 旧パケットの欠落と、再開後に高い順序番号の旧パケットが遅れて届く場合を追加試験する。epoch必須・累積値の意味変更に合わせ、ホスト・画面・資料・試験を通信契約v3へ更新した。
- 静的3画面とシミュレーションの構文検査に成功。Rustのビルドと追加試験は先行PRを統合した後に実施する。実機試験は行っていない。

## 2026-10-24 — PR #73の互換性と接続置換を修正（Codex）

- 再接続トークンを保持できないv1の画面を拒否するため、ホスト・スマホ・通信契約・試験をv2へ更新した。
- 正しいトークンで旧接続を置換する場合も切断処理を通し、全参加者の出力を解放して旧押下を持ち越さない。回帰試験を追加した。
- 静的3画面とシミュレーションの構文検査に成功。Rustのビルド・対象試験はmainの認可修正を統合した後に実施する。実機検証は行っていない。

## 2026-10-24 — PR #71の接続認可を修正（Codex）

- WebSocketのHostを待受ポートとPCのアドレスに制限し、別Origin・`null`を403で拒否する。Originなしはループバックの非ブラウザ検証接続だけ許可する。識別済み接続でのhello再送と管理接続への変更は4007で拒否し、1接続が複数枠を取得する問題を修正した。Rust版とNode参照実装へ同じ認可修正を適用した。
- `node scripts/sim/protocol-sim.mjs --target node`：追加した認可2項目を含め **19/19合格**。すべて `RECOOPLAY_DRY_RUN=1` で実施し、OS入力は送っていない。
- Rust stable 1.99.1（MSVC）を導入。既存Visual Studio 2022、Strawberry Perl 5.42.3、開発用Python環境のlibclang 18.1.1を使用する。`cargo build --release --locked --manifest-path apps/host-rs/Cargo.toml` は成功（初回18分）。Documents配下のtarget生成はアクセス拒否となったため、開発用の `CARGO_TARGET_DIR` をLOCALAPPDATAへ指定した。Git付属PerlではOpenSSL構築に必要なモジュールが不足したため、Strawberry Perlを使う。
- Rust版も `node scripts/sim/protocol-sim.mjs --bin <CARGO_TARGET_DIR>/release/recooplay-host.exe` で **19/19合格**。`cargo test --release --locked --manifest-path apps/host-rs/Cargo.toml` はOrigin・Hostの単体試験 **1/1合格**。構造確認・JavaScriptの構文検査も成功。取り込み後の構成に合わせてAGENTS.mdと技術資料の状況説明を更新した。既存の未使用関数とOpenSSLのデバッグ用PDB不足の警告は残るが、ビルドは成功している。
- Rustの実入力・Minecraft・スマホ実機・Tauriは未検証のまま。実運用の自動復帰の初期値・許可条件は変更していない。

## 2026-10-24 — PR #72をmainへ追従して再検証（Codex）

- #71のOrigin・Host確認と1接続1枠の認可を取り込み、版番号の確認と併用するよう競合を解消した。
- `cargo build --release --locked --manifest-path apps/host-rs/Cargo.toml` 成功。Rustの通信シミュレーション **20/20合格**、Node参照実装 **19/19合格**。`check-static-pages.mjs` は3画面の構文検査に成功。OS入力はdry-runで無効化した。実機試験は実施していない。

### PR #73の統合後の検証結果

- mainの認可修正を統合した後、`cargo build --release --locked --manifest-path apps/host-rs/Cargo.toml` 成功。Rustの通信シミュレーション **24/24合格**。旧v1の拒否、トークン不一致時の元接続維持、正しいトークンでの接続置換と全解放、ログへのトークン非出力を確認した。OS入力はdry-runで無効化した。

### PR #74の統合後の検証結果

- mainへ追従し、`cargo build --release --locked --manifest-path apps/host-rs/Cargo.toml` 成功。Rustの通信シミュレーション **26/26合格**。旧epochのパケットが欠落した後は新epochの10だけが反映され、その後に旧epochの高い順序番号が届いても新たな5だけが反映されることを確認した。v1/v2の画面は版不一致で拒否する。OS入力はdry-runで無効化した。

## 2026-10-24 — PR #75の最終統合検証（Codex）

- #71〜#74の認可、接続置換時の全解放、通信契約v3、epoch境界での視点分離を取り込み、mainへ追従した。ログ匿名化の差分を再確認した。
- `cargo build --release --locked --manifest-path apps/host-rs/Cargo.toml` 成功。Rust通信シミュレーション **27/27合格**、Node参照実装 **19/19合格**、静的3画面の構文検査成功。Rust版のJSONLにIP・User-Agent・clientId・再接続トークンが残らず、枠名と端末の種類が残ることを確認した。OS入力はすべてdry-runで無効化した。
- Rustの実入力、スマホ3台、Minecraft、Tauri、WebRTC経路の実通信、15秒期限切れ後の復帰は今回も未検証。実ゲームの入力先確認と緊急停止、実運用の自動復帰判断は後続の安全確認事項として保持する。既存CIはPython/Reactであり、Rust CI整備は #68 のまま。
- 組み込みブラウザでもdry-runのRustホストへ接続し、P1・接続OK・ロビー・参加待ち（1/3）・START無効・WebRTC+WSの表示を確認した。画面は描画され、操作入力は送っていない。これはPC内の1接続の確認であり、スマホ実機やゲーム入力経路の合格を意味しない。

## 2026-10-24 — #36 PCアプリの枠（Tauri / WebView2）（Claude Code）
- `apps/desktop/`：Tauri 2のアプリ。PCホスト（`recooplay-host.exe`）を子プロセス（コンソール非表示）として起動し、待ち受けを確認してからウィンドウに `http://127.0.0.1:<port>/host` を表示する。起動できない場合（exeなし・ポート使用中・15秒以内に起動しない）は案内を表示する。ホストの画面にはTauriのAPIを開放しない。
- Rust版ホスト：`RECOOPLAY_STDIN_CONTROL=1` のとき、標準入力の `quit` または入力の終了（親の異常終了）で、全出力を解放してから終了する。コンソール版の動作は変えていない。
- ビルド：`cd apps/desktop && cargo build --release` 成功（初回2分24秒、警告なし）。ホストは `cargo build --release` 成功・`protocol-sim` 23/23合格。
- 起動試験（このPC、`RECOOPLAY_DRY_RUN=1`・注入OFFでOS入力なし、試験用ポート）：
  - アプリ起動 → ホストがアプリの子プロセスとして起動し、WebView2（`msedgewebview2`）がポートへ接続。ウィンドウにダッシュボードが表示され「サーバー接続OK」（画面キャプチャで確認）。
  - ウィンドウを閉じる → アプリ・ホストとも終了し、ホストのログに `shutdown`（全解放後に記録）が残った。
  - アプリを強制終了（`Stop-Process -Force`）→ 3秒以内にホストも `shutdown` を記録して終了した。
  - 同じポートでコンソール版ホストが起動済み → 「ポート 18557 は別のプログラムが使用中です」と表示（画面キャプチャで確認）。
- **未検証：** スマホ実機を接続した状態でのアプリ利用、実入力（注入ON）での終了時の解放、配布パッケージ（#41）、他のPCでのWebView2。

## 2026-10-24 — #21 PCの緊急停止（Claude Code）
- Rust版ホスト：グローバルホットキー `Ctrl+Alt+F12`（`RegisterHotKey`、専用スレッド）で緊急停止する。全キー・マウスボタンを最低押下時間・キューより優先して解放し、視点の未処理分を捨て、注入をOFFにする。協力プレイ中は `paused`（`emergency stop`、自動復帰なし）へ移す。スマホ・ダッシュボードの通信に依存しない。
- 標準入力の `stop`（`RECOOPLAY_STDIN_CONTROL=1` のとき）でも同じ処理をする（デスクトップアプリ・シミュレーション用）。
- コンソールのウィンドウを閉じたとき（`CTRL_CLOSE_EVENT`）も、全解放してから終了する。
- ホットキーの登録結果を起動時の表示・ログ（`hotkey`）・ダッシュボードに出す。登録できない場合はダッシュボードに警告を表示する。
- 検証：`cargo build --release` 成功。`node scripts/sim/protocol-sim.mjs` を3回連続で **24/24合格**（coop中にP1・P3が押下中の状態で `stop` → 両方の解放、注入OFF、`paused`・`emergency stop`、その後の押下が注入されないことを追加）。`--target node` **17/17合格**。このPCで起動時にホットキーの登録に成功した（ログ `{"kind":"hotkey","ok":true}`）。
- **未検証：** 実際に `Ctrl+Alt+F12` を押したときの動作（OS入力の自動送信は行っていない）、コンソールの×ボタンでの終了、Minecraftを前面にした状態。操作者が手動で確認する。

## 2026-10-24 — #19 常時ONの入力先ウィンドウの確認（Claude Code）
- Rust版ホスト（`src/focus.rs`）：100msごとに前面のウィンドウのプロセス名（`QueryFullProcessImageNameW`）とタイトルを確認する。`on` モードでは `javaw.exe`/`java.exe` かつタイトルに「Minecraft」を含むときだけ注入する（`config.json` の `target` で変更可、`config.example.json` に既定値を記載）。外れた瞬間に全キー・マウスボタンを解放して視点の未処理分を捨て、ダッシュボードと全スマホ（`game.inputTarget`）に知らせる。ログにはプロセス名と判定だけを残し、ウィンドウのタイトルは残さない。
- 試験用に、`RECOOPLAY_DRY_RUN=1` と `RECOOPLAY_FAKE_TARGET` のときだけ、標準入力の `target on`/`target off` で判定を差し替えられる。
- 検証：`cargo build --release` 成功。`cargo test --release`：判定の単体試験2件（Minecraftの一致、Javaの別アプリ・ブラウザのMinecraft Wiki・ランチャー・Re:Cooplay自身は不一致）合格。`node scripts/sim/protocol-sim.mjs` を3回連続で **25/25合格**（W押下中に入力先から外れる→Wの解放・注入停止・スマホへの通知、外れている間の押下は注入しない、戻った後は新しい押下だけ注入、を追加）。`--target node` **17/17合格**。実際の前面判定がこのPCで動く（前面 `explorer.exe` → 対象外）ことをダッシュボードの状態で確認。スマホ画面の警告表示をheadless Edgeの画面キャプチャで確認。
- **未検証：** Minecraft実機を前面にしたときの一致（実際のプロセス名・タイトル、G1-D）、Wを押したままAlt+Tabしたときの実入力。

## 2026-10-24 — #32〜#34 PCアプリの画面（参加・ゲーム選択・分担確認）（Claude Code）
- `apps/web-static/app.html`（`/app`、ループバック限定）と表示ロジック `app-view.js` を追加した。デスクトップアプリは `/app` を表示する。`/host` は診断画面として残す。
- Rust版ホスト：ロビー・一時停止中のP1のリモコン操作を、PC画面へ `remote` メッセージで知らせる（OSへの注入とは別）。画面は自分が前面のときだけ反応する。
- 検証：
  - `node scripts/sim/app-view-test.mjs` **10/10合格**（枠の表示、開始可否がサーバーの `canStart` と一致、理由・注意、進行の案内、リモコンでの画面移動、参加URL）。
  - `node scripts/sim/protocol-sim.mjs` を3回連続で **26/26合格**（P1のリモコンだけが `remote` で届き、P2・P3・リモコン以外の操作名は届かない、を追加）。`--target node` **17/17合格**。
  - `node scripts/sim/check-static-pages.mjs`：4画面とも構文OK（モジュールのスクリプトに対応）。
  - デスクトップアプリ（`RECOOPLAY_DRY_RUN=1`）に模擬スマホ2台を接続し、①に「2/3人・P1 iPhone・P2 Android」が表示され、P1のリモコン（RIGHT→ENTER）で①→②→③へ移動することを画面キャプチャで確認した。終了時のホストのログに匿名化された `join`（`slot`・`device`）と `shutdown` が残った。
- **未検証：** スマホ実機からのQR読み取りと参加、Minecraftとの切り替えを含む一連の流れ（#35）、他の画面解像度。

## 2026-10-24 — #68（一部）Rust版とシミュレーションのCI（Claude Code）
- `.github/workflows/rust.yml` を追加した（windows-latest）。`host-rs` ジョブ：`cargo build/test --release --locked`、`protocol-sim`（Rust・Node）、`app-view-test`、`check-static-pages`。`desktop` ジョブ：Tauriアプリの `cargo build --release --locked`。OS入力は送らない（`RECOOPLAY_DRY_RUN=1`）。
- ランナーでは `LIBCLANG_PATH=C:\Program Files\LLVM\bin` とし、OpenSSLのビルドのためStrawberry PerlをGit付属のPerlより優先する。
- 既存の `checks.yml`（Python/Reactひな形）は残した。ひな形の削除は #68 の残りとして、ユーザーの確認後に行う。
- ローカルでは `--locked` で両方のビルドが通ることを確認した。GitHub Actionsでの結果はPRに記録する。

## 2026-10-24 — #68 旧Python/Reactひな形の削除（Claude Code、ユーザー承認済み）
- ユーザーの許可を受け、`apps/host`（Python/FastAPI）と `apps/web`（React/Vite）を削除した。`checks.yml` はリポジトリ構造の確認（`verify_overlay.py`）だけにし、ビルド・試験は `rust.yml` に集約した。
- `verify_overlay.py` の必須ファイルを新しい構成（`apps/host-rs`・`apps/desktop`・`apps/web-static`・`apps/node-ref`・`scripts/sim`・両workflow）に変更した。
- `AGENTS.md`（構成・コマンド）、`DEVELOPMENT_WORKFLOW.md`、`SETUP_WINDOWS.md`、`tech-stack.md`、`apps/host-rs/README.md` を更新した。libclangの例は `apps/host/.venv` から開発用の別の仮想環境（`%LOCALAPPDATA%\ReCooplay\tools-venv`）に変えた。過去の記録（BUILD_LOG・判断記録・初期構築の依頼文）は当時のまま残す。
- 削除前に、`rust.yml` がGitHub Actionsで成功していることを確認した（#80：`host-rs` 7分57秒・12分53秒、`desktop` 3分23秒・3分44秒、既存の `host`・`web` も成功）。
- 検証：`python scripts/verify_overlay.py`（26件）PASS。

## 2026-10-25 — PR #80のCI安全設定を追加（Codex）

- 全ジョブでRECOOPLAY_DRY_RUN=1を明示し、Rustの単体試験も含めてOS入力を無効化する。quit・EOFで全解放するshutdown-simをCIへ追加した。
- 先行PRの最新修正を統合してから最終Actionsを実行し、Rustホスト・Tauri・通信・終了・表示・構文と既存ひな形の結果を確認する。実機検証の代わりにはしない。

## 2026-10-24 — PR #78の入力先変更とepochを整合（Codex）

- 入力先から外れた時と戻った時に、全出力・視点を解放してepochを進める。フォーカス喪失前や対象外の間の欠番待ち入力が、復帰後に処理される経路を防ぐ。
- スマホも同じ画面のままepochが変わった場合に全操作を解放する。遅延入力を復帰後に流しても押下されず、新しい押下だけが通る回帰試験を追加した。
- 静的画面と試験スクリプトの構文検査に成功。先行PRの統合後にRustで検証する。Minecraft実機と実際のAlt+Tab・SendInputは未検証。

## 2026-10-24 — PR #77の切断待ち中の緊急停止を修正（Codex）

- 切断でpausedのときも緊急停止の理由を記録し、復帰期限を0にして自動復帰を解除する。epochも更新し、停止前の入力を持ち越さない。
- 自動復帰ONで切断待ちになった後にstopし、全員が戻ってもcoopにならない回帰試験を追加した。試験スクリプトの構文検査は成功。先行PR統合後にRust版で実行する。

## 2026-10-24 — PR #76を最新mainへ追従して検証（Codex）

- #71〜#75の接続認可・接続置換・通信契約v3・epoch分離を保持して統合した。起動エラーが初期画面より先に届く場合も失わないようRust側で保持し、ページ読込完了後に再表示する。
- Tauriアプリとホストを `cargo build --release --locked` でビルド成功。Rustの通信シミュレーション **27/27合格**。
- `shutdown-sim.mjs --bin <ホストexe>`：`quit` と標準入力EOFの **2/2合格**。Wを押下中のdry-runで、解放ログがshutdownより先に記録され正常終了することを確認した。OS入力は送っていない。
- このチャットではネイティブGUIの起動表示・操作は再検証していない。スマホ実機・Minecraft・配布も未検証。取込元のGUI起動観測と今回のビルド・終了試験を区別する。

### PR #77の統合後の検証

- Rustの固定依存ビルド成功。通信シミュレーション **29/29合格**。coop中の全員の押下解放・注入OFFに加え、切断待ちのpaused中に緊急停止してから再接続しても自動復帰しないことを確認した。OS入力はdry-runで無効化した。実際のホットキー操作・コンソールの閉じるボタン・Minecraft前面での動作は未検証。

## 2026-10-25 — PR #78の統合後の検証（Codex）

- main追従後、Rustの固定依存ビルド成功。通信シミュレーション **31/31合格**、単体試験 **3/3合格**（入力先の一致・不一致、Origin・Host）。入力先から外れる前と対象外の間の欠番待ち入力が、復帰後にはstaleとして破棄されることを確認した。
- AGENTS.mdと要件資料を実装状況へ整合。100ms周期の検出であること、Minecraft・実ホットキー・Alt+Tabの実入力試験は未完了であることを明記した。実運用の自動復帰の初期値・使用条件は未決定のまま。OS入力はすべてdry-runで無効化した。
- 注入モード変更時にもgameをスマホへ配信するよう通知漏れを修正し、対象外のままOFF/ONを切り替えた時の警告・inputActive更新を追加確認した。通信31/31を再度通過した。

## 2026-10-25 — PR #79の統合と画面確認（Codex）

- 先行PRの認可・接続置換・停止・入力先変更とスマホ通知を保持してmainへ追従した。診断用テストモードをMinecraftへの入力中と誤表示しないよう修正し、TauriのREADMEと要件の実装状況を整合させた。
- ホストとTauriの固定依存ビルド成功。通信 **32/32合格**（P1のみのリモコン通知を含む）、表示ロジック **11/11合格**、静的4画面の構文検査成功。
- 組み込みブラウザでPCの参加画面の描画・ホスト接続OK・0/3人・空き枠・注入OFF・緊急停止キーの案内を確認した。QRは表示確認のみで、スマホ実機での読み取りは未実施。OS入力は送っていない。
- デザインのユーザー確定、Minecraftとの切替を含む実機の一連の流れは未完了。今回のブラウザ確認をTauriネイティブ画面や実機の合格へ読み替えない。

## 2026-10-25 — PR #80の旧ひな形削除を追加確認（Codex）

- レビュー中に追加された旧Python/Reactひな形と旧CIの削除も確認した。削除対象は未実装の入力ドライバー・ヘルス表示・案内画面とその試験であり、Rust・静的画面・Node参照実装は保持されている。READMEとLICENSEは変更していない。構成チェックと構築・運用資料をRustへ整合し、初期構築依頼は過去の記録と明示した。
- AGENTS.mdの重複記載と削除後に実行できないUvicornの説明を整理し、独立したtools-venvの作成手順を追記した。libclang 18.1.1はLOCALAPPDATAの開発用環境にも用意し、旧ホストのソース削除に依存しないようにした。
- 構成チェックは成功。先行実装の最終確認はRust通信32/32、Node19/19、単体3/3、終了2/2、表示11/11、4画面構文。最終ActionsのRust/Tauriジョブと構成チェックの成功を条件にマージする。OS入力は無効化する。Issueの一括クローズは行わない。

## 2026-10-25 — 実機ログの確認と、自動復帰の期限が延びる不具合の修正（Claude Code）
- ローカルの実機ログ（`logs/`、Git対象外）を確認した。2026-10-25 0:11（約15分）と1:06（約17分）に、Rust版ホスト・スマホ3台（Android×2・iPhone、WebRTC接続）・前面のMinecraft（`javaw.exe`、入力先判定OK）で協力プレイした記録がある。注入（SendInputの成功）はそれぞれ1483件・1474件で、失敗は0件。視点の注入は4501回・4356回。終了時に押したままのキー・ボタンはなかった。切断（`close 1006`/`1005`）・接続の置き換えから自動復帰した。**Minecraftが実際に反応したか、どの版・設定だったかはログからは分からない。**
- 1:06のセッションで、P3が切断（891秒）してから88秒後の再接続（979秒）で自動復帰した。期限（15秒）を過ぎた後は、明示のRESUMEまで再開しない仕様に反する。原因：Rust版は、同じ端末の接続の置き換え（`replaced`）も切断として扱う。そのため、切断待ちの`paused`中に置き換えが起きると、期限が「今から15秒」に延びていた。
- 修正：期限は協力プレイから止まった時に始める。期限内に別の人が切れたときだけ延ばし、期限後の切断や置き換えでは延ばさない（Rust版・Node参照実装）。
- 検証：`cargo build --release --locked` 成功。シミュレーションに「期限後の再接続と置き換えで再開しない・期限が延びない」を追加した。修正前のホストでは不合格（再現した）。修正後は `protocol-sim.mjs` を3回連続で **33/33合格**、`--target node` **20/20合格**。

## 2026-10-25 — #35 Minecraftへの移行・復帰時のセッション維持（Claude Code）
- 判断の記録：`docs/develop/decisions/2026-10-25-session-keep.md`（[P]）。
- Rust版ホスト：PCアプリの画面を `monitor`（`page: app`）として区別し、`focus` を受け取る。協力プレイ中にPCアプリが前面になったら、全解放して `paused`（`app focus`、自動復帰なし）へ移す。選んだゲームを `game.title` として保持し、`select_game` で変更する。ロビー以外で変えたら全解放して `lobby`（`game change`）へ戻す。参加者と役割はそのまま。
- PCアプリ（`app.html`）：前面になった・外れたことを `focus` で送る。ゲームの選択をホストへ送り、ホストの値で表示する。スマホ画面は停止理由「PCアプリの画面に戻った」「PCの緊急停止」を表示する。
- `protocol.md` に `page: app`・`focus`（app）・`select_game`・`game.title` を追記した。
- 検証：`cargo build --release --locked`・`cargo test --release --locked`（3件）成功。`node scripts/sim/protocol-sim.mjs` を3回連続で **34/34合格**（PCアプリへの手動復帰→全解放・paused・リモコンがPC画面へ届く・役割維持・RESUME、協力プレイ中のゲーム変更→全解放・lobby・参加者維持、同じゲーム・未知のゲームは無視、を追加）。`--target node` **19/19合格**。`app-view-test` **11/11合格**。`check-static-pages` 構文OK。
- **未検証：** WebView2のウィンドウでの `focus` の届き方、Minecraftとの実際の切り替え（#37）。

## 2026-10-25 — #42 Minecraftの名称・画面・デモ素材の利用条件（Claude Code）
- 公式のMinecraft Usage Guidelines（<https://www.minecraft.net/en-us/usage-guidelines>、2026-10-25に取得）を読み、要点と本プロジェクトへの当てはめを `docs/develop/decisions/2026-10-25-minecraft-usage-terms.md` に記録した（[E]は公式の記述、[P]は当てはめ）。
- 要点：名称は副題・説明でだけ使う。ロゴ・ブランドを使わない。「NOT AN OFFICIAL MINECRAFT PRODUCT. NOT APPROVED BY OR ASSOCIATED WITH MOJANG OR MICROSOFT」に類する免責表示を関連資料すべてに入れる。自分のプレイ動画・スクリーンショットは無料で見られる形なら共有できる。ゲームファイルを再配布しない。
- PCアプリの②ゲーム選択の画面に免責表示を加えた。リポジトリ内の画像（アイコン・ワイヤーフレーム）にMinecraftの素材がないことを確認した。
- 検証：`node scripts/sim/check-static-pages.mjs` 構文OK。
- **未確認：** 発表資料・デモ動画（未作成。作成後に記録の表で個別確認する）、EULA本文の精読、JPHacksの規約との照合、READMEへの免責表示（READMEの変更はユーザーの指示を待つ）。

## 2026-10-25 — #41 Windows配布パッケージ（Claude Code）
- `scripts/windows/package.ps1` を追加した。release ビルド済みのアプリ・ホストと静的画面一式・設定の例・ファイアウォールの許可スクリプト・LICENSE・利用者向け `README.txt` を、`dist/ReCooplay-<版>-windows-x64.zip` にまとめる。インストーラー（Tauriのバンドル）ではなく、展開して起動する形にした。アプリは自分のフォルダから画面とホストを探すため、変更は不要だった。
- `allow-firewall.ps1` にUTF-8のBOMを付けた（Windows PowerShell 5.1が日本語を正しく読むため）。`-Program .\recooplay-host.exe` で配布フォルダからも使える。
- 検証：`cargo build --release --locked`（host-rs・desktop）成功。`package.ps1` で5.7MBのzipを作成した。`%TEMP%` に展開し、リポジトリの外から `RECOOPLAY_DRY_RUN=1`・`PORT=18600` で `recooplay-desktop.exe` を起動した。展開先の `recooplay-host.exe` が起動し、`/`・`/app`・`/api/info` が200を返した。展開先の `logs/` にログ（`hotkey ok`・`server_start`・`shutdown`）が残った。ウィンドウを閉じると両方のプロセスが終了した。`allow-firewall.ps1` の構文をPowerShell 5.1のパーサーで確認した（実行はしていない）。
- **未検証：** 開発環境のないWindows 11での起動、ファイアウォールの許可手順の実施、スマホ3台の参加、SmartScreenの警告（署名なし）。

## 2026-10-25 — #5 明示操作でのみ実行するWindows入力プローブ（Claude Code）
- `apps/host-rs/src/bin/recooplay-input-probe.rs` を追加した。ホストとは別の実行ファイル `recooplay-input-probe.exe` で、`focus.rs`・`input.rs` を共有する。キー（W・Space・Shift・Ctrl+W）、クリック・長押し・ホイール、相対マウスを順に送る（#6〜#8 の実機確認用）。
  - 手動のarming：標準入力に `ARM` を入れるまで送らない（PowerShellのパイプが付けるBOMは無視する）。
  - 入力先の確認：送る直前に毎回、前面がMinecraftか確かめる。外れたら全解放して待ち、30秒で中止する。
  - 独立した緊急停止：`Ctrl+Alt+F12`（`GetAsyncKeyState` を10msごとに確認）、`Ctrl+C`・ウィンドウを閉じる（`SetConsoleCtrlHandler` の中で全解放）。
  - finallyの全解放：完走・中止・停止・panicのどれでも、押しているものを離してから終わる。
  - `--mock`：OSに送らない（`RECOOPLAY_DRY_RUN` と同じ）。前面の判定と停止を標準入力で差し替える。
- `windows` crate に `Win32_System_Console` を追加した（Cargo.lock は変わらない）。CIに `input-probe-sim` を追加した。
- 検証：`cargo build --release --locked` 成功。`node scripts/sim/input-probe-sim.mjs` を3回連続で **4/4合格**（ARM以外・入力が閉じたときは送らない、完走で押下が残らない、W押下中に入力先から外れる→全解放・外れている間は送らない・戻ると再開、長押し中のstop→全解放・終了コード2・停止後は送らない）。実モード（`--mock` なし、Minecraftは起動していない）で `ARM` を入れると、送信0件のまま入力先を30秒待ち、終了コード3で中止した。
- **未検証：** Minecraft実機での各手順（#6〜#8）、実際の `Ctrl+Alt+F12`・`Ctrl+C`・ウィンドウを閉じたときの全解放（OS入力の自動送信は行っていない）。

## 2026-10-25 — PR #82の利用条件資料のレビュー（Codex）
- 公式Usage GuidelinesとEULAを再取得した。ガイドラインの連絡先要件に対しGitHub Issueで充足とする記載を修正し、公開可能な責任者・直接連絡先は未決定として残した。
- 自作動画・無料公開だけを理由に利用可能と断定せず、汎用製品の宣伝・会場投影・実際の発表素材の個別確認を残した。大会運営の判断で権利者の条件を上書きできないことも明記した。
- `node scripts/sim/check-static-pages.mjs` は4画面の構文確認に成功。Issue #42は発表素材・連絡先・EULA全体と大会規約の照合が残るため閉じない。

## 2026-10-25 — PR #83の配布スクリプトのレビュー（Codex）
- 既存の配布フォルダを無条件に再帰削除する処理を廃止し、既存出力は拒否して保持する。出力をリポジトリ内に限定し、ディレクトリリンクも拒否する。`CARGO_TARGET_DIR`に対応し、両exeのPEヘッダーでWindows x64を確認する。
- host-rs・desktopの`cargo build --release --locked --manifest-path ...`が成功。`CARGO_TARGET_DIR`をLOCALAPPDATAの開発用出力先に設定し、Windows PowerShell 5.1で`package.ps1 -Out dist/review83-20261025`を実行して5.7MBのzipを生成した。
- 既存出力の拒否とzipハッシュの不変、範囲外出力の拒否を確認。梱包内容はexe2本・静的5ファイル・設定例・許可スクリプト・LICENSE・説明のみ。実設定・ログ・トークンを含まない。
- 展開したホストを`RECOOPLAY_DRY_RUN=1`・`RECOOPLAY_NO_CONFIG=1`・`RECOOPLAY_STDIN_CONTROL=1`で起動し、`/`・`/app`・`/api/info`が200、`quit`でshutdown記録と終了コード0を確認した。ファイアウォール設定は変更していない。
- PR #82の免責表示はブラウザでゲーム選択画面を描画して確認した。Tauri実機やMinecraftの確認には読み替えない。Issue #41はクリーンなWindows 11とスマホ3台の条件が残るため閉じない。

## 2026-10-25 — PR #84の入力プローブの安全経路レビュー（Codex）
- 押下の記録と送信が別だったため、コンソール停止の全解放後に遅れたdownを送る余地があった。記録・送信・全解放を同じmutexで直列化し、対象待機から戻った直後も停止と対象を再確認する。
- OS入力失敗は終了コード4で中止する。解放失敗時は記録を削除せず再試行し、解放を確認できなければ表示する。停止ハンドラー登録の失敗も無視しない。ARM後の標準入力切断で停止し、不明な引数はarming前に拒否する。
- panic hookで送信mutexを取り直す処理を廃止し、unwind時のGuardで解放する。標準出力の切断をpanicにしない。mock専用の失敗注入により、押下中のpanicでもデッドロックせず全解放して終了することを確認した。
- `cargo build --release --locked --manifest-path apps/host-rs/Cargo.toml`成功。`node scripts/sim/input-probe-sim.mjs --bin <CARGO_TARGET_DIR>/release/recooplay-input-probe.exe`は**12/12成功**。ARM前、完走、対象喪失、停止、待機中停止、ARM後EOF、panic、不正引数、down/up/ホイール/視点の失敗を確認した。OS入力は全て無効。
- 実際のMinecraft・Ctrl+Alt+F12・Ctrl+C・コンソール終了時の実入力解放は未検証。Issue #5は未確認の安全条件を保持し、#6〜#8・#21・#37・#39・#69を完了扱いにしない。

## 2026-10-25 — PR #85の期限外復帰と関連Issueのレビュー（Codex）
- 最新mainのセッション維持・入力プローブの変更を取り込んだ。Rust/Nodeの期限更新処理を確認し、通信契約に期限内の別参加者切断と接続置換・期限後の扱いを追記した。実運用の初期値・許可条件は決定していない。
- 既存の期限後再接続・接続置換に加え、期限後に別参加者が新たに切断・復帰しても期限が元の値のままで再開しないことを追加した。Node版は置換時に切断処理を呼ばないため、別参加者切断でも回帰を検出する必要がある。
- locked releaseビルド成功。`node scripts/sim/protocol-sim.mjs --bin <CARGO_TARGET_DIR>/release/recooplay-host.exe` **35/35成功**、`node scripts/sim/protocol-sim.mjs --target node` **20/20成功**。いずれもOS入力無効。修正後の実機再試験は未実施。
- Issue #27・#29の作者による2026-10-25の実機観測記録を個別確認した。Rust版PCアプリ・Android2台/iPhone1台・WebRTC・Minecraft前面のonモードで、P1の斜めを含む移動・ジャンプ・スニーク・ダッシュ、P3の攻撃・使う・ホイール・インベントリ・捨てるが動いたとの報告がある。本レビュー担当者が新たに実機試験したものではない。
- 機能の取り込みはPR #71（#67）、認可・順序・全解放と通信はPR #72〜#78および上記シミュレーション、各操作の実機動作はIssue #27・#29の報告を証拠として扱う。両Issueの「取り込み・関連動作のシミュレーションと実機の再確認・結果と共通資料の記録」を照合した。
- Minecraft版・設定の記録、Raw Input設定比較、W保持中の切替、実ホットキー、異常終了、上流なし接続、回転・ロック・キャンセルの網羅、Nodeとの疑似ゲーム実機比較は不足している。#6〜#8・#10・#18・#19・#21・#23・#26・#30・#31・#35・#37〜#42・#69は未完了条件を維持する。SendInput成功件数だけでゲーム内動作の合格としない。

## 2026-10-25 — 実キー入力のダミーE2Eと、PCアプリへの手動復帰の修正（Claude Code）
- Rust版ホストで、模擬スマホ3台＋実際のSendInput＋Edgeの疑似ゲーム画面（`test` モード）のダミーE2Eを行った。マウスは送っていない。試験スクリプト・ダミーデータはリポジトリ外（プッシュしない）。
  - 合格：P1のリモコン（矢印・Enter）、START・PAUSE・RESUME・END、PAUSE時の全解放、実際のCtrl+Alt+F12による緊急停止（#26・#30・#21）。必要人数3で2人のときはSTARTできず、P2のSTARTとP2・P3のPAUSEは無視された（#38）。全員がキーを押したまま1台が切断→全員分を解放（#18）。無通信4.1秒で切断扱い→解放（#18）。期限内の再接続で自動復帰し、旧押下は戻らなかった（#39）。協力プレイ中のゲーム変更→解放してlobby（#35）。PCアプリの強制終了→ホストが解放して終了（#21）。WMIで起動したコンソールのホストにCtrl+C→解放して終了（#21）。
  - 試験環境の注意：このシェルの子として起動したプロセスはCtrl+Cを無視する設定を引き継ぐため、Ctrl+Cの試験はWMIで起動した。
- **不具合と修正：** デスクトップアプリ（Tauri / WebView2）の画面は、背面になっても `blur` を受け取らず、`document.hasFocus()` もtrueのままだった。そのため #35 の「PCアプリへ戻ったら一時停止」が実際のアプリでは働かなかった（ブラウザでのシミュレーションでは合格していた）。デスクトップアプリがホストに `RECOOPLAY_DESKTOP=1` を渡し、ホストは前面のプロセス名（`recooplay-desktop.exe`）で判定するようにした。ログに `app_focus` を記録する。
- 検証：`cargo build --release --locked`（host-rs・desktop）成功。`protocol-sim.mjs` を3回連続で **36/36合格**（前面のウィンドウによる判定と、その後は画面の `focus` を使わないことを追加）。実際のデスクトップアプリ（ドライラン）で、協力プレイ中にPCアプリを前面にすると `paused`（`app focus`）になった。ウィンドウを閉じると `shutdown` を記録し、アプリとホストが終了した。

## 2026-10-25 — PR #87の復帰時停止と自動復帰のレビュー（Codex）

- 元のPRの前面プロセス判定・デスクトップ起動フラグ・dry-run限定の模擬経路を確認した。今回のレビューはOS入力を送らずに実施し、作者のダミーE2Eの報告とMinecraftの実機合格を区別する。
- 回帰試験を2件追加し、修正前のPRコードでそれぞれ失敗を確認した。ブラウザのPC画面を閉じて新しい接続で戻った際に、全体共有のfocusが残り停止を取りこぼす問題と、切断待ちのpaused中にPC画面へ戻っても自動復帰が取り消されない問題である。これらの失敗に伴い後続試験も連鎖して失敗した。
- ブラウザは接続ごとのfocus変化で判定し、デスクトップの前面状態と分離した。PC画面への手動復帰では切断待ちのpaused中も全解放・旧入力破棄・epoch更新を行い、自動復帰期限を0へ戻して、明示RESUMEまで再開しないよう修正した。
- host-rs・desktopの `cargo build --release --locked --manifest-path ...` が成功。修正後の `node scripts/sim/protocol-sim.mjs --bin <CARGO_TARGET_DIR>/release/recooplay-host.exe` は **38/38成功**。`app-view-test.mjs` は11/11、`check-static-pages.mjs` は4画面構文、`verify_overlay.py` は30ファイル確認に成功した。
- Minecraftでの押下保持中のフォーカス切替や復帰は今回追試していない。Issue #19・#30・#37等の未完了条件を保つため、PRの `Closes #35` は `Refs #35` へ変更し、自動クローズを避ける。先のユーザー操作による基本動作の未コミット記録は別のローカル変更として保持する。

## 2026-10-25 — このPCとスマホ3台による基本動作確認（ユーザー操作・Codex観測）

### 環境と起動条件

- 対象ソース：main `8394d010eadd87dd062942e06bbbf5abaefe8885`。Windows 11 Home、OS版10.0.26300、ビルド26300。ホストはこのソースから `cargo build --release --locked --manifest-path apps/host-rs/Cargo.toml` に成功し、LOCALAPPDATAの開発用出力先を使用した。Tauriは既存のビルドを起動し、対象ソースの静的画面を配信した。
- Android 10のChromeを使用する2台とiPhone（UA上はiOS 18.7、Safari使用を案内）の計3台。ブラウザの詳細版・端末機種は未記録。最初の検証モードではP1がiPhone、実入力の再起動後はP1・P2がAndroid、P3がiPhoneとなり、各回ともユーザーが担当表示を確認した。
- Minecraft Java Editionの版はユーザー申告 `26.6`。Raw Inputとゲーム内感度は未確認。テスト用ワールドを用意するよう案内し、Minecraftはユーザーが手動起動した。
- Windowsモバイルホットスポットへ3台を接続したことをユーザーが確認。上流回線は切断しておらず、インターネットなし接続の試験ではない。既存のファイアウォール規則を確認したが、今回の試験で変更していない。
- 最初は `RECOOPLAY_DRY_RUN=1`、続いて全タブとアプリを閉じて `RECOOPLAY_DRY_RUN=0` で再起動。両方とも `RECOOPLAY_NO_CONFIG=1`、`PORT=8080`。実設定ファイルは変更せず、自動復帰は試験セッション内でOFF、入力OFFから開始した。

### 確認結果

| 対象 | ユーザーが確認したゲーム・画面の挙動 | サーバー・ツールの観測 |
|---|---|---|
| 3台の接続 | 全台に正しい担当が表示された | 全3枠が接続、WebRTCは全台open、開始可能 |
| P1のリモコン | 右2回、Esc、EnterでTauriの参加・ゲーム選択・分担確認を期待どおり移動 | remoteの入力を観測 |
| STARTと緊急停止（検証モード） | STARTで担当画面へ移り、実際のCtrl+Alt+F12で一時停止・入力OFF・P1のリモコン復帰 | `reason=emergency stop`、入力OFF、全台接続維持を観測。OS入力は無効のため、実入力保持中の全解放を検証したものではない |
| 独立プローブのキー入力 | 前進・ジャンプ・スニーク・ダッシュが全てMinecraft内で動いたとユーザーが明示確認 | `recooplay-input-probe.exe --steps keys` を実入力モードで起動し、ユーザーがARMを手入力。全SEND/RELEASEが成功、DONE、終了コード0、未解放0 |
| 独立プローブのマウス・視点 | 採掘・設置・ホイールによる持ち物切替・左右の視点移動が全て動いたとユーザーが明示確認 | `recooplay-input-probe.exe --steps mouse,look` を同様にARMで開始し、DONE・未解放0を確認 |
| スマホ3台からの実入力 | P1の前進、P2の視点、P3の持ち物切替が全て反映され、前進は指を離すと止まった。その後ユーザーは「基本操作は全て大丈夫だった。停止も問題ない」と報告 | 実入力モードで3台の操作データとMinecraftの入力先判定、START/PAUSE/RESUMEを観測。実入力セッションにはキー・ボタン注入118件（失敗0件）、視点の集計ログ277件を記録した |

- PowerShell 5.1用のローカル補助スクリプトで、UTF-8のBOM不足による構文エラーが最初に発生した。この時点ではプローブは未起動・非送信。BOMとUTF-8の入出力設定を追加し、同じPowerShell 5.1のパーサーで成功を確認してから再実行した。補助スクリプトはGit対象外の開発用領域に置き、製品コードは変更していない。
- 証拠はユーザーの明示回答、ローカルのプローブ出力、状態観測、終了後に書き出された実入力セッションログを照合した。ログの注入成功だけをゲーム内動作の証拠とはしていない。実環境のIP・認証トークン・Wi-Fiの認証情報は本記録へ転記していない。

### 未実施・終了状態

- 実入力セッションのログにはホストPAUSEによる停止を記録したが、`emergency_stop`イベントは記録されていない。ユーザーの「停止も問題ない」との報告は保持しつつ、実入力を保持したままの物理ホットキーによる全解放は、今回の証拠からは合格を確定しない。
- 押下中のAlt+Tab・PCアプリへの復帰、通信切断からの全解放・再接続、自動復帰ON/OFFと期限内外、Ctrl+C・強制終了時の実入力解放、Raw Input設定比較・推奨感度、上流なし接続、画面回転・ロック・pointercancelの網羅、Nodeとの疑似ゲーム実機比較は未確認として残す。
- ユーザーが「今回は基本動作の確認で終了する」と指定したため、追加試験は実施していない。終了後、Tauri・ホスト・入力プローブのプロセスが残っていないことと、ホストのshutdown記録を確認した。関連Issueは今回閉じていない。今回の基本動作確認を安全条件全体の完了とは扱わない。

## 2026-10-25 工程0・1：準備と明示Ready

- 基準main：0b35dd1。Open PRは開始時0件。素材17枚を実画像で確認し、Figma取得不可のためローカルPNGを参照した。
- 既存の未コミット実機記録を保持し、専用作業ツリーで実装。新規Issue #88・#89、既存 #46 の適用範囲を記録した。
- Rust通信契約v4にpreparing、P1の明示READY、開始・再開のepoch照合を実装。旧STARTは準備まで。PC監視画面のcoop強制を拒否する。入力OFF、対象外、3人未接続、入力・緊急停止の利用不可ではReadyを許可しない。
- Minecraftの既存ウィンドウを照合して前面化し、失敗時は手動起動へ案内する。dry-runでは実ウィンドウを操作しない。
- `cargo build --release --locked` / `cargo test --release --locked`（apps/host-rs）：成功、単体5件成功。既知のOpenSSL PDB警告と未使用関数警告は非致命的。
- `node scripts/sim/protocol-sim.mjs --bin <共有キャッシュのホスト>`：38/38成功（RECOOPLAY_DRY_RUN=1）。Node参照版：20/20成功。
- `node scripts/sim/shutdown-sim.mjs --bin <ホスト>`：quit・EOFの2経路で全解放を確認。
- `node scripts/sim/input-probe-sim.mjs --bin <プローブ>`：12/12成功（--mock）。画面ロジック11/11、静的4ページの構文、構造30ファイルの確認が成功。
- 新しい開始手順・前面化の実機受入は未実施。以前のMinecraft基本操作試験を、この変更の実機証拠へ読み替えない。

## 2026-10-25 工程2：P1ホストタッチパッド

- P1・非coop・現在epochのリモコンだけを認可。PCアプリ前面はDOM仮想カーソル、準備中／一時停止中の対象ゲーム前面はSendInputへ排他的に振り分ける。対象外には送らない。
- 移動量を各軸±120へ制限、rseqで重複を拒否。左右ボタン、スクロール、矢印、Enter、Esc、Eを追加。協力視点処理と定数は維持した。
- 入力モード・PC前面判定の切替、端末の非表示・回転・キャンセルで全解放・保留破棄・epoch更新。P2/P3のメニュー操作、旧epochと重複の移動を拒否する試験を追加した。
- Rust releaseビルド・単体5件、通信契約39項目、終了時全解放2経路、表示ロジック11項目、静的構文・構造確認を実施。端末のキャンセル試験は前試験の押下を解放してから測定するよう修正。モード／フォーカス切替の試験では更新通知を待って新epochで再開する。
- 実PCアプリ・MinecraftのメニューとAndroid/iPhoneのタッチ操作は未実機検証。詳細は docs/develop/architecture/host-remote.md。PR #90を先行依存とする。

## 2026-10-25 工程3・4：PC・スマホ同時UI刷新

- 提供PNG17枚の実画像を確認。背景専用PNG5枚を同梱し、画面全体の画像化はしていない。シアン #17C1FF、紫 #5F5B93、クリーム #FFFBEF 等を実画素から採色し、styles/colors.cssとdocs/develop/design/color-palette.mdへ座標・用途・コントラストを記録した。
- PCの参加・ゲーム選択・固定分担・準備・停止と、スマホのホスト操作・待機・3担当・障害表示を同じデザインで実装した。CSS共通トークンと通信・入力・描画モジュールを分離した。React・新しい本番依存・自由配置編集は追加していない。
- Rust dry-runホストと3つのブラウザOriginで参加・WebRTC・準備→Ready→3担当・Pause・再接続を確認した。libdatachannelのバイナリ応答をJSONとして読めない問題を修正し、文字列・ArrayBuffer・Blobと旧接続を試験した。
- 内蔵Chromiumの縦画面6サイズ（320×568〜430×932）を計測。3担当×6、ホスト準備・一時停止×6の計30条件で横はみ出しと高さ44px未満の操作ボタンなし。前面化ボタン追加後にも12条件を再確認した。874×402では全解放して縦向き案内。PCは1920×1080と1280×720で3カードを保持する。小解像度では説明下部を縦スクロールする。
- 満員・トークン不一致・版不一致の固有説明、モジュール分離後のReady→Pauseを表示専用プレビューで確認した。証拠画像3枚と詳細はdocs/develop/design/ui-validation.md。表示の模擬データを認可・OS入力の合格根拠には使わない。
- 実ブラウザ＋Rust dry-runで押下→送信20件のp95=1ms、視点移動→送信28件のp95=40.7ms、送信間隔27件の中央値33.4ms/p95=66msを観測。実タッチ・Wi-Fi・Minecraftまでの遅延ではない。変更前の同条件測定がなく改善率は不明。
- ホスト・Tauriのreleaseビルド成功。ホスト単体5件、Rust通信40/40、Node参照20/20、終了通知2経路、入力プローブ--mock12/12、画面ロジック12/12、UI入力4/4、外部JSを含む静的構文、構造確認が成功。
- static-assets-sim.mjsで23ファイルのHTTP 200・MIME・no-store・ローカル背景参照を確認（1,155,993 bytes、表示モジュール分離後）。PNG・JPEG・WebP・WOFF/WOFF2のMIMEを追加した。
- Windows配布スクリプトで約6.7MBのZIPを作成し、ZIP内のHTML/CSS/JS/PNG等23ファイルが作業ツリーとバイト単位で一致することを確認。別PCでの起動・新UIのMinecraft/スマホ実機受入は未実施。
- 追加の機能修正（既存ゲームへ戻るOPEN_GAME、固定3人、実入力の緊急停止登録必須）は機能PR #91側へ分離した。mainは更新せず、マージ・auto-merge・Issueクローズは行わない。

- 最終レビューで、paused等の定期state更新により手動ナビゲーションが分担画面へ戻る問題を修正。進行の変化時だけ案内し、同じ進行の定期更新はユーザーの画面選択を保持する回帰試験を追加した。

## 2026-10-25 — #101 Minecraftの送るキーをユーザーのキー設定に合わせる（Claude Code）
- 事象：送るキーが固定（ダッシュ＝左Ctrl、捨てる＝Q）で、このPCのMinecraft（ダッシュ＝Q、捨てる＝R に変更済み）では、ダッシュが効かず「捨てる」がダッシュとして動いていた。
- ホスト（`src/keybinds.rs`）：起動時・ゲームの選択・準備（PREPARE）・Ready・再開（RESUME）のたびに `options.txt` を読み、操作→送るキーの対応を作る。担当の確認は従来の固定の表で行い、送るキーだけを差し替える。新しい版の名前（`key.keyboard.q`）と1.12以前の番号（LWJGL2のキーコード）の両方に対応した。送れないキー（マウスの中ボタン・テンキー等）と未設定の操作は、初期のキーで代用すると別の操作が動くため送らず警告する。2つの操作が同じキーなら警告する。ファイルがない・読めない場合は初期設定のキーで送り、その旨を表示する。ファイルの場所はログに残さない。
- 場所：`%APPDATA%\.minecraft\options.txt`。ランチャーで別のフォルダを使う場合は `config.json` の `minecraftOptions`（`RECOOPLAY_MINECRAFT_OPTIONS` でも可）。
- 送れるキーを、英字・数字・F1〜F12・左右の修飾キー・記号・Insert等へ広げた（`controls.rs`）。
- 画面：`game.keys` を配り、PCの分担確認の画面とスマホのボタンのキー表示を、実際に送るキーにした。警告は分担確認の画面に出す。
- 検証：`cargo test --release --locked` **9件合格**（キー設定の読み取り6件：変更されたキー、送れない・未設定、重複、1.12以前の番号、ファイルなし、英字・数字・Fキー）。`protocol-sim.mjs` を3回連続で **41/41合格**（試験用の `options.txt`（ダッシュ＝Q、捨てる＝R）で、P1のダッシュがQ、P3の捨てるがRとして送られ、捨てるでQを送らないことを追加）。`--target node` **20/20合格**。`app-view-test` **13/13合格**、`ui-input-test` 4/4、`check-static-pages`・`shutdown-sim`・`static-assets-sim`・`input-probe-sim` 合格。
- **未検証：** 実際のMinecraftでの動作（このPCの設定でダッシュ＝Q・捨てる＝Rが効くか）、スマホのボタン表示の見た目。
## 2026-10-25 #54・#93：Steam・Epicの検出と一覧からの起動（ホスト側）

## 2026-10-25 — #97・#99・#100 ゲームの操作定義とユーザーのキー設定（Claude Code、テストは後で）
- **#97：** 操作定義JSONの形式を `docs/game-profile-specification.md` に決めた。`apps/game-profiles/minecraft-java.json` を最初の1件にした（実機で確認済み）。ホスト（`src/profiles.rs`）は起動時にフォルダ内の定義を読み、形式を検証し、不正なものは理由をログに残す。Minecraftの定義はホストにも同梱した。分担の案（`assignment`）は、同じ系統の操作をグループごと1人に割り当てる。担当が3人分に足りないときは、`split` のあるグループ（移動の左・右・ジャンプ等）を分けて配る。`game.profile` で画面に配る。配布用zipに定義のフォルダを同梱した。
- **#99：** `src/keybinds.rs` を定義駆動にした。読み方は `minecraft-options`・`terraria-input-profiles`・`es3-keybindings`（R.E.P.O.）・`unity-inputsystem-json`・`ue-input-ini`・`source-cfg`。キー名の表記ゆれ（XNA・Unreal・Source・Unity）をまとめて送れるキーへ対応させる。`%DOCUMENTS%`（OneDriveへ移したドキュメントを含む）などの場所を展開する。協力プレイ中以外は、設定ファイルの更新日時が変わったら読み直す。
- **#100：** `scripts/profiles/extract.mjs`（読み取りのみ、ゲームのコードは実行しない）。Steamの `appinfo.vdf` の分類から向き不向きを付け、Unity Input Systemの埋め込み定義・.NETの列挙型・Minecraftの `Options.class`・設定ファイルから、下書き（状態は「自動抽出」）を作る。このPCで一度だけ動かし、Minecraft（40件）・Terraria・tModLoader（各31件）・R.E.P.O.（33件）・Goose Goose Duck（97件）が取れることを確かめた。
- 検証：`cargo build --release --locked` 成功。**ユーザーの指示により、単体試験・シミュレーションの実行と追加は後で行う**（keybindsの既存の単体試験は新しい形へ書き直したが、まだ実行していない）。

## 2026-10-25 — #98 主要500タイトルの選定と操作定義（Claude Code、テストは後で）
- `scripts/profiles/build-catalog.mjs` を追加した。Steamの公開データ（ストアの売上上位1000・全期間の売上上位1000、`GetMostPlayedGames` の100、`GetTopReleasesPages`）の順位を合算し、ゲームだけを上位から498本選んだ。個別の定義があるのに上位に入らなかった2本と、Steam外の2本（Minecraft Java・Fortnite）を加えた計502本。一覧は `docs/develop/data/top500-games.md`・`.json`（生成物）。取得した公開データはリポジトリ外のキャッシュに置く。
- 定義：個別の定義（`scripts/profiles/overrides/`）が13本。このPCのデータから抽出した4本（Terraria・tModLoader・R.E.P.O.・Goose Goose Duck）と、広く知られた初期設定で書いた9本（Counter-Strike 2・Team Fortress 2・Left 4 Dead 2・Portal 2・Garry's Mod・Valheim・Stardew Valley・Lethal Company・Among Us、未検証）。残りは、Steamのタグ（重みの上位）からジャンルの型（fps・action3d・platformer・topdown・racing・fighting・pointer）を当てた**仮の定義（template）**。移動だけになりやすい型（platformer・topdown・racing・fighting）は、移動を左・右などに分けられるようにした。
- 状態：device 1／extracted 4／unverified 9／template 488。向き：good 215／limited 180／unsuitable 107（マウス中心・ターン制等）。
- 検証：ドライランのホストで、502件すべてが形式の検証を通り読み込まれた（エラー0）。**単体試験・シミュレーションはユーザーの指示で後回し。** 型の当てはめは上位70本を目で確認し、MOBA・ストラテジーの誤分類を直した。
- **未確認：** templateの定義の正確さ（ゲームごとに実機または自動抽出で確かめる必要がある）。

## 2026-10-25 — #105 参加人数に応じた割り振りと、#60 操作定義から作る操作画面（Claude Code、テストは後で）
- **#105（ホスト、`profiles::assignment_for`）：** 1〜4人の分担の案を作る。グループを単位にし、人数より少なければ `split` のあるグループ（足りなければ重い単位）を分け、優先度の高い単位から1人ずつ、残りは負担（操作の重み。視点・2軸＝3、ボタン＝1、ホイール＝0.5、`weight` で上書き可）の軽い人へ配る。分担はReady・再開（RESUME）のときに参加人数から決め（`game.assigned`、ログ `assignment`）、協力プレイ中は組み直さない。画面には今の人数の案と1〜4人の案を配る。
- **#60（スマホ、`scripts/generated-controls.js`）：** Minecraft以外で定義と分担があるゲームでは、その人に割り当てた操作だけの画面を作る（方向は十字、ボタン、ホイール、視点のパッド。ボタンには実際のキーを表示）。ボタンは `act:<操作ID>` を送り、ホストは割り当てた操作だけをゲームのキー設定に合わせて送る。視点も割り当てた枠だけ受け付ける。Minecraftは実機で確かめた専用の画面のまま。PCの分担確認の画面も、定義があれば分担の案を表示する。
- 確認：`cargo build --release --locked` 成功、静的画面の構文OK。ドライランのホストで、Minecraftの分担の案が1人＝全部、2人＝移動／視点＋攻撃＋持ち物、3人＝移動／視点／攻撃＋持ち物（従来と同じ）、4人＝移動／視点／攻撃／持ち物になった。**単体試験・シミュレーション・画面の試験はユーザーの指示で後回し**（`static-assets-sim` は新しいスクリプトファイルの追加に合わせた更新が要る見込み）。
- **制約：** 選べるゲームは今も Minecraft と疑似ゲーム画面だけ。検出したゲーム（#95）を選んで操作定義を使うのは #94 で結び付ける。枠は3つのままで、4人目の参加は未対応。

## 2026-10-25 — #97〜#101・#105・#60 の試験（Claude Code）
- 追加した試験：
  - 単体試験（`cargo test`、計14件）：同梱の操作定義502件がすべて形式の検証を通ること、不正な定義（未定義のグループ・送れないキー・不正な種類・役割・重複・splitの参照・版）を理由付きで拒否すること、IDとSteam AppIDでの検索、Minecraftの1〜4人の分担、移動だけのゲームの分割と、分けられないグループの半分割、メニュー・会話を分担しないこと、設定ファイルの更新の検知と読み直し、場所の展開（%APPDATA%・%LOCALLOW%・%DOCUMENTS%）。
  - シミュレーション：試験用の操作定義（疑似ゲーム画面に結び付け、`scripts/sim/fixtures/profiles/`）で、3人の分担が「左＋アクション／右／ジャンプ」になること。割り当てた操作（`act:`）だけが定義のキーで送られ、割り当てていない操作・未知の操作・Minecraft用の固定の操作は送られないこと。視点は割り当てた枠だけが動かせること。
  - 画面：操作定義の画面の作り方（割り当てた操作だけ、方向は十字、ホイールは前後、視点のパッドを移す、Minecraftは専用画面、キーが変わったら作り直す）、視点の担当の判定、分担の確認画面の表示。
- 試験で見つけて直した不具合：(1) 操作定義の画面を使うゲームでも、Minecraft用の固定の操作（FWD等）が初期キーで送られていた → 送らないようにした。(2) 視点の移動の記録が常に「P2」になっていた → 実際に動かした枠を記録するようにした。(3) シミュレーションの期待値が、#99で変えた `source` の値（`options` → `user`）に追従していなかった。
- 結果：`cargo test` 14件＋2件合格。`protocol-sim.mjs` を3回連続で **42/42合格**、`--target node` 20/20。`app-view-test` 14/14、`ui-input-test` 6/6、`check-static-pages`・`static-assets-sim`・`shutdown-sim`・`input-probe-sim`・`verify_overlay.py` 合格。
- **未検証（実機が必要）：** Minecraftで、このPCのキー設定（ダッシュ＝Q・捨てる＝R）どおりに動くか。

- `apps/host-rs/src/games.rs` を追加。Steam（レジストリの `SteamPath`、`libraryfolders.vdf`、`appmanifest_*.acf`）とEpic（`ProgramData\Epic\...\Manifests\*.item`）を読み、PC画面へ `state.games`（`verified: false`）を送る。スマホには送らない。ログは検出の件数と、選択・起動のIDだけ。再頒布パッケージ・Proton・未完了のインストール・DLC・ツールは除外する。
- PC画面の `launch_game {id}` で、検出時に確かめた値だけから起動URLを組み立てて起動する（`ShellExecuteW`）。協力プレイ中・一覧にない値（パス・URL・Minecraft）は起動しない。起動前に全解放・epoch更新し、ウィンドウが現れたら前面化する。90秒で現れなければ手動起動を案内する。進行は変えず、P1の準備・Readyで開始する。
- 一覧で選んだゲームの入力先は、前面の実行ファイルがインストール先フォルダ内にあることで判定する（`Target::install_dir`）。Minecraftの判定は従来どおり。
- `cargo build --release --locked`：コンパイル・リンク成功（既知の警告3件）。実行中のホストが `target\release\recooplay-host.exe` を使用中のため最終コピーだけ失敗し、`target\release\deps\recooplay_host.exe` で試験した。`cargo test --release --locked`：単体12件成功（VDF・ACF・Epicマニフェスト・危険な値の拒否・偽フォルダでの検出・インストール先の入力先判定）。
- `node scripts/sim/protocol-sim.mjs --bin <deps のホスト>`：41/41成功（偽のSteam・Epicフォルダ `RECOOPLAY_FAKE_GAMES` を使う「ゲーム一覧」項目を追加）。Node参照版：20/20成功。
- 開発PCで dry-run のホストを起動し、実際のSteamから10件を検出（Epicは0件。その後の通常起動では12件）。画面（#94）は未実装。
- 開発PCの実機確認（通常モード・注入OFF・PC画面の代わりにスクリプトで `launch_game` を送信、Terraria `steam:105600`）：
  - 初回の実装では `ShellExecuteW` がハブのスレッドを約5.4秒止めた（切断判定4秒を超える）。起動要求を別スレッドへ移し、修正後は起動要求後もPC画面への `state` の最大間隔が1001〜1002ms（通常の1秒周期）。
  - 未起動から：起動要求0.4秒、Steamの画面（`steamwebhelper.exe`）を経て3.4秒後に `terraria.exe` が前面、入力先の判定がok、0.1秒後に `started`。ランチャーの画面は入力先と判定しなかった。
  - 起動済みから：Windowsが前面化を拒否した直後にSteamが前面へ出す挙動を観測。拒否されても5秒は前面になるのを待つよう修正し、誤った「手動で前面に」の案内を出さなくなった。起動後にSteam・エクスプローラーへ前面が移ると、入力先の判定もそれに追従した。
  - ゲームへの入力（注入ON）・スマホからの一連の操作は未確認。
  - Epicの実機テストは、2026-10-25のユーザー判断で本PRの対象外とする（使える見込みの状態で可）。起動URLは、Epicのランチャーが作るデスクトップのショートカットと同じ形式（名前空間・カタログID・アプリ名）を使い、それがなければアプリ名だけの形式（Lutrisの設定例と同じ）を使う。
## 2026-10-25 PC原案5画面の反復監査・追加改修

- 最新のローカル監査v2を全文読み、指定パス `docs/develop/design/pc-fidelity-audit-2026-10-25.md` に原文を保持した。素材5枚を1920×1080原寸で確認し、SHA256・採色領域・外接矩形を `pc-fidelity-reference.json` に記録。
- PCだけを参加／ゲーム選択／分担／準備中／準備可能の5構図へ変更。左561px・巨大コピー・楕円CTA・巨大半透明フレーム・横長操作帯・縦長仮キャラ枠を再現。3人固定とP1だけReadyを保持。開発情報は既存 `/host` と設定の詳細へ、ON/OFFとQRには常時到達可能。
- フォントはローカルのNoto Sans JPを使用。正式フォントは未取得、再配布・CDN・新しい本番依存・React移行なし。仮想カーソルのdialog最上位レイヤーとsummary押下を修正。入力定数、Rust、通信契約は変更していない。
- 反復撮影の途中で古いタブを閉じ込めた補助関数と画像寸法不一致を検出し、不採用として記録。DPR丸めの0.667px罫線は1pxの塗り線へ修正。最終製品コミットe2a4c7fでタブ25/26を別々に開き、10:44と10:45 JSTに5画面×2解像度をそれぞれ新規撮影・再計測。両回で主要矩形・ボタン画面内・ページスクロール・コンソール0件を確認。
- 自己監査の最終点は参加96、選択97、分担96、準備中96、準備可能97。各観点の最低比率86.7%、重大P0/P1差分0。画素一致率や実機検証済みを意味しない。計測・比較・差分・採点根拠は `docs/develop/design/evidence/pc-fidelity-progress.md` と `pc-fidelity-element-matrix.md`。

### 実行した検証

| コマンド・対象 | 結果 |
| --- | --- |
| `cargo test --release --locked --manifest-path apps/host-rs/Cargo.toml` | 単体5件成功 |
| `cargo build --release --locked --manifest-path apps/host-rs/Cargo.toml` | 成功 |
| `cargo build --release --locked --manifest-path apps/desktop/Cargo.toml` | 成功 |
| `node scripts/sim/protocol-sim.mjs --bin <新規releaseホスト>` | Rust通信40/40成功 |
| `node scripts/sim/protocol-sim.mjs --target node` | Node参照20/20成功、Rust固有の項目は対象外 |
| `node scripts/sim/input-probe-sim.mjs --bin <新規releaseプローブ>` | --mock 12/12成功、OS入力なし |
| `node scripts/sim/shutdown-sim.mjs --bin <ホスト>` | quit・親stdin消失の2経路成功 |
| `node scripts/sim/app-view-test.mjs` | 15/15成功 |
| `node scripts/sim/ui-input-test.mjs` | 5/5成功、dialogとsummary・全解放・30Hz・旧接続を確認 |
| `node scripts/sim/check-static-pages.mjs` / `node --check scripts/sim/ui-preview.mjs` | HTMLと外部JSの構文成功 |
| `python scripts/verify_overlay.py` / `git diff --check` | 構造30ファイル成功、差分の空白エラーなし |
| `node scripts/sim/static-assets-sim.mjs --bin <新規releaseホスト>` | 最終版23ファイル、1,166,959 bytesのHTTP/MIME/no-store/ローカル参照が成功 |
| `scripts/windows/package.ps1 -Out .venv/pc-fidelity-final-dist` | 最終版ZIP約6.9MB作成。PythonでZIP内全UI23ファイル＋両exeがソース／新規ビルドとバイト一致 |
| `audit-pc-fidelity.py pc-fidelity-accepted-1` と `pc-fidelity-accepted-2` | 2回とも10画像・主要矩形・見出しの画素寸法がPASS |
| `report-pc-fidelity.py` | 2回のタブ・時刻・画像寸法・警告0・矩形・ZIP一致を再照合、要素対応表を生成 |

ビルドは既存のVS/CMake/Strawberry Perl/libclangと `CARGO_TARGET_DIR=C:/Users/kumes/AppData/Local/ReCooplay/cargo-target` を使用。OpenSSLのデバッグPDB欠落警告と既存の未使用フィールド警告は非致命的。画像処理だけPillow入りの同梱Pythonを使用し、製品依存へ追加していない。

### ブラウザとRustの機能確認・限界

- `desktop-browser-harness.mjs` でRust実バックエンドをDRY_RUN＋FAKE_TARGETに限定して起動。ブラウザのPC/P1と模擬P2/P3で、P1リモコン画面移動、PC準備、入力ON、3人条件、P1だけReady、WebRTC+WS、Pause、前面化要求後のPause保持、明示再開、stdin緊急停止、入力OFF、Endで担当保持を確認。12件の観測を `pc-fidelity-functional/backend-checks.json` に記録。
- 表示専用データで0/1/2/3人、キーボード遷移、入力設定、準備中QR、切断、対象外、緊急停止、QRなし／503／再取得、PC切断を確認。15件を `edge-checks.json` に保存。意図的な503等は最終正常画面のコンソール評価と分ける。
- 未実施：変更後のTauri実窓・Minecraft実入力・Android/iPhone実タッチ・実ネットワーク切断・Alt+Tab解放・Ctrl+Alt+F12実キー・別PC起動。表示とdry-runの成功で実機受入を完了扱いにしない。
- 公開直前に#92の履歴更新cc613fcを取り込んだが、72ef255からのファイル差分0、製品コードのe2a4c7fからの差分0を確認。baseは指定どおり#92のブランチ。main直接push・PRマージ・auto-merge・Issueクローズは行わない。

## 2026-10-25 提供ロゴ・アイコンの反映

- 指定されたrogo.png（3200×2400）とicon.png（1774×1774）を実画像で確認。原画像をそのまま保存し、ロゴはPC・スマホヘッダー・Tauri起動画面へ配置。アイコンはブラウザ全4ページ、Appleホーム画面用、TauriのWindows PNG/ICOへ反映。切り取り・背景除去・図案変更・本番依存追加なし。
- `scripts/windows/prepare-brand-assets.py` でPillowを開発時だけ使い、縦横比を維持したアイコン各サイズを生成。原画像SHA256と用途は `docs/develop/design/brand-assets.md`。
- 最初の増分ビルドで旧アイコンがEXEに残ったことを、別名コピーから抽出して検出。build.rsに画像のrerun-if-changedを追加し、release再ビルド成功（1分24秒）。再抽出したEXEアイコンが提供図案へ変わったことを確認し、証拠PNGを保存。
- PC5画面×2解像度を新しい独立タブ29/30で各10枚撮影。両回の監査は主要矩形失敗0、ブラウザ警告・エラー0。最新の最終画像と採寸を差替版へ更新。新しいロゴ以外のレイアウトは変更していない。
- スマホ3担当＋ホスト準備／一時停止×縦6サイズの30条件を新規撮影。ページはみ出し・ゲーム操作ボタンの画面外・高さ44px未満なし。検証器のスマホ向けgame通知漏れを修正し、担当画面の表示後に測定。既存の小さい診断用通信テストボタンは44px判定の対象外。
- `node scripts/sim/check-static-pages.mjs`：成功。`app-view-test.mjs`：15/15。`ui-input-test.mjs`：5/5。`node --check scripts/sim/ui-preview.mjs`：成功。`static-assets-sim.mjs --bin <releaseホスト>`：26ファイル・2,546,433 bytesのHTTP/MIME/no-store確認成功。入力・通信の製品実装は変更していない。
- Windows配布ZIPを `.venv/branding-verified-dist/` へ新規作成（約9.5MB）。全UI26ファイル＋両exeをバイト照合する集約レポートを更新。Minecraft/Tauri実窓・Android/iPhone・ホーム画面追加・別PC起動は今回未検証。
- 既存PR #96へ追加する。マージ・auto-merge・mainへの直接pushは行わない。

## 2026-10-25 PR #96のマージ前レビュー対応

- 新しいユーザー指示で、現在の全PRを確認し、問題がなければマージする権限が与えられた。以前のマージ禁止は今回の明示判断に従って更新する。
- レビューの未対応条件だった重複・中間画像をGit追跡から外した。ローカル生画像・各回の採寸JSON・画像SHA256・監査履歴・最新PC/スマホ画像は保持。過去画像リンクには保存方針のREADMEを追加し、最終版へ案内する。
- 最終ツリーだけをスカッシュマージし、中間画像のコミット履歴をmainへ持ち込まない。入力・描画コードの変更はない。最終画像・26素材の配信・入力/UI試験が成功済みの製品コードを保持する。

## 2026-10-25 PR #95の安全レビュー修正

- 再検出で選択中ゲームが消えると、入力先がMinecraftの条件へ戻る問題を修正。検出対象の消失・場所変更では全解放・視点破棄・epoch更新・起動待ち破棄を実施し、協力中なら一時停止する。未知の選択は注入不可とし、復帰後も自動再開しない。
- #96を取り込み、BUILD_LOGの双方の記録を保持して競合を解消。ユーザーのmain作業は変更しない。
- releaseビルド成功（依存ライブラリ再構築を含み約11分）。Rust単体はホスト12件＋入力プローブ3件成功。既存の未使用フィールドとOpenSSL PDBの警告は非致命的。
- `protocol-sim.mjs --bin .venv/pr95-runtime/recooplay-host.exe`：41/41成功。押下中の対象消失でW・右ボタンを解放し、注入不可・再開不可になり、再検出後もpausedを維持する回帰試験を追加した。初回の試験はP3のepoch通知前に押したため失敗し、P3側の通知を待ってから押すよう試験を修正して再実行した。
- `shutdown-sim.mjs`：quit・EOF両方成功。`app-view-test.mjs`：15/15成功。静的構文・差分空白検査も成功。今回の実ゲーム・スマホ実機の追試は行っていない。

## 2026-10-25 PR #102の統合レビュー修正

- マージ済みの#96の原案準拠UIと#95のゲーム検出・安全停止を取り込み、通信フィールドと画面機能を両方保持した。分担画面の「このPCのキー設定を確認」から操作設定を開き、担当別の実際のキーと警告を確認できる。
- 旧形式の整数キーコードを1〜255に限定し、範囲外の値が16ビットへの変換で実キーへ折り返すことを防止。回帰試験を追加した。
- 初回の統合通信試験は28/42成功。キー再読込が遷移途中のタイトル・旧epochを通知していたため、再読込内の通知を削除し、遷移完了後の通知へ統一した。試験もタイトルだけでなくlobbyへの到達を待つ。修正後は42/42成功。
- releaseビルド成功。`cargo test --release --locked --manifest-path apps/host-rs/Cargo.toml`はホスト19件＋プローブ3件成功。`protocol-sim.mjs --bin .venv/pr102-runtime/recooplay-host.exe`は42/42、Node.js参照実装20/20、`app-view-test.mjs`16/16、`ui-input-test.mjs`5/5、静的構文・差分空白検査は成功。
- `shutdown-sim.mjs`はquit・EOF両方成功。`static-assets-sim.mjs`は26ファイル・2,547,169 bytesのHTTP・MIME・キャッシュ・ローカル参照が成功。
- Rust実バックエンドのdry-runに試験用options.txtを読み込ませ、1280×720のブラウザーでダッシュQ・捨てるRを確認。コンソール警告・エラー0。証拠は `docs/develop/design/evidence/keybind-review/actual-keys-1280.jpg`。同時起動の検証ホストによる緊急停止キー登録不可の安全案内は隠していない。
- Minecraft実入力・Tauri実窓・スマホ実タッチは今回未検証。#101の実機受入を完了扱いにせず、自動クローズ構文をPRから外した。

## 2026-10-25 PR #103の修正・統合レビュー

- 最新main（#95・#96・#102）を統合し、ゲーム検出・起動、安全停止、新UI、キー表示を保持。Minecraftの`game.keys.source=options`を維持し、他形式の読込成功だけ`user`とした。
- Unreal配列の削除・追加・クリア・置換、Sourceの再bind・unbind・unbindall・引用符・命令区切り・空バインドを修正。修飾キー付きUE操作は未対応として送信しない。範囲外の旧Minecraftキー番号を拒否するmainの修正も保持した。
- 停止中のキー設定更新では全解放・視点破棄・epoch更新後に再読込。キーを押したまま設定を変える通信回帰試験を追加。定義の重複、担当、split参照を検証し、提案メタデータだけでReadyできないようにした。
- `cargo build --release --locked --manifest-path apps/host-rs/Cargo.toml`成功。`cargo test`はホスト23件＋プローブ3件成功。`protocol-sim.mjs --bin .venv/runtime/recooplay-host.exe`は43/43、`--target node`は20/20成功。
- `app-view-test.mjs`16/16、`ui-input-test.mjs`5/5、静的構文、構造30ファイル、差分空白検査成功。`profile-extract-test.mjs`は個人のゲームを読まない埋め込みJSON fixtureで静的抽出・下書き状態・未対応キーを確認し、CIにも追加。
- `shutdown-sim.mjs`はquit・EOF両方成功。`static-assets-sim.mjs`は26ファイル成功。`package.ps1 -Out .venv/pr103-package`で約9.7MBのZIP作成成功、同梱Minecraft定義をソースとバイト照合した。
- 本変更経路のMinecraft・スマホ実機は未検証。5タイトルの自動抽出の再照合、設定階層・動的alias等は受入未完了として#97・#99・#100を自動クローズしない。過去の作者の実機観測と今回のfixture/dry-runを区別する。
- 追加の境界検証で、全解除だけのSource/Unreal設定が初期キーへ戻る問題を修正。全解除・置換・未記載操作のキー解除を重ねる際も解除を保持し、再bindした有効操作だけを復元する。並列単体試験のfixture名も一意化。追加後のRust単体はホスト24件＋プローブ3件、計27件成功。

## 2026-10-25 PR #104の修正・統合レビュー

- マージ済み#103と他担当のREADME更新・PR #104への追加コミットを統合。Minecraftの既存`options`契約を維持し、他形式の`user`と区別する。
- 仮・自動抽出・未検証・過去の実機記録をPCとスマホで区別し、未対応定義のReady不可を明示。Rust側の拒否は#103で導入済み。カタログを操作成立済みの一覧として扱わない。
- `cargo build --release --locked`成功、単体はホスト24件＋プローブ3件成功。Rustの形式検証で全502定義の読込エラー0。`profile-catalog-test.mjs`は一覧・識別条件・状態・出典を照合し、template488／extracted4／unverified9／device1を確認。CIにも追加した。
- `protocol-sim.mjs --bin .venv/final-runtime/recooplay-host.exe`は43/43成功。未検証のStardew定義ではReadyと協力入力を拒否し、その後の模擬Epic対象消失では全解放・一時停止を確認した。
- 画面17/17、UI入力5/5、静的構文と差分空白検査成功。終了時全解放はquit・EOF両方成功。素材配信26ファイル・2,548,146 bytesを確認。配布ZIPへ全502定義を同梱する。
- Rust dry-runでPC2解像度・スマホ縦6サイズを撮影し、PC警告の画面内表示・スマホ横はみ出し0・操作ボタンの画面外配置0を確認。証拠は`docs/develop/design/evidence/catalog-review/`。PC1920の初回寸法不一致は採用せず再撮影した。
- 実ゲーム502本の互換性・スマホ実タッチは未検証。#98は開いたままとする。新しい本番依存は追加していない。

## 2026-10-25 PR #106の修正・統合レビュー

- マージ済み#103・#104を統合。Minecraftの専用画面・options契約、未検証定義のReady拒否、対象消失時停止、新デザインを保持。1〜4人の分担案は計算できるが、実セッションの枠とReadyは3人固定のままと明記した。
- 生成画面で固定操作名を使う認可迂回を拒否。生成操作は確定分担だけを許可し、Minecraftへact入力を混ぜない。ゲーム変更・lobby終了で旧分担を破棄し、ロビーでは新しい案を表示する。末尾が:up等の操作IDも正確に解決する。
- 対応画面と検証状態が揃った定義だけを許可。生成画面はbutton・wheel・mouseDelta、axis2d・textは未対応としてReady拒否。試験用定義はシミュレーション用と明記したreviewed fixtureで、実機確認の捏造はしない。
- releaseビルド成功。Rust単体はホスト31件＋プローブ3件成功。`protocol-sim.mjs --bin .venv/runtime/recooplay-host.exe`は44/44、Node参照20/20成功。固定操作による担当迂回、生成ボタン・ホイール・P1視点、旧状態破棄、既存Minecraft操作と安全停止を含む。
- `app-view-test.mjs`18/18、`ui-input-test.mjs`7/7、静的構文、502定義の照合、構造30ファイル、差分空白検査成功。終了時全解放はquit・EOF両方成功。静的素材27ファイル・2,557,981 bytes配信成功。配布ZIP約10.2MBを作成した。
- 実Rust dry-runのブラウザーで準備→明示Ready→生成操作→押下・解放（送信2・未ACK0）→Pause→リモコンと視点パッド復帰を確認。P1〜P3×縦6サイズ、PC2解像度を撮影した。初期描画例外をブラウザーで検出し、重複した初期描画を削除して再撮影。最終正常画面はコンソール警告・エラー0。
- PC分担カード・担当別実キー・スマホの担当説明を実際の割当に追従。Minecraftの既存構造は保持した。証拠と表示専用／実バックエンドの区別は`docs/develop/design/evidence/generated-review/README.md`。
- Minecraft実入力・スマホ実タッチ、2人・4人の実セッションは未検証／未対応。#60・#105を自動クローズしない。

## 2026-10-25 改良後素材によるPC・スマホUIの再現

- 最新main `e618bf0` から `codex/improved-ui-fidelity` で実装。元のmain作業ツリーの未コミット資料は変更していない。改良後11素材を原寸確認し、4色の画像を無加工で取り込んだ。共通色は `colors.css` に集約。
- PCはロゴ帯、大きな右見出し、各画面固有の構成、端末カードとキャラクターを反映。スマホは接続カード・点線・担当札に合わせ、ホスト・P1/P2/P3・生成操作・待機・停止・エラーを統一した。3人固定とホストだけの明示Readyを維持。
- スマホの通信統計を「…」の診断へ分離。診断を開く前に解放し、開いている間は新入力・視点・リモコン移動を送らない。PCの安全停止表示には白い背景を付け、黒い画像との重なりを修正した。
- PC2解像度、スマホ縦6サイズ、派生状態を合わせて最終104画面を再撮影。短い画面でのキャラクター位置、320px幅の44px未満ボタン、ノッチ領域を修正。 `verify-ui-evidence.mjs` で実寸・網羅・はみ出し0・スマホ操作44px以上と画面内配置・共通アンカー5箇所を確認した。撮影はブラウザーが返したJPEGをそのまま保存し、原案PNGを横並び比較する。
- 最終の `check-static-pages.mjs`、`app-view-test.mjs` 18/18、`ui-input-test.mjs` 7/7、`phone-view-test.mjs` 7観点、構造30ファイル、`git diff --check` が成功。新しいスマホ表示試験と撮影証拠の検査をCIへ追加した。
- 既存Rustホストで `protocol-sim.mjs --bin .venv/runtime/recooplay-host.exe` 44/44、`shutdown-sim.mjs` quit/EOF全解放が成功。素材配信は変数整理・最終文言調整前に33ファイル・2,779,188 bytesを確認。ホストのSHA256は #106 検証用と一致し、Rust・通信契約・入力定数は変更していない。
- 表示専用環境で準備→明示Ready→担当操作→Pause→再開→診断開閉を確認、確認画面のコンソール警告・エラー0。追加のRust＋ブラウザー環境の起動は自動承認レビューの利用上限で未実行。既存Rust通信試験と模擬表示を、今回の実機結合試験と混同しない。
- 証拠は `artifacts/improved-ui/README.md` と比較ギャラリー。正式フォントの完全一致、新UIの実端末タッチ・ノッチ・Minecraft・Tauriは未検証。関連Issueを実機完了扱いで閉じない。React移行は今回不要と評価した。
- 最終レビューで、PC見本帯の「使う E」をMinecraftの「持ち物」へ修正し、3キーの表示もホストの実キー設定へ追従。長い名称は縮小・省略表示し、操作設定で全文を確認できる。変更した分担画面は両PC解像度で再撮影した。

## 2026-10-25 — PR #107の診断開始・通信テストをマージ前に修正（Codex）

- レビューで診断開始後の保留連打と、通信テストのdownが抑止され100件のupだけになる問題を確認した。診断を開く専用コールバックから既存の`stopRemote()`を呼び、`release_inputs`で保持・保留入力を破棄する。非注入の`burst`だけは診断内で送信を許可し、非表示・横向きでの押下抑止と通常操作・視点の診断中抑止は維持した。
- `node scripts/sim/controller-diagnostics-test.mjs`を追加し、実際のcontroller・phone-viewに最小DOM・通信・タイマーのスタブを接続。診断表示前のupと`release_inputs`、現在epoch、診断中の通常押下・視点抑止、通信テスト200件の交互のdown/upと連番を確認した。同試験をCIに追加し、`protocol-sim.mjs`の停止試験も保留連打の破棄を含めた。
- ローカルの`controller-diagnostics-test.mjs`、`phone-view-test.mjs`7観点、`ui-input-test.mjs`7/7、`app-view-test.mjs`18/18、`check-static-pages.mjs`が成功した。既存main `c14562d`のRust dry-runホストで、4回分の保留連打に`release_inputs`を送るとその後450msの保留押下が0件になることも別途確認した。これはPRの全通信試験や新UIと実ブラウザーの結合試験の代わりではない。
- 画面構造とCSSを変更していないため、撮影画像・指紋は元コミット`3719777`の記録として保持した。Minecraft・スマホ実機・Tauriの新規受入は実施していない。

## 2026-10-25 — 参加人数を2〜4人にし、人数に応じて分担する（Claude Code、#57・#105）

- ユーザー判断：人数はReadyの時点の接続人数で自動に決め、分担は操作定義から自動で振り分ける（[参加人数の決定](../decisions/2026-10-25-variable-players.md)）。
- ホスト：枠をP1〜P4の4つにし（5台目は4004）、P1を含む2人以上でReadyできるようにした。Readyの時点の接続者を`game.participants`として固定し、分担（`game.assigned`、枠名で配る）とともに終了まで組み直さない。参加者が切断したら一時停止し、戻るまで再開しない。Readyの後に来た人の入力は送らず、その切断では止めない。Minecraftは3人（P1〜P3）だけ従来の専用画面と固定の表（`game.fixedControls`）、2人・4人は操作定義から作った画面で`act:<ID>`を送る。`required`は最低人数2だけを受け付ける。
- 画面：PCの参加者を4枠、分担の確認を人数分の列にし、見出し・案内を人数に合わせた。4人目は赤のキャラクター（画像の外形を測って切り抜きを設定）。スマホは参加者表示を4人分にし、Readyボタンを「Ready・n人で操作を始める」、後から来た人には「次の開始から参加します」と表示する。定義から作る分担の説明文はカード内3行で切る。
- `cargo build --release --locked`（初回はOpenSSLの再構築で約12分）・`cargo test --release --locked`はホスト31件＋プローブ3件成功。`protocol-sim.mjs`（Rust dry-run）45/45（満員を5台目に変更、2人でReady可・1人で不可、2人・4人のMinecraftの分担と`act:`の送信、後から来た人の入力拒否・切断で止めない、参加者の切断で再開不可の試験を追加）、`--target node` 20/20、`app-view-test.mjs` 20/20、`ui-input-test.mjs` 7/7、`phone-view-test.mjs`、`controller-diagnostics-test.mjs`、`verify-ui-evidence.mjs`、`check-static-pages.mjs`、`static-assets-sim.mjs`、`shutdown-sim.mjs`が成功した。
- 試験の追加中、P1の状態だけを待ってP2から送った入力がホストに古いepochとして捨てられた（`stale_input`）。ホストの挙動は正しく、試験で入力する端末にも新しい状態が届くのを待つように直した。
- dry-runホストと模擬スマホ、ヘッドレスChromeで、PC画面の2人・3人・4人の参加と分担（1920×1080、横はみ出しなし）、2人のMinecraftでのP2のスマホ画面（視点パッド・攻撃・使う・持ち物、402×874）を撮影して確認した。
- スマホ実機・Minecraft・Tauriでの2人・4人の試験は未実施。保存済みの画面撮影（`artifacts/improved-ui/final`）は撮り直していない。PR #108（#94）と`desktop.js`・`app-view-test.mjs`が隣接行で衝突するため、後からマージする側で取り込み直す。

## 2026-10-25 — 検出したゲームの選択画面と起動要求（Claude Code、#94）

- PC画面の「② ゲーム選択」を、固定のMinecraft（手動起動）とホストの`state.games`（Steam・Epic）の一覧に変更した。検出しただけの項目（`verified`がtrueでない）に「未検証」、出所（Steam・Epic Games）を表示する。件数・探索中の表示と「探し直す」（`refresh_games`）を追加した。
- クリック・上下キー（ホストのリモコンの上下）は`select_game`による選択だけとし、主ボタン・Enter（PCのキーボードとリモコンで同じ処理）で項目IDの`launch_game`を送る。`game.launch`は選んだ項目の分だけ「起動中…／起動しました／起動できませんでした／起動を確認できませんでした」とホストの案内文で表示し、失敗・確認不可では「手動で起動して次へ」と再要求のボタンを出す。ゲーム名は文字列として表示し、HTMLとして解釈しない。
- `node scripts/sim/app-view-test.mjs` 22/22（一覧・未検証・起動表示・主ボタン・上下の巡回の4件を追加）、`ui-input-test.mjs` 7/7、`phone-view-test.mjs`、`controller-diagnostics-test.mjs`、`verify-ui-evidence.mjs`、`check-static-pages.mjs`、`static-assets-sim.mjs`、`protocol-sim.mjs`（Rust dry-run）44/44が成功した。
- 既存の`recooplay-host.exe`（ホストは変更なし）をdry-run・`RECOOPLAY_FAKE_TARGET=1`・偽のSteam 2件／Epic 1件（名前に`<b>&`を含む）で起動し、ヘッドレスChromeをCDPで操作して1920×1080と1280×720で確認した。一覧・未検証の表示、↓キーでの選択（`select_game`）、Enterでの`launch_game`と「起動しました」・ホストの案内文、主ボタンの「次へ進む」への切替、ゲーム名のエスケープ、1280×720でページがはみ出さないことを確認した。右下の安全案内が起動の案内と重なったため、案内の表示中は一覧の枠の下を空けた。
- 失敗・タイムアウトの表示と再要求のボタンは単体試験のみで、ブラウザでは確認していない。リモコン（スマホP1）経由の操作は、キーボードと同じ関数を通ることを確認しただけで実端末では未確認。保存済みのPC画面の撮影（`artifacts/improved-ui/final`）は撮り直していない。実際のSteam・Epicでの起動・Tauri・Minecraftは未検証。
- 同日、ユーザーが開発PCで実機確認した（PCアプリ`recooplay-desktop.exe`を本ブランチのリポジトリから起動、ホストは既存ビルド・注入OFF）。Steamのゲーム12件・Epic 0件を検出し、ユーザーが選択画面の表示を目視で確認した。ログでは、Steam版Terrariaの選択（`select_game`）、`launch_game`、ランチャーへの要求成功、約9.5秒後の`launch_result: started`、前面の入力先判定`terraria.exe`への切替を確認した。検出したゲームへの入力（注入ON）、スマホのリモコン操作、起動失敗の表示、Epicは今回も未検証。

## 2026-10-25 — PR #110のレビューとmain取り込み（Codex）

- ユーザーのレビュー・問題がなければマージする依頼に基づき、`4276fe5`を確認した。最新main `714a331`を取り込み、`desktop.js`、`app-view-test.mjs`、BUILD_LOGの競合を両方の変更を保持して解消した。#108のゲーム一覧・起動案内と、#110の2〜4人の表示・分担を統合した。既存の未コミットBUILD_LOGは専用stashへ保存し、コミット後に復元する。
- Ready時の参加者・分担の固定、途中参加者の操作拒否、元の参加者が戻るまで再開不可、ホスト権限と全解放経路をレビューした。スマホの2人・4人のReady表示、途中参加P4の待機・赤キャラクター、2人・4人のMinecraftの生成操作と担当外の枠を回帰試験へ追加した。
- 統合後の`node scripts/sim/app-view-test.mjs`は24/24、`node scripts/sim/ui-input-test.mjs`は7/7、`node scripts/sim/phone-view-test.mjs`、`node scripts/sim/controller-diagnostics-test.mjs`、`node scripts/sim/check-static-pages.mjs`、`node scripts/sim/verify-ui-evidence.mjs`、`node scripts/sim/static-assets-sim.mjs`（33ファイル）、`node scripts/sim/profile-catalog-test.mjs`（502定義）、`node scripts/sim/profile-extract-test.mjs`が成功。Node参照実装の`node scripts/sim/protocol-sim.mjs --target node`は20/20成功。`git diff --check`も成功した。
- Rustの再ビルド・単体試験・dry-run試験は別途結果を記録する。今回のレビューでは新しいスマホ実機・Minecraft・Tauriの受入を実施していない。#109の起動順序変更は本PRに含めない。

## 2026-10-25 — ゲームの起動を、メンバー・分担の決定の後に移す（Claude Code、#109）

- PR #108・#110のマージ後のmain `27b615f`で、Rust版の再ビルド（約11分）と`protocol-sim.mjs` 45/45、`app-view-test.mjs` 24/24、`ui-input-test.mjs` 7/7、`phone-view-test.mjs`、`check-static-pages.mjs`の成功を確認してから着手した。
- 順序をゲーム選択 → メンバー・分担の決定 → 起動 → 準備 → P1のReadyに変えた（[起動を分担決定の後に移す](../decisions/2026-10-25-launch-after-roles.md)）。選択画面は選ぶだけで、分担の画面の主ボタン（PCのクリックとリモコンのEnter）を「この分担で決定」→「ゲームを起動する」→「起動中…」→「ゲームを準備する」と切り替え、失敗時は「もう一度起動する」と「手動で起動して準備へ」を出す。
- ホストは決定（ゲームと接続中のメンバー）を`confirm_lineup`で受け、画面が見ていた内容が今と一致するときだけ記録する。`launch_game`・準備・準備中のReadyは決定が今の選択・接続者と一致するときだけ受け付け、選択と違うid・一時停止中の起動も拒否する。選び直し・ロビーへの移行・リセット・分担の画面からの戻り（`unconfirm_lineup`）で決定を消す。起動中の同じ要求は無視し、すでにウィンドウがあれば起動し直さず前面にする（実機の経路のみ）。
- `cargo test --release --locked`はホスト31件＋プローブ3件成功。`protocol-sim.mjs`（Rust dry-run）45/45：準備の前にPC画面の決定を挟み、起動の試験を「一時停止中の起動拒否、選んだだけでは起動しない、決定前の起動・準備の拒否、古い画面の決定の拒否、戻ると取り消し、連打してもepochが1つだけ進む（起動要求1回）」に書き換え、準備中に参加者が変わると決定し直すまでReadyできないことを加えた。`--target node` 20/20、`shutdown-sim.mjs`（決定を追加）、`app-view-test.mjs` 26/26（分担の画面のボタンの切り替えと準備中の戻りを追加）、`ui-input-test.mjs` 7/7、`phone-view-test.mjs`、`controller-diagnostics-test.mjs`、`verify-ui-evidence.mjs`、`check-static-pages.mjs`、`static-assets-sim.mjs`が成功した。
- 試験の書き換え中、起動要求の回数をホストのログで数えたが、ログがすぐに書き出されず0回と出た。ログではなくepochの進み方で数えるように直した。
- dry-runホスト・模擬スマホ2台・偽のSteamゲームに対し、ヘッドレスChromeでPC画面を操作した。Terrariaを選ぶ（起動しない）→ 分担の画面でEnterにより決定（「2人で決定！」）→ 選択画面へ戻ると取り消し → 決定し直して起動（「起動中…」で押せない）→「起動しました」の案内と「ゲームを準備する」→ 準備中、の順に進み、ホストのログで決定・取り消し・起動1回・準備を確認した。
- 起動の失敗・タイムアウト時の補助ボタン、起動済みのゲームを前面にする経路、実機（PCアプリ・実際のSteam/Epic・スマホのリモコン）は未確認。

## 2026-10-25 — 役割の入れ替え（開始前・一時停止中・終了後）（Claude Code、#47・#62）

- PR #111（#109）の上に積んだ。枠ごとの席順を持ち、分担の束を席順に配る方式で、ホストが2人の担当を入れ替えられるようにした（[役割の入れ替え](../decisions/2026-10-25-role-swap.md)、設計案[H]）。Minecraftの3人の専用画面も担当（席順）で引き、ホスト権はP1のまま。
- 開始前（接続中の人）と一時停止中（参加者）だけ受け付け、協力プレイ中は無視する。入れ替えると全解放・視点の破棄・epoch更新を行い、2人がスマホで確認するまでReady・再開できない。ロビーでは分担の決定もやり直し。席順は終了しても保ち（#62）、リセットで戻す。
- PC画面：分担の画面で2人の列を順に押すと入れ替える。確認待ちの人に「スマホで確認待ち」を表示。一時停止中は「担当を入れ替える」で分担の画面を開く。スマホ：担当が変わった本人に通知と「新しい担当を確認しました」ボタン（`role_ok`）。
- `cargo test --release --locked`はホスト31件＋プローブ3件成功。`protocol-sim.mjs`（Rust dry-run）46/46：協力プレイ中の入れ替え拒否、一時停止中の入れ替え（epoch更新・確認待ち・確認前の再開拒否・本人以外の確認を数えない）、再開後に入れ替えた先の操作・視点だけを送る、再接続しても担当を保つ、終了後も保ちロビーで戻すと決定と確認をやり直す、の試験を追加した。`--target node` 20/20、`app-view-test.mjs` 27/27、`ui-input-test.mjs` 7/7、`phone-view-test.mjs`、`controller-diagnostics-test.mjs`、`verify-ui-evidence.mjs`、`check-static-pages.mjs`、`static-assets-sim.mjs`、`shutdown-sim.mjs`が成功した。
- dry-runホストに、ヘッドレスChromeのスマホ画面（P2、402×874）と模擬スマホ2台、PC画面（1920×1080）をつなぎ、PCで P2→P3 の列を押して入れ替えた。PCの列が「アクション（確認待ち）／視点（確認待ち）」になり、P2のスマホに通知と確認ボタンが出て、押すと消えてPCの確認待ちがP3だけになることを確認した。
- 実機（スマホ・PCアプリ・P1のタッチパッドでの操作）は未確認。

## 2026-10-25 — README先頭の画像を指定サムネイルへ差し替え

- ユーザー指定のPNGを assets/images/recooplay-thumbnail.png に無加工で追加し、README先頭の画像参照と代替テキスト・表示幅を更新した。
- Node.jsの検証でREADMEの画像参照、PNG形式、1920×1080、元画像とのSHA-256一致を確認した。元画像を目視確認し、git diff --check も成功。

## 2026-10-25 — PR #111のレビュー修正（Codex）

- 最新main `4bb5134`を取り込み、BUILD_LOGの両方の記録を保持して競合を解消した。既存の未コミット記録はstashへ保持している。
- 起動済みのゲームを前面化する経路が、全解放・視点破棄・epoch更新より先にreturnしていたため、両方の起動経路に共通する位置へ安全停止を移した。決定要求`confirm_lineup`には現在のepochを必須とし、古いepoch・epochなしの要求を拒否する通信試験を追加した。
- `node scripts/sim/app-view-test.mjs`26/26、`node scripts/sim/ui-input-test.mjs`7/7、`node scripts/sim/phone-view-test.mjs`、`node scripts/sim/check-static-pages.mjs`、`git diff --check`が成功。Rustのビルド・単体・通信・終了試験は修正後のCIで確認する。新規の実機試験は実施していない。

## 2026-10-25 — PR #112のレビュー修正（Codex）

- 修正済みの先行PR #111を取り込み、BUILD_LOGの両方の記録を保持して競合を解消した。
- Minecraftの固定画面でP1を視点・アクションへ交換するとPAUSEボタンが消えるため、ホストの停止ボタンを担当のsectionから独立させた。移動担当になった非ホストには表示しない。P1の仮想カーソルがarticleの交換列をクリックできなかったため、`data-swap`をクリック対象へ追加し、PCキーボードのEnter・Spaceも列の交換として処理した。
- 担当確認`role_ok`に現在のepochを必須とし、古い担当の確認を流用して再開できないようにした。古いepoch・epochなしの確認拒否、交換後のP1のPAUSE表示、非ホストへの非表示、仮想カーソルから交換列へのクリックの回帰試験を追加した。
- `node scripts/sim/app-view-test.mjs`27/27、`node scripts/sim/ui-input-test.mjs`8/8、`node scripts/sim/phone-view-test.mjs`、`node scripts/sim/controller-diagnostics-test.mjs`、`node scripts/sim/check-static-pages.mjs`、`node scripts/sim/verify-ui-evidence.mjs`、`node scripts/sim/static-assets-sim.mjs`（33ファイル）、`git diff --check`が成功。Rustのビルド・単体・通信・終了試験は修正後のCIで確認する。新しい実機・ブラウザーの受入は実施していない。

## 2026-10-25 — Documentsの作業場所への集約と未反映資料の整理

- ユーザーの依頼により、通常の作業場所を `<リポジトリ>` に統一し、開発手順へ記載した。mainをリモート最新へ早送りし、先のREADMEサムネイル変更も取り込んだ。
- 未コミットの実機記録と未追跡の実装計画は、mainに同じ内容があることを照合して重複を解消した。未追跡のPC画面監査は、当時の計画である旨と現行資料への参照を追加して保存した。
- 旧画面ギャラリーとZIPは、作業環境固有の参照を含む旧資料のため公開せず、Git対象外の `data/local/cleanup-2026-10-25/` へ移動した。
- `.venv`配下の旧作業ツリー7件を整理した。未反映ファイル618件（335件・283件）はコピー後のバイト一致を確認し、差分・元コミット・ブランチ・ファイル一覧とともに同じローカル保管先に退避した。古い版の製品コードを現行mainへ上書きせず、既存ブランチとコミット履歴は保持した。旧プレビューサーバーと専用起動シェルは終了した。
- 先のREADME差し替え用の管理作業ツリーもアーカイブし、`git worktree list` でDocumentsの主作業ツリーのみになったことを確認した。
- `node scripts/sim/check-static-pages.mjs`：4画面すべて構文OK。`python scripts/verify_overlay.py`：必須30ファイルの確認に成功。`git diff --check`：成功。製品コードの追加編集・新しい実機試験は行っていない。

## 2026-10-25 — 代表的な型での分担の確認（Claude Code、#105の残り）

- #105の完了条件のうち「代表的な型で1〜4人の分担が規則どおりに作られる」「操作の数・重みの表で偏りを確かめる」が残っていたため、主要500タイトルの定義から型ごとに「good」の1本を選んで確かめた：FPS（Apex Legends）、3Dアクション（Marvel Rivals）、プラットフォーマー（Cuphead）、見下ろし型（The Binding of Isaac: Rebirth）、レース（Forza Horizon 6）。いずれも`template`（未検証の定義）。
- `profiles::representative_tests`を追加した。規則（人数分の担当、重複・漏れなし、メニューを配らない、操作が人数以上なら全員に担当、最初の単位がP1）と、偏り（最も重い人が分けられない単位1つだけを持つか、平均の1.5倍以下）を5本×1〜4人で確かめる。表は`cargo test --release --locked representative_assignment_table -- --ignored --nocapture`で出力し、`docs/game-profile-specification.md`に載せた。
- `cargo test --release --locked`はホスト32件成功（表の出力1件は手動実行のため除外）＋プローブ3件成功。5本×1〜4人のすべてで規則と偏りの判定を満たした。分担の算出（`assignment_for`）は変えていない。
- 観察：4人のプラットフォーマーでは定義が1つの部分とした「ジャンプ・上下」が、FPS・3Dアクションの3〜4人では分け方のない移動が最も重い。移動を分けるかは実機の負担を見て決める（#58）。分担の案の確認であり、操作の互換性の検証ではない。

## 2026-10-25 — 入力の初期値をONにし、手動でONにする手順をなくす（Claude Code、#114）

- `config.json`の`injectMode`の省略時の初期値を`off`から`on`にした（`on`の送信条件＝協力プレイ中で対象のゲームが前面、は変えない）。準備の理由は「入力が止まっています（緊急停止など）。PCの画面で『入力を再開する』を押してください」と「対象のゲームを前面にしてください」に分けた（[入力の初期値](../decisions/2026-10-25-input-default-on.md)）。
- PC画面：準備・Ready・一時停止の画面で入力がOFFのときだけ「入力を再開する」を開始ボタンの位置に出す。操作設定のOFF/ONは「入力の一時停止（診断・緊急用）」の中へ移し、手順の文言から「入力をONにする」を外した。
- `cargo build --release --locked`成功。`protocol-sim.mjs`（Rust dry-run）46/46：「進行」の試験を、初期値がONで手動のONなしに準備後のReadyができること、OFFにするとReadyできず理由が「入力を再開する」を案内し、ONに戻すとReadyできることに書き換えた。`--target node` 20/20、`app-view-test.mjs` 27/27、`ui-input-test.mjs` 8/8、`phone-view-test.mjs`、`controller-diagnostics-test.mjs`、`shutdown-sim.mjs`、`static-assets-sim.mjs`、`verify-ui-evidence.mjs`、`check-static-pages.mjs`が成功した。
- 撮影用のスクリプトからdry-runホストを起動し、模擬スマホ3台で協力プレイにして標準入力から緊急停止を送った。PC画面が一時停止になり「入力を再開する」と案内が出て、押すと`canResume`が真になりボタンが消えることを、ヘッドレスChromeで確認した。マージ後のmainでは`confirm_lineup`に`epoch`が必要（6e2ba09）で、付けずに送った最初の撮影は決定が受け付けられなかった（ホストの挙動は正しい）。
- PCアプリ・Minecraftでの実機確認は未実施。

## 2026-10-25 — Node参照実装を削除し、Rust版だけの構成にする（Claude Code、#86）

- `apps/node-ref/`を削除した（手元の`node_modules`も削除）。`protocol-sim.mjs`から`--target node`と`rustOnly`の区別を外し、Node版との分岐はRust版の側だけを残した（試験の件数は46件のまま）。`rust.yml`からNode参照実装の準備と比較の手順を外し、`setup-node`の依存キャッシュ（`apps/node-ref/package-lock.json`）もやめた。試験スクリプトは依存なしのNodeで動く（製品には含まれない）。
- `ui-preview.mjs`がNode参照実装の`ws`パッケージを借りていたため、依存なしの最小のWebSocketサーバー`scripts/sim/mini-ws.mjs`（テキスト・バイナリのフレーム、ping/pong、close）に置き換えた。起動して接続し、`welcome`・`state`・`game`・`pong`の受信を確認した。
- `allow-firewall.ps1`の`-Program`省略時の既定をRust版ホストに、`verify_overlay.py`の必須ファイルからNode参照実装を外した。`AGENTS.md`・`tech-stack.md`・`protocol.md`・`SETUP_WINDOWS.md`・`apps/host-rs/README.md`・`artifacts/improved-ui/README.md`を更新した（過去の記録のBUILD_LOG・判断記録は当時のまま）。
- `protocol-sim.mjs`（Rust dry-run）46/46、`shutdown-sim.mjs`、`app-view-test.mjs` 27/27、`ui-input-test.mjs` 8/8、`phone-view-test.mjs`、`controller-diagnostics-test.mjs`、`check-static-pages.mjs`、`static-assets-sim.mjs`、`verify-ui-evidence.mjs`、`profile-extract-test.mjs`、`profile-catalog-test.mjs`、`input-probe-sim.mjs` 12/12、`python scripts/verify_overlay.py`が成功した。

## 2026-10-25 — 試作品の名残の整理（Claude Code、#115・#116・#117）

- #115：`config.json`の`requiredPlayers`と`required`メッセージを廃止し、診断画面の「必要人数1/2/3」と効かない「協力プレイ」ボタンを外した。Rust版のビルドで出ていた`field required_players is never read`の警告が消えた。
- #116：`command: START`（PREPAREの別名）と`game.canStart`を削除し、ホストの関数名を`can_ready`にした。`protocol-sim.mjs`の`START`は`PREPARE`に置き換えた。PC画面から使われていない`startView`・`phaseView`とその試験6件を削除し、操作設定の手順を今の開始手順に合わせた。通信契約の版はv4のまま（使っていた画面がないため）。
- #117：構造チェックは残し、説明と必須ファイル（操作定義・一覧・操作定義の文書を追加）を今の構成に合わせた。`ISSUE_PLAN.md`は現役の文書のため必須のまま。判断は[試作品の名残の整理](../decisions/2026-10-25-prototype-cleanup.md)。
- `cargo build`・`cargo test --release --locked`（ホスト32件＋表の出力1件は手動、プローブ3件）成功。`protocol-sim.mjs`（Rust dry-run）46/46、`shutdown-sim.mjs`、`app-view-test.mjs` 21/21、`ui-input-test.mjs` 8/8、`phone-view-test.mjs`、`controller-diagnostics-test.mjs`、`check-static-pages.mjs`、`static-assets-sim.mjs`、`verify-ui-evidence.mjs`、`profile-extract-test.mjs`、`profile-catalog-test.mjs`、`input-probe-sim.mjs` 12/12、`python scripts/verify_overlay.py`（32件）が成功した。

## 2026-10-26 — 認識できたゲームなら未検証の定義でも開始できるようにする（Claude Code、#123）

- ユーザー判断「どのゲームでも認識できていればおそらく問題ない」に基づき、Readyを確認の状態（reviewed・device）で制限するのをやめた（[決定](../decisions/2026-10-26-start-any-game.md)）。同梱502本のうち開始できたのはMinecraftだけだった。分担できる操作がない定義（マウス操作だけの`pointer`型）は、理由を表示して開始させない。
- 定義のない検出したゲームに、3Dアクション型と同じ操作の汎用の定義（`profiles::generic`、id `generic`、template）を当てる。以前は定義のないゲームを3人で遊ぶとMinecraftの固定のキーの表で送っており、通信の試験（ゲーム一覧の試験の模擬Epicゲーム）もその経路で通っていた。固定の表はMinecraftの3人と診断用の疑似ゲームだけで使う。
- PC画面・スマホの案内を「未検証。操作が届くか確かめながら遊んでください」「操作定義がないため、一般的な操作（WASD・マウス）で試します」「マウス操作が中心のため、スマホで分担できる操作がありません」に分けた。
- `cargo test --release --locked`はホスト34件（汎用の定義・マウス操作だけの定義の試験を追加）＋プローブ3件成功。`protocol-sim.mjs`（Rust dry-run）46/46：ゲーム一覧の試験を、未検証の定義でReadyできること、定義のないゲームが汎用の定義になりMinecraftの操作名（FWD・USE）は送らず汎用の操作（`act:forward`→W、`act:aim`→右クリック）だけを送ること、に書き換えた。`app-view-test.mjs` 21/21、`phone-view-test.mjs`、`ui-input-test.mjs` 8/8、`controller-diagnostics-test.mjs`、`shutdown-sim.mjs`、`check-static-pages.mjs`、`profile-catalog-test.mjs`が成功した。
- 実際のゲームでの入力の到達は未確認（#61）。

## 2026-10-26 — ゲーム一覧を横3列の正方形のタイルにする（Claude Code、#121）

- PR #124（#123）の上に積んだ。ゲーム一覧を、画像を大きく・下に小さくタイトルの横3列の正方形のタイルにした（[決定](../decisions/2026-10-26-game-tiles.md)）。画像はSteamのライブラリの画像のキャッシュから、縦長（`library_600x900.jpg`・`library_capsule.jpg`）を優先し、なければ横長（`header.jpg`・`library_header.jpg`）。1段下のフォルダも見る。ない項目は頭文字。
- ホストは検出時に画像の場所を表に持ち、`GET /api/game-image?id=<項目ID>`でPC本体からの要求にだけ返す（場所は受け取らない）。`state.games`に`image`の有無を足した。選択画面では左右で隣・上下で1行動くようにし、画面の前後はEnter・Escにした。
- #109（PR #111）で起動案内のCSSを消したとき、「安全案内の表示中は一覧の枠の下を空ける」指定も誤って消していたので戻した。最初の撮影では、タイルに`overflow: hidden`を付けたことで行が枠の高さに詰め込まれ、画像が細い帯になったため、行の高さを中身に合わせた（`grid-auto-rows: max-content`）。新しいSteamのファイル名（`library_capsule.jpg`・`library_header.jpg`）に対応して、画像の出る項目が12本中8本から11本になった。
- `cargo test --release --locked`はホスト34件（画像の検出の試験を拡張）＋プローブ3件成功。`protocol-sim.mjs`（Rust dry-run）46/46：一覧の`image`の有無、`/api/game-image`が一覧の項目IDで画像を返し、画像のない項目・知らないID・パスを含むIDは404を返すことを足した。`app-view-test.mjs` 21/21（3列の移動、画像のURL・頭文字の試験に書き換え）、`ui-input-test.mjs` 8/8、`phone-view-test.mjs`、`controller-diagnostics-test.mjs`、`shutdown-sim.mjs`、`check-static-pages.mjs`、`static-assets-sim.mjs`、`verify-ui-evidence.mjs`、`verify_overlay.py`が成功した。
- dry-runのホスト（実際のSteamを検出）とヘッドレスChromeで、1920×1080と1280×720の一覧を撮影した。13タイル（Minecraft＋Steam 12本）中11本に画像、右・下キーで1行下の項目へ動き、安全案内と重ならず、はみ出しもないことを確認した。PCアプリ（WebView2）・スマホのリモコンでは未確認。

## 2026-10-26 — PCアプリを必ず参加画面から始める（Claude Code、#126）

- ユーザーの指摘：PCアプリを起動すると、人数対応より前の「3人で操作を分担」の古いUIが出る。原因は、`desktop.js`が最後に開いた画面を`localStorage`（`recooplay.app`）に保存して起動時に復元していたことと、誰もつながっていない分担の画面がMinecraftの基本の3人分担を見せる作り（#110）だったこと。
- 起動時は保存した画面を使わず参加画面（QR）から始め、以前の版が保存した値は消す。誰もつながっていないときは分担の画面に列を出さず「参加者を待っています」と表示し、HTMLの見出しの既定の文言からも「3人で」を消した。
- `app-view-test.mjs` 21/21、`ui-input-test.mjs` 8/8、`phone-view-test.mjs`、`check-static-pages.mjs`が成功。起動中のホスト（作業中のファイルを配信）をヘッドレスChromeで開き、`recooplay.app`に`{screen:'roles'}`を保存してから読み直すと参加画面（`data-view=join`）から始まり保存値が消えること、誰もいない分担の画面の見出しが「参加者を待っています」で列が0であることを確認した。
- 追記（#128の一部を先に対応）：東方風神録（appid 1100140）は、Steamの画像のキャッシュが言語名付きの名前（`library_600x900_japanese.jpg`・`header_japanese.jpg`）だけで見つからなかった。決まった名前がなければ`<名前>_<言語>.jpg`（言語は英小文字）を使うようにした。`cargo test`はホスト35件（言語名付きの試験を追加）成功。実際のSteamでの撮影で、画像の出る項目が12本中11本から12本になった（頭文字はMinecraftだけ）。

## 2026-10-26 — ホストのタッチパッドで2本指のスクロール（Claude Code、#122）

- スマホのタッチパッドが1本目の指だけを追っていたため、2本目の指を受け付けるようにした。2本指を動かすと`kind:scroll`（ナチュラルな向き、最大30Hz）を送り、操作中はカーソルを動かさない（2本目が触れたら未送信の移動は捨てる）。2本指で軽くタップすると右クリック。3本目以降は無視する。
- ホストは、ゲームが前面のときスクロール量に合わせてホイールを1〜3段（40pxで1段）送るようにした（以前は量に関係なく1段）。記録（`remote_input`）に段数を残す。PC画面が前面のときは従来どおりPC画面をスクロールする。
- `ui-input-test.mjs` 9/9（2本指のスクロールの向き・量、1本離しても両方離すまでスクロール、動かした後はクリックしない、2本指タップで右クリック、3本目の無視）、`protocol-sim.mjs`（Rust dry-run）46/46（ゲームが前面のときのスクロール100px→-3段、-30px→1段）、`app-view-test.mjs` 21/21、`phone-view-test.mjs`、`controller-diagnostics-test.mjs`、`check-static-pages.mjs`が成功した。スマホ実機での操作感は未確認。

## 2026-10-26 — 検出したゲームと画像をセットで取得し、Minecraftにも画像を付ける（Claude Code、#128）

- PR #127（#126）の上に積んだ。画像の取得元を、ランチャーの画像（Steam、言語名付きを含む）→ Xbox・Store版のアプリのマニフェストのロゴ（最大の版、ハイコントラスト用は除く）→ 実行ファイルのアイコン（Windowsのシェルで最大256pxを取り出し、依存なしで無圧縮のPNGにして一時フォルダへ）→ 頭文字、の順にした。Epicはマニフェストの`LaunchExecutable`（インストール先の外を指す値は使わない）のアイコン。
- Minecraftのランチャー（各ドライブの`XboxGames\Minecraft Launcher\Content\Minecraft.exe`、旧版の`Program Files (x86)\Minecraft Launcher`）を探し、見つけたら一覧の先頭のMinecraftに画像を付ける。一覧（`games`）には混ぜず（入力先・手動起動はそのまま）、`state.minecraft`（`detected`・`image`）で知らせる。見つからなくても「手動で起動」の項目として残す。
- 最初はXbox版の`Minecraft.exe`のアイコンを取り出したが、汎用のアプリのアイコンになった（この実行ファイルはアイコンを持たない）。マニフェストのロゴを先に見るようにし、256pxのロゴになった。途中、撮影用のChromeの作業フォルダを使い回したため、10分間のキャッシュで前の画像が出続けたことがあった。再検出で画像が変わっても古い画像を出さないよう、`/api/game-image`を保存させない（`no-store`）にした。
- `cargo test --release --locked`はホスト39件（PNGの構造、マニフェストのロゴの選び方、インストール先の外を指す実行ファイルの拒否、Windowsのアイコンの取り出し（explorer.exe）を追加）＋プローブ3件成功。`protocol-sim.mjs`（Rust dry-run）46/46：模擬のMinecraftランチャーの検出（`games`に入らず`minecraft.image`が真）、`id=minecraft-java`の画像（PNG・`no-store`）を追加した。`app-view-test.mjs` 21/21、`ui-input-test.mjs` 8/8、`phone-view-test.mjs`、`controller-diagnostics-test.mjs`、`shutdown-sim.mjs`、`check-static-pages.mjs`、`static-assets-sim.mjs`、`verify-ui-evidence.mjs`、`verify_overlay.py`が成功した。
- 開発PC（Steam 12本・Xbox版のMinecraftランチャー）の実際の検出をヘッドレスChromeで撮影し、Minecraft（Creeperのロゴ）・東方風神録を含む13タイルすべてに画像が出ることを確認した。Epicのゲームがないため、Epicの実行ファイルのアイコンは実機で未確認。

## 2026-10-26 — PR #129・#130のレビューと誤クリック修正（Codex）

- #129の画像取得・画像配信のパス制限と、#130の2本指の状態遷移・キャンセル・P1の認可・epoch照合をレビューした。#129のhead `a47c6b7`に対するCI（40209837404／40209837393）は全項目成功。ローカルの `node scripts/sim/app-view-test.mjs`21/21と `check-static-pages.mjs`、既存の `recooplay_host-570d8e9e803d4f7e.exe games::tests`13件（ロゴ・PNG・外部パス拒否・Windowsアイコン等）も成功し、#129をmainへsquashマージした（`f29893a`、GitHubのmerged: trueを確認）。新しいゲーム実機・WebView2確認はしていない。
- #130で、スクロール後に片指を残してもう片方を置き直すと、distanceと開始時刻がリセットされ、最後の解放で意図しない右クリックが1回発生することをNodeのPointer Events模擬検証で再現した。2本指スクロールを継続中は履歴を保持し、両指を離した後だけ新しい操作として初期化するよう修正した。置き直しと2本指キャンセルでクリックしない回帰試験を追加した。
- #129マージ後のmainを#130へ取り込み、BUILD_LOGの両方の記録を保持して競合を解消した。修正後の `node scripts/sim/ui-input-test.mjs`10/10、`app-view-test.mjs`21/21、`phone-view-test.mjs`、`controller-diagnostics-test.mjs`、`check-static-pages.mjs`、`static-assets-sim.mjs`（33ファイル）、`git diff --check`が成功した。
- 修正前の#130で `node scripts/sim/protocol-sim.mjs`46/46も成功していたが、#129との統合後のRustビルド・単体・通信の根拠は修正後のCIで別途確認する。ローカルでRustは再ビルドしていない。作業開始時の未コミットBUILD_LOGはstashへ保持している。

## 2026-10-26 — 協力プレイ中の低遅延の動作とBluetoothの注意（Claude Code、#131）

- ユーザーの切り分け：PC・スマホともBluetooth OFFは問題なし、PCのBluetoothイヤホンで音を流すと途切れる。ログ（`session-2026-10-25T15-01-40-315Z`）では、ホストのタッチパッドの移動（通常約30msごと）が約0.4秒ごとに200〜400ms止まってまとめて届き（540件中200件が同時着、最大1.3秒）、P1のWebRTCの`failed`も最大の空白の最中だった。開発PCのWi-FiとBluetoothは一体の部品（MediaTek MT7922）、Wi-Fiの受信39%。
- 準備〜一時停止の間だけWi-Fiのメディアストリーミングモードを有効にし、ロビーで戻すようにした（`netwatch.rs`、PCの設定は書き換えない）。既定の音の出力先がBluetoothかを5秒ごとに調べ、PC画面に注意を出す。受信の途切れ（150ms以上の空白の直後に3件以上が10ms以内）を数え、10秒ごとに往復時間とともにログ（`net`）に残し、直近10秒に3回以上のスマホがあればPC画面に注意を出す（[決定](../decisions/2026-10-26-network-stability.md)）。
- 開発PCで、メディアストリーミングモードの有効化・解除が管理者権限なしに成功すること、既定の出力先「ヘッドホン (COTSUBU Patra BK)」を列挙元`BTHENUM`からBluetoothと判定することを確認した（一時的な試験。確認後に削除）。dry-runではない実際のホストを別のポートで起動し、起動後数秒で`network.bluetoothAudio`が真になりログに`bluetooth_audio`が残ることを確認した（ロビーのまま、入力は送っていない）。
- `cargo test --release --locked`はホスト40件（途切れの数え方の試験を追加）＋プローブ3件成功。`protocol-sim.mjs`（Rust dry-run）47/47：ロビーでは低遅延の動作が無効・協力プレイで有効、試験用の`bt on/off`でPC画面への知らせが切り替わる、枠ごとの途切れの数がある、を追加した。`app-view-test.mjs` 22/22（通信の注意）、`check-static-pages.mjs`が成功した。
- 途中、シェルのヒアドキュメント経由でスクリプトに書いた`\n`が実際の改行になり、試験のファイルが構文エラーになった。Writeツールで書いた修正スクリプトで直した。
- メディアストリーミングモードで途切れがどれだけ減るかは、実機での比較が必要（未確認）。

## 2026-10-26 — 無線が不安定な端末の診断と案内（Claude Code、#70）

- PR #134（#131）の上に積んだ。PCの「操作設定」に「通信の診断」を追加し、つながっているスマホごとに経路・往復時間（平均・95%）・受信の途切れ・再接続の回数と、状態（良好・注意・不安定）、対処の案内を出す（`slotDiagnosis`）。スマホの接続・診断の画面にも、自分の往復時間・未応答の数・経路から案内を出す（`phoneAdvice`）。設定は変えず、案内だけ。判定の閾値は[決定](../decisions/2026-10-26-network-stability.md)に記録した。
- `app-view-test.mjs` 23/23（診断の判定と案内）、`phone-view-test.mjs`、`controller-diagnostics-test.mjs`（`phoneAdvice`を試験の環境に追加）、`ui-input-test.mjs` 10/10、`check-static-pages.mjs`が成功した。
- dry-runのホストに、往復時間の統計の違う模擬スマホ2台をつなぎ、`bt on`の状態でPC画面を撮影した。P1は「注意（WebRTCが使えていない）」、P2は「注意（応答の遅れ・WebRTC）」、Bluetoothの案内が出ることを確認した。案内の効果は端末ごとに実機で測る必要がある（未実施）。

## 2026-10-26 — 参加画面で接続QRと参加QRを並べる（Claude Code、#133）

- PR #135（#70）の上に積んだ。Wi-Fiの情報が取れるとき、参加画面に「① Wi-Fiにつなぐ」「② 参加する」の2つのQRを並べる。ホットスポットがOFFなら①の位置に「ホットスポットをONにする」ボタンを出す（[決定](../decisions/2026-10-26-join-qr-card.md)）。
- ホストはWindowsのモバイルホットスポットの設定（SSID・パスフレーズ・ON/OFF）をWinRTで読み、読めなければ`config.json`の`wifi`を使う。Wi-Fiの情報は`/api/info`でPC本体にだけ返すようにした（以前はLANの端末にも返していた）。`POST /api/hotspot`を追加し、PC本体かつOriginがPCの画面と一致する要求だけでONにする。dry-runでは本物を読まず`RECOOPLAY_FAKE_HOTSPOT`を使う。
- 開発PCで実際のホストを別のポートで起動し、PC本体からはホットスポットのSSIDとWi-FiのQRが取れ（OFF）、LANのアドレスからは`wifi`・`hotspot`が`null`、別のOriginからのON要求が403になることを確認した（パスフレーズは表示していない。ONにする操作はしていない）。
- `protocol-sim.mjs`（Rust dry-run）48/48：PC本体へのWi-Fiの情報、LANのアドレスからの取得・ON要求の拒否、Originなし・別Originの拒否、PCの画面からのON要求の受け付けを追加した。`app-view-test.mjs` 24/24（案内の形）、`ui-input-test.mjs` 10/10、`check-static-pages.mjs`が成功した。模擬のホットスポットのON・OFFで参加画面を撮影し、ボタンの文字の折り返しと、押した結果が毎秒の再描画で消える問題を直した。
- スマホが①→②で参加できるかは、スマホ実機で未確認。

## 2026-10-26 — ゲームの手動登録（Claude Code、#49・#56）

- PC画面のゲーム一覧に「＋ 追加」「名前を変更」「登録を解除」を加えた。「＋ 追加」はホストがWindowsのファイル選択の画面を出し、PCの前の人が`.exe`を選ぶ（[決定](../decisions/2026-10-26-manual-game-registration.md)）。存在する絶対パスの`.exe`だけを受け付け、引数なしで起動する。登録は`%LOCALAPPDATA%\Re-Cooplay\manual-games.json`に保存し、一覧には「手動登録」「未検証」と出す。
- 登録・変更・解除はPC本体の画面からだけ。dry-runではファイル選択の画面を出さず、`RECOOPLAY_FAKE_PICK`のファイルに書いた場所を選んだことにする。
- `cargo test` 41件成功（登録の保存・読み込み、`.bat`・相対パス・存在しない場所の拒否を追加）。`protocol-sim.mjs`（Rust dry-run）49/49：スマホからの登録・解除の無視、`.bat`の拒否、キャンセル、登録と一覧への表示（実行ファイルの場所を画面へ渡さない）、二重登録の拒否、名前の変更（制御文字の除去）、解除、ログに名前・場所を残さないことを追加した。`app-view-test.mjs` 25/25、`ui-input-test.mjs` 10/10、`check-static-pages.mjs`・`static-assets-sim.mjs`・`verify-ui-evidence.mjs`が成功した。
- メモ帳を登録した模擬の一覧を撮影し、画像（実行ファイルのアイコン）・印・ボタン・名前の変更の画面を確認した。実際のファイル選択の画面と、登録したゲームの起動・入力は未確認。

## 2026-10-26 — PR #134〜#137のレビューと手動登録の入力先修正（Codex）

- #134の低遅延モードの寿命と通信観測、#135の診断と案内、#136のWi-Fi情報のループバック限定とホットスポット開始のOrigin照合を確認した。各headのCIは全項目成功（#134: 40214273085／40214273036、#135: 40214649894／40214649952、#136: 40215277646／40215277619）。先行3件を依存順にmainへ通常mergeし、`19a84fd`・`2333633`・`f01b233`のmerged: trueを確認した。無線・Bluetooth・ホットスポットの実設定は操作していない。
- #137では、手動登録したexeの親フォルダー全体を入力先としていた。System32等の共有フォルダーの別exeも許可されるため、手動登録だけは選択したexeの完全パスで照合するよう修正した。別フォルダーの同名exeと同じフォルダーの別exeは拒否し、Windowsの区切り・大文字小文字・拡張長パス表記を正規化する。画面への入力先説明は一般名とし、exeの場所を含めない。
- 対象照合のRust単体試験と、手動登録を選択した後の状態にもパスを出さない通信回帰試験を追加した。ランチャーから別exeが起動する場合は実際に操作するexeを登録する方針を判断記録へ反映した。mainの先行3件とREADME更新を#137へ取り込んだ。
- ローカルの `node scripts/sim/app-view-test.mjs`25/25、`ui-input-test.mjs`10/10、`phone-view-test.mjs`、`controller-diagnostics-test.mjs`、`check-static-pages.mjs`、`static-assets-sim.mjs`（33ファイル）、`git diff --check`が成功した。Rustの修正後ビルド・単体・通信試験は最新コミットのCIで確認する。ローカルのRust再ビルドや新しい実機試験は行っていない。
- 作業開始時の未コミットBUILD_LOGはstashへ保持している。関連Issueはクローズしていない。

### PR #137の通信試験の前提整理

- head `00a5a96`のCIで、Rustのビルド・単体試験と手動登録の追加チェックは成功したが、通信試験は48/49だった。追加したゲーム選択がlobbyへ戻したため、後続のEND試験がpausedを前提として待ち続けたことが原因だった（ジョブ121239895095）。入力先制限の製品コードの失敗ではない。
- END試験を手動登録試験の前へ移し、緊急停止後のpausedから実際にENDでlobbyへ移る試験として保持した。手動登録を選択した後の入力先・パス非公開チェックも保持し、49件の確認範囲は減らしていない。最新headのCIで再確認する。

## 2026-10-26 — Minecraft専用の文言を選んだゲームの名前に（Claude Code、#140）

- 実機テスト（Outlast）で、Minecraft以外のゲームでも「Minecraftを前面に」「ワールドを準備」と出ていた。PC画面の注意・準備中の案内・前面化ボタン・入力の説明、スマホのリモコンの案内・前面化ボタン・前面でないときの注意・Readyの説明、ホストの準備の案内を、選んだゲームの名前（`game.titleName`、なければ「ゲーム」）で出すようにした。「ワールドを準備」は「プレイ中の画面まで進める」にした。
- Minecraftを選んだときは名前が「Minecraft」になり、意味は変わらない。権利表記、一覧のMinecraftの項目と手動起動の手順、試験用の`game.html`は残した。
- `app-view-test.mjs` 25/25（Outlastの準備中・協力プレイ中の注意）、`phone-view-test.mjs`（Outlastを選んだときにスマホの案内へ「Minecraft」「ワールド」が出ないこと）、`controller-diagnostics-test.mjs`・`ui-input-test.mjs` 10/10・`check-static-pages.mjs`・`static-assets-sim.mjs`・`verify-ui-evidence.mjs`、`protocol-sim.mjs`（Rust dry-run）49/49が成功した。実機での表示は未確認。

## 2026-10-26 — どのゲームでも移動をスティックに（Claude Code、#139）

- 実機テスト（Outlast）で、Minecraft以外のゲームの移動が十字ボタンで、P1が前進を252回押し直していた。スティックの処理を共通の部品（`scripts/stick.js`）にし、操作定義から作る画面でも、前後左右の操作が2つ以上ある人には十字ボタンの代わりにスティックを出すようにした。斜めは2方向を同時に押し、定義にない方向（前進・後退だけのゲームの左右など）には反応しない。Minecraftの3人用の専用画面も同じ部品を使う。
- 画面の作り直し・切断・一時停止・指のキャンセルでは、これまでのスティックと同じく押していた方向をすべて離す（作り直すときは前のスティックを離してから置き換える）。
- `ui-input-test.mjs` 11/11（定義の画面でスティックを作り、方向ごとの操作を渡すこと、斜めの同時押し、ない方向に反応しないこと、作り直しで離すこと）、`phone-view-test.mjs`・`controller-diagnostics-test.mjs`・`check-static-pages.mjs`・`static-assets-sim.mjs`・`verify-ui-evidence.mjs`、`protocol-sim.mjs`（Rust dry-run）49/49が成功した。
- dry-runのホストとヘッドレスChrome（スマホの大きさ）で、Outlastを選んだP1の画面にスティックが出ること、右上に倒すとホストに`act:forward`と`act:right`が同時に届き、離すと両方離れることを確認した。実機のスマホでの操作感は未確認。

## 2026-10-26 — Minecraftの3人用の専用画面をやめる（Claude Code、#141）

- ユーザーの判断で、Minecraftを3人で遊ぶときだけ使っていた専用のスマホ画面と固定の分担の表をやめ、どのゲーム・人数も操作定義から作る画面にそろえた（[決定](../decisions/2026-10-26-unify-controls.md)）。PR #143（#139）の上に積んだ。
- ホスト：`fixed_controls`と`game.fixedControls`を廃止し、協力プレイ中は`act:<ID>`だけを受け付ける。視点は分担で割り当てた人だけ。疑似ゲーム画面にMinecraftと同じ定義を持たせた（`builtin_pseudo`）。分担できる条件のMinecraftの特別扱いをやめた。枠の呼び名は「ホスト」「参加者」。
- 画面：スマホの`v-P1`〜`v-P3`と専用のスティック、PC画面の固定の分担の説明・キーの見本と`usesFixedRoles`・`keyLabel`・`roleControls`を削除した。視点のパッドと感度は置き場所（`#lookHome`）から担当者の画面へ移す。
- `cargo test` 42件成功（Minecraftの3人の分担がこれまでの固定の分担と同じであることを追加）。`protocol-sim.mjs`（Rust dry-run）49/49：試験の送り口で、協力プレイ中はMinecraftの操作の呼び名を定義の操作に読み替え、固定の操作名を拒否する試験は読み替えずに送る。3人の分担が固定の分担と同じであることを追加した。`shutdown-sim.mjs`、`app-view-test.mjs` 25/25、`phone-view-test.mjs`、`ui-input-test.mjs` 11/11、`controller-diagnostics-test.mjs`、`profile-extract-test.mjs`、`profile-catalog-test.mjs`、`input-probe-sim.mjs` 12/12、`check-static-pages.mjs`、`static-assets-sim.mjs`、`verify-ui-evidence.mjs`、`verify_overlay.py`が成功した。
- dry-runのホストとヘッドレスChrome 3台（スマホの大きさ）で、Minecraftの3人がそれぞれ移動（スティック・ジャンプ・スニーク・ダッシュ）、視点（パッド・感度）、攻撃・使う・持ち物の画面になることを撮影して確認した。実機のMinecraft・3人での操作は未確認。

## 2026-10-26 — 自動前面化の引き継ぎ（Codex、#138）

- Claudeの最終セッション記録で作業停止と未コミットの#138を確認し、引き継いだ。coopへ入った後の前面化は開始条件の前面チェックを通れず到達しないため、開始要求の可否と入力許可を分け、停止した状態で前面化・実際の対象照合を行ってからcoopへ進むよう修正した。前面化拒否時は停止を保ち手動切替を案内し、自動復帰の再試行を解除する。
- `app-view-test.mjs`25/25、`phone-view-test.mjs`（前面ボタンと拒否案内を追加）、`ui-input-test.mjs`11/11、`controller-diagnostics-test.mjs`、`verify-ui-evidence.mjs`、`profile-catalog-test.mjs`、`static-assets-sim.mjs`（34ファイル）、`check-static-pages.mjs`、`git diff --check` が成功。前面化の成功・拒否をOS操作なしに差し替える通信試験を追加した。Rustの再ビルド・単体・通信試験は続けて実施し、結果を追記する。
- Windowsの実ウィンドウとスマホでのReady・再開・前面化拒否は未検証で、#138は実機受入まで未完了とする。無線・ファイアウォール設定は変更していない。
- ClaudeのPR #142〜#144は差分・入力解放・サーバー認可をレビューし、各headのRust・構造CI成功を確認して順にmainへマージした（61ce70b、bf14a63、9902c4a）。実機未検証の条件は引き継ぐ。

## 2026-10-26 — Windows配布zipの自動検証（Codex、#145）

- 配布物に版・commit・未コミット変更の有無と全ファイルのSHA-256を記録し、zipの照合値を出力する。Windows CIで同じチェックアウトから両exeをビルドし、梱包・検証後に成果物として保存する。利用者向けの安全案内も選択したゲームに合わせた。
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/windows/package.ps1 -Out dist/issue145-local` が成功（10.3MB）。`node scripts/sim/package-smoke.mjs dist/issue145-local/ReCooplay-0.1.0-windows-x64.zip` は、全同梱物・画面・操作定義・ハッシュ照合、欠落と改変の拒否、リポジトリ外の展開先ホストによる全静的ファイルの配信と正常終了・終了ログ確認が成功した。既存のローカルexeを使用し、OS入力はdry-runで無効にした。
- 開発環境のないPC・Tauri実画面・スマホ3台の受入は未実施（#41）。PCの無線・ファイアウォール設定は変更していない。通信設定を変更・復元するインストーラーは #132 に残す。

## 2026-10-26 — 配布時のVC++ランタイム案内（Codex、#148）

- 既存のホストexeをMSVCの `dumpbin /dependents` で読み取り、`MSVCP140.dll`・`VCRUNTIME140.dll`・`VCRUNTIME140_1.dll`への依存を確認した。配布READMEにVC++ v14 x64ランタイムと公式の導入先、オフラインPCへの事前準備を追記した。ランタイムの自動導入やPC設定の変更は行わない。
- PCアプリはホストの終了コード`0xC0000135`（DLL不足）をポート使用中から区別し、VC++ランタイムと配布ファイルの不足を案内する。起動直後に別プロセスのポートへ接続した場合も同じ終了理由を表示する。
- `cargo test --release --locked --offline --manifest-path apps/desktop/Cargo.toml` が成功（DLL不足と他の終了理由の区別1件）。CIにもこの試験を追加した。配布検証スクリプトの既定zip名はtauri.conf.jsonの版から作り、版更新時も検証対象を一致させる。
- Microsoftの[公式ランタイム案内](https://learn.microsoft.com/cpp/windows/latest-supported-vc-redist)で、対象アーキテクチャとビルドに使用したMSVC以上の版が必要なことを確認した。開発環境のないPCとランタイム未導入PCの実画面での試験、インストーラーでの必要条件チェック・導入は未実施で、#148を未完了として残す。
- #145のCI（head 9f16919、run 40225280916）は、両exeのビルド・全試験・zip作成・展開後dry-run・成果物保存まで成功した。PR #146をmainへマージした（90c3900）。
- 最終ローカル確認：ホストの `cargo build --release --locked --offline --manifest-path apps/host-rs/Cargo.toml` が成功（再試行19秒）。`cargo test` はホスト42件＋プローブ4件成功（手動の表出力1件を除外）、更新時刻を確認したexeで `protocol-sim.mjs` が50/50成功した。初回はビルド完了前に旧exeで試験を起動して更新を妨げたため、旧exeの49/50とビルド失敗は合格根拠に使用していない。OpenSSLのPDB不足の既知の警告は残る。
- PCアプリの `cargo build --release --locked --offline --manifest-path apps/desktop/Cargo.toml` が成功。両exeを再ビルドした後に `package.ps1 -Out dist/issue148-final` でzipを作成し、`node scripts/sim/package-smoke.mjs dist/issue148-final/ReCooplay-0.1.0-windows-x64.zip` の全照合・欠落改変拒否・リポジトリ外での全静的画面配信と正常終了が成功。ローカルの既存記録が未コミットのためmanifestはdirty=true。

## 2026-10-26 — キー名を主表示にする（Codex、#150）

- ユーザーの指摘と明示選択「送るキー名を中心にする」を受け、操作ボタンとPC・スマホの分担確認を「左クリック」「Eキー」「ホイール」「マウス移動」等の実際の入力名へ統一した。見出しも入力種類から作り、ゲーム内の「攻撃」「持ち物」等の意味を流用しない。操作IDと入力の送信処理・分担は従来どおり。
- リモコンのキー表示もMinecraftの設定変更・未割り当てを反映する。操作の名前が「インベントリ」でもRに変更した場合はRキー、送れなければ「送らない」。実キーが変わると操作面を作り直し、既存の全解放経路を使う。
- `node scripts/sim/app-view-test.mjs`25/25、`ui-input-test.mjs`12/12、`phone-view-test.mjs`（リモコンのキー変更・未割り当てを含む）、`controller-diagnostics-test.mjs`、`check-static-pages.mjs`、`verify-ui-evidence.mjs`、`static-assets-sim.mjs`（34ファイル）、`protocol-sim.mjs`（既存の最新Rustホストのdry-run）50/50、`git diff --check`が成功。Rustソースは変更していない。
- computer-useスキルを参照しブラウザーでの画面確認を試みたが、接続可能なアプリ・ブラウザーは0件だった（cua.getState）。今回の表示の実ブラウザー撮影・スマホ実機・ゲーム内入力は未検証。保存済み104画面の証拠検査は新しい表示の目視確認とは区別する。
- Issue整理：#140はユーザーの明示承認後にクローズ済み。前提Issueがクローズ済みの#38・#50・#53・#55・#58・#63から古いblockedを外し、実装済み部分と残る作業・最新の判断を本文へ追記した。#138・#139・#141の実機受入については、ユーザーの「チェックできた」の範囲を確認中であり、実機確認済みとは読み替えていない。

## 2026-10-26 — README・ギャラリーへ説明用画像3点を追加

- ユーザー指定の `4.png`・`5.png`・`P1移動.png` を目視し、QRコード参加・役割別スマホ画面・システム構成図に対応することを確認した。Rustホスト・Tauri・WebSocket/WebRTC・SendInputの実装と図を照合し、3人構成の概略図として重大な矛盾がないことを確認した。
- `assets/images/` に内容別の英語名で追加。Pillowによる可逆WebP変換で各画像の1920×1080と全画素一致を確認した。容量は順に1,183,080・548,174・176,898バイト。既存画像は変更していない。
- READMEの役割表直後に操作画面を掲載し、Mermaidを構成図へ置換。ギャラリーの参加手順付近にQR参加の説明用画像を掲載した。いずれも拡大用リンクと画像種別を明記し、実機記録や互換性の証明とは扱わない。画像一覧に出典ファイル名・追加日・制作日時未確認を記録した。
- Python（markdown-it-py・BeautifulSoup・Pillow）で対象Markdown3件を解析し、ローカル参照44件の存在、既存リンク・画像参照の保持、HTML区切り・代替テキスト、Mermaid置換を確認した。追加画像ブロックを元に戻すとREADMEが編集前と全文一致することを検証し、冒頭のサムネイル・動画と指定箇所以外の本文が保持されていることを確認した。
- `git diff --check`：成功。資料と画像のみの変更であり、製品コードの試験・新しい実機試験は行っていない。

## 2026-10-26 — 4DX@HOMEを参考に外向け資料の不足を調査

- main `3a9bf3d` とorigin/mainの一致、開始時の未コミット変更なしを確認した。参考対象はJPHACKS 2025の `jphacks/kz_2504` とし、GitHubの読み取りでREADME・総合仕様・ギャラリー・ファイル構成を比較した。
- 主要11資料の相対参照101件をPython（markdown-it-py・BeautifulSoup）で確認し、参照先欠落は0件。動画未掲載の旧記載、現行と過去の仕様・検証の混在、一般利用者向けの開始・対処導線を優先課題とした。Release一覧は調査時0件だった。
- 改善順序・候補ファイル・完了条件・確認の限界を `2026-10-26-public-docs-audit.md` に記録した。新規メモのMarkdown解析とローカル参照確認、`git diff --check` が成功。既存の外向け資料の改稿・製品コード変更・実機試験・公開は行っていない。

## 2026-10-26 — 外向け技術仕様書と開発資料の再構成

- 計画に基づき、docs直下を総合仕様・4冊の専門仕様書・導入・操作・対処・ギャラリー・検証要約に整理した。4DX@HOME（jphacks/kz_2504）の総合・フロントエンド・バックエンド・ハードウェア仕様書を参照し、目次、概要、技術スタック、構成・処理、設定・通信、テスト、対処、実装例の章立て・表・図の配置を合わせた。長い前書き、PR番号、編集経緯は外向け本文から外した。
- 開発資料183ファイルをdocs/developへ集約し、通信契約・操作定義はdocs直下の現行仕様へ移した。画像・JSON 120ファイルはSHA-256一致を確認した。開始時の未コミット調査メモとBUILD_LOG追記も保持した。移動先一覧はdevelop/document-migration.mdに記録した。
- 最新コードの全人数共通の生成画面、実キー名表示、未検証定義でも条件成立時に開始可能な動作、前面化と停止、自動復帰の既定値と条件を照合した。旧固定操作・古いReady制限を現行仕様から除いた。実装・通信版・ゲーム定義の意味は変更していない。Rustの差分はコメントのみであることを照合した。
- AGENTS・CLAUDE、README、アプリREADME、構造確認、カタログ生成・照合、UI比較画像の入出力パスを更新した。生成先を既存データと照合し、ネットワーク取得を伴うカタログ再生成は実行していない。mainで並行更新されたREADMEは0ee6f0aまで取り込み、紹介本文・冒頭動画・サムネイルと構成図の配置を保持した。
- python scripts/check-public-docs.py --all：75資料・相対参照455件（画像・アンカー含む）を確認し成功。外向け12図（シーケンス6図）、既存開発図を含め13図を検出。リンク先欠落・アンカー誤り・画像欠落を与えた負例3件も拒否できることを確認した。同検査を構造CIへ追加した。
- Mermaid 11.17.2のparseで外向け12図すべて成功。検証用ライブラリとHTMLはGit対象外のdata/localだけへ配置し、製品依存やpackage-lockは追加していない。ローカルのブラウザで通常幅8ページ・幅390pxの11ページを確認し、全12図のSVG描画、ローカル画像の欠落なし、ページ全体の横はみ出しなしを確認した。
- node scripts/sim/profile-catalog-test.mjs：502定義の照合成功。node scripts/sim/verify-ui-evidence.mjs：104画面の照合成功。python scripts/verify_overlay.py：39項目成功。node scripts/sim/app-view-test.mjs：25/25成功。node scripts/sim/phone-view-test.mjs：8観点成功。node --check scripts/profiles/build-catalog.mjs、git diff --checkも成功。
- Release一覧は0件を再確認し、一般向け配布版が公開済みとは案内していない。資料・パス以外の製品動作変更はなく、実機試験・OS入力試験・Rust再ビルドは実施していない。過去の実機観測を現行版全体の合格へ読み替えていない。
- Push後のGitHubで総合仕様・4冊の専門仕様を開き、全12図の読込み完了と描画エラーなしを確認した。公開表示で読みづらかったPC管理メッセージの長い表は、メッセージ表・認可条件・state項目・HTTP応答へ分け、旧履歴番号の除去で残った不自然な表現も修正した。図と通信処理の意味は変更していない。再度、全75資料・455参照とgit diff --checkが成功した。

## 2026-10-26 — READMEから各資料へ直接案内

- 4DX@HOMEのREADMEと同じく、開発技術の前に「技術仕様書」「利用ガイド」「ギャラリー・関連資料」を置き、総合仕様と専門4冊、利用案内3件、ギャラリー、検証要約、開発資料の計11件へ内容説明付きでリンクした。冒頭の資料バッジも技術仕様書の表記へ合わせ、独自技術にあった重複リンク行を整理した。既存の紹介本文・画像・動画は変更していない。
- python scripts/check-public-docs.py --all：75資料・相対参照461件のリンク・画像・アンカー確認に成功。git diff --checkも成功。製品コード・図は変更していない。

## 2026-10-26 — Minecraftの公式ランチャーを「ゲームを起動する」で開く（Claude Code、#55）

- Minecraftのランチャーを検出したとき、開き方を決めて保持するようにした。実行ファイルの隣の `appxmanifest.xml` が Xbox・Microsoft Store 版のパッケージ（`Microsoft.4297127D64EC6`）ならアプリの ID（`shell:AppsFolder\...!Minecraft`）で開き、それ以外（旧インストーラー版）は実行ファイルを引数なしで開く。ゲーム本体は起動せず、ログイン・更新・「プレイ」はランチャーに任せる。
- Minecraftも他の検出したゲームと同じく、ゲームの選択とメンバー・分担の決定の後だけ「ゲームを起動する」で開ける。案内は「ランチャーを開きました。ランチャーで『プレイ』を押してください」。ウィンドウが現れるまでの待ちは、「プレイ」を押す時間を見込んで300秒（他は90秒）。画面へは `minecraft.launchable` だけを送り、場所・アプリの ID は送らない。ランチャーが見つからないときは従来どおり手動起動の項目のまま。
- 試験：`cargo build --release --locked` 成功（13分、既知のLNK4099警告のみ）。`cargo test --release --locked` はホスト43件（1件は手動用で除外）＋プローブ4件成功。開き方の判定の単体試験を追加。`protocol-sim.mjs` は再ビルドしたexe（06:41）で50/50成功（検出時の `launchable` と開き方の非公開を追加確認）。`app-view-test.mjs` 25/25（起動可否・「公式ランチャー」表示の確認を追加）、`ui-input-test.mjs` 12/12、`phone-view-test.mjs`、`check-static-pages.mjs`、`static-assets-sim.mjs`（34ファイル）、`git diff --check` 成功。
- 文書の配置換えを含む最新main（3da12f0）へ載せ直した後、再ビルドして `cargo test` 43件＋4件、`target/release/deps/recooplay_host.exe`（06:44、起動中のホストが `recooplay-host.exe` をロックしていたため）での `protocol-sim.mjs` 50/50、画面系の試験を再度すべて成功させた。
- 実機は未検証：Store版・インストーラー版のランチャーが実際に開くか、「プレイ」の後にウィンドウを見つけて起動済みになるか、ランチャーのログインや更新で失敗したときの案内は確認していない。

## 2026-10-26 — 前面化してもゲームが前面に来ないことがある問題（Claude Code、#138）

- ユーザーの報告：前面化を選んでも、ゲームが前面に来ないことがある。
- 原因の見立て：ホストは裏で動くプロセスなので、PCアプリやブラウザーが前面のとき、Windowsは `SetForegroundWindow` だけでは前面化を拒むことがある。また、要求した直後に1回だけ前面を確かめていたので、切り替わりが遅れると失敗扱いになっていた。さらに毎回 `SW_RESTORE` をかけていたため、最大化しているウィンドウが元の大きさに戻っていた。
- 修正（`focus.rs`）：いまの前面のウィンドウの入力に一時的につないで（`AttachThreadInput`）から `BringWindowToTop`・`SetForegroundWindow` を呼び、すぐに切り離す。`SW_RESTORE` は最小化しているときだけにした。前面になったかは30msごとに最大7回確かめ、だめなら1回だけやり直す（最大約0.4秒）。対象のウィンドウは、持ち主のいる補助のウィンドウやツールウィンドウより本体のウィンドウを優先する。キー入力の注入は使っていない。手動の前面化・準備・Ready・再開・自動の再開は、すべてこの処理を通る。
- 試験：`cargo build --release --locked` 成功。`cargo test --release --locked` はホスト43件（手動用の1件は除外）＋プローブ4件成功。`protocol-sim.mjs` は再ビルドしたexe（07:04）で50/50成功。`git diff --check` 成功。
- 実機は未検証：dry-runとシミュレーションでは実際のウィンドウを操作しないので、PCアプリ・ブラウザー・スマホ操作の後に、Minecraftや検出したゲームが実際に前面に来るかは確認していない。

## 2026-10-26 — 審査員向けのPC・スマホ画面一覧（Claude Code）

- ユーザーの依頼で、最新のPC画面とスマホ画面の全画面スクリーンショットを撮り、`docs/screenshots.md` にまとめた。READMEの製品説明の流れの後と「技術仕様書」の一覧、`docs/gallery.md` の案内からリンクした。
- 撮影は `scripts/sim/capture-screens.mjs` で行った。main（ee43c5d、#153マージ後）を再ビルドしたRustホストを dry-run・疑似の入力先・偽のランチャー情報で起動し、headless Chrome で PC（1920×1080）1台とスマホ（402×874、2倍の解像度）3台を別々のブラウザーコンテキストで開いた。PCアプリとスマホのボタンを実際に押して、参加→ゲーム選択→分担→決定→準備・Ready→協力プレイ→一時停止→設定・接続・診断→緊急停止（ホストの標準入力の `stop`）の順に進め、PC11枚・スマホ12枚を撮った。OS入力・実ゲームの操作はしていない。
- QR・URLの実際のIPは、撮影時に `/api/info` の応答を説明用のアドレス（192.0.2.10、RFC 5737）へ差し替えた。QRはホストと同じ `qrcode` クレートで `http://192.0.2.10:8080/` から作った（`scripts/sim/fixtures/demo-join-qr.svg`）。Wi-Fiは偽のホットスポット「ReCooplay-Demo」。撮影時に画面の文字に127.0.0.1と説明用以外のIPがないことを検査し、全23枚を目で確認した。
- 疑似の入力先は Ready のときに前面にできる（#138の自動前面化）ので、準備の後すぐにReadyを押せる状態になり、「準備中」の画面は単独では撮れなかった。Minecraftのタイルの画像は、空の実行ファイルから取り出したWindowsの汎用のアイコンになっている。
- `python scripts/check-public-docs.py`（16ファイル）と `--all`（76ファイル・512参照）、`python scripts/verify_overlay.py`、`node --check scripts/sim/capture-screens.mjs`、`git diff --check` が成功。画像は24ファイル・約3.9MB。シミュレーションでの撮影で、実機での動作確認ではない。

## 2026-10-26 — 最新READMEと実装に合わせた技術仕様書の更新

- 作業開始時はmain・未コミット変更なし。origin/mainを68df99bへ早送りし、この時点のREADMEを製品説明・採用仕様の基準として照合した。README自体は変更していない。
- 総合仕様と4冊の専門仕様で、ゲーム固有・汎用定義、対応形式のキー設定読取り、2〜4人の自動分担、担当別画面生成のつながりを補った。分担は現在のグループ・重みに基づき、操作頻度による最適化、自由な画面カスタマイズ、遠隔参加を実装済みとしない。4DX@HOMEを参考にした既存の章立て・表・図を保持した。
- 673c49c以降の製品コード差分を確認。Minecraft公式ランチャーの起動、Store・Xbox版と従来版の開き方、300秒の起動待ち、minecraft.launchable、前面化の対象選択・再試行を仕様へ反映した。既存のstate.games.sourceのmanualという誤記を実装のregisteredへ修正。キー設定の記載なしと、明示的な未割当・非対応キーの違いも明記した。
- 利用手順へMinecraftランチャー操作を反映し、検証ページにはREADMEのOutlast・Terrariaの実演を追加した。画面一覧のdry-runと実ゲーム操作、旧観測と更新後コードの受入範囲を区別した。動画のゲーム版や未記載の端末条件を推測で補っていない。
- python scripts/check-public-docs.py --all：76資料・511参照、外向けMermaid12図（シーケンス6図）を含む全13図の構造確認成功。Mermaid 11.17.2で外向け12図のparse成功。ローカルプレビューの総合・ホスト仕様を1280px、総合と専門4冊を390pxで確認し、SVG全12図の描画とページ全体の横はみ出しなしを確認した。
- python scripts/verify_overlay.py：39項目成功。node scripts/sim/profile-catalog-test.mjs：502定義成功。node scripts/sim/profile-extract-test.mjs：抽出・未検証下書き・非対応キーの確認成功。node scripts/sim/app-view-test.mjs：25/25成功。node scripts/sim/phone-view-test.mjs：8観点成功。node scripts/sim/verify-ui-evidence.mjs：104画面の照合成功。git diff --check成功。
- 変更対象は文書のみ。製品コード・通信契約・操作定義・画像は変更していない。実機・実ゲーム試験およびRustの再ビルドは実施しておらず、ランチャー起動や前面化の実機受入が未完了であることを維持した。

## 2026-11-05 — Rustホストの回帰試験の基準整備（Codex、#169）

- 最新main `b3c0e88`、未コミット変更なしを確認。対象Issue #169〜#174、関連 #38・#39・#157・#161・#162、既存PR・コメントと共通ルール・現行仕様を照合した。重複するopen PRはなく、#169へ「着手します。既存の安全性・入力処理を確認し、回帰テストを整備します。」を投稿してから `codex/169-safety-regression` を作成した。
- `hub.rs` に12件の内部回帰試験を追加。同一出力の複数所有者、部分・全解放、押下60ms/解放50msと予約時刻、最新8件の連打キュー、旧Pump世代、Pause・緊急停止・入力先喪失、視点の累積・端数、WS/RTC共通順序処理を固定する。fixtureは環境変数変更、ゲーム探索、実時間sleepを避け、`Input::for_test` でWindowsのタイマー設定や実入力を呼ばない。
- `protocol-sim.mjs` に5件追加（全55件）。連打、古い開始・全解放要求、視点の欠番・重複・逆順、ホスト切断時の権限・全解放・nextIseq再接続を補強した。製品の処理・定数・通信契約は変更していない。
- `DEVELOPMENT_WORKFLOW.md` の既存手順へ、Codex・Claude Code共通のIssue着手コメント規則を最小限追記した。監査・後続境界・未確認事項は [判断記録](../decisions/2026-11-05-host-regression-baseline.md) に残した。
- 検証済み：`node --check scripts/sim/protocol-sim.mjs`、`python scripts/verify_overlay.py`（39項目）、`python scripts/check-public-docs.py --all`、`node scripts/sim/app-view-test.mjs`（25/25）、`phone-view-test.mjs`（8観点）、`ui-input-test.mjs`（12/12）、`controller-diagnostics-test.mjs`、`profile-extract-test.mjs`、`profile-catalog-test.mjs`（502定義）、`check-static-pages.mjs`、`verify-ui-evidence.mjs`（104画面）、`git diff --check` が成功。最後の各 `.mjs` はすべて `node scripts/sim/` から実行した。
- RustはSETUP_WINDOWS記載の既存ツールとキャッシュ `%LOCALAPPDATA%\ReCooplay\cargo-target` を用い、`RECOOPLAY_DRY_RUN=1` で再構築中。Rust単体・更新済みexeの通信/終了試験・CIの結果は完了後に追記する。この段階では合格扱いにしない。
- 実装担当と別エージェントが差分をレビューし、現時点の修正必須指摘なし。PR作成後の最終headも確認する。SendInput失敗注入、実Peerによる旧rtc_gen拒否、スマホ実機・Windows実入力・Minecraft・Alt+Tab・実ホットキーは未確認。既存実演・過去観測を今回の受入へ読み替えない。
- Rust検証完了：`RECOOPLAY_DRY_RUN=1`、既存PATH/`LIBCLANG_PATH`/`CARGO_TARGET_DIR`をSETUP_WINDOWSどおり設定して `cargo test --release --locked --offline --manifest-path apps/host-rs/Cargo.toml` が成功（ホスト55件、手動表出力1件は既存の除外、プローブ4件）。ネイティブ依存の再構築を含み14分37秒。続く `cargo build --release --locked --offline --manifest-path apps/host-rs/Cargo.toml` も成功（30.91秒）。既知のOpenSSL `ossl_static.pdb` 不足のLNK4099警告のみ残る。
- 更新済み `%LOCALAPPDATA%\ReCooplay\cargo-target\release\recooplay-host.exe` を `--bin` で指定した `node scripts/sim/protocol-sim.mjs` が55/55成功。`node scripts/sim/shutdown-sim.mjs --bin <同exe>` はquit/EOFの両方でup記録後の正常終了が成功。`node scripts/sim/static-assets-sim.mjs --bin <同exe>` は34ファイル成功。いずれもdry-runでOS入力は送らない。
- 機械照合でも `hub.rs` の製品処理はorigin/mainと一致し、追加はcfg(test)の12件のみ。公開資料検査は78資料・528参照、全13図で成功。#170の呼出し/失敗時状態更新と#174の測定点/配送保証/負荷条件も、先行実装を行わず監査判断へ整理した。
- `node scripts/sim/input-probe-sim.mjs --bin %LOCALAPPDATA%\ReCooplay\cargo-target\release\recooplay-input-probe.exe` は12/12成功（必ず `--mock`、OS入力なし）。これはプローブの既存障害試験であり、HubのSendInput失敗注入を検証したものではない。
- 初回CI head `90cefdf`：構造（run 41974036599）とPCアプリのビルドは成功。ホストのビルド・単体も成功したが、通信は54/55。追加ホスト切断試験が、直前のRESUMEをP1だけ受信した時点でP3のphase/epoch同期前に入力していた。CIログの `inject MOUSE_R down` 待機失敗を確認し、各クライアントが同じcoop/epoch/自動復帰OFFを受信してから開始するよう試験準備を修正した。製品コード・合格条件は変えていない。別担当レビューでも原因と修正の妥当性を確認した。初回CIは全成功として扱わない。
- 受信同期修正後、同じ再ビルド済みexeの `node scripts/sim/protocol-sim.mjs --bin <上記exe>` が再度55/55成功。最終差分の `node --check`・公開資料検査・`git diff --check` も成功。修正後headのCI結果はPRへ記載する。

## 2026-11-05 — Windows入力アダプターの分離（Codex、#170）

- #170のIssue・コメントと既存PRの重複を確認し、着手コメント投稿後、PR #175のhead `2e82eaa` から `codex/170-input-adapter` を分離した。作業ツリーは `data/local/worktrees/issue170`。未マージの先行PRから検証可能なStacked PRを作るという最新のユーザー判断を優先する。
- `InputAdapter: Send` の利用可否/理由・キー・左右ボタン・相対移動・ホイールの境界を追加。Hubは `Box<dyn InputAdapter>` に依存し、従来の `Input` が同じWindows/dry-run実装へ委譲する。SendInputフラグ、入力順序、停止・フォーカス・epoch・通信契約・時間定数は変更していない。既存入力プローブのAPIも保持した。
- 記録・失敗注入用実装はcfg(test)限定で、OS入力を呼ばない。境界試験7件を追加し、具体的な引数と順序、利用不可時の拒否、部分失敗後も他出力を解放すること、down/up/視点/ホイール/リモコン失敗時の現行状態更新を確認する。
- up失敗後の再解放で同じupを再送しないこと、視点失敗でも量と診断集計を消費することは内部で再現した。実OSでの残留押下の証拠ではなく、このリファクタリングで安全修正を混ぜていない。独立安全修正の条件と設計理由は[判断記録](../decisions/2026-11-05-input-adapter.md)に整理した。
- `RECOOPLAY_DRY_RUN=1`、既存のSETUP_WINDOWSのPATH/LIBCLANG_PATH/CARGO_TARGET_DIRを使い、`cargo test --release --locked --offline --manifest-path apps/host-rs/Cargo.toml` 成功（ホスト62件・既存の手動表出力1件除外、プローブ4件、18.77秒）。`cargo build --release --locked --offline --manifest-path apps/host-rs/Cargo.toml` 成功（24.58秒）。既知のOpenSSL PDB不足LNK4099警告は残る。
- ビルド済みexeを作業ツリー内のGit対象外 `data/local/issue170/recooplay-host.exe` へコピーし、共有キャッシュと切り離して試験した。`node scripts/sim/shutdown-sim.mjs --bin <専用exe>` はquit/EOF両方で全解放後の正常終了が成功。`python scripts/verify_overlay.py` は39項目、`python scripts/check-public-docs.py --all` は79資料・529参照、`git diff --check` も成功。
- Windows実入力、実際のSendInput失敗、Alt+Tab、ホットキー、スマホ実機・Minecraftと実Peerによる旧rtc_genの対照試験は未実施。
- `node scripts/sim/protocol-sim.mjs --bin <専用exe>` は55/55成功。キー・入力先喪失・緊急停止・旧epoch・再接続・全解放を含む既存の通信回帰を維持した。Rustビルド後の製品ソース変更はない。親担当による独立差分レビューで修正必須指摘なし、PR最終headも確認対象とする。CI結果はPRへ記録する。

## 2026-11-05 — 押下・解放・連打キュー管理の分離（Codex、#171）

- #171の重複作業確認と着手コメント投稿後、検証済み#170 head `5a9d819` から `codex/171-input-manager` を作成した。新しいユーザー判断のStacked PR許可を優先し、親は#181、baseは `codex/170-input-adapter` とする。
- `OutputState` と所有者・交互キュー・最低時間・タイマー世代の処理を `input_manager.rs` へ分離した。coreは明示時刻を受け、Emit/Wait/Idleを1件ずつ返し、OS・Hub・通信・タイマー実行器・ログへ依存しない。Hubには認可済み操作の伝達、送出・ログ・予約・診断が残る。
- 押下60ms/解放50ms、上限8辺・古い2辺単位の破棄、複数所有者保持、停止優先の解放、旧世代Pump拒否を維持。#169/#170の既存62テストはアサーションを変えず保持し、独立core試験6件を追加した。設計と副作用順序、有限のStacked運用は[判断記録](../decisions/2026-11-05-input-manager.md)へ記録した。
- `RECOOPLAY_DRY_RUN=1`、既存SETUP_WINDOWSのPATH/LIBCLANG_PATH/CARGO_TARGET_DIRを用い、`cargo test --release --locked --offline --manifest-path apps/host-rs/Cargo.toml` はホスト68件＋プローブ4件成功（既存手動1件除外）。サブエージェントの利用上限による作業停止を挟んだが、再開時に成功ログと未コミット変更を確認し、破棄せず継続した。
- `cargo build --release --locked --offline --manifest-path apps/host-rs/Cargo.toml` 成功（32.45秒、既知のOpenSSL PDB不足LNK4099警告）。新しいexeをGit対象外の `data/local/issue171/recooplay-host.exe` へコピーし、共有キャッシュと分離して試験した。`node scripts/sim/shutdown-sim.mjs --bin <専用exe>` はquit/EOFの全解放後正常終了が成功。構造39項目・差分検査も成功。
- #170で内部再現したup失敗後の再送なし等の既知挙動は保持し、安全修正を混ぜていない。実OS入力・Windows設定変更は行わず、実機の押下/解放・Minecraftの操作感・Alt+Tab・実ホットキーは未確認。
- `node scripts/sim/protocol-sim.mjs --bin <専用exe>` は55/55成功。公開文書検査は80資料・533参照、`git diff --check`も成功。親担当の一次独立レビューで修正必須指摘なし。最終headの独立レビューとCI結果はPRへ記録する。

## 2026-11-05 — 視点累積・補間の純計算分離（Codex、#172）

- #172の重複確認・着手コメント投稿後、#171の訂正後head `0e8fb27` から `codex/172-look-core` を作成した。親は#185、baseは `codex/171-input-manager`。純計算と既存回帰を独立検証できる追加層として再評価し、#175から4段で区切る。
- `Look` の到着gap・2秒窓・平滑化・未処理量・整数化・端数を `look.rs` へ分離。明示時刻と認可済み差分を受け、移動要求を返す。Hubは担当/epoch/lseq/累積値を検証し、実送出後に既存診断を集計する。4ms、既定30〜120ms、最大gap×0.5、0.5px閾値、trunc、OS i32/診断i64の型幅を維持した。
- 既存68件のアサーションは無改変。独立数値試験8件を追加し、係数、符号/端数保存、0.5px、1000ms、2秒の正確な境界、最大gapと時定数、停止時破棄、入力禁止、急な大量移動を固定した。判断・Stacked上限・実機チェックは[判断記録](../decisions/2026-11-05-look-core.md)へ記載。
- `RECOOPLAY_DRY_RUN=1`、SETUP_WINDOWSの既存PATH/LIBCLANG_PATH/CARGO_TARGET_DIRで `cargo test --release --locked --offline --manifest-path apps/host-rs/Cargo.toml` はホスト76件＋プローブ4件成功（既存手動1件除外）。境界assert補強後の `cargo test --release --locked --offline --manifest-path apps/host-rs/Cargo.toml look::tests` も8/8成功。後者では製品処理を変更していない。
- `cargo build --release --locked --offline --manifest-path apps/host-rs/Cargo.toml` 成功（20.29秒、既知のLNK4099警告）。Git対象外 `data/local/issue172/recooplay-host.exe` に保存した専用exeで `node scripts/sim/shutdown-sim.mjs --bin <専用exe>` のquit/EOF全解放後正常終了が成功。`python scripts/verify_overlay.py` は39項目、`git diff --check`も成功。
- 実OS入力・Windows設定変更なし。実機の操作感・Raw Input/感度・Android/iPhone・フォーカス喪失・実ホットキー・SendInput失敗は未確認。後続#173以降の認可/副作用をまたぐ実装はスタックを増やさず、設計監査へ渡す。
- `node scripts/sim/protocol-sim.mjs --bin <専用exe>` は55/55成功。公開資料検査は81資料・535参照、差分検査も成功。親担当の最終差分レビューとCI結果をPRへ記録する。

## 2026-11-05 — ホスト内部の再現可能な負荷計測（Codex、#174）

- 重複するopen PR/着手コメントなしを確認した親担当が#174へ着手コメントを投稿し、PR #175/head `2e82eaa`から `codex/174-host-measurement` を分離。製品処理を変えず、cfg(test)の独立計測ハーネスと実行脚本を追加した。
- `cargo test --release --locked --offline --manifest-path apps/host-rs/Cargo.toml`：ホスト56成功/2 ignored（既存手動表1件・opt-in長計測1件）、プローブ4成功。5負荷条件の40ms smokeを通常CIに含める。`cargo build --release --locked --offline --manifest-path apps/host-rs/Cargo.toml` も成功。既知のOpenSSL PDB不足LNK4099警告のみ。
- テストexe/製品exeはGit対象外の専用コピーへ保存し共有ビルドキャッシュのロックを解放した。`node scripts/sim/host-load-measure.mjs --test-bin data/local/issue174/host-measure-test.exe --duration-ms 1000 --repeats 3 --out data/local/issue174/initial.json`：15条件成功。待機/処理/停止/tick/通知キューを計測し、各条件で全解放・未処理視点破棄・旧入力非復元・キュー消化をアサートした。
- 初期観測は受信キュー最大1,686件・停滞監視キュー最大1,008件、停止完了最大7,148µs。有限負荷の内部観測であり、製品上限/実ゲーム遅延ではない。詳細・再現手順・未測定条件は [判断記録](../decisions/2026-11-05-host-load-measurement.md) と個人パス/IP/tokenを含まないJSONへ残す。長計測は続けて実行する。
- 初回head `04118b3` のCIはPR Rust/PCアプリ（run 41981601106）・構造（41981601121）、push Rust/PCアプリ（41981553682）・構造（41981553515）が全成功。通信55/55、既存の終了・画面・プローブ・配布zip/展開後dry-runも通過した。
- 長計測の初回実行は利用上限停止後にセッション/実プロセス/結果ファイルが存在しないことを確認し、合格として数えず再実行。専用試験名と結果markerをバイナリ内で起動前に確認するrunnerへ更新し、製品exeの誤指定が実行開始前に拒否される負例と、40ms×5条件のrunner smokeを確認した。共有Rustキャッシュは使わず、既に構築した非注入テストexeの専用コピーを使用した。
- `node scripts/sim/host-load-measure.mjs --test-bin data/local/issue174/host-measure-test.exe --duration-ms 30000 --repeats 3 --out data/local/issue174/long.json`：30秒×5条件×3反復、15条件・計27,975処理で全アサーション成功。対象ソース315b06c、開始時dirty=false、ソース4ファイルと実行したテストexeのSHA-256を結果に記録。個人パス/IP/tokenなしの長結果を `docs/develop/data/host-load/long.json` へ保存した。
- 長計測の観測最大：受信キュー1,773件、停滞監視キュー1,008件、停止enqueue→内部停止完了8,775µs、tick間隔20,587µs。fixtureはtimeBeginPeriodを呼ばず受信待ちも本番と異なるため、製品の停止上限/4ms周期や実ゲームの遅延へ読み替えない。冒頭バースト/監視キュー蓄積は再現したが、本番ループ・実ソケット・ディスク/標準出力停滞・slow writerは未測定。最適化は実施していない。

## 2026-11-05 — スマホ入力ライフサイクルの回帰試験（Codex、#176）

- 最新main `b3c0e88`、作業ツリーclean、PR #175は未マージ・CI成功を確認。対象Issue・既存PR・コメントを照合し、#176への着手コメント後に `codex/176-phone-regression` をmainから作成した。最新ユーザー判断に従い、Rust側とは独立して進める。
- 実controller・表示・生成操作・スティック・視点・タッチパッド・transportを隔離VMで動かす再利用可能なfixtureと15試験を追加。製品コードは変更していない。新試験を既存CIへ追加し、[判断記録](../decisions/2026-11-05-phone-regression.md)へ棚卸しと試験境界を記載した。
- `node scripts/sim/phone-lifecycle-test.mjs` は15/15成功。別の正期待repro `node scripts/sim/phone-lifecycle-test.mjs --repro-shared-pointer` は終了コード1で、同controlの2指保持から片指だけを離すと早期upになる既存不具合を再現。既定CIはこの特定のAssertionErrorとactual/expectedだけを既知不具合として固定し、修正済みとは扱わない。#177で所有元管理と正期待への切替を行う。
- 関連検証：`node scripts/sim/ui-input-test.mjs` 12/12、`phone-view-test.mjs` 8観点、`controller-diagnostics-test.mjs`、`check-static-pages.mjs`、`python scripts/verify_overlay.py` 39項目、`python scripts/check-public-docs.py --all` 78資料・522参照、`git diff --check` 成功（省略したmjsも `node scripts/sim/` から実行）。実装者とは別の親エージェントが全差分・正期待repro・fixtureを独立レビューし、修正必須指摘なし。
- 実DOMの描画/ヒット判定/自動Pointer Capture配送・Android/iPhoneの複数指/回転/バックグラウンド/Wi-Fi断は未検証。実通信・OS入力は行っていない。#10・#38・#39は完了扱いにしない。最終CI結果はPRへ記載する。

## 2026-11-05 — Pointer所有と入力解放の一元管理（Codex、#177）

- #176のPR #182作成後に重複作業・コメントを確認し、#177へ着手コメントを投稿。最新ユーザー判断に従い、`codex/176-phone-regression` を親に `codex/177-pointer-ownership` を作成した。
- `input-owners.js` へ保持元とcontrolの双方向管理を分離。送信できた最初のdownと最後のupだけを送り、Pointer・スティック・タップを別保持元で管理する。#176で再現済みの早期upを修正し、同じ正期待reproを通常の成功試験へ切り替えた。描画・視点・通信契約・役割認可・Rust処理は変更しない。[判断記録](../decisions/2026-11-05-pointer-ownership.md)へ責任境界と失効順を記載。
- `node scripts/sim/input-owners-test.mjs` 4/4、`phone-lifecycle-test.mjs` 16/16、`phone-lifecycle-test.mjs --repro-shared-pointer` 成功（修正前はexit 1）、`controller-diagnostics-test.mjs`、`phone-view-test.mjs` 8観点、`ui-input-test.mjs` 12/12、`app-view-test.mjs` 25/25、`check-static-pages.mjs`、`python scripts/verify_overlay.py` 39項目、公開資料検査、`git diff --check` 成功。省略したmjsは `node scripts/sim/` から実行。
- `node scripts/sim/capture-screens.mjs --bin <PR #181の専用dry-runホストexe> --out data/local/issue177/screenshots` が成功し、23画面を保存。生成された移動・アクション・緊急停止後の画面を目視確認し、表示崩れなし。画像はGit対象外で、実機受入へ読み替えない。
- 実装した親とは別のエージェントが全差分・未追跡ファイル・停止経路を独立レビューし、修正必須P0〜P2指摘なし。独立実行でも所有4/4・ライフサイクル16/16・正期待repro・UI入力12/12・診断・差分検査成功。Android/iPhoneの複数指とPointer Capture配送、実ゲームは未検証。CI結果はPRへ記載する。

## 2026-11-05 — スマホの接続・参加状態を分離する（Codex、#178）

- #177のhead `6c80fab` を親に `codex/178-phone-session` の専用worktreeで作業。重複確認とIssueへの着手コメントは親担当が実施済み。`phone-session.js` へidentity/token・現在Socket・seq/iseq・retry/stopped/lastServerMsg・slot/host/game/epochと接続表示の導出を移した。controllerはDOM・実通信・入力停止/RTCの副作用をつなぐ。Reactや新依存は追加していない。
- 責務抽出段階で `node scripts/sim/phone-session-test.mjs` 6/6、`phone-lifecycle-test.mjs` 16/16、`controller-diagnostics-test.mjs` が成功。`node --check apps/web-static/scripts/controller.js` も成功。製品入力・視点周期・通信形式を変更していない。
- 既存の旧onopen通知には世代ガードがなく、可視化と予約再接続が重なったSocketの遅延openで現在のseqが巻き戻ることを再現。`node scripts/sim/phone-session-test.mjs --repro-stale-open` は正期待 `[1,2]` に対して実際 `[1,1]`、AssertionError・exit 1。この失敗再現を抽出コミットに残し、世代ガードの修正は次の独立コミットで扱う。
- 判断とStackの区切りは [接続・参加状態の分離](../decisions/2026-11-05-phone-session.md) に記録。実ブラウザー・Android/iPhone・実WebRTC・OS入力は未検証。
- 別の修正コミットでonopen先頭へ現在Socketの照合を1行追加。正期待の `node scripts/sim/phone-session-test.mjs --repro-stale-open` はexit 0となり、既定の同試験は7/7成功。seqの連続性、未ACK2件の維持、pingの予定時刻、旧Socketへのhello不送信を確認した。
- 最終ローカル検証：`node scripts/sim/phone-lifecycle-test.mjs` 16/16、`input-owners-test.mjs` 4/4、`ui-input-test.mjs` 12/12、`controller-diagnostics-test.mjs`、`phone-view-test.mjs` 8観点、`app-view-test.mjs` 25/25、`check-static-pages.mjs`、`python scripts/verify_overlay.py` 39項目、`python scripts/check-public-docs.py --all` 80資料・527参照、`git diff --check` が成功。各 `.mjs` は `node scripts/sim/` から実行した。HTML/CSSは未変更。新しい実ブラウザー描画・スマホ実機・実ゲーム試験は未実施で、VMの成功を実機受入に読み替えていない。
- CIへ接続・参加状態試験を追加。独立レビューとpush後CIの結果はPRへ反映する。Stacked PRはbase `codex/177-pointer-ownership` とし、このスマホStackは#178で区切る。
- 追加の独立QA：親担当が製品head `94c94b5` の全製品差分とセッション単体7件・実controller16件・診断試験を独立レビュー/実行し、修正必須指摘なしを確認した。
- 同headの専用worktreeで、親担当が `node scripts/sim/capture-screens.mjs --bin C:/Users/kumes/Documents/kz_2613/data/local/worktrees/issue170/data/local/issue171/recooplay-host.exe --out data/local/issue178/screenshots` を実行し成功。#171専用のdry-runホストを使い、PC 1920×1080とスマホ402×874（2倍）の23画面をGit対象外へ保存した。`shots.json` と23枚の存在を確認し、親担当と実装担当の双方がP2視点・緊急停止後P1の画像を目視して表示崩れなしを確認した。これはheadless Chromeの描画・疑似参加/停止確認であり、スマホ実端末・実WebRTC・Windows実入力・実ゲームの受入ではない。
- 追加QA後はBUILD_LOGのみを更新し、製品/試験コードは`94c94b5`から変更しない。最終docs-only headのCIを追跡し、PR本文へ結果を記載する。

## 2026-11-05 — セッション状態・認可の設計監査（Codex、#173）

- 最新main `b3c0e88`、対象Issue・既存PR・コメントを再確認し、#173へ着手コメントを投稿してから独立監査ブランチを作成した。先行の製品Stackを無制限に増やさず、実装と並行できる設計・試験系列・再開条件を成果とする。
- 現行コード・通信/ホスト仕様・回帰試験と、作業中のRust入力分離/スマホ状態分離を照合。責任境界、ガード、状態更新と副作用順序、維持するログ/通知、対照付き試験系列、外部の統合条件を[判断記録](../decisions/2026-11-05-session-extraction-plan.md)へ整理した。製品コード・採用仕様は変更せず、本Issueの製品分離が実装済みとは扱わない。
- 別エージェントがコードと文書を独立レビューした。WSパースの実行箇所、再検出停止の対象範囲、Playerとmonitorのepoch条件の違いという指摘をそれぞれの対象文書へ反映した。未確認事項・保留理由もレビューし、それ以外の修正必須指摘なし。
- `python scripts/check-public-docs.py --all`、`python scripts/verify_overlay.py`（39項目）、`git diff --check` 成功。監査資料とBUILD_LOGだけの変更のためRustの製品ソース再ビルドや新たなOS入力試験は行っていない。PRの既存CIも追跡し、結果をPRへ記載する。
- Android/iPhone・Windows実入力・ゲーム操作・無線断・Alt+Tab・実ホットキー等は未検証のまま。mainマージ・Issueクローズ・正式リリースは行わない。

## 2026-11-05 — 型付きメッセージ境界の設計監査（Codex、#179）

- 最新main `b3c0e88`、対象Issue・既存PR・コメントを再確認し、#179へ着手コメントを投稿してから独立監査ブランチを作成した。先行の製品Stackを無制限に増やさず、実装と並行できる設計・試験系列・再開条件を成果とする。
- 現行コード・通信/ホスト仕様・回帰試験と、作業中のRust入力分離/スマホ状態分離を照合。責任境界、ガード、状態更新と副作用順序、維持するログ/通知、対照付き試験系列、外部の統合条件を[判断記録](../decisions/2026-11-05-protocol-boundary-plan.md)へ整理した。製品コード・採用仕様は変更せず、本Issueの製品分離が実装済みとは扱わない。
- 別エージェントがコードと文書を独立レビューした。WSパースの実行箇所、再検出停止の対象範囲、Playerとmonitorのepoch条件の違いという指摘をそれぞれの対象文書へ反映した。未確認事項・保留理由もレビューし、それ以外の修正必須指摘なし。
- `python scripts/check-public-docs.py --all`、`python scripts/verify_overlay.py`（39項目）、`git diff --check` 成功。監査資料とBUILD_LOGだけの変更のためRustの製品ソース再ビルドや新たなOS入力試験は行っていない。PRの既存CIも追跡し、結果をPRへ記載する。
- Android/iPhone・Windows実入力・ゲーム操作・無線断・Alt+Tab・実ホットキー等は未検証のまま。mainマージ・Issueクローズ・正式リリースは行わない。

## 2026-11-05 — ゲーム管理サービスの設計監査（Codex、#180）

- 最新main `b3c0e88`、対象Issue・既存PR・コメントを再確認し、#180へ着手コメントを投稿してから独立監査ブランチを作成した。先行の製品Stackを無制限に増やさず、実装と並行できる設計・試験系列・再開条件を成果とする。
- 現行コード・通信/ホスト仕様・回帰試験と、作業中のRust入力分離/スマホ状態分離を照合。責任境界、ガード、状態更新と副作用順序、維持するログ/通知、対照付き試験系列、外部の統合条件を[判断記録](../decisions/2026-11-05-game-service-plan.md)へ整理した。製品コード・採用仕様は変更せず、本Issueの製品分離が実装済みとは扱わない。
- 別エージェントがコードと文書を独立レビューした。WSパースの実行箇所、再検出停止の対象範囲、Playerとmonitorのepoch条件の違いという指摘をそれぞれの対象文書へ反映した。未確認事項・保留理由もレビューし、それ以外の修正必須指摘なし。
- `python scripts/check-public-docs.py --all`、`python scripts/verify_overlay.py`（39項目）、`git diff --check` 成功。監査資料とBUILD_LOGだけの変更のためRustの製品ソース再ビルドや新たなOS入力試験は行っていない。PRの既存CIも追跡し、結果をPRへ記載する。
- Android/iPhone・Windows実入力・ゲーム操作・無線断・Alt+Tab・実ホットキー等は未検証のまま。mainマージ・Issueクローズ・正式リリースは行わない。

## 2026-11-06 — 先行11 PRの統合とセッション判定の製品分離（Codex、#173）

- #175→#181→#185→#187、#183、#182→#184→#186、#188→#189→#190を依存順にmainへmerge。force push・ブランチ削除・保護回避なし。各段階でmainのtreeと検証済み親/統合候補の完全一致を確認し、baseをmainへ変更した。BUILD_LOG競合は両記録を保持。別エージェントが元11差分と更新7差分を独立レビューし、製品差分一致・記録欠落0行・修正必須指摘なしを確認。各PRの最終headのPR/push CI全成功後に統合。Issueは閉じていない。
- 全11本の固定候補8c8fd78（統合main a3ffc413と同tree）でRust77件＋プローブ4件、通信55/55、quit/EOF全解放、36ファイル配信が成功。PC表示25件・スマホ8観点・セッション7件・入力16件・所有4件・UI入力12件・診断・静的構文・502定義・抽出・104画面証拠・構造39項目・公開資料88件/553参照も成功。
- 共有CARGO_TARGET_DIRを別worktreeから利用した初回検査は旧62件のバイナリを再利用したため全11本の証拠から除外。cargo clean -p recooplay-host --release後に製品crateを再構築し、77件とソースを照合した。以降の製品実装は通常ディレクトリで行う。依存キャッシュのコピーはしていない。
- #173へ製品実装再開コメント後、mainから専用ブランチを作成。session.rsへ主要判定を抽出し、純粋判定9件とHub通知順序1件を追加。副作用の順序と既存アサーションを保持。[判断記録](../decisions/2026-11-06-session-core.md)参照。
- cargo test --release --locked --offline --manifest-path apps/host-rs/Cargo.toml：ホスト87件＋プローブ4件成功、手動/長計測2件ignored。cargo build同引数成功（既知LNK4099警告）。固定exeのprotocol-sim.mjsは55/55、shutdown-sim.mjsはquit/EOFで全解放後の正常終了、構造39項目、公開資料89件/555参照が成功。
- rustfmtはstableツールチェーンに未導入のため実行不可（rustfmt.exe is not installed）。既存の簡潔な書式を維持しgit diff --check成功。実機試験は行っていない。#191の解放失敗問題・#174本番計測・#179/#180製品抽出は別の後続作業として残る。

## 2026-11-06 — 型付き受信境界と不正通知時の停止（Codex、#179）

- #173のPR #192を全CI成功後にmainへ統合（4eda262）、統合後main CIも成功。#179の重複PRなしを確認し再開コメント後に専用ブランチを作成。
- Rust protocol.rsへ共通解釈とInput/Look/Remote/Commandを抽出し、入力保留を型付き値へ変更。有限な数値文字列・小数cast・未知state・ACK原値を維持。非有限な入力連番/視点は状態更新前に拒否する。認証・接続世代・epoch・順序・担当はHub/sessionに維持。[判断記録](../decisions/2026-11-06-protocol-boundary.md)参照。
- Webに受信構造検証を追加。独立レビューで同epoch保持中の不正なgameによる例外と保持残存を検出したため、必須配列・入れ子・表示値の検証と適用中例外の全解放/切断を補強。12破損系列・描画失敗・復帰・未知typeの対照を実controllerで追加。最終独立レビューは修正必須残なし。
- cargo test --release --locked --offline --manifest-path apps/host-rs/Cargo.toml：ホスト95件＋プローブ4件成功、既存2件ignored。cargo build同引数成功、既知LNK4099警告。固定exeのprotocol-sim.mjs 55/55成功。初回の新テストはfixtureにキー割当がなく失敗したため、製品のKeybindsを設定して再実行し成功（合格条件は緩和していない）。
- node scripts/sim/protocol-boundary-test.mjs 7/7、phone-lifecycle-test.mjs 16/16、phone-session-test.mjs 7/7、input-owners-test.mjs 4/4、ui-input-test.mjs 12/12、診断、スマホ8観点、PC25/25、静的構文、構造39項目、公開資料検査、git diff --check成功（省略したmjsはscripts/sim配下）。別エージェントの独立実行でもWeb境界7/7と入力16/16成功。
- node scripts/sim/capture-screens.mjs --bin <固定179-host.exe> --out data/local/179-screenshots：実ホスト配信で参加→準備→Ready→協力→Pause→診断→緊急停止の23画面保存。アクションと緊急停止の表示を目視確認。画像はGit対象外。Android/iPhone・実ゲームの受入ではない。最終head CIと配布zipはPRで追跡する。

## 2026-11-06 — ゲーム管理の外部境界と起動監視の分離（Codex、#180）

- #173統合と#179確定差分を基準に、重複PRなしを確認し#180へ再開コメントを投稿。#179のafd6c23を親とする専用ブランチでHubを順次変更した。
- game_service.rsへGameBackend/GameService、既知選択/対象構築/Minecraft Entry、手動登録・編集、純粋なLaunch::observeを分離。games/focusを再実装せず、認可・世代・Ready・全解放/epoch/通知の順序はHubに維持。[判断記録](../decisions/2026-11-06-game-service.md)参照。
- cargo test --release --locked --offline --manifest-path apps/host-rs/Cargo.toml：ホスト102件＋プローブ4件成功（既存2件ignored）。既存95件の期待値を維持し、外部呼出し・対象制限・手動登録・90/300秒/5秒境界のサービス5件、旧起動結果/ゲーム切替・mock前面喪失全解放のHub2件を追加。cargo build同引数成功（既知LNK4099警告）。
- 固定180-host.exeのprotocol-sim.mjs 55/55、shutdown-sim.mjs quit/EOF全解放、static-assets-sim.mjs 37資産成功。Web境界7/7、静的構文、構造39項目、資料91件/558参照、git diff --check成功。省略したmjsはscripts/sim配下。
- 別エージェントが全製品差分・5単体・2Hub試験を独立レビューし修正必須指摘なし。旧gen/state拒否をOS呼出しより先に行うこと、保存・通知・時間判定と案内の維持を確認。実ゲーム・ランチャー・Windows入力・スマホ・Alt+Tab・配布先PCは未検証。

## 2026-11-06 — #191 入力送出失敗時の安全停止と再解放

- キー・ボタンの失敗を未確認集合へ記録し、成功したupだけで取り除く。入力停止を一度だけ適用し、通常解放やスマホ要求から再試行枠を増やせない。停止時の再解放後は50ms間隔で最大3回。終了時の追加試行も最大3回で、未確認が残れば明示終了はコード1。
- 再解放成功後もPCで明示再開するまで入力禁止。スマホのPCリモコンをラッチ中に止め、PC画面の両再開入口で転送済みの合成クリックも拒否する。PC画面の停止操作は維持。
- 独立レビューの指摘3件を修正し、最終再レビューで修正必須残なし。`cargo test --release --locked --offline` は108件＋プローブ4件成功。release build、固定exeの `protocol-sim.mjs` 55/55、`shutdown-sim.mjs` quit/EOF、`capture-screens.mjs` 23画面と合成クリック拒否・CDPポインター再開、`git diff --check` 成功。Windows実注入での残留は未確認。

## 2026-11-06 — #174 本番Hub・実WebSocketの追加計測

- `runtime-measure.mjs` でloopback・非注入の2人/4人×5条件を実行。出力の成功up、全解放、旧epoch拒否、新epochの非stale ACKと停止中の注入抑止を全条件で確認。`Hub::run`、受信からのキュー待ち、4ms tick、実ログ記録/flush、通知投入、実WS送信完了と未完了時のキューを測定した。
- [測定手順と判断](../decisions/2026-11-06-host-runtime-measurement.md)、[exe SHA-256と全集計](../data/host-load/runtime-loopback.json)。受信停止でWS送信完了最大5.157秒、送信キュー最大86,572件。Hub停止完了は全条件で最大1.480ms。有限負荷の観測で、無制限キューに最悪時の有限上限は保証できない。配送方式と定数は維持。
- 独立レビューで既存ホスト誤接続の経路を修正し、計測子のループバックbind・割当ポート通知後のみ接続。成功up照合を停止/切断直前からに限定し、最終再レビューに修正必須残なし。
- `cargo test --release --locked --offline` は108件＋プローブ4件成功（手動/長計測の2件は通常実行対象外）。release build、通信55/55、quit/EOF、配信37件、CI相当の2人通常スモーク、スマホ入力16/所有4/セッション7/境界7/UI12、静的画面、構造39、資料、差分検査が成功。

## 2026-11-06 — 実機受入試験の準備と中断（Codex、#10）

- main b3c0e88から専用worktree・codex/10-device-acceptanceを作成。関連Issue・対象11PR・CIを確認し、#10へ着手コメント。実機受入手順とAndroid dry-run補助runnerを作成途中。
- ADB認可済みAndroid 1台、Android 16/API36、1080x2392、Chrome 156.0.8078.79を確認。端末操作試験は未実施。一時forwardは除去し、中断時のforward/reverse一覧は空。
- cargo build --release --locked --offline --manifest-path apps/host-rs/Cargo.toml成功（既存cache、13m31s、LNK4099のみ）。専用exe SHA-256 b1c3c24fa2ded67bf755eb7dde9f80d7ed1aa86412c6a2053539b9b573e00af4。ホストは起動していない。
- node scripts/sim/ui-input-test.mjs 12/12、phone-view-test.mjs 8観点、controller-diagnostics-test.mjs、app-view-test.mjs 25/25、check-static-pages.mjs成功。新runnerは独立レビューの通信期限・cleanup補強が残り、未実行。公開資料検査は当時未作成の証拠ファイル参照を指摘し、作成後の再検査前。
- ユーザー指示で中断。詳細はdocs/develop/acceptance/evidence/2026-11-06.md、再開手順は作業treeのdata/local/device-acceptance/RESUME.md。未コミットで保存、PR未作成。実Windows入力・ゲーム・永続設定変更なし。

## 2026-11-06 — 実機受入手順と端末なしのローカル検証（Codex、#10）

- 既存の専用ブランチを統合main 83c700907f0f382d08b5df9cc8ce1c2c2d274ca7へ早送り。統合側と中断時のBUILD_LOG追記を保持。2〜4人・二段階Ready・#195の安全停止を反映したAT-D01〜08と記録票を整備した。
- Android補助CLIの構文・異常系7/7、同一SHAのホストで --host-only のHTTP・監視接続・初期押下ゼロ・正常終了が成功。dry-run固定、動的ループバック、時間制限と後片付けを実装。独立レビューのPause判定順序・動的ポート・保留手順の指摘を反映した。
- 同一SHAのRustビルド・ホスト108件＋プローブ4件を再利用。今回の通信55/55、quit/EOF、静的配信37資産、スマホ入力16/所有4/セッション7/受信境界7/UI12、PC表示25、診断・画面構文、配布zip、構造・資料・差分検査は成功。
- 実機操作は未実施。実施コマンド、失敗と再試行、ハッシュ、残る確認の詳細は [受入試験の証拠](../acceptance/evidence/2026-11-06.md) を参照。

## 2026-11-06 — Android USBとAndroid・iOS 2台の実機受入（Codex、#10・#38・#39・#157）

- main 83c700907f0f382d08b5df9cc8ce1c2c2d274ca7の固定exeハッシュを照合。Android 16 / Chrome 156のUSB試験で初期表示、担当入力、診断、保持中Pause、再読み込みによるP1復帰が成功。[USB記録](../acceptance/evidence/2026-11-06-android-usb.md)
- 同じPCホットスポットにAndroidとiOSの実端末2台で参加し、二段階Ready・分担、担当入力、切断・再接続、Pauseを部分確認。初回はiOS切断後に停止した状態でボタン待ちがタイムアウトし、追試でiOS攻撃とAndroidジャンプを観測。[2台の記録](../acceptance/evidence/2026-11-06-two-phones.md)
- すべてdry-run。製品コードと既存USB CLIの修正なし。ホスト正常終了、ADB転送と試験用待受の残り0。資料検査と差分検査を実施。

## 2026-11-06 — 2台の操作・通信復帰とWindows安全停止の準備（Codex、#10・#38・#39）

- 統合main e95a43ad69399b7cc863ff99e60905db5a17e7b8 の構造・Rust通信CI成功と、83c7009から製品差分がないことを照合。固定exeハッシュを確認。
- Android・iOSの実端末2台、模擬0、ホットスポットのdry-run。約30秒の担当入力、切断後の停止・同一枠復帰・明示Resume、担当交換・本人確認、物理ホットキー発火と注入OFFを記録。[実機証拠](../acceptance/evidence/2026-11-06-device-safety.md)
- /gameのフォーカス通知・入力観測の境界、OFFで始める専用設定、緊急停止・OS残留観測・復旧を整理。[実入力開始前チェック](../acceptance/windows-input-preflight.md)
- 資料検査と差分検査を実施。
- 監督者の明示許可後に、専用疑似ゲーム画面で単一Spaceの実入力を1回確認。押下・解放の送出成功、画面到達の目視、注入OFFと解放済み状態、終了後のOS状態を記録。残るAT-D04とMinecraftは未受入。

## 2026-11-07 — WebSocket送信待ちの上限（Claude Code、#197）

- 接続ごとの送信待ちを4096件までとし、達した接続と、1回の送信が4秒を超えた接続を切断する。切断は既存の経路で全解放し、再接続で最新の状態を受け取る。閉じる通知と入力処理は変更していない。
- 同じ条件の計測（4人、8秒、ループバック、dry-run、各1試行）。slow-monitorは送信待ち最大105,031件→4,096件、送信の待ち時間8.10秒→4.00秒。安全停止は修正前後とも成功し、停止の往復は14.9ms→5.1ms。burstの送信待ちは最大42件→117件で上限に余裕がある。
- `cargo test` はホスト109件・プローブ4件成功、`protocol-sim` 55/55、`shutdown-sim`が成功。実Wi-Fi・実端末・長時間の負荷は未検証。
## 2026-11-06 — ホストの異常終了の検知と再起動（Claude Code、#222）

- PCアプリが起動後のホストを監視し、異常終了したら自動で再起動する。60秒未満の連続した異常終了は3回までとし、超えたら再起動を止めて案内する。
- 再起動したホストはロビーから始まり、Readyまで入力を送らない。異常終了したホストはキーを解放できない場合があるため、案内に物理キーの操作を含めた。実入力中の異常終了は未検証。
## 2026-11-06 — スマホのカラースキン（Claude Code、#159）

- スマホの「接続・診断」に標準・ダーク・ポップを追加した。色名の上書きだけで切り替え、標準は属性を外して従来の配色に戻す。ゲームごとに端末へ保存し、不正な値は標準にする。
- 入力・通信・操作定義は変更していない。Android Chrome・iPhone Safariの実機は未確認。

## 2026-11-07 — PCアプリの通信の設定（Claude Code、#220）

- 操作設定に「通信の設定」を追加した。自動復帰のON/OFFを切り替え、期限とポートを確認できる。協力プレイ中は変更不可。
- 切替は実行中だけ有効で、起動すると初期値（ON）へ戻る。期限・ポートの変更は従来どおり `config.json`。ホストは変更していない。
- `app-view` 26/26、`check-static-pages`、`ui-input` 12/12が成功。headless Chromeで切替がホストへ届くこと、協力プレイ中に無効になることを確認した。

## 2026-11-07 — 分けやすい人数の参考（Claude Code、#166）

- 分担の画面に、操作定義の重みから計算した人数の参考を表示する。全員に操作があり偏りの最も小さい人数を選ぶ。「推奨」と断定せず、試遊の結果でないことを明記した。
- 実機の記録があるゲーム（現在はMinecraft）には表示しない。Minecraftの計算は2人だが、本番は3人で実機記録があり、食い違って見えるため。
- `app-view` 26/26、`check-static-pages`が成功。headless Chromeで表示位置を確認した。面白さ・操作負担の試遊は未実施。

## 2026-11-06 — 104機能の監査と、ホスト不在・リセット・LAN境界の修正（Claude Code、#200・#212〜#214・#223・#225）

### 機能監査（#200〜#210）

- 対象はmain `d6309e5`、CI 42168038163の配布zip（SHA-256 `3461dc69…c56405`）。104機能の判定は、合格（実機）15、合格（自動試験）40、不具合7、未実装30、未実施9、保留2、対象外1。機能別の根拠は子Issueのコメントに記録した。
- 未チェックは11機能（F01-04、F02-05、F02-07、F04-06、F08-01、F08-02、F08-04、F08-07、F08-08、F08-09、F10-09）。実入力・実ゲーム・実機の比較・開発環境のないPCが必要で、担当は未定。
- 実行：`protocol-sim` 55/55、`app-view` 25/25、`ui-input` 12/12、`phone-lifecycle` 16/16、`phone-session` 7/7、`protocol-boundary` 7/7、`input-owners` 4/4、`shutdown-sim`、`runtime-measure`、`package-smoke`ほかが成功。Rust単体はCIの結果を確認した。
- headless Chromeでスマホ2/3/4台とPC画面を描画し、360×640・320×568で操作部のはみ出しがないことを確認した。配布版PCアプリをdry-runで起動し、通常終了と孤児プロセスなしを確認した。実OS入力・実ゲーム操作・PC設定の変更はしていない。
- 新規Issueは#212〜#227。#215は初版で非表示の要素の色を見て誤った記述をしたため訂正した。
- 未確定の観測：ホストの強制終了後にPCアプリがWM_CLOSEで終了しない例を4試行中1回観測した。再現せず原因は不明（#222）。

### 修正（ブランチ `claude/223-host-handover-reset`）

- #212：リセットで前回の参加者・分担・理由・自動復帰期限を消す。
- #213：リセットは全員切断とし、スマホは4001で自動再接続せず案内を出す。
- #223：ロビーの切断枠を15秒で解放し、P1が空くと接続中で最も若い枠をP1へ移す。接続は4008で閉じ、通常の再接続で戻す。準備中以降は移さない。
- #214：PC専用の画面を実ファイルで判定し、`::$DATA`を配信しない。
- #225：自動復帰ON・15秒の判断を資料へ記録した。コードの初期値は変更なし。
- 判断は[資料](../decisions/2026-11-06-host-reset-auto-resume.md)に記録した。実端末でのホスト交代は未実施。
- 検証：`cargo build --release --locked --offline` 成功。`cargo test` はホスト114件・プローブ4件成功、手動2件は対象外。`protocol-sim` 56/56、`shutdown-sim`、`phone-session` 7/7、`phone-lifecycle` 16/16、`app-view` 25/25、`ui-input` 12/12が成功。
- headless Chromeのスマホ画面で、ホストのタブを閉じて14秒時点はP2のまま、19秒時点でP1に昇格し、空いた枠に新しい端末が参加できることを確認した。リセットでは全員が案内を表示し、接続は0のままだった。LAN経路の表記違いは403または404になった。

## 2026-11-07 — React移行の基盤とスマホ画面の外枠（Claude Code、#235）

- ユーザー判断でReact移行を最優先にした。`apps/web/` にReact 19・Viteを導入し、ビルド結果を `apps/web-static/react/` へ出す。`/phone-react.html` は確認用で、既定の画面は変更していない。
- `index.html` の本文を機械変換して外枠にし、入力と接続は既存の `controller.js` をそのまま使う。
- `react-phone-parity.mjs` を追加した。既存画面とReact版で、DOM97要素の構造、位置、WebRTC、操作、押下と解放の順序、スティック、保持中のPause、再読み込みの結果が一致した。タップの遅延（40回）はp50 5.4→4.7ms、p95 17→12.5ms。視点の送信は47→48.5件/秒（WS・RTCの全送信の数）。読み込みは1.6→1.1秒。各1試行のheadless Chromeの値で、実端末・無線の性能ではない。
- 試験の検出力は、React版のclassを意図的に変えて不合格になることで確認した。mainの `index.html` の変更を取り込んだ際も、外枠のずれ（待機画面の案内）を検出した。外枠は再生成して一致を確認した（統合後のタップp95 12.8→12.5ms）。
- `npm audit --omit=dev` は脆弱性0件。バンドルは226.8kB（gzip 71.1kB）と28.2kB。実端末、WebView2は未確認。

## 2026-11-06 — 担当色の統一と待機画面の案内（Claude Code、#215・#227）

- `colors.css` の `--p1〜4` と `/game` の色をキャラクターの色へ統一し、`/game` のP4の未定義を解消した。`check-static-pages.mjs` に一致の検査を追加し、色を崩すと失敗することを確認した。
- 接続案内を2〜4人の文言にした。スマホの待機画面の押せないボタンを、ボタンではない案内へ変更した（原案の位置と形は維持）。
- `check-static-pages`、`app-view` 25/25、`phone-view`、`ui-input` 12/12、`phone-lifecycle` 16/16、`verify-ui-evidence`、`static-assets-sim`（37ファイル）が成功。headless Chromeの360×640で待機画面を確認した。実端末は未実施。保存済みの画面画像は更新していない。
## 2026-11-06 — PCアプリ内の動作環境・制限事項（Claude Code、#226）

- 操作設定の画面に「動作環境・制限事項」を追加した。文面は配布zipの `README.txt` に合わせた。`check-static-pages.mjs` に必須の語の検査を追加した。
- `check-static-pages`、`app-view` 25/25、`ui-input` 12/12が成功。headless Chromeで表示を確認した。WebView2の実画面は未確認。
## 2026-11-06 — PCアプリの版の表示（Claude Code、#216）

- ホストが `package-manifest.json` の版とcommitを読み、PC本体の `/api/info` にだけ返す。開発中はビルドの版を使い「開発版」と表示する。操作設定の画面に表示する。
- 更新の確認は外部通信を伴うため実装していない。扱いは #168 の結論に従う。
## 2026-11-06 — AT-D04実入力再開の準備（Codex、#39）

- 統合main d6309e512ded9d52f9e8d1b5268a95ea62cd11e6 の構造CI・Rust通信CIが成功。固定exeのSHA-256が記録と一致し、ビルド元83c7009との製品差分なし。
- 専用ルート・初期注入OFFと自動復帰OFFの設定、別窓のイベント観測、OSの読み取り観測を準備。ループバックdry-runでホットキー登録成功。今回の物理発火と実入力開始許可が揃うまでA〜Eを保留。[再開準備記録](../acceptance/evidence/2026-11-06-at-d04-restart.md)
- node --check（ローカル観測スクリプト）、OS読み取りの短時間試験、python scripts/check-public-docs.py --all、git diff --checkを実行。

## 2026-11-06 — AT-D04の左右マウスと同時保持の追試（Codex、#39）

- 再開dry-runで物理停止の発火、注入OFF、論理押下ゼロを確認。監督者の明示許可後、Aの左右マウス各1回はホスト・専用画面・OSの3記録が一致。別窓イベント0と全解放を確認した。
- Bの初回は観測疎通とモード切替に問題があり、送出前に終了。隔離画面の切替UIを外し、試行固有の観測資産でdry-run疎通を再確認。B追試で同時保持と解放を観測したが、先行単独クリックがあり全体判定は不合格。経緯は [試験記録](../acceptance/evidence/2026-11-06-at-d04-restart.md) に追記。
- ローカル試験スクリプトの node --check、公開資料検査と差分検査を実行。C〜EとMinecraftは未実施。

## 2026-11-07 — AT-D04の同時保持・保持中Pause（Codex、#39）

- 最新main d6309e5の必須CIと固定exeを再照合し、dry-runで物理停止と全解放を再確認。明示許可後にB・C各1組を実施し、ホスト・疑似ゲーム・OSの証拠を照合して合格。
- Dは保持中のフォーカス喪失で全解放を観測。切替先のfocusイベントが取れない試行は合格に数えない。結果と再試験の手順を [受入記録](../acceptance/evidence/2026-11-06-at-d04-restart.md) に追記。

## 2026-11-07 — AT-D04のAlt+Tab・実入力中緊急停止（Codex、#39）

- 操作簡略化のため模擬WS参加者2つを用い、監督者のAlt+Tabと物理Ctrl+Alt+F12でD・Eを各1回実施。固定exeによる実Windows入力、疑似ゲームへの到達、system全解放、GetAsyncKeyStateの全解放、別窓への入力ゼロを独立照合した。両系列はこの条件でPASS。実スマホ0台、WebRTC未使用。
- ホスト終了0、OFF・押下と未確認解放ゼロを確認。Dはcoopのまま入力解放、Eはpaused・再開不可。失敗・準備中断の記録、余剰クリック、未確認条件を [受入記録](../acceptance/evidence/2026-11-06-at-d04-restart.md) に併記した。AT-D04全体とMinecraftの受入は継続中。
- ローカル補助のnode --checkと監督指定なし起動の拒否を確認。補助の例外理由保存、終了状態を含む判定を改善。公開資料検査とgit diff --checkを最終差分で実施。

## 2026-11-07 — D・E反復と緊急停止後の旧入力・再開拒否（Codex、#39）

- 現地監督下でDを2回、Eを2回追加し、同じ固定exe・模擬WS参加者2つの条件でD/E各3回の合格を確認。E最終試行は停止後に旧epoch入力2件のstale ACKと実RESUME要求の拒否を確認し、追加送出ゼロ・OS全解放を維持した。[実測](../acceptance/evidence/2026-11-06-at-d04-restart.md)
- 既存通信試験の緊急停止ケースへ、旧epochの更新・両参加者のstale ACK・RESUME拒否・追加送出なしを追記。`node scripts/sim/protocol-sim.mjs --bin ../../main-83c700907f0f/recooplay-host.exe` を専用worktreeで実行し、最終差分で55/55合格。OS入力なし。
- 独立レビューで、OFFでの無送出だけではepoch拒否を証明できない点を修正。構文検査・資料検査・差分検査を実施。A〜Cの各3回反復とAT-D04の他の個別系列は残件として維持。

## 2026-11-07 — 未マージPRのレビューと競合解消（Codex）

- #211・#228・#229・#231・#232の差分とCIを確認。BUILD_LOGの各記録、担当色と動作環境の両検査を保持して競合を解消した。
- ローカルで `app-view-test` 25/25、`ui-input-test` 12/12、`phone-view-test`、`phone-session-test` 7/7、`phone-lifecycle-test` 16/16、`check-static-pages` と差分検査が成功。公開資料のPython検査は、この実行環境にPythonがないためCIで確認する。
- #234はlocalStorage getterのSecurityErrorによる初期化失敗を再現し保留。#230は再起動と終了の競合、再起動の待受タイムアウト未処理を指摘し保留。通常系の試験成功と、異常系の問題を区別する。
- このレビューでは実端末・Minecraft・実OS入力の追試は実施していない。

## 2026-11-07 — スマホの待機画面をReactへ移す（Claude Code、#235）

- 表示内容の計算を `phone-model.js` の純粋関数へ分け、既存画面とReact版で共用する。React版では既存の書き込みを止め、待機画面をReactだけが描く。入力と接続は変更していない。
- `react-phone-parity.mjs` に待機画面の内容の完全比較（ロビー・一時停止中）を追加した。タグ間の改行とimgの属性の順序だけを除く。文言を1文字変えると不合格になることを確認した。
- 全項目一致。タップのp95は12.4→13.2ms、視点は49.5→47.5件/秒（headless Chrome、1回の比較）。`phone-view`、`phone-lifecycle` 16/16、`ui-input` 12/12、`check-static-pages`、`static-assets-sim`（42ファイル）が成功。実端末は未確認。

## 2026-11-07 — ホストの手動譲渡（Claude Code、#233）

- ロビーのP1のスマホに「ホストを譲る」を追加した。サーバーが現在のホスト・ロビー・相手の接続を確認し、2つの枠を入れ替える。両者は4008で閉じ、同じトークンで再接続する。
- 認可の純粋関数・枠の入れ替えの単体試験と、`protocol-sim` の譲渡の試験（非ホスト・旧epoch・未接続の拒否を含む）を追加した。実端末は未確認。

## 2026-11-07 — スマホのリモコン画面の表示をReactへ移す（Claude Code、#235）

- 表示内容を `phone-model.js` の `remoteModel` へ分けた。開始・前面化・終了のボタン、案内、参加者、ホストの譲渡をReactが描く。タッチパッドとキーは `memo` で固定し再描画しない。サーバーの拒否の案内は `phoneView.note` に一本化した。
- `react-phone-parity.mjs` にリモコン画面の内容（ロビー・準備中・一時停止中）、拒否の案内、再描画の後の実タッチの入力を追加した。全項目一致。
- タップのp95は5回の比較で既存13.1・13.0・15.6・12.3・12.6ms、React 82.7・12.3・21.6・14.0・12.9ms。最初の82.7ms（最大350ms）は再現しなかった。既存画面でも最大58msの例があり測定環境の揺れと判断したが、原因は確定していない。CIでの値を見続ける。
- `phone-view`、`phone-lifecycle` 16/16、`ui-input` 12/12、`controller-diagnostics`、`phone-session` 7/7、`check-static-pages`が成功。実端末は未確認。

## 2026-11-07 — 受入追試の分離と視点試験の端数判定（Codex、#39）

- 他作業者がPR #211を統合したため、追加実測と回帰テストをPR #242へ分離。main d4cdcd0との製品差分ゼロを確認し、双方の履歴・記録を保持した。
- 取り込み後CIは通信55/56で視点累積ケースが失敗。区間間の整数端数持越しを計算モデルで再現し、同じ基準点から全体累積を照合するよう試験を修正。許容幅と不正パケットの条件を維持。緊急停止後の拒否ケースは成功した。新製品の実入力は未追試。
- 統合ソース7af027aで `cargo build --release --locked --offline --manifest-path apps/host-rs/Cargo.toml` と `cargo test` が成功（115+4件成功、既定ignored 2件）。専用コピーのexeに対する通信試験は56/56合格。新exeはdry-run専用で実入力なし。SHA-256と旧版実測との区別は受入記録へ保存した。

## 2026-11-07 — React移行・ホスト譲渡・PC設定のPRレビュー（Codex）

- #241・#243・#244の差分、CIのRust・通信・配布・React同等性の成功を確認して順に統合した。既定の入口は従来の画面のまま。
- #242・#236・#237は双方の検証記録を保持して統合準備。通信設定と人数の参考表示の関数・import・試験を両方残した。
- ローカルの `npm run build`、`app-view-test` 27/27、`ui-input-test` 12/12、`phone-view-test`、`phone-lifecycle-test` 16/16、`check-static-pages`、構文・差分検査が成功。ブラウザー比較のローカル追試はCDPの `Target.createTarget` がタイムアウトし、完了できなかった。CIの同等性試験成功と区別する。
- #230・#234は前回指摘が未修正のため保留を継続。#239は上限超過の本文を落とした後、送信側の取り出しで件数が減り、切断条件を満たさず接続が残る分岐を指摘して保留した。
- このレビューでは実端末・Minecraft・実OS入力の追試は実施していない。

## 2026-11-07 — 機能監査の再開：CI成果物での回帰確認と変更機能の再判定（Claude Code、#200）

- 対象 main `bed7b9c`。このPCではStrawberry Perlとlibclangが見つからず、ローカルの `cargo build` / `cargo test` は実施していない。代わりに利用者の許可を得て、Actions run 42347182356 の配布物 `ReCooplay-0.1.0-windows-x64.zip`（SHA-256 `dfc4d047…0c95d0`、同梱の.sha256と一致、manifest commit bed7b9c・dirty=false）の `recooplay-host.exe`（SHA-256 `5789c244…44735e`）を使った。CI成果物での試験であり、ローカルビルドの結果ではない。
- dry-run・OS入力なしで、`protocol-sim` 57/57、`app-view-test` 27/27、`check-static-pages`、`verify_overlay.py`、`phone-session-test` 7/7、`phone-lifecycle-test` 16/16、`ui-input-test` 12/12、`input-owners-test` 4/4、`protocol-boundary-test` 7/7 ほかが成功。`react-phone-parity` は `apps/web` 未ビルドのため未実施。
- リセット後のホスト決定を監査用のdry-run試験で確認した（全員4001で切断、最初に再参加した端末がホスト、旧トークンではP1を取り戻せない、ロビーでの15秒以内の再接続でホストを維持）。試験スクリプトと詳細はGit対象外の `data/local/feature-audit-104/` に置いた。
- 再判定の案：F01-10・F03-12・F07-06 は不具合から合格（自動試験）、F10-10 は未実装から合格（自動試験。更新情報は #168 待ち）。Issueへは未投稿。実端末・Minecraft・実OS入力は未実施で、未チェックの11機能は残る。

## 2026-11-07 — 機能監査の実機確認：複数指・ホットスポット・遅延・全解放・緊急停止（Claude Code、#200）

- 対象はmain `bed7b9c` のCI成果物（run 42347182356、`recooplay-host.exe` SHA-256 `5789c244…44735e`）。ローカルビルドではない。端末はAndroid（Chrome 156）とiPhone（iOS 18.7）。PCのモバイルホットスポットを使った。
- dry-run・疑似入力先：F04-06（実指の複数操作、2台で3回ずつ。二重down・対応のないup・残留0）を合格（実機）。F08-01・F08-02（60秒×3回、実機2台＋模擬1台）は保留。iPhoneで受信の途切れが多い。p50/p95/p99、経路比較、許容判断はない。
- 通常モード・入力OFF固定：F01-04（アプリのボタンでホットスポットをON、Wi-Fi QR・参加QRで2台が接続）を合格（実機）。
- 監督下の実入力（隔離ルート、ブラウザーの疑似ゲーム画面と観測窓、模擬参加3人でSpace・左・右）：F08-08（操作元の解放×3、保持中Pause×3）とF08-07（物理Ctrl+Alt+F12×3。停止後は旧epochがstale、RESUMEは拒否）を合格（実機）。左を押したまま右を押すと右が届かない事象が2回起きた。常駐ランチャーOrchisの横取りによる環境要因で、Orchisを止めると解消した。
- 結果は #201・#204・#208 へ投稿した。試験の記録・補助スクリプト・生ログはGit対象外の `data/local/feature-audit-104/` に置いた。Minecraftへの実入力、F08-04・F08-09・F02-05・F02-07・F10-09は未実施。終了時点でmainは `d1b6521` に進んでおり、ホスト側の変更（`hub.rs` など）が今回の確認に影響するかは再評価が必要。

## 2026-11-08 — 機能監査の実機確認の続き：対象の制限・通信断・ゲームの起動と前面化（Claude Code、#200）

- 対象は引き続きmain `bed7b9c` のCI成果物（`recooplay-host.exe` SHA-256 `5789c244…44735e`）。`bed7b9c..d1b6521` のホストの変更は役割交代・人数変更の追加だけで、緊急停止・全解放の既存の経路は変わっていないことを確認した。
- 監督下の実入力（隔離ルート、ブラウザーの疑似ゲーム画面と観測窓）。F08-09は、保持中に観測窓を前面にする操作を自動で3回行い、全回合格。疑似ゲーム画面の`blur`から3〜6msで全解放し、観測窓への入力は0件だった。F08-04は、実機AndroidをP1にして開発者ツールのタッチでボタンを保持し、Wi-Fi OFFとChromeの強制終了を3回ずつ行い、全回合格。検知はそれぞれ約4.2秒（heartbeat timeout）と0.25〜0.48秒（close 1006）で、P1〜P3の押下をすべて解放し、OSも全解放した。
- Minecraft Java Edition 26.3（通常モード、入力の送出0件）。F02-05は、PC画面からの起動要求でランチャーが開き、「プレイ」の後に`javaw.exe`を検出して前面にした。F02-07は、Ready×1とRESUME×2の3回とも、0.07〜0.1秒でMinecraftを前面にした。いずれも合格（実機）。
- 結果は #202・#208 へ投稿した。未チェックはF08-01・F08-02（保留）とF10-09（別PCなし）。Minecraftへの実入力、iPhoneでの通信断、自動復帰ONの期限内の復帰は未実施。記録はGit対象外の `data/local/feature-audit-104/`（PROGRESS.md、RUNS.md）にある。

## 2026-11-08 機能監査：Minecraftへの実入力と障害試験（部分実施）

- 対象：main `bed7b9c` のCI成果物（run 42347182356、exe SHA-256 `5789c244…44735e`）。通常モード・入力ON、Minecraft Java Edition 26.3、検証用に作った新規のクリエイティブ・ピースフルのワールド。P1＝実機Android、P2・P3＝模擬WS。実スマホ3台・iPhoneでの試験ではない。
- Minecraftへの実入力：W・Space・視点・左右クリックの送出に成功し、ブロックの破壊と設置を画面で確認した。連続3回（模擬3人）と、Android実タッチ（P1）で、押下の残留0、入力OFF、ホスト終了コード0。
- 障害：保持中のWi-Fi OFFで約4.4秒後に停止・全解放。自動復帰ONで約9秒の切断は期限内に復帰、約24秒の切断は復帰せず（手動の再開で復帰）。Pause後の再開で新しい入力が流れ、旧押下は復元されない。画面スリープで一時停止（再接続は端末のロック解除待ちで未確認、epochが3進んだ原因は未確認）。
- F08-01（通信テスト）：Android（WS+RTC p95 62〜84ms、WS単独 p95 124〜388ms）とiPhone（p95 56〜68ms）を計測。判定は保留。集計が回ごとに分離されない点は #259、常駐アプリの横取りは #260。
- Tauri版PCアプリ（dry-run）の窓表示と、閉じたときのホスト子プロセスの終了を確認した。
- AT-D05は未合格。実スマホ3台、同意付き動画、iPhone、人の常駐と物理緊急停止の準備、WS単独/RTC単独の断が残る。ONの判断は実機の合格を意味しない。
- 詳細な記録はGit対象外の `data/local/feature-audit-104/RUNS.md`（RUN-20261107-01〜RUN-20261108-38）。投稿先：#39・#40・#157・#200・#201・#202・#204・#208。
- 追求で見つけた2件を起票した：#261（Minecraftがゲームメニューのまま前面になっていても入力を送り、メニューを誤操作する）、#262（1人のスマホのフォーカス喪失で他の参加者の押しっぱなしまで解除される。画面スリープでepochが3進むのも同じ原因）。
## 2026-11-07 — 画面の定義を index.html へ一本化（Claude Code、#235）

- `index.html` とReactの二重管理をなくした。`phone-react.html` はビルド時に生成し、Reactは `createPortal` で変わる部分だけを既存の要素へ描く。タッチパッド・キーにReactは触れない。
- `index.html` に要素を足し、React側を変えずに `react-phone-parity` が合格することを確認した（確認後に元へ戻した）。全19項目一致、タップのp95 19.5→11.9ms。
- `BUILD_LOG.md` に `merge=union` を指定した。2ブランチの追記が競合なく両方残ることをローカルのGitで確認した。GitHubのマージ判定での動作は未確認。

## 2026-11-07 — P2以降の表示の整理（Claude Code、#238）

- 前面の注意を見ている人が行えることに合わせ、ゲームの検証状況の案内はホストだけに出す。接続・診断の数値と通信テストをホストだけにし、参加者には接続状態と対処の案内を残す。
- 満員・再参加不可の案内から「PC側でリセット」をなくした（#223で切断枠が15秒で空くため）。参加者の枠の一覧、担当の確認、回転、切断の案内は全員に残す。
- `body[data-host]` は表示の切替だけに使い、権限はホストが判定する。実端末は未確認。

## 2026-11-07 — 一時停止中の人数変更（Claude Code、#162）

- 一時停止中にPC画面から、今の接続で参加者と分担を決め直せるようにした。ホストの接続、2人以上、参加者との差があるときだけ許可する。全解放・epoch更新・全員の確認・明示の再開を必要とし、自動復帰は解除する。
- 協力プレイ中・古いepochの要求は受け付けない。実端末は未確認。

## 2026-11-07 — リモコンのReact化・参加者向け表示・人数変更のレビュー（Codex）

- #245・#246の差分、CIのRust・通信・React同等性・配布検証の成功を確認して統合した。#247は全解放・epoch更新・全員の担当確認・明示再開の条件を確認し、双方の記録を保持して統合準備した。
- ローカルで `npm --prefix apps/web run build`、`phone-view-test`、`phone-lifecycle-test` 16/16、`controller-diagnostics-test`、`ui-input-test` 12/12、`app-view-test` 27/27、`check-static-pages`、`node --check scripts/sim/protocol-sim.mjs`、差分検査が成功。実端末・Minecraft・実OS入力の追試は実施していない。
- #230・#234・#239は、前回指摘した再起動処理・保存領域の取得・送信待ち上限超過時の切断処理が未修正のため保留を継続する。

## 2026-11-07 — 観客向け表示（Claude Code、#163）

- OBS等のブラウザソースで重ねる透過ページ `/overlay` を追加した。参加者の色、担当、押している入力、進行を表示する。PC本体だけが開け、読み取り専用でホストへ操作を送らない。
- ゲームへの常駐描画は採用しない。フォーカスと入力に影響させないため。ON/OFFはOBS側のソースで行う。第三者が担当を理解できるかの確認は未実施。

## 2026-11-07 — PC画面の開始前の演出（Claude Code、#160）

- 参加、ゲーム選択、分担の決定、画面の切替に0.32秒の演出を追加した。ユーザー判断でF07-05はReady前で完結させ、協力プレイ中・一時停止中は再生しない。効果音はなし。
- 状態が変わった瞬間だけ `pcEffects` で判定する。入力と前面化は待たせない（ChromeでREADYからcoopまで29ms）。`prefers-reduced-motion` では既存の共通CSSで止まる。

## 2026-11-07 — 開始前の演出と観客向け表示のPRレビュー（Codex）

- #248の差分・CI成功を確認して統合。#249はPC専用の配信境界と表示処理を確認し、演出・観客表示の両関数、両試験、双方の検証記録を保持して統合準備した。
- ローカルの `app-view-test` 29/29、`ui-input-test` 12/12、`check-static-pages`、`npm --prefix apps/web run build`、差分検査が成功。実OBS・実端末・Minecraft・実OS入力の追試は実施していない。
- #230・#234・#239は前回指摘が未修正のため保留を継続する。

## 2026-11-07 — キー割当の編集とゲーム別の保存（Claude Code、#50・#53）

- PCの操作設定で、各操作に送るキーをホストが送れるキー・左右のマウスボタン・送らないから選べるようにした。ゲームごとに `%LOCALAPPDATA%\Re-Cooplay\key-overrides.json` へ保存し、初期値へ戻せる。壊れた・知らない値は無視して初期値で動く。
- 協力プレイ中は変更できない。変更時は既存の停止中のキー再読込と同じく全解放・epoch更新を行う。ゲームの設定ファイルを読んだ後に重ね、同じキーの警告もそのまま出る。
- シミュレーション（`RECOOPLAY_NO_CONFIG=1`）では保存しない。ボタン配置の編集（#50の残り）は未実装。
## 2026-11-07 — 時間制の役割交代（Claude Code、#161）

- PCの操作設定で1・2・3分を選べる。既定はOFF。時間になると一時停止して全解放し、担当を参加者の間で1つずらし、全員の確認を待つ。再開はホストの明示操作だけで、自動復帰しない。ホストの権限は移らない。
- 一時停止中は時間を数えず、協力プレイへ入るたびに数え直す。試験用に、dry-runだけ標準入力の `rotate` で交代の時刻にできる。
- 面白さと混乱の試遊（#161の完了条件）は未実施。OFFのままなら従来の動作は変わらない。

## 2026-11-07 — PC画面のReact移行の基盤と参加者の表示（Claude Code、#235）

- `app.html` から `app-react.html` をビルドで生成し、参加者の表示をReactが描く。表示内容は `playerCards` で既存の画面と共用する。`app-react.html` はホストでPC本体だけが開けるページにした。
- `react-pc-parity.mjs` を追加した。参加待ち・1人・2人・準備中・協力プレイ・一時停止・切断の参加者の表示、DOMの構造、演出の回数（12回）、実行時のエラーが一致。classを変えると不合格になることを確認した。
- 既存の画面は描き直しのたびに要素を作るので、演出が途中で消えることがある。React版は要素を保つので最後まで再生される。WebView2は未確認。

## 2026-11-07 — PC画面の分担の表示をReactへ移す（Claude Code、#235）

- 分担の表示を `roleColumns` で既存の画面と共用し、React版ではReactが描く。入れ替えのクリック・キー操作は従来どおり `document` で受ける。
- `react-pc-parity.mjs` に分担の表示（決定前・決定後・入れ替えの選択・入れ替え後）を追加した。
- `react-phone-parity` が手元で3回中2回不合格になった。視点はReact版のほうが速い（46→49.5件/秒）のに両方向の差で判定していた。タップは20回の p95 が実質最大値で、1回の揺れで5msを超えた。視点は悪化だけを判定し、タップの許容幅を10msにした。CIの許容幅（30ms）は変えていない。
- 同じ試験の「サーバーの拒否の案内」も、通常の案内と見分けられない待機条件で揺れていた。拒否の案内だけにある形で判定するようにした。
## 2026-11-07 — キー編集とPC画面のReact移行のレビュー（Codex）

- #251の保存・入力停止・認可・キー反映の差分とCI成功を確認して統合した。#252はPC専用ページの配信境界とReactの同期描画を確認し、キー編集・参加者表示・両方の検証記録を保持して統合準備した。
- ローカルで `app-view-test` 29/29、`ui-input-test` 12/12、`phone-lifecycle-test` 16/16、`npm --prefix apps/web run build`、`check-static-pages`、`node --check scripts/sim/react-pc-parity.mjs`、差分検査が成功。WebView2・実端末・実ゲーム・実OS入力の追試は実施していない。
- #230・#234・#239は前回から変更がなく、指摘未修正のため保留を継続する。

## 2026-11-07 — 配信するロゴの容量を減らす（Claude Code、#256）

- `logo.png`（3200×2400、1.3MB）はスマホの画面を開くたびに読み込まれていた。表示は最大でPC画面の約215pxなので、960×720（210KB）にした。原画像は `apps/desktop/icons/logo-source.png` に残し、`prepare-brand-assets.py` で作り直せるようにした。
- 白・黒の背景に合成した表示サイズの比較で、差は最大12/255、差が16を超える画素は0。`verify-ui-evidence`、`static-assets-sim`、両方の同等性試験などが成功。
- #254・#256 の初回の調査で「参照なし」とした中間画像とスクリプトは、証拠フォルダ内の資料から参照されていた。調べ方の誤りなので、削除せずIssueで訂正した。

## 2026-11-07 — 送信待ち上限の切断漏れの修正（Claude Code、#197）

- 上限で本文を落とした後に送信側が1件消化すると、件数だけの判定では切断されず、落とした通知が補われないまま接続が続く競合があった。落としたことを `SendQueue.overflowed` に記録し、送信側はその記録で必ず切断する。
- `cargo test` ホスト126件・プローブ4件、`protocol-sim` 60/60、`shutdown-sim` が成功（dry-run）。実Wi-Fi・実端末・長時間の負荷は未検証。

## 2026-11-08 — #265 Steam・Epic・Minecraft 以外のランチャーのゲームを検出する（Claude Code）
- `apps/host-rs/src/launchers.rs` を追加し、検出（`games::detect`）に組み込んだ。対象：Steam に追加したゲーム（`shortcuts.vdf`）・GOG・Ubisoft Connect・EA app・Battle.net（`product.db`）・Xbox（PC Game Pass、`XboxGames\*\Content`）。読み取りのみ。起動は検出時に確かめた値（英数字のID・実在する実行ファイル）だけから組み立てる。GOG は実行ファイル、ほかはランチャーのプロトコル（Xbox はパッケージのアプリID）で起動する。入力先はインストール先のフォルダ内のプロセス。一覧の項目はすべて「未検証」。itch.io は、インストール情報が SQLite と gzip にしかないため対象外（手動登録で代わりに使える）。判断の記録は `docs/develop/decisions/2026-10-25-game-detection-launch.md` の追記。
- レジストリは試験で JSON（`<偽のフォルダ>\registry.json`）に差し替えられる。ログ `games_detected` に出所ごとの件数を足した（名前・場所は残さない）。
- 画面：出所の名前（Steam（追加したゲーム）・GOG・Ubisoft Connect・EA app・Battle.net・Xbox）を出し、見出しの件数を「Steam・Epic など」として数える。`protocol-specification.md` の source の一覧を更新した。
- 検証：`cargo test --release --locked` **135件合格**（追加9件：Steam に追加したゲームの64ビットID、バイナリVDFの不正データ、レジストリ系3ランチャー、Battle.net の製品の読み取りと自身の除外、Xbox の読み取りと Minecraft ランチャーの除外、SHA-256、発行者ID）。このPCの実データで、Xbox 版 Minecraft ランチャーのファミリー名の計算が公式の値（`Microsoft.4297127D64EC6_8wekyb3d8bbwe`）と一致し、実際の `product.db`（Battle.net 自身だけ）からゲームを出さないことを確かめた。`protocol-sim` 60/60、`app-view-test` 30/30（追加1件）、`ui-input-test` 12/12、ほかCIの試験（React の比較・配布zipを除く）と `verify_overlay.py`・`check-public-docs.py` 合格。
- **未検証：** GOG・Ubisoft・EA・Steam に追加したゲームは、このPCに入っていないため固定のデータでの試験だけ。Battle.net・EA・Ubisoft・Xbox の起動の形式で実際に起動できるか（#218）。
## 2026-11-08 — スマホの画面切り替えに演出を付ける（Claude Code）

- ユーザーが比較ページで6案から「ワイプ＋流れ星の群れ」を選び、帯の色を本人のキャラクターの色（P1青・P2緑・P3紫・P4赤）に合わせるよう指示した。`view-transition.js`・`view-transition.css` を追加し、`phone-view.js` の `.view` の切り替えから呼ぶ。
- 帯は620msで横切り、画面を覆う310msの時点で画面を入れ替える。それまで古い画面は `inert` にして新しい押下を受けない。押しっぱなしの解放は従来どおり切り替えの開始時に行う。動きを減らす設定とブラウザ以外（試験）では演出せず即座に切り替える。演出中に次の切り替えが来たら、前の入れ替えを済ませてから始める。
- `view-transition-test` を追加して成功。`phone-view-test`、`phone-lifecycle-test`、`phone-session-test`、`phone-skin-test`、`controller-diagnostics-test`、`app-view-test`、`ui-input-test`、`check-static-pages` も成功。`ui-preview.mjs` とheadless Chromeで、P1・P2・P3の帯の色と接続直後の切り替えを目視確認した。
- Rustホストのビルドが必要な `react-phone-parity`、実端末（iPhone・Android）での見た目・滑らかさは未確認。

## 2026-11-08 — スマホのキャラクターの切り抜きを直す（Claude Code）

- ユーザーから「スマホのキャラクターが見切れている」と指摘があった。P4（赤）は切り抜きの値がなく、青用の値で上と左右が欠けていた。P2〜P4の枠の縦横比も青の値のままだった。接続中の画面のキャラクターは下が切れていた。
- P2〜P4の枠の縦横比と切り抜きを画像ごとの値にし、P4の値を追加した（`shared.css` の `.art-1`〜`.art-3` と同じ）。接続中は不透明部分を枠に合わせて全身を出す。待機画面でキャラクターの下半分がカードの後ろに隠れる配置は意図どおりなので変えない（一度全身表示にしたが、ユーザーの指示で戻した）。
- `ui-preview.mjs` とheadless Chromeで、402×874・430×932のP2〜P4（P4は枠を書き換えて表示）と接続中の画面を目視確認した。`phone-view-test`・`phone-skin-test`・`app-view-test`・`ui-input-test`・`check-static-pages`・`view-transition-test` が成功。実端末は未確認。

## 2026-11-08 — スマホの背景をキャラクターの色ときらめきにし、待機カードを不透明にする（Claude Code）

- ユーザーが背景の比較ページから、B3（キャラクター色のグラデーション）とB2（空色グラデーション×きらめき）の組み合わせを選んだ。上は本人のキャラクターの色を淡く敷いて同じ色の水玉を重ね、下はレモン色の空に白と黄色の✦を置く。`phone-background.css` と `index.html` の `.phone-bg` で描き、背景画像 `mobile-stars.png` はスマホ画面では使わなくなった（ファイルは残す）。ダーク配色では従来どおり単色にする。
- 待機カードが半透明で、後ろに隠したキャラクターの下半身が透けていたため、不透明の `--color-surface` にした。
- `ui-preview.mjs` とheadless Chromeで、P1〜P4（P4は枠を書き換えて表示）、ダーク、ポップの配色を目視確認した。`phone-view-test`・`phone-skin-test`・`phone-lifecycle-test`・`app-view-test`・`ui-input-test`・`check-static-pages`・`view-transition-test` が成功。`static-assets-sim` はWindows用のRustホスト（`recooplay-host.exe`）が必要なため実行できなかった。実端末は未確認。

## 2026-11-08 — 待機カードの「Readyで操作画面に変わります」を2行にする（Claude Code）

- 1行のまま大きな文字で表示していたため、枠が待機カードの枠にかかっていた。「Readyで／操作画面に変わります」の2行にし、幅をカードの86%まで、文字を `clamp(14px,4.3vw,19px)` にした。
- `ui-preview.mjs` で320×568・360×640・402×874・430×932の枠の位置を測り、カードの内側に収まることを確認した。`phone-view-test`・`check-static-pages`・`phone-skin-test` が成功。

## 2026-11-08 — スマホの背景の模様を平たい星と流れ星にする（Claude Code）

- ユーザーが前の背景（`mobile-stars.png`）の流れ星を参考に挙げ、光らない平たい模様の5案からV1（5つ角の星＋3本線の尾の流れ星を画面全体に散らす）を選んだ。グラデーション（上はキャラクターの色、下はレモン色）はそのまま、上の水玉と小さな✦をやめて `assets/phone-stars.svg` を白の半透明（`--color-bg-star`）で重ねる。形はSVG、色はCSSの mask で付ける。
- `ui-preview.mjs` とheadless Chromeで、P1〜P4（P4は枠を書き換えて表示）、ダーク、ポップの配色を目視確認した。`phone-view-test`・`phone-skin-test`・`check-static-pages`・`app-view-test`・`ui-input-test`・`view-transition-test` が成功。Rustホストは `.svg` を `image/svg+xml` で配信する（`main.rs`）が、実際の配信は未確認。

## 2026-11-08 — 画面切り替えの流れ星を背景と同じ形にする（Claude Code）

- ユーザーが背景V1に合わせた演出の4案からT1を選んだ。帯（キャラクターの色と水玉）はそのままに、流れ星を背景と同じ平たい5つ角の星＋3本線の尾にし、光（drop-shadowのぼかし）をやめた。真ん中の✦も5つ角の星にした。星の大きさは比較ページ（画面の幅244px）で決めた値を、実際の画面の幅に合わせて拡大する。使わなくなった `--color-fx-star-tail`・`--color-fx-star-glow` を削除した。
- 比較ページでキャラクターがカードの手前に出ていたのは比較ページだけの誤り（`z-index`）で、実際の待機画面はカードの後ろから出る配置のまま。
- `view-transition-test`・`phone-view-test`・`phone-skin-test`・`check-static-pages` が成功。`ui-preview.mjs` とheadless Chromeで接続直後の切り替えを目視確認した。実端末は未確認。

## 2026-11-08 — スマホの水色の枠と見出しをキャラクターの色にする（Claude Code）

- ユーザーの指示で、標準の配色のときだけ、水色の枠・「接続完了!!」などの見出し・点線を本人のキャラクターの色（P1青・P2緑・P3紫・P4赤）にした。黄色の枠は変えない。`phone-skins.css` で `body[data-slot]` の `--color-cyan`・`--color-cyan-ink`・`--color-phone-dots` を上書きする。緑は白地で文字が読みにくいため、少し深い緑にした。ダーク・ポップの配色はスキンの色のまま。
- `ui-preview.mjs` とheadless Chromeで、待機画面のP1〜P4、ホストの画面の青・緑、ポップ配色を目視確認した（P4・緑のホストの画面は枠を書き換えて表示）。操作画面は `ui-preview.mjs` で表示できず未確認。`phone-view-test`・`phone-skin-test`・`check-static-pages`・`app-view-test`・`ui-input-test`・`view-transition-test` が成功。

## 2026-11-08 — 変更全体のレビューと満員・横向き画面の背景（Claude Code）

- このブランチの変更全体を読み直した。満員（`#full`）と横向き（`#rotatePrompt`）の画面は背景のグラデーションだけで星の模様が出ていなかったため、`::after` で同じ模様を重ねた（ダークでは出さない）。`ui-preview.mjs` で両画面を目視確認した。
- 残る確認: 実端末の見た目・滑らかさ、P4と操作画面の見た目、Rustホストからの `.svg` 配信、`react-phone-parity`・`static-assets-sim`（Rustホストが必要）。`artifacts/improved-ui` の撮影証拠は変更前の画面のままで、撮り直していない（`verify-ui-evidence` は寸法・網羅だけを見るため合格する）。

## 2026-11-08 — 画面切り替えの始まりに古い画面の大きさが変わるのを直す（Claude Code）

- ユーザーが動作確認デモで「切り替えの時にUIがきゅっと縮む」と指摘した。`body` の `data-view` を描画の最初に変えていたため、帯が覆う前から古い画面に次の画面の余白（`body[data-view=v-wait] main { padding: 0 }` の有無）が当たり、待機画面が402×820から374×792へ一瞬で縮んでいた（操作画面から戻る時は逆に広がる）。`data-view` を画面を入れ替える時（`showView`）に変えるようにした。
- 動作確認デモ（模擬ホスト）で、切り替え開始から300msの古い画面の大きさが変わらないことを測った。`phone-view-test`・`phone-lifecycle-test`・`phone-session-test`・`check-static-pages`・`view-transition-test` が成功。

## 2026-11-08 — 指定PNGへのアプリアイコンの更新（Codex、#268）

- ユーザー指定の `C:/Users/kumes/Downloads/icon.png`（2048×2048 RGBA）を `apps/desktop/icons/icon-source.png` へそのまま保存した。SHA-256：`25c4195916c2a260ae3b8017c5ee125f79fea15bf72478e921a767c8e8e0f40b`。
- `prepare-brand-assets.py` に原PNGを無劣化で埋め込むSVG生成を追加し、ICOは原画像から各サイズへ直接縮小するようにした。Windows用PNG/ICO・WebとTauri起動画面のPNGを再生成した。ロゴの生成結果に差分なし。新しい本番依存なし。
- `python scripts/windows/prepare-brand-assets.py`：成功。`python scripts/sim/verify-brand-assets.py --source C:/Users/kumes/Downloads/icon.png --exe C:/Users/kumes/AppData/Local/ReCooplay/cargo-target/release/recooplay-desktop.exe --preview docs/develop/design/evidence/icon-268/sizes-light-dark.png`：原画像・SVGのバイト一致、PNG 6件・ICO 7サイズの全画素一致、EXE内の7画像とICOのバイト一致に合格。EXE検証器の初回はリソースコンパイラーのplanes値の正規化（0→1）を不一致と判定したため、画像データの完全一致を保持しつつメタデータの正規化を許容して再実行した。
- `CARGO_TARGET_DIR=C:/Users/kumes/AppData/Local/ReCooplay/cargo-target` を指定し、`cargo build --release --locked --offline --manifest-path apps/desktop/Cargo.toml`：成功（1分12秒）。サンドボックス内は既存キャッシュのロック作成が拒否されたため、承認付き実行で成功した。
- `node scripts/sim/static-assets-sim.mjs --bin C:/Users/kumes/AppData/Local/ReCooplay/cargo-target/release/recooplay-host.exe`：42ファイルのHTTP・MIME・no-store・ローカル素材の照合に合格。初回はサンドボックス内でホストが起動せず失敗、通常環境の承認付きdry-runで再実行して成功した。
- `node scripts/sim/check-static-pages.mjs`：全5ページと外部JSの構文・参照確認に合格。`git diff --check`：成功。
- 明暗背景の16・24・32・48pxで2体の形と水色・赤を視認した（16pxでは表情の細部は小さい）。再ビルドしたTauriアプリを `RECOOPLAY_DRY_RUN=1`、`RECOOPLAY_NO_CONFIG=1`、専用ポートで起動し、実窓タイトルバーの新アイコンを確認して終了した。
- 判断と再生成手順は `decisions/2026-11-08-app-icon.md` と `design/brand-assets.md`。タスクバー・デスクトップショートカット・iPhoneホーム画面のキャッシュ反映は、今回それぞれの表示操作を行っていないため未検証。Minecraft・スマホ実機の操作の合格には読み替えない。

## 2026-11-08 — スマホの画面切り替え演出のAndroid実機確認（Claude Code、#267）

- 端末はAndroid（Chrome）。PCのモバイルホットスポット経由。ホストはdry-run（OS入力なし）、2人目は模擬、対象ウィンドウは前面という試験用設定。
- 接続、PREPARE、Ready（協力プレイへ）、一時停止の各切り替えで、帯・水玉・流れ星・中央の星の演出が出て、切り替え後の画面が正常に表示されることを録画で確認した。背景とキャラクター色の枠に配置の崩れはない。操作感は利用者が実機の画面で確認した。
- 未確認：iPhone Safari、「視差効果を減らす」オン時の動き、横向き、Minecraftへの実入力。

## 2026-11-09 — React + TypeScript strictの製品UI基盤（Codex、#235）

- 2026-11-08のユーザー指示に従いGoal Modeの `create_goal` を実際に設定し、`codex/235-react-typescript` で実装。#235の着手コメントを投稿済み。着手コメントの継続ルールは既存のままで、新しいルールPRは作成していない。
- スマホ/PC主要画面をTSXへ移し、Islands/Portalとglobal storeを削除。`contracts.ts`、共通コントローラーモデル、Reactボタン/スティック/視点、PCの型付き設定APIを追加。入力の保持・30Hz・WebRTC/WS・epoch・認可は既存エンジン/ホストに残した。新しい本番依存なし。
- `npm ci --prefix apps/web`、`npm run build --prefix apps/web`：成功（strict型チェック込み、追加開発依存は版固定、audit 0件）。`node --experimental-strip-types scripts/sim/controller-layout-test.mjs`：合格。CIは既存buildに型チェックを含め、共通モデル試験を追加。
- `CARGO_TARGET_DIR=C:/Users/kumes/AppData/Local/ReCooplay/target-pr-queue` と既存Perl/libclangを使用し、`cargo build --release --locked --manifest-path apps/host-rs/Cargo.toml`、`cargo test --release --locked --manifest-path apps/host-rs/Cargo.toml`：成功。135件合格・2件ignored、input-probe 4件合格。既存のdead_codeとOpenSSL PDB警告あり。
- `CARGO_TARGET_DIR=C:/Users/kumes/AppData/Local/ReCooplay/target-pr-queue-desktop` で `cargo build --release --locked --offline --manifest-path apps/desktop/Cargo.toml`：成功。管理者トークンでないこと（IsInRole Administrator=false）も確認。`dev.ps1 -Task verify` と `-Task desktop`：成功。過去のUACポップアップの原因は記録不足で断定できないが、今回の通常ビルドでは再現なし。インストーラーやFirewall変更を検証から分離。
- 上記ホストを `--bin` に指定した `protocol-sim.mjs`：60/60、`react-phone-parity.mjs --samples 20`：DOM/配置/操作/安全停止/再接続/反復再表示に合格。タップp95 20.7→19.3ms、look 29→28回/秒（ka除外、PC上の模擬タッチで実端末遅延ではない）。`react-pc-parity.mjs`：主要画面の文言とボタン状態・設定の変更/復元を含めて一致、演出14回・実行時エラーなし。
- `phone-lifecycle-test` 16/16、`phone-session-test` 7/7、`input-owners-test` 4/4、`protocol-boundary-test` 7/7、`ui-input-test` 12/12に合格。`phone-view-test`、`controller-diagnostics-test`、`phone-skin-test`、`view-transition-test`、`app-view-test`、`android-dry-run-test`、`check-static-pages`、`verify_overlay.py`、`check-public-docs.py`、`git diff --check`：合格。
- Android 16 / SDK36、Chrome156.0.8078.79の実機を認可済みADB/CDPで検証。参加/ボタン/2接点保持/スティック/44px領域/診断/Pause全解放/実回転/実非表示と復帰/再読み込み/担当交換後の視点/送信停止/JavaScriptエラーなしを確認。USB経路・P2/P3は模擬・OS入力なし。実指やLAN品質の合格とは扱わない。生の記録は `data/local/device-acceptance/run-24HFRs`、共有用は `acceptance/evidence/react-235/android-summary.json`。
- Tauri実窓で `/app-react.html`、参加/ゲーム選択/設定をComputer Useで確認。終了後に `shutdown releaseConfirmed:true unconfirmed:[]` とプロセス終了を確認。初回の再ビルドは旧EXEを起動したためロックで失敗したが、終了・再ビルド成功後の新EXEで確認し直した。
- `static-assets-sim.mjs --bin <上記ホスト>`：57資産のHTTP/MIME/no-store/ローカル参照に合格。`package.ps1 -Out data/local/react-migration/package-235` と同zipの `package-smoke.mjs`：同梱/ハッシュ/改変拒否/リポジトリ外での無注入起動・正常終了に合格。Archiveモジュールの自動読込制限は.NET展開APIで解消し、システムの実行ポリシーは変更していない。
- 判断は `decisions/2026-11-08-react-typescript-foundation.md`、通常権限の手順は `WINDOWS_NORMAL_USER_DEV.md`、試験条件・証拠・再開手順は `acceptance/2026-11-09-react-typescript.md`。既定URL切替、iPhone Safari・実指・3実端末・Wi-Fi断・Minecraft実入力・配布先PCの受入は未完了。#271/#50/#272は共通描画/型境界を準備した段階で、保存スキーマ/編集UI/型生成の完了とは扱わない。
- 成果物は draft PR [#274](https://github.com/jphacks/kz_2613/pull/274) に提示した。追加ファイルを含む `git diff --check origin/main` でTSXの末尾空白を検出・除去し、同コマンドとstrictビルドを再実行して成功した。mainマージ・Issueクローズはしていない。
- 追加確認：`cargo test --release --locked --offline --manifest-path apps/desktop/Cargo.toml`（同じdesktopキャッシュ）：3/3合格。コミット `43e842473227c5d074d9cbfa936f7a5f28714cf5`、dirty=falseの最終zipを `data/local/react-migration/package-235-final` へ作成し、同zipの `package-smoke.mjs` も合格。Android試験のuiAssetsハッシュが最終ビルドと完全一致し、追加資料3件のローカル参照が存在することを照合した。
- CI追跡で反復再マウントの確認が1回失敗した。試験はP1の停止表示だけを待ってP2のパッド位置を直ちに検査していたため、P2自身のpaused・lookHomeへの反映も明示的に待つよう修正した。個数・配置のassertは維持。`react-phone-parity.mjs --samples 20` を再実行し全項目合格（タップp95 29.3→21.8ms、look 28→27回/秒）。

## 2026-11-09 — 移行基盤の完了監査とプレビュー/実切断の補完（Codex、#235）

- 先行ターンはPR #274・CI成功まで進んだが、完了監査で入力bindingsなしの共通プレビューに視点パッドが出ないことを確認した。同じCSSを使うIDなしの視点/感度表示を追加し、ボタンの見た目を変えるdisabled属性の代わりに全体をinertにした。実入力用data-ctl・IDは出さない。編集UIや保存スキーマの実装ではない。
- `node --experimental-strip-types scripts/sim/controller-preview-test.mjs`：合格。既存Viteで実TSXを変換してReactで描き、ボタン/スティック/ホイール/視点が存在し、入力属性・重複IDがなくinertであることを確認。`--write-preview` のHTMLを隔離headless Chromeの600px幅で撮影・視認した。CIと `dev.ps1 -Task verify` に追加。
- `npm run build --prefix apps/web`：strict型チェックとビルド成功。`react-phone-parity.mjs --bin C:/Users/kumes/AppData/Local/ReCooplay/target-pr-queue/release/recooplay-host.exe --samples 20`：全比較に合格。タップp95 14.8→10.1ms、look両版28回/秒。プレビュー用CSSは既存IDと同じ詳細度を維持し、プレイ画面の表示を変えない。
- Android補助スクリプトへ、再読み込みとは別に「保持中の実WebSocket切断→全解放/paused→同じP1への再接続→旧押下なし」を追加。Wi-Fi断やOS入力とは区別した。従来版とReact版を同じAndroid16/Chrome156で各14項目実施し全合格。Reactは `data/local/device-acceptance/run-037g52`、従来版は `run-XEW5c8`。共有証拠を `acceptance/evidence/react-235` へ更新。
- 同実機のlook間隔の中央値は従来33.1ms/React33.0ms、p95は66.0/66.1ms。event-to-sendの3標本p95は従来26.5ms/React20.4ms。少標本・USB/CDPのため改善やLANの保証を主張しない。両版ともJavaScriptエラーなし、試験タブ/転送/回転設定を後始末しホスト正常終了。
- `dev.ps1 -Task verify`（追加プレビュー・入力ライフサイクル16/16・セッション7/7・受信境界7/7を含む）、`android-dry-run-test.mjs` 7/7、`check-static-pages.mjs`、`verify_overlay.py`、`check-public-docs.py`：合格。iPhone/実指/複数実端末/Wi-Fi断/Minecraftと標準URL採用は未完了として保持する。
- 追加CIのPC比較は、初回がPage.navigateの応答期限超過、失敗ジョブ1回の再実行では従来版の分担決定待ちで失敗した。P1のキー復元通知を受けただけでPC自身の旧epochの描画反映を待っていなかったため、PCの担当キー表示が変更→復元することを確認してから決定するよう試験を修正した。Page.navigateが期限を超えた場合も同じtargetのURLと画面を再観測し、遷移を重複実行しない。比較項目・許容値・認可は変更なし。ローカルの `react-pc-parity.mjs --bin <上記ホスト>` は設定変更/復元・分担・演出14回を含め全合格。
- 2026-11-09のユーザー回答：「用意できないため実機受入は保留」。接続中のiPhone/iPadも通常権限のPnP一覧で見つからず、iOS用CLIはPATHにないことを確認した。iPhone受入と既定URL切替は保留し、開発PRの独立した検証は継続する。

## 2026-11-09 — PR #274の総合自己レビュー・製品エンジンのTypeScript化（作業中）

- 新しいユーザー依頼で自己レビューを開始し、[着手コメント](https://github.com/jphacks/kz_2613/pull/274#issuecomment-6724900679)を投稿。品質条件を満たせばPRブランチで標準化するという今回の判断を適用する。上記のiPhone保留は継続するが、今回の標準化を一律に禁止する意味にはしない。
- 最新main `c271ebe` と開始時PR HEAD `9947391` を独立worktreeへ保存。Open PRは #273・#274。#273のスキン修正との重複を確認し、Reactにも影響する共有CSSへ同じ無効ボタン修正を適用した。#273の旧main実機記録をReactの合格とは扱わない。
- 実装前に `decisions/2026-11-09-react-product-review.md` を追加。入力・通信・接続・モデル・遷移・スマホ/PCランタイムを製品TSへ移し、製品から旧JSのimportを除去。`allowJs/checkJs`を削除し、strictに加えて未使用宣言も検査する。通信方式、入力定数、Rustの認可・OS入力処理は変更していない。
- 操作面の入れ子rootとパッドのDOM移動を廃止。Reactが操作要素・接続状態・診断値を描画し、型付きbindingで高頻度の押下クラス/ノブ/パッドだけをエンジンへ渡す。入力保持は押下時の操作IDを保存する。エンジンと部品の破棄で全解放・購読解除・タイマー停止を行う。
- `npm run typecheck --prefix apps/web`、`npm run build --prefix apps/web`：成功。製品TSの実装へ適用した `node scripts/sim/product-web-test.mjs`：成功（保持元4、セッション7、受信境界7、ライフサイクル16、UI入力12、表示判断30、スキン、破棄、PC境界、34モジュールの旧JS依存/循環検査）。遷移試験もTS側で成功し、同runnerへ追加した。
- `node scripts/sim/react-phone-parity.mjs --bin C:/Users/kumes/AppData/Local/ReCooplay/target-pr-queue/release/recooplay-host.exe --samples 20 --tolerance-ms 30`：成功。p95は参照16.8ms・移行後12.7ms、視点28.5・28回/秒（PC headless、Android性能の証拠ではない）。パッドを隠しhomeへ移す実装依存とdata-bound属性を比較から外し、表示・操作・多重ID・停止後に視点を送らない条件は維持した。
- `react-pc-parity.mjs --bin <同ホスト>`：最初はQR取得の待機で失敗。追加した境界検証がRustの開発版 `commit:null` とqrcode crateのSVG `version` を拒否していたため、Rustの実装に合わせて修正。再試験は全比較・設定変更/復元・演出14回に合格。
- Androidの予備比較はA/B/C各60秒×3回、入力と視点を各60秒で完走・未ACK/解放残留なし。ただし時間制御で操作サイクル数が142〜144と異なるため、本比較には採用しない。操作48サイクル（単発・連打・保持・同一/別ボタン2接点・スティック8方向とボタン）、視点1800移動と別操作10タップへ固定した本比較を開始した。試行ごとにホスト/タブ/生データ/統計を独立させ、A/B/Cの順序を交替する。USB/CDP/dry-runであり、実Wi-Fi・実指・Minecraftの検証ではない。

## 2026-11-09 — Android固定回数比較の完了と標準URL切替の検証準備

- A/B/C/D/Eを同じAndroid 16・Chrome156・同じPCとホストexeで各3試行、ボタン60秒＋視点60秒で比較した。A=main c271ebe、B/C=PR旧画面/React 9947391、D=TSエンジン48f180a、E=診断の同期描画を外したdf7e3eb。各試行48サイクル・1800視点移動で、ボタン224件をホストの受理ログと照合し、欠落・重複・未ACKは0。全解放・再接続・回転・非表示を含む後続試験も全合格。
- 視点の平均送信間隔は全条件34.48〜34.85ms。端末内送信の200ms以上の空白は0。一方、ホストのlookLost（受信連番の空き）は16〜21回を記録した。ボタン欠落と混同せず、実パケット損失率・最終移動量の欠落とも断定しない。累積値で後続までの抜けを補う既存仕様を維持した。
- DのACK観測p95は109.3〜111.5msで、Cの109.0〜109.1msより数ms高い試行があった。観測点は製品ACK処理後で、診断描画も含む。同期React描画を受信処理内で強制する構造を除去し（df7e3eb）、Eを再測定した。Eのp95は109.2〜111.3msで試行差は残るため、ネットワーク改善や統計的な同等性を主張しない。Eの視点最大間隔は69.3ms（Dは96.8ms）だったが、3試行の観測範囲として記録する。
- HTTP/WSはADB reverse TCP。RTCはローカルICEで成立したが選択候補対を収集していない。旧CLIの「WebRTCはUSB経路」という説明は不正確だったため、共有した測定記録では訂正した。純Wi-Fi・無線断・実指・実OS入力・Minecraftの試験とは区別する。
- `node scripts/device/summarize-react-review.mjs`：15試行の端末/Chrome・exeハッシュ・操作回数・資産の一致、ボタン受理の欠落/重複なしを検証して成功。識別子を除いた生データをgzipで保全し、`evidence/pr274-review/trials.json` に統計と各gzipのSHA256を記録した。
- 標準URLをRustで `/`→phone-react.html、`/app`→app-react.htmlへ変更し、Tauriの環境変数によるUI切替を除去した。旧版は明示URL `/index.html`・`/app.html` と固定worktreeで保存する。mainへはマージしない。以下で標準化後のビルド・Android・Tauri・配布を検証する。

## 2026-11-09 — PR #274の標準化後受入と総合レビュー完了（Codex）

- 最新のユーザー依頼に沿い、PRブランチの `/`・`/app`・TauriをReact標準にした。製品UI・入力/通信/接続・モデル・runtimeは `apps/web/src/` のstrict TS/TSX、旧版は `apps/web-static/LEGACY.md` の比較/診断/復元範囲に分離。全206項目の判定・根拠・未確認理由を `acceptance/2026-11-09-pr274-self-review.md`、試行別rawと制約を `acceptance/2026-11-09-react-performance.md` に整理した。
- 標準化後、通常ユーザートークン（Administrator=false）と既存Perl/libclang/ビルドキャッシュで `cargo build --offline --release --locked --manifest-path apps/host-rs/Cargo.toml` と同 `cargo test`：成功、135合格/2ignored＋input-probe4。desktop用cacheで同じbuild/test（`apps/desktop/Cargo.toml`）：成功、3合格。既存dead_codeとOpenSSLのPDB LNK4099警告あり。UAC/インストーラー/Firewall変更はなし。
- `npm ci --prefix apps/web` は制限環境の空キャッシュとDNS到達不可で失敗。既存ユーザーcacheを明示した `npm ci --offline --no-audit --cache C:/Users/kumes/AppData/Local/npm-cache --prefix apps/web` は通常トークンで成功。`npm run build --prefix apps/web` と `npm run typecheck --prefix apps/web`、`node scripts/sim/product-web-test.mjs`：成功。34 TSモジュールの旧JS import/実行時循環/型回避を検査し、入力/通信/表示/破棄の実製品TS回帰も成功。
- 新ホストを `--bin C:/Users/kumes/AppData/Local/ReCooplay/target-pr-queue/release/recooplay-host.exe` で指定した `node scripts/sim/protocol-sim.mjs`：60/60。`shutdown-sim.mjs`：quit/EOFで全解放・正常終了。`static-assets-sim.mjs`：59資産、2,056,661 bytesのHTTP/MIME/no-store/ローカル参照・React標準/旧版URLを確認。初回はruntime-measureを付けず起動通知を待てなかったため修正（0d43517）し、合格を再確認した。
- `react-phone-parity.mjs --bin <新ホスト> --samples 20 --tolerance-ms 30`：旧indexと標準/で全比較に合格。タップp95は15.9→9.5ms、look28→29回/秒（PC headless値で実端末/ゲーム遅延ではない）。5画面寸法、横溢れなし、44px領域を追加確認。`react-pc-parity.mjs --bin <新ホスト>`：旧app.htmlと標準/appで設定変更/復元・全画面・演出14回に合格。正常QR受理と攻撃SVG6件拒否、Tab/Escape/フォーカス復帰、4縦横比で横溢れなしを追加確認。
- 標準URLのAndroid補助試験をクリーンworktree `review-standard`（0d43517）から配信。3人配分は入力60秒＋視点60秒/1800移動で15項目成功。2人配分の視点＋別ボタンは最初の2回で `look companion down: 1 !== 10` と失敗。CDP部分touchEndを「残す接点」と取り違え、攻撃ボタンが約60秒長押しになっていた。Chromium一次実装を確認し「終了するボタン接点」に補助runnerだけを修正。10down/10upのassertを維持した再試験は15項目成功、視点最大115.1ms・200ms以上0。主比較の3人視点には別ボタンがなく影響しない。
- RTCを文書開始時に無効化した標準WS-onlyも15項目成功。ダーク無効ボタンの色（文字174/180/194、背景51/56/69）と可視性を実Androidで検証しスクリーンショットを目視した。共有CSSは #273 と同じ修正であり、同PRの旧main実機証拠は転用していない。補助5試行（失敗2件を含む）のrawと索引は `evidence/pr274-review/standard-*`。全ホストexit0、後片付け失敗なし。AndroidはCDP合成タッチ・dry-run、HTTP/WSはADB reverse、RTC候補対未収集で、実指/Wi-Fi断/実OS入力の合格ではない。
- 新Tauri実窓をComputer Useで確認。RootWebAreaのURLは標準 `/app`、参加/ゲーム選択/設定開閉・Escape後のフォーカス復帰を観測。Alt+F4後は実窓消滅、desktop exit0、ホストshutdown releaseConfirmed=true/unconfirmed=[]。同時に実スマホをTauriへ接続した受入ではない。実窓起動もdry-run/no-config/fake targetで無注入。
- `scripts/windows/package.ps1 -Out data/local/pr274-review/package-0d43517`：クリーン0d43517のzip569ファイルを生成。SHA256 `5a6036f5d9f5a507fd640ae2aa5c5e5c5996ad70a0e73f919caec0b2fe4f8503`。`node scripts/sim/package-smoke.mjs <同zip>`：全内容/ハッシュ/欠落・改変拒否、repo外展開から標準React URLとentryの配信、dry-run正常終了に合格。製品バイナリは標準化ソースを通常権限でビルドしたもの。後続変更は試験/記録のみで正式リリースしない。
- `node scripts/device/android-dry-run-test.mjs`：9/9。`node scripts/sim/check-static-pages.mjs`、`python scripts/verify_overlay.py`、`python scripts/check-public-docs.py`、`git diff --check`：成功。CIの0d43517はStructure checks（42514496080）とRust host and protocol simulation（42514496091）がともにsuccess。最終記録コミットのCIも追跡しPRのChecksに残す。
- iPhoneは利用できないため受入保留。実指・スクリーンリーダー・複数実端末/Tauri同時連携・Wi-Fi断/経路別比較・Minecraft/実緊急停止・別PC初期環境・ホスト内入力別時間/到着ジッター/順序保留は未受入/未測定の理由を保持。#50/#271/#272の全機能を完成扱いにしない。mainマージ・Issue close・正式release・Award Day安定版の更新はしていない。

## 2026-11-09 — PR #274の追加必須レビュー：実Wi-Fi計測の準備

- [追加着手コメント](https://github.com/jphacks/kz_2613/pull/274#issuecomment-6729223462)を投稿。前回はREADMEのLAN起動手順とAT-D07を完了ゲートに結び付けず、USB専用runner（runtime-measureによる127.0.0.1待受＋reverse）だけを測定した。利用可能なWi-Fi環境と選択ICEの調査/runner整備を行わず残件へ分類したことが検証漏れ。既存206項目とUSB15試行を保全し、実Wi-Fi11項目を追加必須（総数217）とした。
- 既存ネットワークを読み取り、PCのNative 802.11 / Microsoft Wi-Fi Direct仮想アダプターとAndroid wlan0が同一subnetで、AndroidからPCへのrouteがwlan0であることを確認。USBテザリングなし、既存ADB reverseなし。Firewall/永続ネットワーク設定は変更していない。生アドレス・serial・接続情報はGit対象外のprivate記録のみ。
- `wifi-network-discover.mjs`で有効Wi-Fi候補を一意に検出し、`android-dry-run.mjs --wifi-network <private.json>`で通常LAN待受を使う。HTTPのremoteIPAddress/port、WS URL、所有ホストPIDのEstablished両端、PC限定ページ403とinfoの機密項目非公開を照合。getStatsのtransport.selectedCandidatePairIdでUDP候補対の両端を確認し、5秒ごとの履歴も保存する。ADB forwardはCDP制御だけ、reverseは作らない。
- 経路予備試行1はReact初期読込前のnull参照、2〜5はこのPCのCIMがRustのwildcard socketをState=0と返してListen値と一致しないため失敗。6は公開info APIまで403を要求した誤りで失敗。初期DOM待機、CIMはListenと推測せず所有PIDの実LAN Established両端を照合、infoは200かつwifi/hotspot/buildを非公開という既存仕様へ修正。7は全15項目に成功。失敗のホストも正常終了し転送/タブを片付けた。これらは製品入力の欠陥を修正したという意味ではない。
- `input_trace.rs`を追加。明示したtrace/dry-run/no-config/fake-targetの4フラグが揃う時だけ有効。runtime-measureとは独立し、LANバインドと入力アルゴリズムを変更しない。WS/RTCのアプリ受信・hub処理・順序buffer・受理・dry-run出力の単調時計を、識別情報/本文を保存せずメモリーへ蓄積し終了時に出力する。上限到達は有効な比較データとして扱わない。
- 通常権限、既存Perl/libclang/cacheで `cargo test --offline --release --locked --manifest-path apps/host-rs/Cargo.toml`：137合格/2ignored＋probe4。`cargo build --offline --release --locked --manifest-path apps/host-rs/Cargo.toml`：成功。既存dead_code/PDB LNK4099警告あり。`node scripts/device/android-dry-run-test.mjs`：10/10、`wifi-route-test.mjs`、`wifi-host-analysis-test.mjs`、`node --check scripts/device/android-dry-run.mjs`：成功。経路未証明/USB URL/キャッシュ/誤ICE候補の拒否と、未同期時計の原点を動かしてもhost内計測が変わらないことを検査。CIへ追加。
- 計測付きホストでWi-Fi予備E（入力60秒＋視点60秒）を完走。224入力/受理/出力が一致、順序gap待ち0。受信→受理p95 0.147ms、受理→dry出力p95 8.035ms（最低押下/解放の待ちを含む）。視点ホスト到着に200ms超の空白2件/最大284.521msがあり、本比較で旧JS/TSを同条件で測定する。予備値を本比較の3試行へ黙って混ぜない。

## 2026-11-09 — 実Wi-Fiの21独立試行を完了し、ACK差の追加診断へ進む

- 計測hostはd7b4b79のソース、SHA256 `47f6f6f85bd3ad76e55f340a9d00d779cc5bb8e3aa7ab90b90b3bb6d85570099`。全21試行で同一exeを使用。runnerはクリーンな752f949で固定し、A〜E＋A/E WS-onlyの7条件を各3回、入力60秒/48サイクル/224論理入力、視点60秒/1800移動で測った。順序は7条件の巡回開始を0/2/4ずらした。Eの配信対象はfe19ecbの独立worktreeで、前回Eと同じ9個の製品JSハッシュを保持。
- 最初の本比較は保全コピーのexe配置先から起動し、LAN文書が届かず2回失敗した。Firewallを読み取ると、同一ハッシュの通常開発パスは有効Allow受信2/Block0、保全コピーのパスはAllow0/Block2だった。規則を変更せず、予備で到達確認済みの通常開発パスへ揃えて再開した。再読込の新Document応答を待つ修正も752f949で固定した。失敗2回はbatch-attempt1/2と元summaryを保全し、成功データへ混ぜない。
- 全21試行で4,704入力の送信/受理/dry出力が一致、欠落/重複適用/未ACK0、順序gap待ち0、停止/切断/回転/非表示/再接続後の残留なし。視点の送信200ms空白0に対し、hostのアプリ受信には200ms空白が計25件あった。旧/新、RTC/WSで試行差があり、物理パケット損失やMinecraft反映と同一視しない。
- 無線状態100標本は2412MHz、link72Mbps、RSSI -45〜-40dBmで、全標本のAP識別子は同一（識別子は公開しない）。PCはWi-Fi Direct/mobile hotspot、Androidはwlan0。HTTP/WSの実LAN接続と非ループバック認可、選択ICEのtransport→pair→両端ID/アドレス一致を各試行と5秒履歴で検証。端末はAndroid16/Chrome156.0.8078.79、P2/P3は模擬参加者。実指/実OS入力/実無線断/Minecraftは未受入。
- `node scripts/device/summarize-wifi-review.mjs`：21試行のソース/runner/端末/exe/資産/入力/ACK/出力/経路を照合し成功。匿名raw gzipとSHA256、全分位/平均/最大/nのCSV、独立集約JSON、準備10記録（成功2/失敗8）と無線環境を `acceptance/evidence/pr274-wifi` へ保存。旧USB15試行は変更していない。ACK集計は当該試行の送信iseqに一致する最初のACKだけを採り、warmup/別試行/二重ACKを除外する（#259）。
- AのACK観測p95は107.9〜109.4ms、Eは111.3〜112.1ms。WS-onlyのAは106.8〜107.6ms、Eは108.7〜110.4ms。Eのp99には226.7ms/WS-only235.9msの試行もあり、残る差を無回帰と断定しない。製品onmessage前に登録する先行ACK observerを追加し、同じrenderer時計で既存観測点までの処理/配送区間を分ける追加診断を実施する。主21試行には途中でこの観測を追加していない。
- `wifi-route-test`・`wifi-host-analysis-test`・`wifi-trial-acks-test`・`wifi-ack-observer-test`：成功。CLI拒否試験は11/11。transport/candidateのID関係も明示的に検査し、不一致を拒否。reverse拒否の例外に端末識別子を含めないboolean検証とエラーのprivate値除去を追加した。通常権限の `protocol-sim.mjs --bin <同host>` は60/60成功（制限環境での初回は待受に到達せず失敗し、通常実行で再確認）。752f949のCI Structure42543336466 / Rust42543336455は全成功。

## 2026-11-09 — ACKの前後観測と診断表示のフレーム通知

- 同じWi-Fi/host47fのWS-onlyでA/Eを各1回、先行ACK observer付きで追加診断した（主21試行と別）。Aは先行p95 105.2ms/従来106.3ms、Eは107.1/109.4ms。各224 ACKに対応し、両観測点間のp95はA1.1ms/E2.3ms、p99はA1.6/E2.9ms。先行側にも差があるため全差をReactだけの問題とは断定しないが、製品処理とその間の配送/microtask区間にも差を観測した。原本と匿名化2試行を `evidence/pr274-wifi/ack-observer` へ保存。
- runtimeのACKが呼ぶrenderStatsは100ms throttle。PhoneViewのtelemetryはflushSyncを除去していたが、外部storeへの通知は同じdispatchからReact購読へ入る。診断値だけを次のrequestAnimationFrameへまとめ、ACK/input callbackから直接通知しないpublisherを追加した。入力保持・通信・認可・画面遷移/安全停止の同期状態は変更しない。破棄時にframe取消し、古いcallback/以後patchを無視する。
- `node --experimental-strip-types scripts/sim/telemetry-publisher-test.mjs`：成功（callback内の通知なし/複数patch統合/snapshot不変/取消し/破棄後停止/新寿命）。`npm run build --prefix apps/web`：strict/Vite成功。`node scripts/sim/product-web-test.mjs`：全成功、製品TS35モジュール、旧JS依存/循環/型検査回避なし。新publisher試験を共通runner/CIへ含めた。
- `react-phone-parity.mjs --bin <同host> --samples 20 --tolerance-ms 30`：旧indexと標準/で全比較成功。PC headlessのタップp95 15.9→3.8ms、視点27.5→29.5回/秒、5寸法/44px/再マウント/停止/標準entryに合格。Androidの性能改善やゲーム反応速度の証拠にはしない。Androidでは次の独立再測定で効果を確認する。
- 主21試行の完全5秒経路履歴はraw gzipに保全し、索引だけを候補辞書と重複排除時系列へ縮約した。生データ/測定値を削除せず、trials.jsonの重複を減らした。再試験用集約は別manifest/保存先を要求し、主21試行を上書きしない。

- 改修後の先行ACK診断（F、同じWS-only/host47f、224 ACK）は先行p95 105.6ms/従来106.9ms、観測点間p95 0.8ms/p99 1.2ms。改修前Eの2.3/2.9msより短く、診断通知をdispatch外へ移した効果を観測した。先行側のRTTも変動するため、従来ACKの全改善を表示変更や通信速度へ帰属させない。
- 通常observerへ戻した再試験の初回は入力60秒/224件を完走したが、視点40秒付近のlook-1200で選択候補ペアのstate/nominated検証に失敗し停止した。直前look-1050までのsnapshotはsucceeded/true、hostログにその区間のRTC close/failedはなく、原因は未特定。未検証の無線経路を成功扱いにせず、ホストexit0で全解放・自己タブ/forwardを終了。元summary/host trace/radioログ/失敗manifestを保全して、成功6本へ混ぜない。
- 失敗した瞬間のgetStatsもprivateファイルへ保存するようrunnerを補完し、公開する失敗状態には接続/候補stateとnominatedだけを含める。候補ID・アドレス・UDP・成功/nominationの検証は緩めていない。CLI11/11と経路拒否試験、構文検査が成功。次の再実行で同じ事象が出る場合は、その生統計から原因を調査する。

- 2回目の再試験も視点途中で停止し、今度は失敗snapshotを保全できた。現在の選択pairはsucceeded/true、履歴内の1snapshotだけin-progress/true。どちらもpeer/DTLS/ICEはconnected、選択IDとLAN両端は一致し、直前snapshotからpayloadは送信27,441/受信22,756 bytes増えていた。hostにもRTC close/failedはない。[W3C統計仕様](https://www.w3.org/TR/webrtc-stats/)でpair.stateはチェックリスト、transportのiceState/dtlsStateと別で、bytesSent/ReceivedはICE connectivity checkを除くpayloadと確認した。1回目の未保存snapshotも同因だったとは断定しない。
- 判定器がチェックリストの一時的なin-progressを実接続断と混同していた。選択transport→pair→candidate ID、実peer/ICE/DTLS connected、nomination、正しいUDP LAN両端、双方向payload正値を必須とする判定へ修正。接続中のチェックリスト再検査は値を保存し、failed/waiting/frozen、接続未完、payloadなし、異なるID/経路は拒否する。取得API/間隔/入力負荷は変更しない。経路拒否の単体試験にこれらを追加し成功。主21試行の生入力/時刻は保全し、失敗2回と別に改修後の比較を再開する。

## 2026-11-09 — 実Wi-Fi追加レビューの修正後再検証と記録確定

- 主21試行に加え、製品c2e2fe3（診断telemetry通知を次frameへ集約）をrunner c75fda5から通常の後段ACK観測で再測定。RTC+WS / WS-only各3試行、入力60秒/224件＋視点60秒/1800移動、同じ47f6f6fホスト・Android・Chrome・AP。6試行の入力1,344件が受理/出力一致、欠落/重複適用/未ACK/順序gap待ち0。Pause・切断・復帰で旧入力残留なし、全ホストexit0・cleanupFailuresなし。主21試行と別のevidence/pr274-wifi-afterへ保存。
- `node scripts/device/summarize-wifi-review.mjs --batch data/local/pr274-wifi/after-batch.json --supplement --out docs/develop/acceptance/evidence/pr274-wifi-after`：全6独立試行のソース/runner・資産・共通exe・経路・224件照合に成功。全分位/平均/最大/標本数CSVとraw gzip/SHA256を生成。途中停止2回を別gzip/索引へ保存し、成功値へ混ぜない。無線環境も別採取して元のAPと同一であることだけを匿名共有。
- 先行ACK診断はA/E-before/E-after各1回・224件の別データとして保全。製品handler前→後段観測の間隔p95/p99はA 1.1/1.6ms、E-before 2.3/2.9ms、E-after 0.8/1.2ms。ネットワークやゲームの速度改善とは呼ばず、ACK callback中の診断subscriber通知を除いた構造上の改善とする。
- `node scripts/device/wifi-route-test.mjs`、`wifi-host-analysis-test.mjs`、`wifi-trial-acks-test.mjs`、`wifi-ack-observer-test.mjs`、`android-dry-run-test.mjs`（11/11）：成功。誤経路/未接続/誤ID/未nomination/payloadなし/キャッシュ/USB URLを拒否し、実接続済みの候補再検査を誤って切断扱いしない。#259の連続試行ACK分離も成功。
- `node scripts/sim/product-web-test.mjs`：成功、35 TSモジュール。診断publisherのframe集約・不変snapshot・冪等破棄・旧callback停止を追加検証。strict/Vite buildとphone parityは製品修正c2e2fe3で成功済み。`python scripts/check-public-docs.py`、`python scripts/verify_overlay.py`、`git diff --check`：成功。原206行とUSB15試行の不変、217項目（OK208/未確認8/別Issue1）、共有gzipのSHA256と接続情報除去を照合。
- 製品修正c2e2fe3のCIは[Structure checks](https://github.com/jphacks/kz_2613/actions/runs/42548657268) / [Rust・製品回帰・配布](https://github.com/jphacks/kz_2613/actions/runs/42548657277)が成功。最終記録HEADもpush後に追跡する。PR #274の追加着手・完了記録を更新し、Draftを維持する。
- 読取/起動の通常権限承認経路が一時的に利用量制限で自動レビュー失敗となったため、その時間は未実行として保持。指定時刻経過後に同じ承認経路で再実行し成功。制限回避、UAC昇格、Firewall/永続ネットワーク設定の変更はしていない。
- 実Wi-Fi断そのもの、ルーター/距離/混雑/Bluetoothの比較、実指・長時間・iPhone・複数実スマホ・実OS入力/Minecraft・別PCは未受入。dry-runのLAN計測とAT-D07全体の製品受入を分ける。mainマージ・Issue close・正式release・Award Day安定版更新はしない。
- Wi-Fi試験後、同じ47f6f6fホスト・固定c2e2fe3配信で `android-dry-run.mjs --condition usb-regression-after-wifi --trial 1`（Wi-Fi/benchmark指定なし）を実行。既存USBの15機能項目が成功、host exit0・後片付け失敗0。evidence/pr274-wifi-after/usb-regression.jsonとrawへ分離保存し、旧USB15試行と無線性能値には混ぜない。

## 2026-11-09 — ユーザー判断に従い製品利用・評価をWi-Fi前提へ統一

- ユーザーがUSB有線接続を通常の利用場面に想定しないと明示したため、`2026-11-09-wifi-product-baseline.md` に判断を記録。製品評価は同一Wi-Fi上の旧版/新版、RTC+WS/WS-only、改善前後を中心とし、USB/ADB reverseは開発・切り分け用の任意の補助にした。ADB forward/CDP制御は製品通信と区別する。
- #276のタイトル・完了条件をWi-Fiの観測区間/計測負荷統一へ変更し、必須のUSB対Wi-Fi追加測定を削除。#275/#277/#157/#264/#235とPR #274も更新。既存IssueはOpen、PRはDraftのまま。実装に新たに着手した扱いにはしない。
- AGENTS、ENV-07、技術構成、React判断、総合仕様、検証状況、受入README、性能報告、自己レビューへ反映。受入手順はWi-Fiを先に配置し、USB手順は開発用補助として保持。性能報告冒頭にWi-Fiの主結果と残件を掲載した。
- `python scripts/check-public-docs.py`：17資料/317参照に成功。`python scripts/verify_overlay.py`：39必須ファイルに成功。保存済み証拠の照合で原206行、217項目の集計（OK208/未確認8/別Issue1）、USB15試行、Wi-Fi生データ/SHA256が不変。`git diff --check`：成功。製品コード・入力定数・runner・測定数値は変更しておらず、実機再測定や製品ビルドは不要な文書変更。
- 新しい合格の追加、mainマージ、Issue close、正式release、Award Day安定版更新は行わない。
## 2026-11-08 — Android・iPhone実機での受入確認（Claude Code、#10・#159・#213・#223・#233・#238）

- 対象：main `c271ebe`（ホストは `cargo build --release --locked` の成果物）。ホストはdry-run（OS入力なし）、PCのモバイルホットスポット経由。端末はAndroid 16（Chrome 156.0.8078.79）とiPhone（iOS 26.5、Safari）。Minecraft・実OS入力は使っていない。
- スキン（#159）：両端末で標準・ダーク・ポップを選べ、画面全体の色が変わる。Androidでは再読み込み後も保持した。iPhoneでは各スキンの待機画面を確認した。**不具合を1件発見して修正した**：ダークで無効状態の「ゲームを開く・準備する」が明るい灰色に薄い文字で、読めなかった（`phone-skins.css` に無効状態の規則を追加。Androidの実機で読めることを確認）。ゲームを切り替えての保存・復元は、実機では確認していない（Minecraftのみ）。
- P2以降の画面（#238）：iPhone（P2）とAndroid（P2）の待機画面にP1専用のボタン・診断の数値・ゲームの検証状況が出ないことを確認した。
- ホスト譲渡（#233）：Android（P1）からiPhone（P2）へロビーで譲渡し、iPhoneがホスト画面、Androidが待機画面に変わった（ログ `host_transfer`）。確認ダイアログを開いたまま4秒を超えると、ブラウザーが通信（心拍）を止めて切断扱いになり、譲渡の操作が失われた（確認ダイアログ中は素早く操作する必要がある。未対応の観測）。
- ホスト不在の自動交代（#223）：ホスト（iPhone）のWi-Fiを切ると、ロビーでAndroidが自動でP1になり、iPhoneはWi-Fi復帰後にP2として参加した。
- リセット（#213）：PCのリセットで両端末が「PCでリセットされました。参加するときはページを再読み込みしてください。」を表示し、自動再接続しない。iPhoneを先に再読み込みするとP1、Androidを後にするとP2になった。
- 基本の表示とタッチ（#10）：iPhoneは利用者が実指で操作し、すべて意図どおりだった（Space長押し約5秒＝押下1・解放1、同じボタンに2本指で片指を離しても保持、別ボタンの同時押しで独立した解放、ホームへ戻すと約1.2秒で解放、横向きへ回すと解放）。Androidは実機のChromeへCDP（`Input.dispatchTouchEvent`）でタッチを送り、非表示はホームボタン、回転は画面の回転設定で実施した（実指ではない）。長押し5.05秒、2本指で片指を離しても保持、別ボタンの同時押しで独立、非表示で約1秒後に解放、回転の約0.2秒後に解放し、全系列で残留なし。
- 未確認：Minecraftへの実入力、実Wi-Fi・長時間、Androidの実指の複数操作、ゲームごとのスキンの保存・復元の実機確認、iPhoneのスキン再読み込み後の保持。

## 2026-11-09 PR #274: main統合後の再検証と画面部品の分割（Claude Code）

- mainの#273を取り込んだ（競合は `phone-skins.css` のコメント1行のみ。Codex側が同じダーク無効ボタン修正を入れていたため内容は同一）。
- 型の厳密化：`Navigation.screen` を `ScreenId`（join/game/roles）、`UiAction.kind` を `UiActionKind` のリテラルUnionにした。`data-go` は `SCREENS` に含まれる値だけ受理する。外部ゲームの操作IDは列挙していない。
- 画面の分割：`PhoneApp` を `Header`・`HostRemoteScreen`・`WaitingScreen`・`GameplayScreen`・`DiagnosticsDialog`、`PcApp` を `Sidebar`・`Workspace`・`SettingsDialog`・`RenameDialog`・`ConnectionHelpDialog` に分けた。DOM ID・文言・入力エンジンは変更していない（描画の移動のみ）。
- 検証：`npm run build`（tsc strict + Vite）、ホスト `cargo test` 137合格・2 ignored＋別枠4、protocol-sim 60/60、shutdown-sim、app-view-test 30/30、スマホ画面・スキン・ライフサイクル・入力担当・セッション・境界・ui-input 12/12・静的資産、react-phone-parity・react-pc-parity、product-web-test、controller-layout/preview-test すべて合格。
- Android実機（Wi-Fi・dry-run・Codexと同じ `android-dry-run.mjs --wifi-network` 経路、60秒計測）：分割前後の2回とも15項目合格（Wi-Fi経路証明、2接点保持、Pause・回転・バックグラウンド・切断・再読み込みの全解放、JSエラーなし）。CDP合成タッチであり実指ではない。
- 未実施：iPhone（利用者判断で不要）、実指、Minecraft実入力、実無線断。#271/#50（編集可能レイアウトの保存・編集UI）と#272（Rust間の型生成）は本PRでは完成していない。レビュー10件のうち、通常UIのonClick化（1）、表示モデル分割（3）、store/actionsのProvider化（4）、`flushSync`の再点検（5）、DOM所有境界（7）は入力の遅延・安全性への回帰リスクがあるため見送り、別Issueで扱う。


## 2026-11-09 — #279 PR-A a: 配信資産と共有TSの移動

- 基点: origin/main `ee77270`。独立worktree `data/local/worktrees/279-web-structure`、`codex/279-web-structure`。元の作業ツリーは変更しない。
- 利用者の追記に従い、移動とパス/import更新を同一コミットにした。TS化・試験移植は後続。途中のCIと旧試験を保つため、旧配信ルートをまず `apps/web/static` へそのまま移動。旧版削除後に最終の `src`/`public`/`dist` へ整理する。診断・疑似ゲームのinline JSはPR-B/Cまで一時的に維持する。
- 既存タグ3つの存在と最新mainを確認。Issue #279作成・着手コメント投稿済み。mainへのpush/マージ/Issue closeは行わない。
- 移動前: `npm ci`/`npm run build`、product-web-test、phone-view-test（8観点）、controller-diagnostics-test（200件）の成功を確認。移動後もWebビルド・同試験・check-static-pages・verify_overlay成功。Rust host build/test: 137成功・2 ignored、probe 4成功。desktop build/test: 3成功。
- assert数はソース上のassert呼出箇所数（ループ展開前）。動的な観点数・200 packetの各値/連番も維持して後続に対照記録する。

| 移植対象 | 移植前assert箇所 |
|---|---:|
| `app-view-test` | 194 |
| `phone-view-test` | 53 |
| `controller-diagnostics-test` | 14 |
| `input-owners-test` | 17 |
| `phone-session-test` | 39 |
| `phone-skin-test` | 15 |
| `protocol-boundary-test` | 21 |
| `ui-input-test` | 73 |
| `view-transition-test` | 23 |
| `phone-lifecycle-test` | 59 |

- Android実Wi-Fiの前後比較は未実施: 指定の `data/local/wifi-network.private.json` が存在せず、サンドボックスからのADB server接続も失敗。実IP・秘密情報は公開しない。実入力試験は許可の範囲外なので実施しない。iPhone・実指・Minecraft・実無線断は未確認。
`python data/local/run-web-checks.py a` 相当のrust.yml全Node試験（parity含む）・構造/公開docs成功。protocol-sim 60/60、input-probe-sim 12/12。package.ps1 / package-smoke成功。git diff -M --stat HEAD: 131 files、155 insertions、131 deletions（BUILD_LOG追加を除きパス/importのみ）。


## 2026-11-09 — #279 PR-A b: 旧JS依存の試験を製品TSへ移植

- [x] Ready可否・前面化失敗・2/4人ラベル、途中参加の待機、自分の色・担当、ホストだけのPause、診断前停止、未検証/非対応案内、ホストと参加者の案内分離、ゲーム名、INVキー（null/省略含む）。旧DOMモックを製品 `createReactPhoneView` の表示store検査へ置換。53assert箇所を維持。
- [x] phone-harnessは製品TS runtime/viewだけをVMで実行。Controllerの描画先だけテストDOMへ接続し、保持/解放・30Hz・接続処理は製品コードを使用。16ライフサイクル観点、受信境界7観点を維持。描画失敗注入は旧innerHTMLから製品store購読への例外注入に変更。
- [x] 診断を開く前のup/release_inputs、epoch=7、診断中のボタン/視点抑止、BURST 200件のstate/button/epoch・iseq連続を維持。仮想時計の進行中は模擬pongを返し、3秒無応答試験と混同しない。
- [x] 操作割当、方向スティック、ホイール前後、視点、空担当、変更時の再生成キー、Minecraft/汎用の実キー表示をcontroller-layout/model/actionsと実ControllerのReact HTMLで確認。UI入力12観点を維持。
- [x] owners/session/skin/protocol/transition/app-viewのTS専用化。RECOOPLAY_TEST_TS廃止。shared→画面/画面→別画面の型importを含む禁止を追加し、PcInfoを共有domainへ移動。
- `node scripts/sim/product-web-test.mjs`、`npm run build --prefix apps/web` 成功。モデル・入力・接続・描画境界を変更したため関連14スイートを実行。TS化/削除していない旧画面はこのコミットで維持。

| 試験 | 移植前assert箇所 | 移植後assert箇所 |
|---|---:|---:|
| `app-view-test` | 194 | 194 |
| `phone-view-test` | 53 | 53 |
| `controller-diagnostics-test` | 14 | 14 |
| `input-owners-test` | 17 | 17 |
| `phone-session-test` | 39 | 39 |
| `phone-skin-test` | 15 | 15 |
| `protocol-boundary-test` | 21 | 21 |
| `ui-input-test` | 73 | 74 |
| `view-transition-test` | 23 | 23 |
| `phone-lifecycle-test` | 59 | 59 |


## 2026-11-09 — #279 PR-A c: 旧版削除と最終配信構成への切替

- 旧JS/HTMLと比較専用parityを削除。旧表示専用ui-preview・build-ui-gallery・report-pc-fidelityは旧構成依存のため廃止。capture-screensは標準URLと実DOMを使うため維持し、audit-pc-fidelity/measure-pc-referenceは提供画像の解析用として維持。
- Viteをroot=src / publicDir=public / outDir=distの5 HTML入力にし、phone/pcのCSSをmain.tsxから元と同順序でimport。Vite設定自身もtsconfig.node.jsonのstrict検査へ追加（新依存なし）。Rust/Tauriの探索目印はdist/phone/index.html。package.ps1も同じ配置に更新。
- [x] 静的配信: 5 HTML、ハッシュ付きJS/CSS、画像、MIME、no-store、CSS背景参照、旧URL404。PC限定のcanonicalizeした実体ディレクトリ検査とroot外拒否。LANの大文字/末尾ドット/::$DATA/重複スラッシュ/直接パスをprotocol-simで検査（60/60）。
- [x] Android runnerは旧版/alias切替を廃止し標準URLとdistの資産ハッシュを使用。CLI拒否は12/12。実Wi-Fiはprivate設定なしのため未実施。
- [x] check-static-pagesをビルド済み5 HTML/JS・担当色・PC環境文言の検査へ移植。package-smokeと構造検査も新パスで実行。共有TSは旧ファイルに依存しない。診断・疑似ゲームとoverlayのinline/旧runtimeは次の独立コミット/PRで移植する。
- `npm run build --prefix apps/web`、host build/test（138成功・2 ignored、probe 4）、desktop build/test（3成功）、rust.ymlに列挙された全Node試験、verify_overlay、check-public-docs成功。shutdown-sim成功、input-probe-sim 12/12。`package.ps1 -Out data/local/package-c` / package-smokeも展開先から全静的配信・正常終了成功。
- in-app browserで新しい/appを開き、ロゴ・参加待ち4人・QR・設定の描画を目視確認。dry-run環境の緊急停止キー登録エラーの表示は維持。Tauri実窓、実指、iPhone、Minecraft、実無線断はこの時点では未確認。

## 2026-11-09 — #279 PR-A d: overlayのReact/TS化

- overlayをReactのstateとoverlayModelで描画。元のDOM ID・CSS・?position=top・1秒再接続・登録以外は送信しない条件を維持。共有monitorはdecodePcMessageでunknown入力を検証し、古いsocket/破棄後の通知と再接続を停止する。
- `npm run build --prefix apps/web`、product-web-test（新monitor試験を含む）、check-static-pages成功。`auxiliary-pages-smoke.mjs --pages overlay --bin <構築済みホスト>` 成功: 実headless Chromeで起動・状態描画・不正受信拒否・再接続・pagehide破棄後の非再接続を確認。初回のスモークはfixtureの動的ポート通知設定不足で失敗し、RECOOPLAY_RUNTIME_MEASURE=1を追加して成功した。
- Tauri実窓を専用ポート18130、dry-run/no-config/fake targetで起動。AXで/app・ロゴ・4人参加待ち・設定と緊急停止表示を確認し、閉じる操作後の窓消失とshutdownログ1件を確認した。これは実入力/Minecraft/実機受入を意味しない。
- PR-Aの構築・Rust/desktop単体試験・全CI相当Node試験・package-smokeはコミットcで成功。overlay変更に対して上記を追加検証。Android実Wi-Fi前後比較はprivate設定未提供のため未確認。iPhone・実指・Minecraft実入力・実無線断も未確認。旧版は既存タグのみで保持する。

## 2026-11-09 — #279 PR-B: 診断画面のReact/TS化

- /hostの既存DOM ID・CSS・統計・経路表示・1000件ログ・自動スクロール・再取得5秒・管理操作を維持。診断画面もReact lifecycleでAPI fetch/interval/monitorを破棄する。旧コードに準備中ラベルがなくundefined表示になった箇所だけ「準備中」と明示した。
- APIのJSONはunknownからdecodePcInfo、WSはdecodePcMessageで検証。now/slotの統計/RTC統計/注入先/ログを型付け。実ブラウザでRustの非キー出力code:nullの拒否を発見し、nullable契約に合わせて修正・回帰assert追加。秘密情報は記録しない。
- npm ci / npm run build成功。product-web-test（diagnostics-test追加）成功。全CI相当Node試験はauxiliary-pages-smoke以外成功（protocol-sim 60/60、shutdown、input-probe 12/12含む）。受信互換修正後にproduct-web-testと実headless Chromeのoverlay/diagnosticsスモークを再実行し成功。後者は1005件受信→古い5件除去・文字列escape・phase操作・確認取消時非送信・再接続・pagehide破棄を含む。
- desktop build/test（3成功）、package.ps1 -Out data/local/package-b / package-smoke成功。hostの初回再構築は検証シェルにPerl/libclangを設定していなかったため失敗した。SETUP_WINDOWSの環境を再設定したhost build/testは再実行中（第三者ライブラリの再構築）。Rust製品ソースはPR-Aから変更していない。
- Tauri実窓の共通起動・終了はPR-Aで確認済み。Android実Wi-Fiの前後比較はprivate設定なし、実入力照合は許可なしのため実施しない。iPhone・実指・Minecraft・実無線断は未確認。

## 2026-11-09 — 利用者依頼による一時停止（#279）

- PR-AはDraft #280、先端1702e60までpush済み。PR-Bは0a07f52をローカルのcodex/279-web-diagnosticsにコミット済み、未push・PR未作成。現在codex/279-web-pseudo-gameでPR-Cの変更を未コミットのまま保存した。
- PR-CのWeb strict/buildとpseudo-game-testは成功。旧画面の12系列trace（通知/観測先着・down/up・保持時間・視点・未反映等）と一致し、破棄後timer/frameは0。PR-Cの全CI相当スイート・新画面実ブラウザ・配布・実窓は未実施。
- PR-Bのhost再構築は、Perl/libclangの設定不足で初回失敗、設定後のdatachannel-sys再構築は利用者の停止依頼により中断（終了コード1）。build/testの再実行が必要。Rust製品ソースはPR-Aと同一。PR-Bのdesktop build/test・package-smokeと、code:null修正後のproduct-web-test/overlay・diagnostics実ブラウザ試験は成功済み。
- 検証用プロセスを終了。元の作業ツリーを変更せず、未コミット差分は保持。再開情報は元ツリーの data/local/codex-handoff/web-structure-resume.md に保存した。mainの更新・マージ・Issue close・リリースはしていない。


## 2026-11-09 — #279再開: 履歴更新への追従とPR-C実装

- 停止中にmain/PR-Aのコミット履歴だけが書き換えられた。ee77270と新main 6ad3153、旧A 1702e60と新A 9642c2cのtree一致をgit diff --quietで確認。閉じた#280のコメントから後継Draft #281を確認した。元worktreeを保持し、新worktree data/local/worktrees/279-web-resumedでBをcherry-pick（0a07f52→ae98b05、tree一致）し、保存済みC差分を移植。旧履歴のB作成はGitHub 422で拒否されたが、新ブランチcodex/279-web-diagnostics-resumedではDraft #282を作成できた。mainは変更していない。
- B単独のTauri実窓で/appロードを確認し終了。shutdownログ1件。中断した依存ライブラリの再構築は約16分で完了し、host build/testが138成功・2 ignored、probe4成功。新worktreeで同コマンドを再実行して同じ結果を確認。desktop build/testも3成功。
- CはPseudoGame.tsxの静的な殻とruntime.tsのcanvas/入力照合へ分離。照合500ms、保留確認100ms、観測報告500ms、focus報告1秒、ホイール表示150msと操作順序を維持。旧通知・破棄後の購読/タイマー/RAF/再接続を停止。inject/lookをunknownから検証する。
- [x] 固定時計で移植前の12系列を再生し、ログ・統計・observe送信・canvas文字描画を変換後と照合。通知先着/観測先着、down/up、保持時間、ホイール、視点、物理入力、非選択、未反映、注入失敗、ワールド/ジャンプを含む。旧JSは試験から読み込まず、タグの固定traceだけを保持。テスト用時計はAsia/Tokyoを明示し、TZ=UTCでも一致。
- [x] 不正inject/lookによる例外・統計変更がないこと、冪等破棄、旧socket通知/イベントが描画・送信を再開しないこと、再接続待ち破棄、timer/RAFが0であることを確認。
- [x] 実in-app browserでCSS分割による共通色の後勝ちを発見。pseudo-game.css内の@importで共通色→画面色の順を1つのCSSへ固定し、旧配色に戻ったことを目視。ブラウザ試験に--bg/--panelとcanvas寸法を追加。
- npm run build（strict、Vite設定も検査）、product-web-test、check-static-pages、auxiliary-pages-smoke（overlay/diagnostics/pseudo-game）成功。rust.ymlの全Node試験・verify_overlay・check-public-docsも成功。protocol-sim60/60、shutdown-sim、input-probe-sim12/12。新しい試験のため成功条件や既存assertを削除していない。
- 利用者が指定したprivate設定の存在と現在のPC/Androidアドレス一致、認可済み1台、縦向き、実wlan0経路、USBテザリング/reverseなしを検証した。接続情報は非公開。移行前/PR-A/PR-B/PR-Cの各60秒Wi-Fi測定は準備中で、結果は後続記録に追記する。OS実入力照合・iPhone・実指・Minecraft・実無線断は未確認。
- 変換前JSの出典: legacy-js-last-with-reactのapps/web-static/game.html、script SHA-256 `b3b653fde7c332b4fbaf7cea932b7185ce08a5f4b585ef75f928f9ad635310c8`。元に専用自動試験はなく、移植後pseudo-game-testはassert呼出箇所16（ループ展開前）＋12系列全体のdeepEqual。既存input-probe12観点は移植前後で維持。

## 2026-11-09 — #279 最終検証と3つのDraft PR

- DraftはPR-A #281（main向け）、PR-B #282（A向け）、PR-C #283（B向け）。旧#280は他者による履歴更新後の後継#281へ移った。mainの直接push・マージ・Issue close・リリースは実施していない。元作業ツリーと旧worktreeの変更は保持した。
- `npm ci` / `npm run build --prefix apps/web`、`cargo build --release --locked` / `cargo test --release --locked`（host: 138成功・既存2 ignored、probe4成功、desktop: 3成功）。rust.ymlに列挙された全Node試験とverify_overlay/check-public-docsは成功。protocol-sim60/60、shutdown-sim、input-probe-sim12/12。ローカル集計はdata/local/checks-pr-c-final/results.json（29コマンド、全終了コード0）。実装コミット9642c2c / ae98b05 / 66159e6のGitHub Structure checksとRust host and protocol simulationも全成功。
- Androidは利用者指定のprivate設定を引数に渡し、現在のPC/Androidアドレス・wlan0経路を検証。`node scripts/device/android-dry-run.mjs --wifi-network <private.json> --benchmark-ms 60000 --bin <exe> --sha256 <hash> --adb <adb.exe> --condition pr279-<条件> --trial <番号>` を移行前/PR-A/B/Cで実行した。最終試行は各16/16合格、各224入力の欠落・重複受理・未ACKは0。ボタン60秒と視点60秒を測定し、USBはCDP制御だけ（reverse/テザリングなし）。回転設定はfinallyで元どおりに復元済み。
- Androidの途中失敗も保存: A1はLAN文書HTTP待ちで中断、B2は選択ICE経路の双方向payload不足、B3は単指ボタンのdown/upがなく不合格（原画像にブラウザー拡大、反復イベントの多くがcontrol=null）。B4/C4は製品・試験判定を変えずに完走。座標ずれによる空白連打と標準ズームが疑われる。各1回の完走から性能改善・同等性は結論しない。lookLostは0ではなく、ボタン欠落0と区別した。[比較表・公開用集計](../acceptance/2026-11-09-web-structure-wifi.md)に全数値、試験判定、ソース/runner/exeハッシュを記録。接続情報・実IP・端末識別子・生ログはコミットしない。
- 配布の初回再確認では、比較前後で共用したcargo targetの通常buildが旧exeを再利用しており、package-smokeがJSの404を検出した。失敗zipはdata/local/package-pr-c-finalに保持。復旧では測定前に構築・単体試験しAndroid A/B/Cでも使用した固定exe（SHA-256 `4d562056c2eb6652886c1e86ff7861b456005ebd5f0e871f8821be5abaadcce1`）とdesktop exeをdata/local/verified-package-input/releaseへ隔離。`CARGO_TARGET_DIR=<隔離入力> scripts/windows/package.ps1 -Out data/local/package-pr-c-fixed` と `node scripts/sim/package-smoke.mjs data/local/package-pr-c-fixed/ReCooplay-0.1.0-windows-x64.zip` は成功。同梱一覧・改変/欠落拒否・全資産のHTTP200と内容一致・リポジトリ外の起動と正常終了を確認。zipのdirty印はこの最終記録の追記によるもので、製品コードは66159e6から変更していない。
- その配布フォルダのdesktopを専用ポート18133、dry-run/no-config/fake targetで起動。RECOOPLAY_ROOT/HOST_EXEは渡さず自動探索を確認。computer-useで実窓の/app・ロゴ・4人参加待ち・設定・緊急停止表示をAX確認し、Alt+F4で窓消失、desktop終了0、shutdown1件（releaseConfirmed=true、unconfirmed=[]）を確認。PR-A/Bもそれぞれ実窓で確認済み。
- 旧版タグの現在参照先は702b872 / e265745 / 6ad3153。履歴更新前c271ebe / 9947391 / ee77270とそれぞれtree一致をgit diff --quietで確認し、設計書を更新した。
- 未実施: 実OS入力での疑似ゲーム照合・実ホットキー/Alt+Tab・iPhone・実指・Minecraft実入力・実無線断・複数実端末・別PCの製品受入。明示許可のないOS入力は実施せず、dry-runや固定traceの成功を実入力の合格とは扱わない。

- #279の実測を受け、SETUP_WINDOWSへworktree別target・固定exeハッシュ・展開後package-smokeを追記。通常buildの成功表示だけで配布バイナリの版を判断しない。製品コードと依存関係は変更せず、git diff --checkとcheck-public-docs成功。

## 2026-11-09 — 実装済み・実機待ちIssueの洗い出しとAndroid実機（Wi-Fi）の回帰確認（Claude Code）

- オープン約60件を確認。実装済みで実機確認だけが残るのは #138・#139・#141（残る項目はOutlast・Minecraft・Windows実ウィンドウで、Android 1台では完了できない）。#38・#39・#217・#218・#224 は複数端末・実ゲームが必要で、#262・#261・#197・#264 は未実装または実機計測が必要。
- 古いexe（16:38ビルド）は標準URL `/` が404だった。StrawberryPerlとLIBCLANG_PATHをPATHへ足して `cargo build --offline --release --locked` で再ビルドし（22:04）、その版で試験した。
- `node scripts/device/android-dry-run.mjs --bin <exe> --sha256 <hash> --wifi-network data/local/wifi-network.private.json` を、既定（3人）・`--players 2`・`--players 4`・`--ws-only` の4構成で実行。Android 16/Chrome、HTTP/WS/ICEは実Wi-Fi（ADB reverseなし、CDP制御だけADB forward）。各14項目すべて合格：生成操作面・単指/2接点・スティック・Pause/回転/バックグラウンド/切断再接続での全解放・再読み込み・JSエラーなし。
- 限界：実指ではなくCDP合成タッチ、OS入力なし（dry-run/fake target）、P2以降は模擬参加者。#138・#139・#141・#224の実機完了条件は満たしていない。

## 2026-11-09 — 実Minecraft・実Windows入力・Android実機（実Wi-Fi）の自動確認（Claude Code）

ユーザーが「このPCをフルで利用してよい・ユーザー操作なしで確認」と明示したため、監督者役を兼ねて実入力で確認した。対象はMinecraft Java 26.3（公式ランチャーから起動）の既存クリエイティブワールド（事前に保存フォルダとoptions.txtをバックアップ。終了後のoptions.txt差分なし）。ホストは現ブランチをStrawberryPerl＋LIBCLANG_PATHで再ビルドした通常実入力モード（dry-run・fake target・設定なし。ホットキー有効）。

- **P2・P3を模擬WS、P1を模擬WS**（`data/local/real-mc/scripts/stage2.mjs`）：Ready→coop、P1前進でWの実OS押下/解放、P2視点で画面が回転（目視確認）、P3ホットバー切替、P3左ボタン押下/解放、W＋左ボタン同時保持→Pauseで全解放、Resume直後に旧押下を復元しない、物理Ctrl+Alt+F12（`keybd_event`）でW・左ボタンが解放されhotkey由来の緊急停止ログ、停止後は入力が届かない。13/14合格（残り1件は静止画面ハッシュの安定性で、Minecraft側の画面アニメーションによる試験側の問題。製品の欠陥ではない）。
- **#138（自動前面化）**：Windows Terminalを前面にした状態でReady/準備を行うと、ボタン操作なしでjavawが前面になることをGetForegroundWindowで確認（Android実機のタップ経由でも同じ）。前面化後はMinecraftがゲームメニュー（pauseOnLostFocus）を開くため、ホストはpreparingのまま「プレイ中の画面まで進めてください」と案内して待つ。これは仕様どおりだが、#261（ゲームメニューのままの入力）の根拠になる。
- **Android実機をP1（ホスト）、P2・P3を模擬WS**（`stage3a.mjs`）：実機ChromeがWi-Fi（WS＋RTC）でホストへ参加。`adb shell input`の実タッチ（スティック・長押し。制御はUSB、通信はWi-Fi）でMinecraftへ実入力が届くことを確認（スティック上=W、右上=W+D、左=A、Space長押し、Ctrl長押しはそれぞれ実OSで押下・指を離して解放）。#139・#141のうち、Android実機・実指系のスティック入力と3人分担の移動・視点・アクション入力がMinecraftへ届く部分を確認した。8方向のうち確認したのは上・右上・左のみ。Outlast等の他ゲームは未実施。
- **保持中の安全停止（Android実機、motionevent DOWN→MOVE→保持→UP）**：W保持中に実機がホーム画面へ移ると解放（phaseはcoopのまま）、画面消灯で解放。実Wi-Fi断（`svc wifi disable`）では約5.6秒後に全解放してpaused（4秒切断判定と整合）、Wi-Fi復帰の約6.2秒後に自動復帰し、旧押下は復元しない。全8項目合格。
- **#262の再現（現状の挙動の記録）**：P3が左ボタンを押している間にP1の実機がフォーカスを失うと、P3の左ボタンも解除された。バグ票どおりの挙動で、修正は未実装。
- 構成の違い：Wi-Fi断の試験以降、実機がPCのモバイルホットスポットではなくルーター経由の自宅LAN（PCは有線の同一セグメント）へ自動接続し、以降はそのIPで実施した（Wi-Fi断・復帰の試験自体はルーターLAN上で実施）。ホットスポット側での同試験は未実施。
- 限界：Minecraft 26.3は1版・クリエイティブ・単一PC。P2・P3は模擬、実機は1台。2人・4人の実入力、AT-D05の連続3回の台本、実指の長時間、iPhoneは未実施。#261は未修正。実入力の試験コードは `data/local/real-mc/scripts/`（Git対象外）。

## 2026-11-09 — #138・#141の実機確認と #259 の実装（Claude Code）

- **#138**：Android実機（P1・ホスト、ルーター経由の自宅LANのWi-Fi）のタップで一時停止→Windows Terminalを前面にしてから実機の「再開する」→ボタン操作なしでMinecraft（`javaw`）が前面になり `coop` へ戻ることを実ウィンドウで確認。Readyも同様（先の記録）。再開ボタンは他の参加者の `role_ok` 後に有効になる（模擬参加者に自動応答させた）。完了条件を満たしたとしてクローズ。
- **#141**：3人分担でP3の持ち物（E）が実OS入力になりMinecraftの持ち物画面が開くことを目視確認（移動・視点・攻撃は先の記録）。4人構成では持ち物・ドロップ・ホットバーがP4、攻撃・使うがP3になり、分担外の入力は届かないことも観測した。完了条件を満たしたとしてクローズ。
- 試験の留意：Minecraftはフォーカスを失うとゲームメニューを開く（`pauseOnLostFocus`）。メニューが開いたままのcoopでは視点・左ボタンが届かない場合があり、#261の根拠になる。Steamはログインが必要なため #139 のMinecraft以外のゲーム（Among Us等）は起動できず、ユーザー作業待ち。
- **#259（通信テストの1回ごとの分離とp50・p99表示）を実装**：`apps/web/src/phone/burst-stats.ts`（最近順位法のp50/p95/p99、テストで送った入力のACKだけを集めるレコーダー、WebRTC/WS別集計）。`runtime.ts` の通信テストが1回ごとにレコーダーを作り直す。常時の統計（`rtts`）・入力/ACK/epochの契約は変更していない。`node --experimental-strip-types scripts/sim/burst-stats-test.mjs`：手計算（1〜100msでp50=50・p95=95・p99=99）、連続3回の最大値の非継承、他入力・二重ACKの除外、経路別件数の一致に合格（`product-web-test.mjs` の共通runnerへ追加）。`npm run typecheck --prefix apps/web`・`npm run build --prefix apps/web`・`node scripts/sim/product-web-test.mjs`：成功。Android実機（実Wi-Fi、dry-runホスト）で通信テストを3回連続実行し、各回200件・未ACK 0、最大20→15→18msと前回を引き継がず、p50/p95/p99とWebRTC/WS別が表示されることを確認した。実Wi-Fi・1台・1経路条件の観測で、遅延性能の評価ではない。

## 2026-11-09 — #262（端末ごとの解放）と #261（メニュー表示中のマウス抑止）の修正（Claude Code）

- **#262（案1）**：`release_inputs` に端末が直近に送った入力番号 `iseq` を付け、`iseq`付きは**送信した端末の押下だけ**を解放し、他の参加者の押下とepochは変えない（`hub.rs` の `release_slot_inputs`）。解放要求より前に送られ、順序待ちの後に届いた押下は `release_floor`（番号の下限）で適用しない。`iseq`なし（旧版のスマホ）は従来どおり全解放・epoch更新。切断・Pause・緊急停止・入力先喪失の全解放は変更していない。フロントは `stopRemote` で `iseq: lastIseq` を付ける。
- **【2026-11-10撤回・Q48】以下の #261 の実装（カーソル表示の判定でマウス入力を止める方式）は採用しない。コードから削除済み。下の検証・実Minecraftの結果のうち #261 に関する部分は、撤回した実装の記録である。** **#261（案の「案内と手順」ではなく、ホストがカーソル表示で判定）**：操作定義に `capturesMouse`（Minecraftが `true`）を追加し、`GetCursorInfo` で入力先がマウスを捕捉していない（カーソルが表示されている＝ゲームメニュー・持ち物）と判定した間は、マウスの押下・ホイール・視点を送らない。キーは送る（Escで戻れる）。切り替わった時点で押下中のマウスボタンと視点の未処理分を解放し、epochは変えない。`mouseBlocked` をgame状態で通知し、スマホに案内を出す。画像認識は使わない。
- 検証：`cargo build/test --offline --release --locked`：成功、137合格/2ignored＋4。`node scripts/sim/protocol-sim.mjs --bin <同ホスト>`：62/62（#262・#261の試験を追加。`cursor on|off` はdry-run＋fake targetの標準入力だけ）。`npm run typecheck/build --prefix apps/web`、`node scripts/sim/product-web-test.mjs`（`phone-warning-test` を追加）、`check-static-pages.mjs`、`verify_overlay.py`、`check-public-docs.py`、`profile-catalog-test.mjs`：成功。
- **実Minecraft 26.3（実入力）**：メニュー表示中にP3の左クリックを送っても左ボタンは押されず、メニュー（統計など）は変化しない（目視）。メニュー中もWは通り、Escで閉じるとマウス操作が再開する（7/7）。**Android実機（P1・Wi-Fi）**：P3が左ボタンを押している間に実機がホームへ移っても、P3の押下は続きepochは4のまま、P3が離すと解放される。実機のスティックでW保持中にホームへ移るとP1自身のWは解放される（6/6）。
- 限界：画面消灯の再試験は、Chromeが背面で切断・再接続（epoch更新を伴う従来の全解放）したため試験の前提が崩れ、合否を判定していない。4秒以上の背面化・切断は従来どおり全員の停止になる。`GetCursorInfo` は入力先のウィンドウが前面のときのカーソル表示状態で、Minecraft 26.3以外・ウィンドウ化以外の表示形態は未検証。持ち物を開いている間もマウスを止める（持ち物はEキーで開閉できる）。Minecraftのカーソルの判定が合わない版・環境があれば、`mouse_capture` ログで確認する。

## 2026-11-10 — PR #284：#261の旧判定を撤回し、#259・#262を維持（Claude Code）

- 根拠：Q48（kume確定）。ゲームのメニュー・カーソル状態でReadyや入力の可否を決める機能は不要。Readyはメニューの状態にかかわらず受理し、プレイ中の画面まで進めてからReadyする運用を、既存の非ブロッキングの案内で示す。Minecraft専用の機構は製品標準に残さない。
- 撤回：`capturesMouse`（操作定義・`profiles.rs`）、`GetCursorInfo`（`focus.rs` の `cursor_visible`）、`mouse_blocked`・`check_cursor`・`cursor_free`・`FakeCursor` と標準入力 `cursor on/off`（`hub.rs`・`main.rs`）、`mouseBlocked`（状態・型・通信境界・スマホの案内文）、`protocol-sim` の #261 試験、`phone-warning-test.mjs`、関連の仕様書の記述。
- 維持：#259（通信テストの1回ごとの分離・p50・p99）、#262（`release_inputs` の `iseq` による本人のみ解放と、解放前の押下の遅着拒否）。全員解放（切断・Pause・緊急停止・入力先喪失）は変更していない。
- 案内：Ready前の案内は、既存の「プレイ中の画面まで進めてください」で統一する（ユーザー判断、2026-11-10）。Readyの可否には連動しない。
- 残るリスク：メニューを開いたままReadyすると、協力入力の攻撃・使うがメニューをクリックするおそれがある（2026-11-09の観測：「統計」ボタンが押された）。自動対策済みとは主張しない。制限事項として扱う。
- 撤回後の実Minecraft・実機の確認は、下の2026-11-10の記録を参照。

## 2026-11-10 — PR #284の実機確認（実Minecraft・実Wi-Fi・実入力、Claude Code）

ユーザーが「本番想定のWi-Fi経路で、Minecraftへの実入力をこのPCで実行してよい」と明示し、緊急停止を押せる位置で立ち会った。
- 構成：ホスト `ef875c7` のリリースビルド（`recooplay-host.exe` SHA-256 `5a1536104d501cec…`）を、PCアプリ（Tauri、`recooplay-desktop.exe` `dd717b9e1c6d503c…`、PR #284とは別の既存ビルド）から子プロセスとして起動。通常の実入力モード（dry-runなし）。
- 経路：Windowsのモバイルホットスポット（`192.168.137.0/24`）にAndroid実機（Chrome）を接続し、HTTP・WS・WebRTCとも実Wi-Fi。ADBは画面のタップ・状態取得だけに使った。P1＝実機Android、P2・P3＝PC上の模擬WS。
- 起動：PCアプリでゲーム一覧から「Minecraft Java Edition（公式ランチャー）」を選び→分担を決定→「ゲームを起動する」。ランチャーの「プレイ」と、タイトル画面からワールドに入る操作は、人がPCのマウスで行った（スマホで操作できない。#287で起票）。Minecraft 26.3、ウィンドウ表示、既存のシングルプレイのワールド。
- **Q48（#261）**：準備中に、ホストのスマホのリモコンの「Esc」でゲームメニューを開いた（画面で確認）。メニューを開いたまま、スマホの「Ready」を押すと、拒否・待機なしで `preparing→coop`（epoch 11）に進み、スマホはP1のコントローラーへ切り替わった。続けて、スマホの「一時停止・ホスト操作へ」→リモコンの「Esc」でメニューを閉じ→「再開する」で `coop` に戻った（PCに触れずにスマホだけで操作）。その後、P1の実機スティックで実Wの押下・解放、P3の攻撃で実左ボタンの押下・解放を確認した。メニューを開いたままの状態で、協力入力を意図的に送る確認はしていない（誤クリックのリスクは制限事項のまま）。
- **#262**：P3が攻撃（実左ボタン）を保持中に、実機をホーム画面へ移すと、`release_inputs`（P1、iseq 16）が2回届き、3.2秒後もP3の左ボタンは押されたまま、epoch 13は変わらず。その約6秒後にChromeが背面でWSを切断し（close 1006）、`P1 disconnected` で全員解放・一時停止した（Q49の「実際の通信断では全員解放」と一致）。実機が戻ったのは切断の20秒後で、自動復帰の期限（15秒、このビルドの既定はON）を過ぎていたため、自動復帰せずホストの再開を待った。再開後、P1の実W・P3の実左ボタンを同時に保持して実機をホームへ移すと、1.2秒後にP1のWだけが解放され、P3の左ボタンは保持、epoch 15のまま。
- 限界：実機は1台（Android）、iPhone・実機2台以上は未実施。Ready前の案内は「プレイ中の画面まで進めてください」で統一する（ユーザー判断）。Minecraft以外のタイトルでの同じフローは未実施。

## 2026-11-10 — PR #284の実機確認：Among Us（Steam）とiPhone（実Wi-Fi・実入力、Claude Code）

ユーザーが「Among Usを遊んでよい。Re:Cooplayから開く」と明示し、立ち会った。
- 構成：ホスト `ef875c7` 以降のリリースビルド（`5a1536104d501cec…`。その後の変更は文書と画面の文言だけ）を、PCアプリ（既存ビルド）から起動。通常の実入力モード。PCのモバイルホットスポット経由の実Wi-Fiで、P1＝Android実機（Chrome）、P2＝iPhone実機（Safari、ユーザーが操作）、P3＝PC上の模擬WS。
- **起動**：PCアプリのゲーム一覧で「Among Us（Steam・未検証）」を選び→分担（P1：A・D、P2：W・S、P3：E・Q・R）を決定→「ゲームを起動する」で、Steam経由で起動し、Among Usが前面になった。PCでの操作は不要だった。
- **Q48（#261）・Minecraft以外**：準備中に、ホストのAndroidのリモコン（トラックパッドと左クリック）だけで、タイトル画面の「プレイ」→「プラクティス」→マップ「THE SKELD」を選び、ゲーム内に入った。スマホのReadyで協力プレイへ進み、P1のスティックで実Dの押下・解放、iPhoneのW・Sの実入力を確認した。
- **#262（iPhoneの離脱）**：P1がDを保持中に、iPhoneがSafariを離れると、ホストには `release_inputs`（P2）だけが届き、P1のDは保持、epochは変わらなかった。ただしiOSが背面のSafariを止めるため、約5.2秒後に心拍が途切れて切断扱い（`heartbeat timeout`）になり、全員解放・一時停止した（Q49の「実際の通信断では全員解放」どおり）。戻ると自動復帰した（このビルドの既定はON）。
- **#262（Androidの離脱）**：iPhoneがWを保持中に、Androidをホーム画面へ移すと、`release_inputs`（P1）だけが届き、iPhoneのWは保持された。約6.1秒後にAndroidのWSが切れ（close 1006）、全員解放・一時停止した。
- 観測：iPhoneで「短い離脱」として扱われるのは、心拍の切断判定（4秒）より短い場合だけ。それより長いと、Androidと同じく全員停止になる。再接続のとき、`replaced` の切断で一時停止→自動復帰が数ミリ秒の間に2回続き、epochが2進む（P1・P2とも観測）。安全上の問題は見つかっていない。
- 限界：Among Usは未検証の操作定義のまま（移動だけ確認）。iPhoneの操作はユーザーによる実指。iPhoneのページ再読み込み時の挙動は記録していない。

## 2026-11-10 — #139・#61・#218の実機確認（Among Us・Minecraft・手動登録、実Wi-Fi・実入力、Claude Code）

ユーザーの許可と立会いのもと、PR #284のホスト（`5a1536104d501cec…`）をPCアプリから通常の実入力モードで起動した。PCのモバイルホットスポット経由の実Wi-Fiで、P1＝Android実機、P2＝iPhone実機、P3＝模擬WS。
- **#139（Minecraft以外のスティック移動）**：Among Us（Steam、v19s）のプラクティス（THE SKELD）で、P1の実機スティックを右・左に倒すと実D・実Aが押され、キャラクターが右・左へ移動した（画面の前後比較で確認）。指を離すと解放された。P2（iPhone）の担当W・Sも実入力で届いた。
- **#61（Minecraft以外の1タイトル）**：Among Us、ボーダーレス全画面、操作定義は未検証のまま（既定の分担：3人でA・D／W・S／E・Q・R）。注入：A・D・W・Sの実入力が届いた。前面喪失：P1がDを保持中にユーザーがAlt+Tabすると、前面が `explorer.exe` になった時点でDが解放され（`system` 名義）、`app focus` で一時停止。Among Usへ戻っても自動では再開しない。停止：Dを保持中にCtrl+Alt+F12（`keybd_event`）で即時解放・一時停止・入力OFF、押し直しても届かない。PC画面の「入力を再開する」→スマホの再開で戻った。制約：外部のプロセスからの前面の切り替え（`SetForegroundWindow`・最小化）は、Among Usの全画面表示に対して効かなかった。判定：移動を中心とした遊びならGo。タスクの操作はマウスが中心で、分担の向き不向きは未評価（#167）。
- **#218（ゲームの検出・登録・起動）**：Minecraft公式ランチャー＝起動要求でランチャーが開き、「プレイ」を人が押すと検出して前面化（#287）。Steam＝Among Usを2回起動し、ランチャー操作なしで前面化。起動済みのゲーム＝起動中のAmong Usを選ぶと、PC画面のボタンが「ゲームを準備する」に変わり、前面化して準備へ進んだ。時間切れ＝Minecraftのランチャーを開いたまま「プレイ」を押さないと、約300秒後にPC画面へ「起動を確認できませんでした。…手動で起動してください」と「もう一度起動する」「手動で起動して準備へ」が出た（スマホには時間切れの案内は出ない）。手動登録＝PC画面の「＋ 追加」でファイル選択画面が開き、ユーザーが選んだ `aooni` が「手動登録・未検証」として一覧に加わり、「ゲームを起動する」で起動・前面化した。Epic＝このPCに導入されておらず未検証。

## 2026-11-10 — #285 遅れた押下の破棄と復旧後の案内（PR #284 に積み重ね）

- 既存の安全ゲートの照合：旧epochの入力はstale ACKで不実行、本人の `release_inputs` 以前の押下は不実行（#284）、通信断・epoch変更でスマホが全保持を失効し、同じ指のpointermove/pointerupでは押下・視点を再開しない（ボタン・スティック・視点パッド）、`protocolVersion` は完全一致必須（不一致は 4005 で拒否）。不足は「同じepoch内で大きく遅れて届いた押下」と「Q27の案内」だった。
- ホスト：`apps/host-rs/src/freshness.rs` を追加。接続ごとに「受信時刻−スマホの送信時刻 `t`」の最小値（`ping`・`ka`・`input` の到着、15秒×2区間）を基準とし、押下の処理時点で基準から500ms以上遅れていればstale ACKを返して実行しない。`t` 不正・基準なしも不実行。解放は常に適用。500msは2026-11-09の実Wi-Fi計測で正常時ACK往復の最大384ms（E-ws）を上回る値。スロットの診断に `staleDowns` を追加。
- スマホ：押下のstale ACKで該当操作の押下表示を解き、通信断・epoch変更などで入力を止めたときに触れていた指とあわせて、離すまで「指を離して操作を再開」（`#liftHint`、非モーダル・タッチ透過・画面上部）を出す。
- 自動試験：`cargo test --release --locked`（host 142成功・2 ignored、probe 4成功。鮮度判定3件と遅延押下の破棄・他者保持の継続を追加）、`node scripts/sim/protocol-sim.mjs` 62/62（遅れた押下の破棄を追加。手書き入力の `t: 0` を現在時刻へ修正）、`node scripts/sim/product-web-test.mjs`（`phone-lifecycle-test` に復旧・遅延破棄の2件を追加）、`npm run typecheck/build`、`check-static-pages.mjs` 成功。
- 実機（Android Chrome 1台、アプリ通信はホットスポットのWi-Fi、操作はUSBのCDPタッチとadb、dry-run・疑似入力先、模擬P2）：協力プレイ中にジャンプを押したまま `svc wifi disable` → 約4秒で切断扱い・`act:jump` 解放・一時停止。Wi-Fi復帰後に自動復帰しても、押したままの指では押下が再開せず（ホストの `pressed` 空）、案内を表示。指を離すと案内が消えた。
- 未確認：iPhone Safari、実端末2〜4台、Minecraft実入力、実際のバースト損失で500ms閾値が正常な押下を捨てないか（今回の閾値は既存計測からの選定で、新たな測定はしていない）。
- 2026-11-11 レビュー指摘（P2）への対応：古い押下のstale ACKが、離して押し直した新しい押下まで止めていた。スマホは操作ごとに「今続いている押下の番号」（`pressing`）を持ち、upを送ると消す。stale ACKの番号がその操作の今の押下と一致するときだけ止めて案内を出す。同じ操作を複数の指で押している場合は、ホストには最初の押下しかないので、そのstaleで全員を止める（従来どおり）。試験3件（押し直し・複数の指・スティックの倒し直し）を追加し、修正を外すと失敗することを確認。`node scripts/sim/product-web-test.mjs`（phone-lifecycle 21/21）、`npx tsc --noEmit -p apps/web` が成功。
## 2026-11-11 — #284 本人だけの解放で、逆順に届く入力の境界をそろえる（レビュー指摘P1・P2）

- P1：本人の `release_inputs` の後に、解放前に送った視点がRTCで遅れて届くと、同じepochで番号が大きいため受け付けて視点が動いていた。スマホは解放要求に、直近に送った視点の `lseq`・`cx`・`cy` を載せる。ホストはその番号と累積値を基準に進め（移動は適用しない）、それ以下の視点を捨てる。新しいタッチは解放時点の累積値から差分を取るので、捨てた移動が混ざらない。解放より新しい視点が既に届いていれば基準と補間待ちを保つ。`lseq` のない旧版のスマホは従来どおり。
- P2：新しいタッチの押下（RTC）が、それより前に送った解放要求（WS）を追い越すと、解放が新しい保持まで消していた。ホストは押下ごとの入力番号（`press_iseq`）を持ち、解放は `iseq` 以下の押下だけにする。番号より後の押下の出力は残す。全体の安全停止（`release_outputs(None)`）は変えていない。
- 試験：Rust `own_release_rejects_a_late_look_sent_before_it_and_keeps_the_new_touch_baseline`、`late_own_release_keeps_a_press_that_overtook_it_and_releases_older_ones`（Codexの再現手順と同じ順序）。Web：解放要求が最後に送った視点の番号・累積値と一致し、未送信の移動を後から送らないこと。

## 2026-11-11 — #284 本人だけの解放の追加境界3件（Codex再レビューのP1×3）

- P1（視点の追い越し）：解放要求より新しい視点が先に届いていると、補間待ちを丸ごと残していた。新しい視点の累積値と解放時点の `cx`・`cy` の差（新しいタッチの分）までに未処理量を減らす（`Look::keep_at_most`）。未処理量を増やす・向きを逆にする変更はしない（既にOSへ出した移動を戻さない）。端数は解放前の分として捨てる。
- P1（連打の再生）：押下を残す出力では、旧キューも一括で残していた。`OutputState::drop_slot_edges` で、その枠の保留辺を捨てて他の枠の辺は残し、最後に集約押下へ合わせる。新しい押下は1回だけ出て（既に押していれば出さない）、60ms/50msの待ちは従来どおり `pump_step` が守る。
- P1（旧版のスマホ）：`lseq`・`cx`・`cy` のない解放要求（iseqだけ）では、解放前の視点を拒否できない。`iseq` と視点の境界の両方がそろわない要求は、`iseq` なしと同じく全参加者の全解放・epoch更新にした。現行のスマホは常に `lookMark()`（未送信なら `lseq:0`）を載せるので、通常は本人だけの解放になる。protocolVersionは変えていない。
- 試験：Codexの独立試験6件（`codex/review-resume-20261111` の 8c8ca5c）を `release_order_tests.rs` に移植し、コード修正を外した状態で3成功・3失敗（視点105≠5、down 2回、旧版の視点90≠0）、修正後に6件成功。単体試験を追加（`drop_slot_edges` の3条件：押したままならdownを出し直さない・離した直後は50ms後に1回・他の枠の辺は残す、`keep_at_most` の増やさない・逆にしない）。既存試験は旧版の期待を全体解放へ変更し、本人だけの解放には `lseq` を載せた。`protocol-sim` に旧版（iseqだけ）が全体解放になる確認を追加。
- 結果：`RECOOPLAY_DRY_RUN=1 cargo test --release --locked` 150成功・2 ignored、probe 4成功。`protocol-sim` 62/62。
- 実機確認（2026-11-11、dry-run・疑似入力先、#313 のhead `7f0f442`＝本修正を含むビルド）：P1＝Android Chrome（USBのCDPで操作）、P2＝iPhone Safari（利用者の実指）、アプリ通信はどちらもホットスポットのWi-Fi。協力プレイ中にAndroidがジャンプ（SPACE）を押したまま、iPhoneが視点を操作してからホーム画面へ移り、約2秒でSafariへ戻った。ホストに届いたのは `release_inputs`（P2、`lseq:15`、`kept:[]`）だけで、SPACEは押されたまま（upはAndroidの指を離した55秒後の1回だけ）、epochは4のまま、切断・一時停止なし。戻った後のiPhoneの視点操作は通常どおり注入された。
- 未確認：iPhoneでの「指を離して操作を再開」（#313）、逆順到着そのもの（実ネットワークでは偶発で、再現は自動試験だけ）、実Minecraftでの入力。
## 2026-11-10 — #161 時間制の役割交代をQ42/Q44/Q46に合わせる

- 既存実装（1〜3分を選べ、交代のたびに一時停止して全員の確認とホストの再開を待つ）を確定仕様へ変更。間隔は60秒固定（`ROTATION_CHOICES = [0, 60]`）・初期OFF。ロビーへ戻るとOFFに戻す（Q44）。
- 交代時は協力プレイを止めず、全員の入力を解放→未処理入力・視点を破棄→epochを進めて旧入力を無効化→参加者の順に担当を1つずらす（Q46、N人でN回で元に戻る）。ホスト権限・P番号・キー割当は移さない。確認待ち（roleAck）は使わない。
- 交代5秒前から `rotationSoon`・`rotationNext` で次の担当を予告し、交代ごとに `rotationCount` を増やす。スマホは非モーダルの案内（`#rotationNotice`、タッチ透過）で予告と交代直後の担当を示す（交代直後の案内は4秒で消える）。一時停止中は数えず、再開で残りから数える。
- 自動試験：`cargo test --release --locked`（host 139成功・2 ignored、probe 4成功。交代の予告・継続・全解放・巡回・停止中の残り・OFFへの復帰を追加し、旧方式の試験を置換）、`node scripts/sim/protocol-sim.mjs` 60/60（交代の試験を新仕様へ置換）、`node scripts/sim/product-web-test.mjs`、`npm run typecheck/build`、`check-static-pages.mjs`、`check-public-docs.py` 成功。
- 実機（Android Chrome 1台＝P1、アプリ通信はホットスポットのWi-Fi、USBのCDPで観測、dry-run・疑似入力先、模擬P2）：実時間で待ち、56.5秒時点で予告、60.6秒で交代（一時停止なし）、P1の画面が移動から視点・クリック等へ切り替わり、交代の案内は約5秒後に消えた。
- 未確認：実スマホ2〜4人での2周期以上、iPhone、Minecraft実入力での操作感、交代中の切断・Wi-Fi断。第三者の試遊（#167）。
- 2026-11-11 レビュー指摘（P2）への対応：交代の向きが逆だった（3人で元のP1の担当がP3へ移っていた）。`rotated_seats` を、枠の番号順で1つ前の参加者の席（＝担当）を受け継ぐ向きに直した。#161の「現在の参加者順で循環（P1→P2→P3→P1）」に合わせ、席順ではなく枠の番号順で回すので、手動の入れ替え後も P1→P2→P3 の向きになる。単体試験に3人・4人・欠番・入れ替え後を加え、Hubの試験 `role_rotation_follows_slot_order_with_gaps_four_players_and_after_a_manual_swap` で、予告 `rotationNext` と実際の交代の一致、N回で元に戻ることを確認した。protocol-simの確認も「P1の担当がP2へ」に直した。`cargo test --release --locked`（RECOOPLAY_DRY_RUN=1）、`node scripts/sim/protocol-sim.mjs`（60/60）が成功。
## 2026-11-11 — #302 PCアプリの終了と通信断をスマホの画面全体で示す

- ホストは終了時（デスクトップの `quit`・標準入力のEOF）に、全解放の後でスマホの接続を終了コード4009で閉じ、送信のため200ms待ってから終える。解放の順序と終了コードは変えていない。
- スマホは4009で再接続をやめ（次に起動したアプリへ勝手につながらない）、「PCのアプリが終了しました。…再読み込みしてください。」を画面全体に出す。参加できない案内（満員・版不一致・終了など）を出している間は、下の操作画面を隠す（`#full` は背景が透けるため、押せそうに見えていた）。
- 4009以外の切断が3秒続いたら、「PCのアプリとつながっていません／再接続しています…」で操作を覆う。再接続は続け、welcomeで消す。満員などで止まったときは覆わない。
- `node scripts/sim/product-web-test.mjs`（phone-lifecycle 18/18、#302の試験2件を追加）、`npx tsc --noEmit -p apps/web`、`node scripts/sim/check-static-pages.mjs`、`cargo build --release --locked`、`node scripts/sim/shutdown-sim.mjs`（quit・EOFの両方でスマホが4009を受けることを追加）、`node scripts/sim/protocol-sim.mjs`（60/60）が成功。
- 実機確認：Android Chrome 1台（アプリ通信はモバイルホットスポットのWi-Fi、操作はUSBのCDP）、dry-run・疑似入力先のホスト。ホストを強制終了すると1.5秒後は覆わず、3.8秒後に覆いが出た。ホストを再起動すると自動で再接続して覆いが消えた。`quit` で終了すると（終了コード0）終了の案内が出て、下の操作画面は隠れた。その後に新しいホストを起動しても再接続しなかった。iPhone・デスクトップアプリの×ボタンからの終了は未確認。
## 2026-11-10 — #275 視点受信の空白の再分析（保存データ）

- `scripts/device/look-gap-analysis.mjs`（＋合成データの試験、CIに追加）で、PR #274 の主21試行＋修正後6試行の視点受信の200ms以上の空白30件を、端末の送信時刻・`lseq`・まとめ着・相対遅れ（最小値基準、時計の直接差は使わない）に対応付けた。
- 結果：送信側の空白0件（端末の送信間隔は最大66.9ms）。30件すべてで空白中に送ったパケットが直後に3〜11個まとめて届き（相対遅れ135.6〜378.0ms）、RTCでは20件で1〜2個の欠落を伴った。WSは欠落なしの遅着のみ。逆順・経路切替は0件。ハブの処理・経路切替が原因ではなく、無線区間での滞留が推測される（機器・仕組みは未確定）。
- 記録：`docs/develop/acceptance/2026-11-10-look-gap-analysis.md`、`docs/develop/acceptance/evidence/look-gaps-275/gaps.json`。製品コードは変更していない。新たな実機測定は未実施。
- 試験：`node scripts/device/look-gap-analysis-test.mjs` 合格、`python scripts/check-public-docs.py` を実行。
## 2026-11-10 — #290 担当の内容から入力の種類の重複を除く

- 2026-11-10、ユーザーが#290の扱いについて「キー名のまま（#150を維持）」を選んだ。操作定義の名前（使う・キル等）は主表示に戻さず、`docs/develop/decisions/2026-10-26-input-key-labels.md` を維持する。#290では「キー：Aキー」のような重複表記の解消だけを行う。
- `roleView` の内容を、見出し（入力の種類）を繰り返さない1行（例「Aキー、Dキー」「マウス移動、左クリック」）にした。PCの分担カードは従来 `lines[0]` だけを出しており、複数種類の担当で一部しか表示されなかったが、1行にまとめたので全入力が出る。
- `node --experimental-strip-types scripts/sim/app-view-test.mjs`（30/30）、`npx tsc --noEmit -p apps/web`、`node scripts/sim/product-web-test.mjs` が成功。実機・Among Usでの目視は未実施。
## 2026-11-10 — #289 終了・ホスト譲渡の確認をページ内ダイアログへ

- 終了（`END`）とホスト譲渡の確認を `confirm()` から `<dialog id="phoneConfirm">` へ置き換えた。切断中はOKを無効にして要求を保持し、段階や参加者が変わり操作が成り立たなくなったら閉じる。通信契約・ホストは変更なし。
- 自動試験：`npm run typecheck --prefix apps/web`、`node scripts/sim/product-web-test.mjs`（`phone-lifecycle-test` 20/20、#289の4件を追加）、`npm run build --prefix apps/web`、`node scripts/sim/check-static-pages.mjs` 成功。ハーネスの `confirm()` は呼ぶと失敗する。
- 実機（Android Chrome 1台、アプリ通信はWindowsモバイルホットスポットのWi-Fi、操作はUSBのCDP）：dry-run・疑似入力先のホストへ、模擬P2（PC上のWSクライアント）と2人で準備→Ready→一時停止→「ロビーに戻る」。確認を12秒表示してもP1の切断・再接続は0回（ホストログにも切断なし）、OKで `host end` によりロビーへ戻った。実ゲーム・iPhone・ホスト譲渡の実機操作は未確認。
## 2026-11-10 — #291 前面の案内を進行の段階に合わせる

- 前面の警告（`inputTarget`）はゲームへ入力する段階（準備中・協力プレイ中・一時停止中）だけに出す。ロビーでは出さず、未選択時の既定タイトル（Minecraft）も出さない。
- ホストのリモコン画面では上部の警告を出さず、操作先（`#remoteRoute`）に届かない理由を段階別に示し、ゲームの検証状況は下の `#remoteNotice` に出す。警告の有無で矢印・Enter・Escの位置が動かない。前面にあるのに「前面にしてください」とは出さない。
- 自動試験：`npm run typecheck --prefix apps/web`、`node scripts/sim/product-web-test.mjs`（`phone-view-test` の警告の観点を新仕様へ更新・追加）、`npm run build --prefix apps/web`、`node scripts/sim/check-static-pages.mjs` 成功。
- 実機（Android Chrome、ホットスポットのWi-Fi、USBのCDPで観測）：dry-runホストのロビーで上部警告なし、状態欄に「PCアプリが前面にないため、リモコンは届きません（ロビーではPCアプリだけを操作します）」を表示。準備中・協力プレイ中の実ゲームでの表示は未確認。

## 2026-11-10 — #292 ホストのスマホからPCアプリへ戻る

- ホストに `OPEN_APP`（P1のみ、協力プレイ中以外、現在epoch必須）を追加。PCアプリ（`recooplay-desktop.exe`）のウィンドウを前面にするだけで入力は送らない。失敗時は理由を `command_result.reasons` で返す。状態に `canOpenApp` を追加し、スマホのリモコンに「PCアプリを前面にする」を出す（PCアプリが前面のときは隠す）。
- PCアプリから起動したホストは、選んだゲームのウィンドウを一度見た後に閉じたら、ロビーでPCアプリを1回だけ前面に戻す（一時停止中に閉じた場合はロビーへ戻った後）。ゲーム自体をスマホから終了する操作は追加していない。
- 自動試験：`cargo test --release --locked`（host 140成功・2 ignored、probe 4成功。`OPEN_APP` の段階・ホスト限定、ゲーム終了時の1回だけの前面化を追加）、`node scripts/sim/product-web-test.mjs`、`npm run typecheck/build --prefix apps/web`、`check-static-pages.mjs`、`check-public-docs.py` 成功。
- 実機（Android Chrome、ホットスポットのWi-Fi、USBのCDPで操作）：dry-run・疑似入力先で、PCアプリの背面を標準入力 `app blur` で模擬。ロビーでボタンが表示され、押すと `open_app ok` となり表示が「PCアプリを操作中」に変わりボタンが消えた。実ウィンドウ（Tauri）の前面化と、実ゲームを閉じたときの自動復帰は未確認。
## 2026-11-11 承認済みPRの競合解消と統合前確認

- ユーザーが #317・#316・#318・#309・#310 のマージを明示承認。#317は `4e650fc`、#316は `89ce980` としてmainへマージした。いずれも直前のhead SHAと全CI成功を確認し、マージ後にorigin/mainを再取得した。
- その後、GitHubでは#318/#309/#310がBUILD_LOGの追記競合となった。ローカルの `.gitattributes` の `merge=union` とGitHub上の判定の違いを確認。作者ブランチを更新せず、最新mainから `codex/approved-prs-20261111` に3件の作者コミットをmergeで取り込み、双方のログを保持した。承認範囲外の製品変更は含めていない。
- 最終組合せで `npm ci --prefix apps/web`、`npm run build --prefix apps/web`（型確認を含む）、`node scripts/sim/product-web-test.mjs`、`node scripts/sim/check-static-pages.mjs`、`python scripts/check-public-docs.py`、`git diff --check` はすべて成功。
- 実スマホの表示・Minecraftの通し確認は未実施。OS入力を送る変更・Rust製品コードの変更はない。統合PRの最新CIを確認してから、既に承認された3件の範囲で統合する。
## 2026-11-10 — #225（PR #286）の実機確認：自動復帰の初期OFFと設定移行（実Wi-Fi・dry-run、Claude Code）

- 構成：ホスト `825b18a` のリリースビルドを、PCアプリ（Tauri、既存ビルド）から子プロセスとして起動。`RECOOPLAY_DRY_RUN=1`・`RECOOPLAY_FAKE_TARGET=1`（OS入力なし）。Android実機（Chrome）をWindowsのモバイルホットスポット経由の実Wi-Fiで接続し、P1＝実機、P2・P3＝PC上の模擬WS。ADBは画面のタップ・状態取得・Wi-Fiの切替だけに使った。
- **旧設定の移行**：リポジトリのルートに版なしの `config.json`（`{"port": 8080, "autoResume": true}`）を置いて起動すると、`{"autoResume": false, "port": 8080, "settingsVersion": 2}` に書き換わった（他の項目は保持）。ホストの状態とPC画面の「切断から戻ったら自動で再開する」はOFF。
- **初期OFF・実Wi-Fi断**：協力プレイ中に実機のスティックでWを保持し、実機のWi-Fiを切ると、約4秒で `P1 disconnected` の一時停止と全解放（Wの解放をホストのログで確認）。Wi-Fiを戻すと、実機はPCのホットスポットではなく別の保存済みネットワーク（研究室のルーター）へ自動接続し、P1は戻れなかった。保存済みのホットスポットへ接続し直した後にP1が再参加し、36秒間 `paused` のまま（canResume=true）。
- **初期OFF・期限内の復帰**：スマホで再開した後、ページを離れて約6秒で戻る短い切断を起こすと、34秒間 `paused` のまま自動で再開しなかった（期限15秒以内の復帰でも、ホストの明示RESUMEを待つ）。再開時に旧いWの押下は復元されなかった。
- **明示的なONの保持**：PC画面の操作設定で「切断から戻ったら自動で再開する」をONにすると、ホストに反映され、`config.json` が `autoResume: true`・`settingsVersion: 2` になった。PCアプリを再起動しても、ホストとPC画面ともONのまま。ONの状態で短い切断（約6秒）を起こすと、`auto resume` で協力プレイへ戻った。
- 後片付け：試験用の `config.json` は削除した。PCアプリと子ホストは残存なしで終了。
- 限界：実入力（Minecraft）はなし（dry-run）。iPhone・実機2台以上は未実施。Wi-Fi復帰時に端末が別の保存済みネットワークを選ぶ問題は、製品の範囲外の端末設定だが、会場での運用上の注意になる。
## 2026-11-10 — #293 Among Usの操作定義にマウスの担当を加える

- `scripts/profiles/overrides/steam-945360.json` と生成物 `apps/game-profiles/steam-945360.json` を同じ内容で更新（カタログの再生成は公開データの取得が要るため実行せず、該当2ファイルの groups/actions/sources だけを変更）。
- 「マウス（タスク・ボタン）」（P2：カーソル `mouseDelta`＋左クリック）を追加。協力プレイ中に誰も押せなかった「メニュー」（host）を廃止し、マップ（Tab）と「閉じる・メニュー」（Esc）を「使う・役職の操作」（P3）へ移した。分担の案は2人：P1移動＋使う等／P2マウス、3人：P1移動／P2マウス／P3使う等、4人：左右／上下／マウス／使う等。
- 自動試験：`cargo test --release --locked`（2〜4人の全員分担でマウス・Esc・使うが必ず誰かに入り、カーソルとクリックが同じ人になる試験を追加）、`node scripts/sim/profile-catalog-test.mjs` 成功。
- 定義の検証状態は `unverified` のまま。Among Usの実ゲームでマウスのタスク操作が成立するかは未確認。

## 2026-11-10 — #306 終了ボタンの名前を戻り先に合わせる

- ホストの `END` は `Phase::Lobby` に戻し、PCアプリは分担の画面（「分担しよう！」）になる。スマホのボタン「ロビーに戻る（協力プレイ終了）」と確認文の「ロビー」は戻り先と合わなかった。
- 戻り先は変えず（参加画面へ戻すと接続中の参加者を選び直す手間が増えるため）、ボタンを「協力プレイを終了（分担に戻る）」、確認文を「協力プレイを終了して、分担の画面に戻りますか？」、OKを「終了して分担に戻る」にした。#309（ページ内の確認）に積み重ねた。
- `node scripts/sim/product-web-test.mjs`（phone-lifecycle-testを含む）と `node scripts/sim/check-static-pages.mjs` が成功。実機での目視は未実施。
- 実機確認（2026-11-10）：Android Chrome 1台（アプリ通信はモバイルホットスポットのWi-Fi、操作はUSBのCDP）、dry-run・疑似入力先のホスト、模擬P2。一時停止中のボタンが「協力プレイを終了（分担に戻る）」で1行に収まり、確認ダイアログの文と「終了して分担に戻る」が表示され、OKで `host end` によりロビーへ戻った。iPhone・実ゲームは未確認。
## 2026-11-10 — #297 保持中の切断枠で参加できないときの案内

- ロビーでは切断した枠を15秒保持する（#223）。その間に5台目が来ると、接続中が2人でも「部屋が満員です」と出ていた。
- ホストの `full` に `retryMs`（ロビーで保持中の切断枠が最も早く空くまでのms、なければ `null`）を加えた。スマホは `retryMs` があれば「切断した人の再接続を待っているため、今は参加できません。N秒ほど待ってから再読み込みしてください。」と出す。デコーダーは負数・文字列を拒否する。
- 番号の飛び（P1・P2・P4）は、番号が担当色・トークン・再接続の識別に使われているため変えていない。
- `cargo test --release --locked full_room`（RECOOPLAY_DRY_RUN=1）、`node scripts/sim/protocol-sim.mjs`（60/60）、`node --experimental-strip-types scripts/sim/protocol-boundary-test.mjs`、`node scripts/sim/product-web-test.mjs`、`npx tsc --noEmit -p apps/web` が成功。実機での表示は未確認。
- 実機確認（2026-11-10）：Android Chrome 1台（アプリ通信はモバイルホットスポットのWi-Fi、操作はUSBのCDP）、dry-run・疑似入力先のホスト。P1＝実機、P2〜P4＝模擬で満員にし、P4を切断した直後に実機を新しい参加者（参加情報を消して再読み込み）として接続した。「切断した人の再接続を待っているため、今は参加できません。13秒ほど待ってから再読み込みしてください。」が表示され（ホストログ reject_full）、案内どおり14秒後に再読み込みすると参加できた（slot_released P4の後）。実機の参加情報は試験後に戻した。iPhoneは未確認。

## 2026-11-11 分担画面の決定前後と注意の配置（#296）

- 決定前後で見出しと案内を切り替え、1人のときは参加待ちを表示した。決定後は入れ替え操作の案内を外し、注意は分担帯の中へ移動した。
- `npm.cmd run build` と `node --experimental-strip-types scripts/sim/app-view-test.mjs`（31/31）が合格。Chrome（1280×720）の模擬状態で、1・3・4人の表示、決定前後、注意とイラストの位置を確認。Windows配布版での通し確認は未実施。

## 2026-11-11 次の4件の独立レビュー・統合準備（未承認）

- 対象は #286（221c8f0）、#312（156a1e3）、#319（fb58eb3）、#320（bf46b70）。main e38a681を基準に作者コミットを履歴ごと保持して取り込んだ。製品コードの競合なし、BUILD_LOGは両側の追記を保持。作者ブランチは未変更。
- #286のconfig.rsとfocus.rsを実ソース参照で `rustc --edition=2021 --test ... -C lto=thin -C opt-level=3 -C codegen-units=4` と、専用targetで構築済みの既存serde_json/windows依存にリンクして独立実行し、8/8成功。旧設定の一度だけOFF移行、欠落OFF、明示ON/OFFの再起動保持、他設定保持、フォーカス照合を確認。ホスト全体の試験ではない。初回はreleaseのthin LTOに合わせない実行でLNK2019/LNK1107となり、同じprofile指定で復旧した。
- #312のprofiles.rsとcontrols.rsも同じ方法で実ソース参照の独立試験を実行し、13成功・1ignored。Among Usの2〜4人の各分担でマウス移動とクリックが同一担当、Esc等が各1人に入ることを確認。既存502定義のカタログ試験も成功。実ゲームのタスク操作は未確認。
- #319は親#309マージ後にbaseだけmainへ変更し、差分が文言・試験・ログだけであることを再確認。以前失敗したCIは最新状態で全成功となっている。#311のbaseも親#310マージ後にmainへ変更したが、今回の4件には含めない。
- この4件だけの最終組合せで `npm run build --prefix apps/web`（型確認含む）、`node scripts/sim/product-web-test.mjs`、`node scripts/sim/profile-catalog-test.mjs`、`node scripts/sim/check-static-pages.mjs`、`python scripts/check-public-docs.py`、`git diff --check` は成功。
- #320のfull.retryMsは任意の非負有限値、端末側の既定満員表示との区別を確認。参加番号の詰め直しは対象外。実スマホ表示は作者の報告と独立追試を区別する。
- #284/#313のホスト全体の独立ビルドは、sandboxのMSBuildがChecking Build System後に終了1となり、同じ専用targetを通常環境で再構築中。そこから成功を推定せず、旧入力・緊急停止の指摘PRをこの4件に混ぜない。

## 2026-11-11 ホストのリモコンの案内（#300）

- ロビー・ゲーム起動後・準備・一時停止の次の操作を実際のボタン名で表示し、インベントリキーはMinecraftのゲーム操作中に表示する。
- `npm.cmd run build`、`node scripts/sim/phone-view-test.mjs`、`node scripts/sim/phone-lifecycle-test.mjs`（31/31）、`node --experimental-strip-types scripts/sim/ui-input-test.mjs`（12/12）が合格。Chromeの402×874の模擬表示で、準備と一時停止の案内およびタイトルごとのキー表示を確認。
- Android・iPhoneの実機操作は未実施。準備直後にタッチパッドが反応しなかった観測は、既存の入力試験で原因を特定できていない。

## 2026-11-11 一時停止画面の参加枠と再開・終了案内（#303）

- 一時停止画面は実際にプレイしていた枠だけを表示する。切断中の参加者は残し、未参加枠や途中で接続しただけの枠は表示しない。左側に一時停止の見出しと再開・終了の案内を置き、入力OFF時はPCで安全を確認して入力を再開する手順を示す。
- Web型チェック・ビルド、app-view 35/35、静的ページが合格。Chrome（1280×720）の模擬通知でP1・P2・P4、切断中P2、入力OFF、再開と終了の案内、ボタンが重ならないことを確認した。
- Windows配布版と実機での通し確認は未実施。

## 2026-11-11 — #298 ゲーム一覧の誤検出・重複・件数を直す

- 「beta／Battle.net」は、Battle.netアプリ自身の更新用の製品（`agent_beta`、場所 `Agent\beta`）だった。除外を完全一致から前方一致（`agent`・`bna`・`battle.net`）にした。このPCの実際の product.db で、修正前は試験が失敗し、修正後に合格した。
- Xboxアプリの「Minecraft: Java Edition」（`Microsoft.MinecraftJavaEdition`）は、固定の「Minecraft Java Edition（公式ランチャー）」と同じゲームなので一覧から外した（`Microsoft.4297127D64EC6` のランチャーは以前から除外）。Minecraftのバージョンは一覧に出さず、従来どおり公式ランチャーで選ぶ。統合版の「Minecraft for Windows」（`Microsoft.MinecraftUWP`）は別のゲームなので残す。
- 一覧の見出しを、並んだ項目の数と合わせた（例「全 7 件（Minecraft、Steam・Epic など 5 件、手動登録 1 件）」）。左の説明は語の途中で折り返さないよう改行位置を決めた。
- このPCで修正後のホストを起動し、一覧が固定のMinecraft＋6件（Steam 4件、Xboxの統合版、手動登録1件）になることを確認した。`cargo test --release --locked launchers::`（RECOOPLAY_DRY_RUN=1）、`app-view-test` 30/30、`product-web-test`、`check-static-pages`、`npx tsc`・`npm run build` が成功。PCアプリの実画面での目視は未実施。
- 2026-11-11 レビュー指摘（P2）への対応：自動検出0件の早期returnで総数が出なかった。0件でも「全 N 件（Minecraft、手動登録 M 件。Steam・Epic などのランチャーでは見つかりませんでした）」と並んだ項目の数を出す。固定だけ・固定＋手動・固定＋自動・全部の4条件を `app-view-test` に追加し、修正前は「固定だけ」で失敗（29/30）、修正後30/30。Codexの `review-game-count.mjs` も合格。mainを取り込み（競合なし）、`launchers` 9件・`npx tsc`・`npm run build` 成功。
## 2026-11-11 操作設定の案内（#299）

- Minecraftの手順はMinecraft選択時に表示し、それ以外は共通の手順を案内する。待機中の表示、実ポートの観客向けURL、キー設定を直接開いたときのフォーカスを見直した。画面移動は折りたたみ内から利用できる。
- `npm.cmd run build` と `node --experimental-strip-types scripts/sim/app-view-test.mjs`（31/31）が合格。ChromeでAmong Usの模擬通知とポート18080を使い、表示とフォーカスを確認。Tauri配布版・OBSでの確認は未実施。

## 2026-11-11 — #314 前面にない間は役割交代の時計を止める（レビュー指摘P2）

- 協力プレイのまま対象ゲームが前面から外れると（`check_target()` は入力を解放してepochを進めるが、phaseはCoopのまま）、`rotate_roles_if_due()` がphaseと期限だけを見ていたため、操作できない間も60秒の時計が進んで担当が交代していた。
- `sync_rotation_clock()` を追加した。協力プレイ中に `can_inject()` が偽になったら残り時間を凍結し（`rotation_at=0`、`rotation_left` に保存、予告も取り消す）、真に戻ったら残りから数える。前面の変化（`check_target`・`on_focus_change`）、毎秒の交代確認、協力プレイへの移行（`set_phase`）で呼ぶ。注入OFF・入力の障害など、前面以外の理由も1秒以内に反映する。Pause・切断・緊急停止の既存の扱い（協力プレイを離れたら残りを保存）は変えていない。
- 試験 `role_rotation_counts_only_while_the_target_game_can_be_operated` を追加：前面喪失で凍結→長時間（最大 `u64::MAX/2`）経過しても予告・交代なし→復帰で残りから数え、残りを操作したら1回だけ交代→前面にないまま一時停止・再開しても数えない。修正を外すと失敗することを確認。
- main（155e01c）を取り込んだ。競合した `PhoneApp.tsx`・`phone.ts`・`phone-harness.mjs` は、Codexが #324（cf7cd3c）で同じ組み合わせを解消した内容を使った。

## 2026-11-11 PC参加画面の進行条件とカード表示（#295）

- 接続中の2人がそろうまでOKと参加画面からの移動を無効にし、必要な人数を1か所に表示した。参加カードはホストと端末を示し、担当はゲーム選択後の画面で確認する。
- `npm.cmd run build`（`apps/web`、型チェックとViteビルド）、`node --experimental-strip-types scripts/sim/app-view-test.mjs`（31/31）、`node --experimental-strip-types scripts/sim/pc-boundary-test.mjs` が合格。
- Chrome（1280×720）でホスト通知を模擬し、0・1人ではOK・Enter・ホストのリモコン・設定内ナビから進めず、2人でOKからゲーム選択へ進むことを確認した。ホスト・端末の表示とカード内の収まりも確認した。Windows配布版と実機Wi-Fiでの参加は未実施。画面全体の縦横比対応は #270。

## 2026-11-11 全画面のゲームからPCアプリへ戻る案内（#307）

- ホストのスマホに、準備・一時停止中の復帰方法を表示する。既存の前面化ボタンが使えない場合はAlt+Tabを案内し、一時停止中に担当を変更できるときはPCの操作名を示す。PCとスマホの準備ボタン名を揃えた。
- `npm.cmd run build`、`node scripts/sim/phone-view-test.mjs`、`node --experimental-strip-types scripts/sim/app-view-test.mjs`（33/33）が合格。Chrome（360×640）の模擬通知で、前面化ボタンの有無による案内と配置を確認。
- Windows配布版での全画面切替、Minecraftとスマホ実機での復帰は未実施。

## 2026-11-10 — #287 Minecraftのランチャーをホストのリモコンで操作する（#311 に積み重ね）

- この PC で公式ランチャーを一時的に開き、ウィンドウを確認した（入力は送らず閉じた）：`C:\Program Files\WindowsApps\Microsoft.4297127D64EC6_2.6.2.0_x64__8wekyb3d8bbwe\Minecraft.exe`、タイトル「Minecraft Launcher」。起動直後に同じタイトルの `GamingServicesUI.exe` が一時的に前面になった。
- ホスト：Minecraftを選んだロビー・準備中に、`minecraft.exe`/`minecraftlauncher.exe` かつタイトルに「Minecraft Launcher」を含むウィンドウが前面なら、ホストのリモコン（キー・クリック・タッチパッド・ホイール）をランチャーへ送る（`remoteRoute: "launcher"`）。PCアプリが前面ならそちらを優先。ランチャーが前面から外れた・戻ったときは全解放してepochを進める。起動時の案内を「ホストのスマホのリモコンで「プレイ」を押してください」に変更。
- 自動試験：`RECOOPLAY_DRY_RUN=1 cargo test --release --locked`（host 142成功・2 ignored、probe 4成功。ランチャーの照合、ホスト限定・協力プレイ中と他ゲームで無効・前面から外れたら解放、を追加）、`node scripts/sim/protocol-sim.mjs` 60/60、`node scripts/sim/product-web-test.mjs`、`npm run typecheck/build`、`check-static-pages.mjs`、`check-public-docs.py` 成功。
- 実機（Android Chrome、ホットスポットのWi-Fi、USBのCDPで操作、dry-run・疑似入力先）：標準入力 `launcher focus` でランチャーが前面の想定にし、スマホの表示が「Minecraftのランチャーを操作中」に変わり、Enter（down/up）とタッチパッドの移動がランチャー経路で注入された。`launcher blur` で表示が戻った。
- 未確認：実際のランチャーへの実入力で「プレイ」を押せること、ワールドに入るまでスマホだけで進められること、Steam等の他ランチャーで人の操作が要る場面の洗い出し（Among Usは不要だった：#287のコメント）。
- 2026-11-11 レビュー指摘（P1）への対応：`remote_launcher_active()` が緊急停止ホットキーの登録結果を見ていなかった。ゲームの経路（`remote_game_active()`）と同じく `self.hotkey.is_ok() || self.fake_target.is_some()` を必須にした。試験 `launcher_route_needs_the_emergency_hotkey_like_the_game_route` を追加：疑似入力先なし・登録失敗・記録用InputAdapterで、ランチャーの前面を観測しても `remoteRoute=none` となり、キー・クリック・移動・ホイールのどれも送らないこと、登録成功なら `launcher` になることを確認。修正を外すと失敗することも確認した。`cargo test --release --locked`（RECOOPLAY_DRY_RUN=1、143件成功・2件ignored）。
- 2026-11-11 レビュー指摘（P2）への対応：#309の確認ダイアログ（`showModal()` のトップレイヤー）を開いたままPCアプリが終了すると、終了の案内（`#full`）より手前に確認が残り、「PCとの通信が戻るまでお待ちください」と再接続しない終了が矛盾していた。`render.blocked`（満員・版不一致・リセット・参加情報の不一致・PCアプリの終了など、再接続しない終端の案内）で、確認を閉じて未実行の要求を捨て、診断の画面も閉じるようにした。一時的な通信断（覆いの表示）では閉じず、#309の「確認を保留し、再接続後の現在epochで実行」を保つ。試験2件を追加し、修正前は「終了の案内より手前に確認を残さない」で失敗、修正後に合格（phone-lifecycle 25/25）。実機確認：Android Chrome 1台（アプリ通信はホットスポットのWi-Fi、操作はUSBのCDP）、dry-run。ホスト譲渡の確認を開いたまま `quit` で終了すると、確認が閉じて終了の案内が前面に出た。

- 2026-11-11 独立統合再レビュー：#314 797f211、#311 75b96a1、#315 31e9319、#321 257f53fの祖先を保持して競合解消。Rust157成功・2ignored（独立時計3＋ランチャー2を含む）、probe4成功、release build成功。通信60/60、shutdown-simのquit/EOFで全解放→4009通知→正常終了。Web型・build・product-web・静的5画面、独立終端6系列成功。実Chrome DOM 390×844で確認・診断の2モーダル閉鎖、要求破棄、終了案内の最前面・全画面表示と、一時断の確認保持を確認。実Tauri・実ランチャー・Minecraft・iPhoneは未確認。詳細はPR_REVIEW_RESUME_2026-11-11.md。#324は古い時計修正前のDraftなのでマージせずCloseした。#284/#313は追加P1の3条件が独立再現し保留（通常試験成功とは区別）。

- 2026-11-11 #284 a83a9f1・#313 c160865の修正再レビュー後、ユーザー承認で共有出力の残件もCodexが修正。最新main5603e24を取り込み、P3が同じKEY_Wを保持する間のP1本人解放で、P1の保留辺だけを破棄してP3の保持とepochを維持するようにした。修正前はP1の旧down3が再生された。回帰は製品のキー割当構築と実Hubの順序処理を使う `own_release_discards_old_tap_even_when_another_slot_holds_the_same_key`。元の独立6系列、他者の保留辺と60ms/50ms、全体停止の既存試験も維持。ローカル `product-web-test`・`npm run build --prefix apps/web`・終了時独立6系列成功。修正前はRust175成功・通信62/62（親）、共有出力の追加1件だけ失敗（親子）。修正後Rustのローカル再実行はMSVC環境のdbghelp.lib解決とnmake検出に失敗したため、Windows CIでRust/通信/配布の最終確認を行う。実入力・iPhone復帰案内・複数実端末の受入は #285 に残す。
- 共有出力の修正確認中に、本人の保持・保留がない出力へも解放が及び、別の枠の最低押下待ちが消える経路を確認した。本人が関与しない出力は処理対象から外し、別の枠の短いタップが通常の60ms待ち後に本人のupとして出る回帰を追加。

## 2026-11-11 参加者の待機・再開案内と少数ボタンの配置（#301）

- 待機画面で自分の枠と、ロビー・準備・一時停止に応じた次の操作を表示。ボタンだけで構成される1〜3操作の担当では、縦に並べた高さ64px以上のボタンを画面下部に配置した。
- `npm.cmd run build`（`apps/web`、型チェックとViteビルド）と `node scripts/sim/phone-view-test.mjs` が合格。
- Chromeの402×874の模擬表示で、一時停止時のP2表示・再開案内と、Among Us相当の3ボタン配置を確認した。Android・iPhoneでの片手操作とWindows配布版での通し確認は未実施。前面の警告は #291 の既存条件を使用。

## 2026-11-11 UI表記5件（#328〜#332）の独立レビューと統合（Claude Code）

- 統合ブランチ `claude/integration-ui-20261111`（main `4f63eaa` 起点）に、#329（`f7f484d`）→#331（`c7816fb`）→#332（`5ad5a0e`）→#328（`72d46b7`）→#330（`a3a7924`）の順でマージした。
- 競合は `apps/web/src/pc/model.ts` と `PcApp.tsx` の2回。#329の参加人数による進行制限（OK・設定内ナビの無効化と `canAdvance`）、#331の折りたたみ式の画面移動・`GAMES`・`gameSteps`・`overlayUrl`、#332の分担画面の見出しと案内を、どれも捨てずに合成した。参加画面の文言は#329、分担画面の文言は#332を採用した。
- レビューで確認した点：参加画面の進行制限は `setUi` だけにかかり、サーバー状態による画面復元（`screenOnGameUpdate`）は塞がない。lobbyの「送信しません」表示は、緊急停止（`inject.mode==='off'`）を先に判定するため誤表示しない。スマホの案内に書いたボタン名（「再開する」「協力プレイを終了（分担に戻る）」「ゲームを開く・準備する」）は実際のボタン表示と一致する。
- Claude Codeの追加修正（#301の範囲）：参加者の待機文で、(1) 自動復帰待ちの文から切断理由（例：「P2 が切断」）が消えていたのを戻し、(2) 分担決定後のロビーでも「ゲームと分担を決めるまで」と出ていたのを「ゲームを起動するまで」に変えた。`scripts/sim/phone-view-test.mjs` に回帰を追加し、修正前に失敗することを確認した。
- 結果：`npm run build`（`apps/web`）、`app-view-test.mjs` 33/33、`phone-view-test.mjs`（8観点）、`phone-lifecycle-test.mjs` 31/31、`ui-input-test.mjs` 12/12、`pc-boundary-test.mjs`、`check-static-pages.mjs` が合格。Rustの変更はないため、Rust・通信契約・配布はCIで確認する。
- 軽微な残件：#332で分担画面から人数の参考（`playerHint`、#166）を外したため、製品では未使用になった（試験からだけ参照）。
- 未確認：Windows配布版・Tauriでの表示、Android・iPhoneでの片手操作と表示、OBSからの観客向け表示。各Issue（#295・#296・#299・#300・#301）はこれらの受入まで開いたままにする。

## 2026-11-11 診断ログと通信警告の根拠（#304）

- 診断ログで枠ごとの途切れ・最大空白・往復時間・経路を読めるようにした。PCの通信診断には、現在の集計と、その接続で最後に警告した区間の時刻・回数・最大空白を表示する。閾値は従来どおり3回。再接続では警告記録を初期化する。
- PCの案内は通信・ゲームの検証状況・入力安全などを項目ごとに表示する。入力・通信の送受信処理は変更していない。
- Webの型チェック・ビルド、app-view 35/35、PC通知境界、静的ページが合格。Chrome（1280×720）の模擬通知で、案内の分離と回復後の0回・直前の3回の併記を確認。
- Rustのビルド・単体試験・通信試験はGitHub Actionsで確認する。Windows配布版と実Wi-Fiでの診断表示は未実施。

## 2026-11-11 分担決定後の切断と別端末の参加（#305）

- 決定済みの参加者が切断した場合、PCの分担画面に対象の枠と再決定の案内を表示する。ロビーの枠保持中に同じ端末が戻る既存の挙動を維持し、保持期限後に別端末が入った場合は準備・起動に再決定を要求する。
- `npm.cmd run build`（型チェック・Vite）、`node --experimental-strip-types scripts/sim/app-view-test.mjs`（34/34）、`node --experimental-strip-types scripts/sim/pc-boundary-test.mjs`、`node scripts/sim/check-static-pages.mjs` が合格。Chrome（1280×720）の模擬通知で、複数枠の切断案内、人数不足時のボタン無効化、復帰後の案内消去を確認。
- 既存の修正前dry-runホストでは、保持期限後に別端末が同じ枠に入ると旧決定で準備に進めた。修正後のRust単体試験に保持中の復帰、別端末への交代、明示的な再決定を追加した。
- ローカルのRustビルドはVisual StudioのCMake自動検出失敗後に再試行し、ユーザー方針に従って停止した。Rustビルド・単体試験・通信契約試験はGitHub Actionsで確認する。Windows配布版と実機Wi-Fiでの再接続・別端末参加は未実施。

## 2026-11-11 #334・#335の独立レビューと統合（Claude Code）

- 統合ブランチ `claude/integration-305-307`（main `a231e19` 起点）に #334（`b26147d`、#305）→#335（`219a10f`、#307）の順でマージした。競合はなし。
- #334のレビュー：保持期限で枠を解放すると `expired_members` が立ち、再決定までは `lineup_ok` が偽になる。`can_prepare`・`can_launch`・起動要求の拒否はすべて `lineup_ok` を参照するため、別端末が同じ枠に入っても旧決定で準備・起動へ進めない。保持中に同じ端末が戻る場合と、ホストの引き継ぎで決定を消す既存の処理は変わらない。`lineupDisconnected` はRust・TSの型・スマホとPCの受信検査・通信契約の文書がそろって追加されている。
- #335のレビュー：「担当を入れ替える」の案内条件はPCの表示条件（一時停止中かつ `canSwap`）と一致する。Alt+Tabの案内は、ゲームが前面のとき（前面喪失で入力を止める既存の安全処理の範囲）だけ出る。
- 結果：`npm run build`（`apps/web`）、`app-view-test.mjs` 34/34、`phone-view-test.mjs`（8観点）、`phone-lifecycle-test.mjs` 31/31、`ui-input-test.mjs` 12/12、`pc-boundary-test.mjs`、`check-static-pages.mjs` が合格。ローカルのRustビルドは、Git Bashのperlでは `datachannel-sys` のOpenSSL設定が失敗するため実施できず、Rust単体試験・通信契約はCIで確認する。
- 軽微な残件：操作名を「ゲームを準備する」に揃えたが、`docs/develop/requirements/requirements-v0.3.md` と `docs/develop/architecture/pc-screens.md` には旧名「ゲームを開く・準備する」が残る。要件の文書はユーザー確認後に直す。
- 未確認：Windows配布版・実機Wi-Fiでの同じ端末の復帰と別端末の参加（#305）、実ゲームの全画面からの復帰（#307）。両Issueは開いたままにする。
## 2026-11-11 マウスの同時押下を妨げる常駐アプリの案内（#260）

- アプリ内の動作環境・制限事項、配布README.txt、実機受入のAT-D04〜D05に、左を押したまま右クリックが届かない場合の対処を追加した。
- 起動時のプロセス検出は採用しない。症状はマウスジェスチャーや割り当ての設定に依存し、プロセス名だけでは誤警告や見落としが起きる。利用者が常駐アプリや機能を確認して操作する。
- 3か所の記載をローカルの `probe-260.mjs` で確認。Web型チェック・ビルド、`node scripts/sim/check-static-pages.mjs`、配布PowerShellの構文検査が合格。Chromeで操作設定から制限事項を開き、案内の表示を確認した。
- 配布zipの生成・スモーク試験はCIで確認する。実機入力は今回再試験していない。
## 2026-11-11 視点の通信試験を出力通知待ちにする（#240）

- 欠番・重複・逆順を検証する通信試験の固定1秒待ちを、監視接続の累積出力が許容範囲に入るまでの待機（上限3秒）へ変更した。移動量の許容差と入力列は維持。失敗時はepoch、累積出力、出力通知を記録する。製品側は変更していない。
- `node --check scripts/sim/protocol-sim.mjs` が合格。既存dry-runホスト（埋め込みコミットなし）で対象ケースのみ実行して合格。監視側で出力通知を1.2秒遅らせる模擬条件では旧版が失敗し、修正版は合格した。
- 元のCI失敗の原因は未確定。最新のRustホストを使う通信試験全体とRust単体試験はGitHub Actionsで確認する。実機は今回未確認。

## 2026-11-11 #338・#340・#341の独立レビューと統合、Android実機の回帰（Claude Code）

- 統合ブランチ `claude/integration-20261111b`（main `63545cd` 起点）に、#338（`d544aaa`、#240）→Claude Codeの修正→#340（`e74df03`、#304）→#341（`aa45b5d`、#303）の順で取り込んだ。競合は `app-view-test.mjs` だけで、#340と#341の試験を両方残した。
- #338の指摘【中】：固定1秒待ちを「累積出力が一度目標に達するまで待つ」に変えたことで試験が弱くなっていた。視点は絶対座標なので、古いパケット（900・800）を誤って適用しても途中で目標の30を通過すれば合格し、後半の35の照合も最後に送った座標へ戻るため見逃す。修正として、目標到達後に視点の出力通知が400ms止まるまで待ち、その時点の累積量も目標のままであることを確かめる（待ちの上限は3秒）。手元ではRustのビルド（MSVC・ビルドスクリプト）が失敗するため、修正前に失敗する変異版ホストでの確認はできていない。修正版は統合PRのCIで、最新のRustホストを使う通信試験として実行する。
- #340の指摘【低】：Rust試験の最後の確認は `Slot::new` で新しい枠を作るだけなので、再接続時に初期化する処理（`on_hello`）を通らない。診断表示だけの問題なのでマージは止めない。ログ表示を `JSON.stringify` に変えても、トークン・IP・UAはログに含まれないことを確認した。
- #341：一時停止画面の参加枠は `shownSlots`（プレイ参加者）で絞られ、案内のボタン名は実際の表示と一致する。
- 結果：`npm run build`、`app-view-test.mjs` 36/36、`phone-view-test.mjs`、`phone-lifecycle-test.mjs` 31/31、`ui-input-test.mjs` 12/12、`pc-boundary-test.mjs`、`check-static-pages.mjs` が合格。`protocol-sim.mjs` は構文検査だけ手元で行い、実行はCIに任せる。
- Android実機の回帰：main `09f50c1` のCI配布zip（manifestのcommitは `09f50c1`、dirtyなし、zipのSHA-256一致）から取り出した `recooplay-host.exe` で `scripts/device/android-dry-run.mjs --wifi-network --players 3` を実行し、Android 16（`25118PC98G`）・ホットスポットWi-Fi経由の14項目がすべて合格した（記録 `data/local/device-acceptance/run-bmngAr`）。保持中のPause・回転・バックグラウンド・通信切断での全解放と、同じ枠への再接続・再読み込み後の管理権を含む。dry-runなので実ゲームへの入力は含まない。
- 追記：#342の最初のCIでは `host-rs` ジョブの `product-web-test.mjs` が失敗した。#340がログ表示をすべて `JSON.stringify` に変えたため、既存の `diagnostics-test.mjs` が期待する `extra=[a,b]` が `["a","b"]` になっていた（#340単体のCIでも同じ失敗）。値だけの配列は従来の `[a,b]`、オブジェクトを含む値はJSONで出すように直した。`product-web-test.mjs`、CIの `rust.yml` で実行するNode試験15件、`app-view-test.mjs` 36/36が手元で合格。

## 2026-11-11 WS単独切断の観測記録（#277）

- Wi-Fi用dry-run runnerに `--ws-fault-observe` を追加。試験タブのWS閉鎖、ホストのphase・epoch・押下数、新しいWSでの同じ枠への復帰、前後の選択ICEペアの確認をPC観測時計で記録する。失敗時も取得済みの観測を保存する。
- Webの型チェック・ビルド、Android補助CLI 14/14、通信経路試験、障害時系列の合成試験が合格。実AndroidでのCDPイベント採取は未確認。
- この系列はWS閉鎖であり、実Wi-Fiリンク断とは区別する。RTC単独、実Wi-Fi断と復元、3人全員の保持・キュー・視点、復帰設定別の障害受入は別途必要。

## 2026-11-11 配布版PCアプリとAndroid実機でのUI受入、参加画面の案内の崩れ（Claude Code）

- 対象：main `0a2642c` のCI配布zip（manifestのcommitは `0a2642c`、dirtyなし、SHA-256一致）。リポジトリ外に展開し、`recooplay-desktop.exe` を通常モード（dry-runではない）で起動した。WebView2はCDPで観測した。P1はAndroid 16（`25118PC98G`）・Chromeで、ホットスポットのWi-Fi経由で接続し、USBはadbとCDPだけに使用。P2・P3は、PCのヘッドレスChrome（端末ごとに別のブラウザコンテキスト）からWi-Fiアドレスへ接続した。協力プレイには入っておらず、ゲームへのOS入力はない。
- 合格（8項目）：#295 1人ではOKと設定内ナビが無効でホスト・機種を表示し、3人でOKが有効になる／#299 ロビーの操作設定で「協力プレイを始めるまで…送信されません」、実ポートの観客URL、見出しへのフォーカス、画面移動の折りたたみ／#296 「分担しよう！」→「この分担で決定」→「分担決定！」で入れ替え案内が消える／#300・#307 Android実機のリモコンで、決定後の案内「『ゲームを準備する』を押して準備を始めてください。」、開始ボタン名「ゲームを準備する」、Eキー非表示（Minecraftのロビー）／#305 決定後にP3を切断すると「P3が切断したため…」を表示し、同じ端末が保持中に戻ると決定が有効に戻る。画面は `data/local/device-acceptance/desktop-ui-0a2642c/`。
- 不具合：1人のときの左の案内「あと1人の参加を待っています。」が3行に折り返し、末尾がOKボタンに隠れた（#329の文言）。「あと1人待っています。」に短くし、`app-view-test.mjs` に1行11文字以内の確認を追加した（修正前に失敗、修正後は36/36合格）。

## 2026-11-11 配布版と実ゲームでの受入、ボタンだけの担当の配置（#301、Claude Code）

- 対象：#344時点のCI配布zip（SHA-256照合済み）の `recooplay-desktop.exe` を通常モードで起動した。ゲームはAmong Us（Steam）。ホットスポットのWi-Fiを使い、USBはadbとCDPだけに使用。準備→Ready→協力プレイ→ホストの一時停止→協力プレイの終了まで進めた（プレイヤーの操作は押していない）。
- 3人構成（Android 16実機がP1のホスト）：準備中・一時停止中の案内、Eキーの非表示、Alt+Tabの案内、PCの一時停止画面（参加した3枠だけ、見出しは1か所）を確認し、#300・#303を閉じた。
- 4人構成（Android実機がP4の参加者、ホストは模擬端末）：全画面のAmong Usが前面のとき、ホストのスマホの「PCアプリを前面にする」でPCアプリが前面に戻り、「Among Usを前面にする」でゲームへ戻せた（`GetForegroundWindow` で判定）。#307を閉じた。
- 不具合：Among Us・4人のP4の担当はボタンだけの5個（E・Q・R・Tab・Esc）だった。#328の配置は「ボタンだけで3個以下」にしか効かないため、Android実機では高さ44pxのボタンが画面の上部（701px中150〜298px）に並び、下半分以上が空いた（#301の観測6が残っていた）。
- 修正：判定を `buttonLayout`（`apps/web/src/shared/controller-layout.ts`）へ移した。ボタンだけの担当は6個まで画面の下側に大きく置き、1列にするのは3個以下だけにした。`phone-view-test.mjs` に3・5・6・7個の確認を追加し、修正前は5個で失敗、修正後は合格。`npm run build`、`product-web-test.mjs`、スマホ・PCの画面試験、`ui-input-test.mjs` 12/12、`check-static-pages.mjs` が合格。

## 2026-11-11 スマホの個人レイアウトと配置の編集（#355・#356）の統合（Claude Code）

- #355（#271のデータモデル）：指摘なし。プレイ画面の見た目は変えず、モデル・保存・試験だけを足す。
- #356の指摘【高】：保存した配置で遊ぶと、ホストから状態が届いて画面を描き直すたびにスティックをつなぎ直していた。つなぎ直しでは押している方向を離すため、押したままの移動が途中で切れる。`Stick` の依存を、方向と操作の組の文字列に変えて直した。
- #356の指摘【中】：スティック・視点パッドを複製できたが、入力エンジンはどちらも1つずつしか持てないため、2つ目は反応しない部品になっていた。複製をボタンだけにし、保存値に複数あっても実入力へつなぐのは1つずつにした。
- 試験：`react-dom/client` を最小限のDOM（`scripts/sim/fixtures/react-dom-lite.mjs`）で動かし、描き直しでのつなぎ直しと解放の回数を数える。`phone-layout-test.mjs` に3項目を足し、修正前は失敗、修正後は13/13合格。typecheck、`ui-input-test.mjs` 18/18、`app-view-test.mjs` 36/36、`phone-view-test.mjs`、`phone-lifecycle-test.mjs` 31/31、`product-web-test.mjs` が合格。
- 判断待ち（#356の記載）：横向きで配置を使うには、縦固定（#52）をやめる判断が要る。今回は変えていない。
- 未確認：Android Chrome・iPhone Safariの実機で、指での編集・複数指・保存後の操作遅延と視点の周期。

## 2026-11-11 Windowsインストーラー（#354）の統合（Claude Code）

- レビュー：一般ユーザー権限の導入先、ランタイム取得先の固定とMicrosoft署名の確認、同意なし（`/S`）で取得・ファイアウォール変更をしないこと、ファイアウォールの許可がローカルサブネットだけであること、アンインストールが自分の入れたファイルだけを消すことを確認した。
- 指摘【低】：アンインストール時の削除確認で、`%LOCALAPPDATA%\Re-Cooplay` を「手動で登録したゲーム」とだけ示していた。実際にはキーの設定（`key-overrides.json`）も入り、zip版とも共有する。確認の文言と `apps/desktop/README.md` を直した。
- 試験：NSISが手元にないため、インストーラーの作成と `installer-smoke.mjs` はCIで確認する。
- 未確認：対話の画面、ランタイムが実際に不足したPC、開発環境のない別のWindows 11 x64での導入からアンインストールまで（#219の受入ゲート）。

## 2026-11-11 RTC単独切断とWSフォールバックの観測（#277）

- Wi-Fi用dry-runに `--rtc-fault-observe` を追加。試験タブのfast DataChannelを閉じ、同じWS・同じepochのまま新しいジャンプの押下と解放がWSで受理され、ホストの押下状態が空に戻ることを確認する。DataChannelとICEを別々に記録する。
- Web型チェック・ビルド、Android補助CLI 17/17、通信経路・障害時系列・RTC単独観測の試験が合格。Chrome内のローカルPeerConnection間で、試作フックによるDataChannel閉鎖とICE接続の継続を確認。
- 実Android・Wi-Fiでの実行、実Wi-Fi断と復元、全参加者の保持・キュー・視点、復帰設定別の受入は残る。

## 2026-11-11 — 同一Wi-Fi性能比較の試行計画（#276）

- 比較軸を1項目に固定し、60秒×各3回の順序と既存runnerの引数を生成する。先行ACK診断は別系列にする。
- `node scripts/device/wifi-comparison-plan-test.mjs` で順序・回数・比較軸・引数を確認した。
- `node scripts/device/wifi-route-test.mjs` と `node scripts/device/wifi-trial-acks-test.mjs` が合格した。
- 実Wi-Fi・Android測定、トレースと定期ICE観測の個別負荷、集計・匿名化は未実施。

## 2026-11-11 RTC単独切断の観測（#359）と同一Wi-Fi比較の試行計画（#360）の統合（Claude Code）

- どちらも試験・計測用のツールだけの変更で、製品の動作は変えない。指摘なし。
- #360の `wifi-comparison-plan-test.mjs` がCIで実行されていなかったので、`rust.yml` の「Android試験の経路判定…」の手順に追加した。
- 手元で `android-dry-run-test.mjs` 17/17、`wifi-route-test.mjs`、`fault-timeline-test.mjs`、`rtc-fault-observer-test.mjs`、`wifi-trial-acks-test.mjs`、`wifi-comparison-plan-test.mjs` が合格（`android-dry-run-test.mjs` は `apps/web/dist` のビルド後）。

## 2026-11-11 — WebとRustの通信版照合（#272）

- Webのhello・welcomeで版定数を共有し、既存の通信シミュレーションをWebの版で実行する。版番号と現行の受信互換条件は維持した。
- `npm run typecheck`、Node.js 22の `--experimental-strip-types` で `protocol-boundary-test.mjs` 8件、`phone-session-test.mjs` 7件、`phone-lifecycle-test.mjs` 31件が合格。
- ビルド済みホストとの照合を含む `protocol-sim.mjs` 全体はNode.js 24のCIで確認する。実機Wi-Fiの受入と通信・設定スキーマの共通化は未実施。
- 統合（Claude Code）：#362をレビューし指摘なし。手元で `tsc --noEmit`、`protocol-boundary-test.mjs` 8/8、`phone-session-test.mjs` 7/7、`phone-lifecycle-test.mjs` 31/31、`product-web-test.mjs`、`protocol-sim.mjs` の構文検査が合格。ホストとの照合はCIで確認する。

## 2026-11-11 — 定期ICE観測の負荷を比較する試行（#276）

- `periodicIce` 比較軸を追加し、RTCありのWi-Fi性能試行で5秒間隔のICE観測を切り替える。明示的な経路照合とホスト入力トレースは両条件で維持する。
- `node scripts/device/` 配下の `android-dry-run-test.mjs` 20/20、`wifi-route-test.mjs`、`wifi-comparison-plan-test.mjs`、`fault-timeline-test.mjs`、`rtc-fault-observer-test.mjs`、`wifi-trial-acks-test.mjs` が合格。CLI試験の資産は照合済みCI配布zipから取得。
- 実Wi-Fi・Androidでの負荷比較、ホスト入力トレースの負荷比較、新データセットの集計・匿名化は未実施。
- 統合（Claude Code）：#364をレビューし指摘なし。`rtcObserverSource` を関数にした変更は呼び出し元2か所とも対応済み。観測なしでは `__wifiPathHistory` が空のまま進む。手元で上記6本が合格。

## 2026-11-11 — 個人解放の直後に切断した場合の回帰試験（#39）

- 通信試験で、P3の個人解放時はP1の保持が続き、直後のP3切断でP1も解放されてepochが進むことを検証する。同じP3枠に戻っても自動復帰OFFでは停止を維持し、旧保持が再出力されないことを確認する。
- `node --check scripts/sim/protocol-sim.mjs` と `git diff --check` は合格。ホストを起動する通信シミュレーション全体はGitHub Actionsで確認する。
- 実Wi-Fi、Android・iPhoneのblur、実Windows入力の受入は未実施。
- 統合（Claude Code）：#366をレビューし指摘なし。試験だけの変更で、使う `release_inputs`（`hub.rs`）と `injected`・`noPress` は既存。`protocol-sim.mjs` の構文検査が合格し、ホストとの実行はCIで確認する。

## 2026-11-11 — ホスト入力トレースの負荷を比較する試行（#276）

- `hostTrace` 比較軸を追加し、Wi-Fi性能試行でホスト入力トレースだけを切り替えられるようにした。トレースを省いた試行ではホスト内の区間を集計しない。
- `node scripts/device/` 配下の `android-dry-run-test.mjs` 23/23、`wifi-comparison-plan-test.mjs`、`wifi-route-test.mjs`、`wifi-host-analysis-test.mjs`、`wifi-trial-acks-test.mjs` が合格。CLI試験は照合済み配布版のWeb資産を使用。
- 実Wi-Fiでの負荷測定と新しい比較系列の集計・匿名化は未実施。
- 統合（Claude Code）：#368をレビューし指摘なし。トレースの起動・読み込み・集計の3か所がすべて `hostTrace` で切り替わることを確認した。手元で上記5本が合格。

## 2026-11-11 — Wi-Fiの観測負荷の集計（#276）

- 試行計画と実行順・資産・経路を照合してACK、ホスト内区間、ICE RTTを個別に集計する。
- `node scripts/device/summarize-wifi-overhead-test.mjs` と関連する計画・ACK・経路・ホスト分析の短時間試験が合格。実Wi-Fiの比較測定は未実施。
- 統合（Claude Code）：#370をレビューし指摘なし。計画の交互順（baseline/candidate）と、#364・#368の観測設定の記録（`periodicIce`・`hostTrace`）の照合が一致する。集計結果にLANアドレス・パスを出さない。手元で `summarize-wifi-overhead-test.mjs` ほか7本が合格。

## 2026-11-11 — 引き継ぎの入口と履歴の整理（#255）

- 現行のWindows構築手順とGitHubの作業状況に案内を揃え、対象資料の個人PCのパスを一般表記にした。初期資料は既存リンクと証拠を保つため同じ場所に記録として残す。
- `python scripts/check-public-docs.py`、`node scripts/sim/verify-ui-evidence.mjs`、`git diff --check` が合格。BUILD_LOGの分割は並行して追記中のPRが落ち着いた後に検討する。
- 統合（Claude Code）：#372をレビューし指摘なし。この記録はBUILD_LOGの先頭に追加されていたが、記録は古い順に並べているため末尾へ移した。

## 2026-11-11 実機確認の消化：RTC単独切断・スキン・準備直後のスワイプ・定期ICE観測の負荷（Claude Code）

- 対象：main `f21f5a0` のCI配布zip（manifestのcommitは `f21f5a0`、dirtyなし、SHA-256一致）。端末はAndroid 16（`25118PC98G`）・Chrome 156。製品の通信はWindowsモバイルホットスポットのWi-Fi、USBはadbとCDPの制御だけ。
- #277：`android-dry-run.mjs --wifi-network --rtc-fault-observe` が3項目すべて合格。fast DataChannelを閉じた後もICEは `connected` のままで、同じWS・同じepochで新しい押下と解放が `via=ws` でACKされた。実Wi-Fiの断と復元は残る。
- #159：dry-runで、ゲームごとのスキンの保存・復元を7項目確認した（ゲームA・Bで別々に保存、ゲームを戻す・再読み込みで復元、標準へ戻す、壊れた保存値は標準）。Issueを閉じた。
- #345：配布版のPCアプリを通常モードで起動してAmong Usを準備に進め、準備に入ってから0〜3.1秒のあいだにホストのタッチパッドを5回スワイプした。1回目からWindowsのカーソルが動いた。Issueを閉じた。
- #276：定期ICE観測あり・なしを60秒×各3回、交互の順で実測し、`summarize-wifi-overhead.mjs` で集計した。6試行とも全項目合格。端末内ACK往復の差は組ごとに向きが逆になり、ばらつきの方が大きかった。匿名化した集計を `docs/develop/acceptance/evidence/wifi-periodic-ice-276/` に保存した（生記録はローカル）。

## 2026-11-12 iPhone Safariの実機・実指での受入（#285・#50・#271、Claude Code）

- 対象：main `f21f5a0` のCI配布zip（SHA-256一致）の `recooplay-host.exe`。dry-run・疑似入力先で、OS入力なし。iPhone（UA `iPhone OS 18_7`・Safari）がP1のホストで、WindowsモバイルホットスポットのWi-Fiに接続した。P2・P3はPCのヘッドレスChromeの模擬端末。利用者が実指で操作し、ホストの監視接続で入力・状態・ログを時刻つきで記録した。
- 入力：短いタップ（Space 94ms）、長押し（Shift 3.21秒）、スティック（W 2.16秒）、2本指の同時操作（Ctrl押下→D押下→D解放→Ctrl解放）が、正しい順で受理された。
- #50：「配置を編集」を押すと、押していたスニークは解放され、編集画面の約38秒間はゲームへの入力が0件だった。動かして大きくしたジャンプは、保存後に受理された。利用者の評価は「動作は問題ない」。編集画面とボタンのデザインは、デザイン担当が別Issueで改良する。
- #285：PCのホットスポットを約10秒止めて、指を押したまま切断した。切断の検知と同時にホストがShiftを解放し、全員を一時停止にした。押したまま同じ枠へ再接続しても押下は復活せず、画面には「指を離して操作を再開」が出て、「再開する」は押せなかった。再開後の新しい押下は正しく受理された。
- iOSの制約：押したままコントロールセンターを開くと、iOSがタッチを取り消すため、iPhoneが自分から解放を送る。切断中に、iPhoneが別の既知のWi-Fiへ自動で移ることがあった。
- 気づいた点：再接続後の一時停止画面で、下の説明文の最後の行がSafariのツールバーに隠れていた。
- 残り：実端末2〜4台の同時確認、Androidの実指、横向き（縦固定 #52 の判断待ち）、実Minecraft入力。

## 2026-11-12 — CIの重複実行と統合前チェック（#379）

- PRとmainの実行条件を分け、古いPR実行を取り消す。製品Webの一括試験が実行する9本の個別呼び出しを整理し、必須チェックと検証範囲を記録した。
- `node scripts/sim/product-web-test.mjs`、`python scripts/check-public-docs.py`、`git diff --check` が合格。Windows上の全ジョブはGitHub Actionsで確認する。

## 2026-11-12 — 人数変更の通信試験で状態を待つ（#379）

- CIの `C1: 待機タイムアウト lineupOk` を受け、C1がMinecraftのロビーで3枠を受信してから、その状態で分担を確定する。役割確認は1人目の受理を待ち、全員が確認するまで再開できないことを検査する。
- `node --check scripts/sim/protocol-sim.mjs` と差分検査が合格。ホストを起動する通信試験と反復はGitHub Actionsで確認する。

## 2026-11-12 — 補助画面のブラウザー起動診断（#379）

- Chromeの起動とCDP接続・画面検査を分けて記録する。デバッグポートファイルが未作成・書き込み中の場合を待機し、子プロセスの起動失敗や終了は直ちに報告する。失敗時にプロセス出力の末尾をCI成果物へ保存する。
- 構文・差分検査、照合済み配布版 `e8bf483` を使ったoverlayのdry-run、存在しないChromeで起動失敗を記録する試験が合格。GitHub Actionsでの反復と、報告済みの起動タイムアウトの原因確定は未実施。
- 統合（Claude Code）：#380・#381・#382をまとめて統合した。#380で外した9本の個別呼び出しは、すべて `product-web-test.mjs` の中で実行されることを確認した。3件ともBUILD_LOGの先頭に追記していたため、古い順の並びに合わせて末尾へ移した。

## 2026-11-12 — CIを並列化し通信・補助画面を反復する（#379）

- ホスト・Web・デスクトップを並列に実行し、通信と配布のジョブは同じrunの成果物を使用する。通信とデスクトップの成功後に配布を検査する。配布用のデスクトップ再ビルドを省き、統合前に確認するジョブを6件にした。
- 手動で通信・補助画面を各20回実行するワークフローを追加。成功した同一コミットの配布runを照合し、各回のログを残す。
- YAMLで既存試験コマンドの維持とジョブ依存を照合し、公開資料と差分検査が合格。実際の成果物の受け渡しと反復実行はGitHub Actionsで確認する。

## 2026-11-12 — 配布PCアプリのWebView2試験（#379）

- CIで配布用Tauriアプリをループバック・dry-runで起動し、WebView2の参加画面と操作設定を開く。オーバーレイを表示した状態でメインウィンドウを閉じ、アプリとホストの終了を照合する。
- `node --check scripts/sim/desktop-webview2-smoke.mjs`、PowerShell構文、対象がないPIDへの終了要求の拒否、差分検査が合格。Windows CI上での実行は未確認。
- 統合（Claude Code）：#384と#385を統合した。#385のWebView2の確認手順は、#384で新しくできた `package` ジョブの配布zipの確認の直後へ移した。#384で外した手順は、配布用のPCアプリの再ビルドだけ（`desktop` ジョブのビルドを受け渡す。PCアプリが埋め込むのは起動画面 `ui` だけなので中身は同じ）で、ほかの試験はすべて残っていることを、mainのワークフローと突き合わせて確認した。
- 修正（Claude Code）：#385のWebView2の試験は、#385単独・統合後のどちらのCIでも「WebView2の参加画面が見つかりません: 30秒」で失敗した。手元で調べると、ホストが127.0.0.1で応答していても、待ち受けのソケットがWindowsの一覧（`Get-NetTCPConnection`・netstat）に出ないことがあり、待ち受けからホストを特定する方法が使えなかった。ホストはPCアプリの子プロセスとして特定するように直した。あわせて、ホストの応答（最大90秒）と画面の表示（30秒）を分けて待ち、それぞれの所要時間と、失敗時に開いていた画面の一覧を出すようにした。直した試験は、手元の配布版 `f21f5a0` で合格し（ホストの応答まで1.7秒、参加画面まで2.4秒）、修正前の #350 の配布物（`1013728`）では「オーバーレイ表示中にTauriが終了しません」で失敗した。CIで画面が出なかった原因は、新しい出力で確かめる。
- 統合（Claude Code）：#384を統合した。外した手順は配布用のPCアプリの再ビルドだけ（`desktop` ジョブのビルドを受け渡す。PCアプリが埋め込むのは起動画面 `ui` だけなので中身は同じ）で、ほかの試験はすべて残っていることを、mainのワークフローと突き合わせて確認した。#385（WebView2の試験）は、CIのランナーでWebView2のデバッグ用ポートから画面が返らない原因を調べるため、別に統合する。
- 追記（Claude Code）：上の修正後も、CIでは「WebView2の参加画面が見つかりません」で失敗した。失敗時の診断で、CIのランナーのWebView2（156.0.4314.58）は、このPCアプリのプロセスとして起動し、保存先の環境変数（`WEBVIEW2_USER_DATA_FOLDER`）も反映していた。ところが `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS` は起動引数に入らず、デバッグ用ポートが開いていなかった。exe名ごとのレジストリ（`HKCU\Software\Policies\Microsoft\Edge\WebView2\AdditionalBrowserArguments`）で渡しても同じだった。そこで、PCアプリが自分でWebView2の起動オプションを渡すようにした（`apps/desktop/src/main.rs` の `browser_args`）。既定はwryの既定値と同じで、`RECOOPLAY_DRY_RUN=1` かつ `RECOOPLAY_WEBVIEW2_DEBUG_PORT` にポートがあるときだけ、デバッグ接続を開く。製品の通常起動では開かない（単体試験 `webview2_debug_port_only_in_dry_run`）。メイン画面とオーバーレイは、同じ起動オプションにそろえる。CIで合格した（ホストの応答まで3.1秒、参加画面まで3.7秒）。

## 2026-11-12 反復試験のワークフローを起動できるようにする（#379、Claude Code）

- #384で追加した `ci-repeat.yml` は、mainへのpushのたびに「ワークフローのファイルの問題」で失敗として記録され、手動でも起動できない状態だった。ジョブ全体の `env` で `${{ runner.temp }}` を使っていたため（`runner` の値は手順の中でしか使えない）。診断の保存先は、手順の中で `$env:RUNNER_TEMP` から決めるように直した。統合後に、mainで成功したrunを指定して反復試験を実行する。

## 2026-11-12 — PCとスマホの画面寸法の検査（#379）

- Chromeで画面を撮影し、操作部品のはみ出しと装飾以外の11px未満の文字を検査する。スマホは縦スクロールを許容する。通信ジョブの成果物に画像と診断を保存する。
- PC 800×560・スマホ390×844で、修正前はリモコンの10pxラベルを検出した。11pxに修正した後、Webビルドと2組の寸法で各23画面の撮影・監査が合格した。2組目はPC 900×1000・スマホ402×874。ホストは照合済み配布版 `e8bf483` のdry-run。
- 最新main上ではNode構文、ワークフローの構造、公開資料、差分を確認した。Actionsでの成果物と実端末の表示倍率・可読性は未確認。

## 2026-11-12 — 終了とホスト譲渡の回帰試験（#379）

- 協力プレイ中にP1の移動キーとP3の攻撃ボタンを保持したままENDを送り、両方の解放、ロビーへの遷移、epoch更新、旧入力の拒否を検査する。緊急停止後のEND試験も維持する。
- ホスト譲渡の確認を一時断中に保ち、接続が戻っても自動送信せず、再度のOKで新しいepochを使って1回だけ送信することを検査する。
- Nodeの構文検査、スマホのライフサイクル試験32/32が合格。通信の新規ケースは配布版 `e8bf483` を使ったdry-runで合格。全体は62/64で、残り2件はWebビルドがない環境での画面配信試験。Windows CIでの全体確認と実機受入は未実施。
- 統合（Claude Code）：#390と#391をまとめて統合した。#390は統合前にmainと衝突していてCIが動いていなかったため、統合ブランチのCIで確かめる。#391の記録はBUILD_LOGの途中に入っていたため、古い順の並びに合わせて末尾へ移した。

## 2026-11-12 — 静的検査で見つかったClippy指摘の修正（#379）

- 既存の指摘に合わせ、テスト専用ヘルパー、不要な借用、反復処理、既定値初期化を整理した。入力停止と切断の条件および参加枠の順序は従来のまま維持する。
- 鮮度判定の単体試験3/3と差分検査が合格。Rust全体の検証はGitHub Actionsで実施する。整形と静的検査の必須化は後続で扱う。

## 2026-11-12 — ホストのタッチパッド感度（#377）

- リモコンのタッチパッドの下に0.5〜6.0倍の感度を追加。既定は1.0倍で、協力プレイの視点感度と別に端末へ保存する。1本指のカーソル移動に適用し、1送信の±120px上限、操作先の判定、スクロール、クリック、解放は従来の挙動を維持する。
- UI入力19/19、スマホ入力ライフサイクル32/32、スマホ画面試験8観点、Webビルドが合格。Chromeのdry-runでPC 800×560・スマホ390×844の23画面を撮影し、寸法監査とスライダーの表示を確認した。
- Android ChromeとiPhone Safariで、低・標準・高感度のPCカーソル移動量と再読み込み後の復元を確認する。実機受入は未実施。
- 統合（Claude Code）：#395をレビューした。倍率は1本指のカーソル移動だけにかかり、タップの判定（倍率をかける前の移動量）、1送信の±120px上限、スクロール・解放は変わらない。ホストは移動量を小数で受け取り、ゲームへ送る直前に四捨五入する（`hub.rs` の `remote_message`）。そのため低感度でゆっくり動かすと、1回あたり0.5px前後の移動が0または1に丸められる。統合は止めず、実機受入（#377）で動きを確かめる。手元で `ui-input-test.mjs` 19/19、`phone-lifecycle-test.mjs` 32/32が合格。

## 2026-11-12 — ホスト画面の切断案内と下端の表示（#378）

- 一時停止の切断理由で、本人は「あなた」、他の参加者は枠名で表示する。ロビーで操作先がない場合はPCアプリを前面にする案内に短縮する。
- 指を離す案内はホスト見出しの下に表示する。リモコン全体でスクロールし、説明の末尾まで到達できるようにした。用途の不明なタッチパッドの装飾を外した。
- スマホ画面試験、入力ライフサイクル32/32、Webビルドが合格。Chromeのdry-runでPC800×560・スマホ360×640の23画面が寸法監査に合格し、説明の末尾と終了ボタンまでの到達を検査した。
- Android・iPhoneのツールバー表示中と、感度設定（#395）を含む画面での受入は未実施。
- 統合（Claude Code）：#396をレビューし指摘なし。#395（感度のスライダー）と同じ画面を変えるため、#395の統合後のmainに取り込んだ。両方を含む画面で、型検査、`phone-view-test.mjs`、`ui-input-test.mjs` 19/19、`phone-lifecycle-test.mjs` 32/32が合格。スライダーを含むリモコンの寸法検査は、統合ブランチのCIで確かめる。

## 2026-11-12 — Rust静的検査と依存監査の必須化（#379）

- #392で取得したWindowsの整形結果に揃え、#394の修正箇所は同じRust 1.99.1のrustfmtで再整形した。整形をCI設定と別コミットに記録した。
- host-rs・desktopの既存ジョブに `cargo fmt --check` と `cargo clippy -D warnings` を追加する。依存監査の3チェックはUbuntuで実行し、統合前の確認項目に加える。
- ホスト・PCアプリ両方の整形確認、YAML構造と既存ジョブの保持、公開資料と差分検査が合格。変更後のClippy、依存監査、Windowsの全体試験と所要時間はGitHub Actionsで確認する。

## 2026-11-12 — RustとWebの受信契約の回帰試験（#272）

- 通信シミュレーションでRustホストの初回・3台参加後のPC状態、スマホ3台のwelcomeとゲーム状態を製品のWebデコーダーへ通す。
- 照合済みのWindows配布版 `3cde8f1` に対する対象2ケースがdry-runで合格。Webの既存のスマホ受信境界8/8とPC受信境界も合格。通信試験全体と実機受入は未確認。
- 統合（Claude Code）：#399をレビューし指摘なし。ホストの実出力を、製品のWebの受信デコーダー（`protocol.ts`・`pc-messages.ts`）に通す試験で、確認を弱める変更はない。BUILD_LOGの見出しの前の空行だけ直した。

## 2026-11-12 — WebView2の最小ウィンドウ試験（#270）

- 配布試験のdry-run子プロセスを最小サイズ付近まで縮め、WebView2の表示寸法、参加画面のQRとボタン、設定ダイアログの表示領域を検査する。
- Node・PowerShellの構文、C#コンパイル、対象外プロセスの拒否と差分検査を確認。Windows CIでの実ウィンドウ試験と有人での判読性は未確認。
- 統合（Claude Code）：#402の試験は、手元（表示倍率150%）で「WebView2が最小ウィンドウ付近まで縮みません」で失敗した。ウィンドウを縮めるPowerShellは高DPI非対応のため、実寸で指定した大きさがWindowsにさらに1.5倍へ拡大され、ほぼ元の大きさのままだった。縮める直前にそのスレッドだけモニターごとのDPI対応（`SetThreadDpiAwarenessContext`、PER_MONITOR_AWARE_V2）にするよう直した。手元で、ウィンドウが1280×820から786×523（CSSの大きさ）まで縮み、QR・ボタン・設定が表示領域に収まって合格した。縮めた後の大きさはPCアプリの最小サイズ（800×560）を少し下回るため、試験は人が縮められる大きさより厳しい条件になっている。

## 2026-11-12 Android実機での確認の消化：感度・ホスト画面・実Wi-Fi断・通信方式の比較（Claude Code）

- 対象：main `c63a55c` のCI配布zip（manifestのcommitは `c63a55c`、dirtyなし、SHA-256一致）。端末はAndroid 16（`25118PC98G`）・Chrome 156。製品の通信はWindowsモバイルホットスポットのWi-Fi、USBはadbとCDPの制御だけ。新しい展開先はWindowsのファイアウォールで受信が止められたため、以前に許可済みの手元の展開先に同じ配布物を置いて使った。
- #377：PCアプリを通常モードで起動し、Among Usを準備に進めて、タッチパッドを右へ120pxスワイプした。カーソルの移動量は、1.0倍で108〜120px、0.5倍で54〜60px、6.0倍で648〜720px。再読み込み後も6.0倍が復元された。0.5倍がやや小さいのは、ホストでの四捨五入の影響とみられる。
- #378：dry-runで、ロビー・分担決定後・準備中・ホストの一時停止・参加者の切断による一時停止の5画面を、実際のChrome（`visualViewport` 384×702）で確かめた。説明の最後の行と終了ボタンにスクロールで届き、横はみ出しと11px未満の文字は0件。
- #277・#39・#285：dry-runで、ジャンプを押したまま端末のWi-Fiを `cmd wifi set-wifi-enabled` で切って戻した。ホストは4秒で切断を検知して解放し、全員を一時停止（epoch更新）。同じ枠へ再接続した後も、押したままで押下は復活せず、画面に「指を離して操作を再開」が出た。指を離して再開した後の新しい押下は受理された。
- #275・#157：RTC+WSとWS単独を60秒×各3回、交互の順で比べた。3組ともRTC+WSの方が、ACK往復のp95と視点の200ms以上の空白が小さかった。匿名化した集計を `docs/develop/acceptance/evidence/wifi-transport-275/` に保存した。
- runnerの修正：最初の実行で2試行が「同一ボタンの2接点保持」で失敗した。ホストには解放が届いていた（押下から約500ms後）が、確認が180msしか待たなかった。押下と解放はホストに届くまで待ってから確かめるよう、`scripts/device/android-dry-run.mjs` を直した。直したrunnerで、Android実機の全14項目が合格した。

## 2026-11-12 — ホストのリモコンでPCアプリの枠を越える（#405）

- 利用者の決定：協力プレイ以外のホストのリモコンは、PCアプリの枠を越えてPCの画面全体を操作してよい。PCアプリ以外のランチャー・ダイアログが前面に出ると、操作先が「なし」になりスマホから何もできなかったため。
- ホスト：Minecraftの公式ランチャーだけだった経路（`launcher`）を、PCアプリ以外の前面のウィンドウ全般（`desktop`）へ広げた。ロビー・準備中・一時停止中に、注入が常時ON・入力の異常なし・解放の再送なし・緊急停止キーが使えるときだけ。前面が変わったら全解放してepochを進める。協力プレイ中の分担操作の入力先の制限は変えていない。
- PCアプリ：仮想カーソルが枠の端を越えたら `remote_leave` で位置を知らせ、ホストが前面のウィンドウの表示領域の同じ割合の位置へOSのカーソルを置く。以降は実際のマウスとして動く。実際のマウスでPCアプリへ戻ると、その位置から仮想カーソルを始める。
- 確認：手元で `ui-input-test` 20/20・`phone-view`・`app-view` 36/36・`phone-lifecycle` 32/32・`protocol-boundary` 8/8・型検査が合格。Rustのビルドと試験は手元でOpenSSLのビルド（Perl）ができないため、CIで確認する。実機（実際のランチャーでの操作・表示倍率ごとのカーソル位置）は未確認。

## 2026-11-12 — PCアプリに全員の接続のリセットを置く（#412）

- 利用者の指摘：接続中のスマホを全部リセットするボタンが見当たらない。リセットは診断画面（`/host`）にしかなく、PCアプリからは「操作設定→手順・詳しい確認→診断画面を開く」とたどる必要があった。
- PCアプリの「操作設定」に「接続中のスマホをすべてリセット」を置いた。押すと画面内の確認（`<dialog>`、既定の選択は「やめる」）を出し、確かめたときだけ `reset` を送る。仮想カーソル・リモコンでも押せるよう `confirm()` は使わない。ホストの挙動（全解放・全員を close 4001・ロビーへ・分担を消す、#213）は変えていない。
- 確認：手元で型検査・`app-view` 36/36・`check-static-pages`・`ui-input` 20/20が合格。配布ジョブのWebView2試験（`desktop-webview2-smoke.mjs`）に、「やめる」では送らず、確かめると届くことの確認を足した（CIで確認）。

## 2026-11-08 — 人数別プリセットをBERT風モデルで作る（Claude Code）

- ユーザーの依頼「BERTのように2〜4人のプリセットを振り分ける」「Rustホストの中で毎回動かす」に対応した。小さなBERT風エンコーダ（2層・64次元・約20万パラメータ）を `scripts/preset-model/train.py` で学習し、重み（`apps/host-rs/assets/preset-model.bin`、約0.8MB）をexeに埋め込む。推論は `src/preset_model.rs` に直接書き、依存は追加していない。判断と未決事項は `docs/develop/decisions/2026-11-08-bert-presets.md`。
- モデルは操作ごとのカテゴリ、2つの操作を同じ人が持つべきか、同じ軸か（方向の縦横）を出す。2〜4人への組み立ては決まった手順で行う。送る操作は従来どおり定義の役割案P1〜P3だけ。`RECOOPLAY_PRESETS=rule` で従来の規則に戻り、状態に `game.profile.presetSource` を付けた。
- 定義502本の大半はジャンルの型の複製（操作名120種類）なので、概念辞書から合成した12,000本と混ぜて学習した。評価は、見せない言い回しの合成600本でカテゴリ92.8%・同じ人92.6%・軸96.5%、手作り・抽出の実在14本で93.8%・99.2%・99.0%。
- ユーザー環境の torch 2.11 は Python 3.13 での読み込み時に `IndentationError` になったため、作業用のvenvで torch 2.6.0（CPU）を使った。
- `cargo test --release` 130件（Pythonとの推論の一致、全定義の2〜4人の重複・漏れ・偏り、FPS・Minecraft・Cuphead・Terrariaのまとまり）、`protocol-sim` 60/60（モデル・規則の両方）、`app-view-test` 29/29、`check-static-pages` が成功。`protocol-sim` の疑似ゲーム・4人のMinecraftの試験は規則の分担を固定で見ていたので、規則のときだけ固定で確認し、モデルのときは不変条件と「持っている人の入力だけ送る」を確認するようにした。
- 実機（スマホ・Minecraft・実際の遊びやすさ）は未検証。画面に `presetSource` は表示していない。Terrariaの2・3人用ではカーソルが移動の人に付く（重みの課題）。

## 2026-11-08 — プリセットのモデルを実在のゲームのデータで学習し直す（Claude Code）

- ユーザーの依頼「実際のゲームのデータセットで」「ローカルで読める情報の中で」「学習はDGXで」に対応した。合成したゲームを学習から外し、このPCのゲームのファイルから読んだ5本（`scripts/preset-model/build_dataset.py`：Minecraftの `Options.class`・`ja_jp.json`・`options.txt`、Terrariaの `input profiles.json`、Goose Goose Duckの埋め込みInput System、R.E.P.O.の列挙型と `DefaultKeyBindings.es3`、Core Keeperの .NETメタデータの `RewiredConsts.Action`）と、手作りの定義（9本＋上の4本の手作り版）を使う。注釈は `data/labels.json`（Claudeが付けた。人の確認は未了）。
- 実データにない矢印キーで方向がばらけた（Cuphead）。WASDと矢印キーの置き換えで水増しし、学習に出てこないキーは「キーなし」と同じにした。
- 初めて見る操作名に弱かったので、ユーザーの依頼でClaudeが知識から実在のゲーム79本の初期キー設定を書き（`data/claude-games.txt`、ネットもゲームのファイルも使っていない）、学習に加えた。評価の14本は書いていない。
- 1ゲームずつ外した評価（DGX、14本を並列）：遊びの操作どうしの1本平均で、実在だけ→＋Claudeの79本は、同じ人の判定82.5%→93.3%、軸76.5%→92.8%、カテゴリ81.3%→84.9%、再現率93.7%→88.5%。全部の組の再現率が下がって見えたのはUI操作どうしの組のためで、遊びの操作では悪化していなかった。IDの書き方の水増しは効かなかったので使わない。手作りの定義の形では97〜98%、ゲームの生データでは63〜84%で、生データへの汎化は不十分。
- 最終モデル（DGXで学習、341KiB）：ジャンルの型の定義381本でカテゴリ99.8%・遊びの同じ人99.2%。`cargo test --release` 130件、`protocol-sim` 60/60、`app-view-test` 29/29が成功。
- 未検証：実機での遊びやすさ、注釈の人による確認。Terrariaではカーソルが移動の人に付く（ボタンの重みの課題）。ホストは初めて見るゲームのファイルを読まない。

## 2026-11-08 — 生データの読み取りを広げ、Project Winter を加える（Claude Code）

- `build_dataset.py` の読み取りを広げた：Source（`kb_act.lst`・英語と日本語の翻訳・`config_default.cfg`、VPKの中も）、Source 2（`.vcfg`）、Unreal Engine 3（`Input.ini`）、Godot（`project.godot`）、Rewired（UnityのアセットのUserData。UnityPyがあるときだけ）。Rewired以外は該当するゲームがこのPCになく、見本のフォルダ（`test_readers.py`）でだけ確かめた。
- ユーザーが入れた Project Winter を Rewired の設定（Addressables の `prefabsassets_assets_misc.bundle`）から読み、72操作（キーあり49）に注釈を付けた。Rewired のマウスの要素番号は、操作名との対応（Use＝左、Aim＝右、持ち物の切り替え＝ホイール）で確かめた。
- R.E.P.O.・Goose Goose Duck・Terraria はユーザーが削除したため、作り直すと消えた。以前に読んだゲームは残すようにした（`note` に削除済みと記録）。
- 交差検証（DGX、15本）：元の生データ5本の1本平均は、Project Winter を加えてもほぼ同じ（遊びの同じ人83.2%・再現率72.4%・軸84.4%）。最終モデル（DGX）はジャンルの型の定義でカテゴリ99.8%・遊びの同じ人97.8%。`cargo test --release` 130件、`protocol-sim` 60/60、`app-view-test` 29/29が成功。

## 2026-11-08 — GitHubの操作定義を学習に使う（Claude Code）

- ユーザーの判断（配布物がオフラインならよい、学習だけならライセンスも可、注釈はClaude）を受け、`collect_github.py` で GitHub から `.inputactions` と `project.godot` を4,950件集め、`github_dataset.py` で2,538件（21,032操作）にした。ファイルは `data/local/`（Git対象外）に置き、コミットしない。無作為の22本にClaudeが注釈を付けた。
- Godotのマウスのイベント（`Vector2(0, 0)` を含む）を読めていなかったので直した。
- DGXで評価：GitHubの注釈付き22本（学習に不使用）で、注釈なしデータの有無による差は誤差の範囲（遊びの同じ人90.3%→90.4%、再現率76.0%→75.2%、軸88.0%→89.5%）。伏せたキーの予測だけ41.6%→67.3%と上がった。注釈なしデータを増やしても振り分けは伸びない。
- 最終モデル（GitHubのデータを含む、DGXで学習）：ジャンルの型の定義でカテゴリ99.6%・遊びの同じ人99.5%。Terrariaの3・4人用でカーソルが視点の担当になり、Forzaの3人用でアクセルとブレーキが分かれた。`cargo test --release` 130件、`protocol-sim` 60/60、`app-view-test` 29/29が成功。

## 2026-11-08 — 注釈付きの生データを増やす（Claude Code）

- GitHub のゲームへの注釈を35本足した（乗り物系中心、合わせて57本・582操作）。`train.py --gh-folds 4` で57本を4組に分けて評価：注釈付きの生データなし→ありで、1本平均の遊びの再現率74.5%→83.2%、カテゴリ79.7%→85.8%、軸89.1%→92.9%。乗り物系10本の再現率は30%→39%で弱い。
- 最終モデル（DGX）：ジャンルの型の定義でカテゴリ99.8%・遊びの同じ人99.6%。Forzaの3人用でアクセルとブレーキがそろった。`cargo test --release` 130件、`protocol-sim` 60/60、`app-view-test` 29/29が成功。

## 2026-11-13 — BERT風プリセットを今の main へ移す（Claude Code）

- 11/08 の `claude/bert-presets`（GitHub未登録・main から682コミット遅れ）を、今の main へ移した。コミットを1つずつ移すと同じ衝突が続くため、最終の状態（`7afb72a`）をまとめて移した。上の11/08の記録はそのブランチのもの。
- 利用者の判断：分担の効果は10〜20本を人が判断する。それまでの既定は**規則**とし、`RECOOPLAY_PRESETS=model` のときだけモデルで作る（ブランチでは既定がモデルだった）。実機で受け入れた今の分担を変えないため。
- 移した後に main で増えた操作（Among Us の `click`・`pause`、#293）に注釈を足した。
- `train.py` に、層数・次元・ヘッド数・n-gramの数・dropout・学習率・GPU（`--device cuda`）を指定する引数を足した（既定は従来と同じ）。Rust はヘッダーから大きさを読むので、推論の直しは要らない。

## 2026-11-13 — 人による評価を受けて、プリセットの組み立てを直す（#411）

- 利用者が評価ページで19本・43件を評価した（モデルが良い30・規則が良い11・どちらもダメ2）。回答（選択とメモ、回答者の識別子なし）を `scripts/preset-model/data/human-review-2026-11-13.json` に残した。
- 「持ち物の切り替えだけ」「通報だけ」の担当をなくし、方向の移動を P1 に、カーソルとクリックを同じ人にする組み立てに直した（詳細は `docs/develop/decisions/2026-11-08-bert-presets.md`）。
- 試験：19本で、遊びの操作が人数分あれば全員が遊びの操作を持つこと、方向の移動が P1 にあること、Among Us でカーソルとクリックが同じ人であることを足した。全定義の重複・漏れ・偏りの試験は、持ち物・メニュー・会話を合わせて最大1と数える形にした。DGX（Linux）で preset の試験5件が合格。
- 残る点：Stardew Valley の4人は操作が少なく、「前進だけ」「後退だけ」の人ができる。
## 2026-11-13 — ハッシュ付きのJS・CSSをスマホにキャッシュさせる（#308）

- #308 の「参加URLを開いてから約5秒、ページが真っ白」を調べた。スマホの画面が最初に読むのは、JS約260KB（うち React の共通部分 214KB）・CSS約30KB・画像約0.8MB（ロゴ215KB、背景200KB・154KB など）。ホストはすべてを `Cache-Control: no-store`・圧縮なしで配るので、開くたび・再接続で読み直すたびに全部を取り直す。Wi-Fiなら通常1秒程度の量で、5秒の原因とは断定できない（端末側の測定はしていない）。
- 名前にハッシュ（8文字）の付いたビルドのJS・CSS（`/assets/phone-4qsUqWul.js` など）は、中身が変われば名前も変わるので `public, max-age=31536000, immutable` にした。HTML・画像など名前の変わらないものは従来どおり `no-store`。古い画面が残る心配はない（HTMLは毎回取り直し、新しい名前のJSを読む）。
- 確認：DGX（Linux）で単体試験（キャッシュさせる名前・させない名前）が合格。配信の試験（`static-assets-sim.mjs`）の期待をこれに合わせた（CIで確認）。
## 2026-11-13 — Minecraftのランチャーを前面に出す（#419）

- 利用者のPCのログ（11-13 14:42）で、Minecraftのランチャーを開いた後、24秒間PCアプリが前面のままだった。ランチャーは裏で動くホストが `ShellExecuteW` で開くため、Windowsが前面を譲らず、PCアプリの後ろに開く。ホストが前面にしていたのはゲーム本体（`javaw.exe`）だけだった。
- ランチャーを開いた後、ゲーム本体が現れるまでの起動の確認（0.5秒ごと）で、ランチャーのウィンドウ（`minecraft.exe`・`minecraftlauncher.exe`、タイトル「Minecraft Launcher」）が現れたら前面にする。ゲーム本体と同じ前面化の方法を使い、拒まれたら最大6回までやり直す。一度出せたら、以降は前面を奪わない。dry-run では開かないので行わない。
- PCアプリ以外が前面になった・外れたときのログ（`launcher_focus`）に、前面のプロセス名を足した（タイトルは個人の情報を含みうるので残さない）。前面化の結果は `launcher_front` に残す。
- 確認：DGX（Linux）で、追加した試験2件（現れたら一度だけ前面化を求める・拒まれたらやり直し上限で諦める・世代違いは捨てる、ランチャーの照合）と、既存のランチャー・リモコンの試験が合格。Windowsだけの試験とClippyはCIで確認する。実機は未確認。
## 2026-11-13 — ホストのリモコンでPCの画面全体を操作する実機確認（#405、Claude Code）

- 対象：main `1f1bc3b` のCI配布zip（manifestのcommitは `1f1bc3b`、dirtyなし）の `recooplay-desktop.exe`。実入力（dry-runではない）。PCはWindows 11、2160×1440、表示倍率150%。ホスト（P1）はAndroid 16（`25118PC98G`）・Chrome 157。製品の通信はWindowsモバイルホットスポットのWi-Fi、USBはadbとCDPの制御だけ。段階はロビー（ゲーム未選択）。
- ほかのアプリを操作しないよう、クリックを記録する確認用のウィンドウ（WinFormsの最前面ウィンドウ）をPCアプリの右に置いた。クリックとホイールは、カーソルの直下が確認用のウィンドウかPCアプリのときだけスマホから押した。
- A：確認用のウィンドウが前面のとき、スマホの操作先は「PCの画面を操作中（実際のマウスとして動きます）」。タッチパッドを右へ60pxスワイプすると、OSのカーソルが毎回81px動いた（4回）。スマホの左クリック・右クリック・ホイール↓が、確認用のウィンドウに届いた。スマホの「PCアプリを前面にする」でPCアプリが前面になり、操作先は「PCアプリを操作中」に戻った。
- B：PCアプリの画面で仮想カーソルを右へ動かすと、枠を越えたところで操作先が「PCの画面を操作中」に変わった。OSのカーソルはPCアプリの右端の近く（x=1227、ウィンドウの右端は1240）に置かれた。そのままスワイプして確認用のウィンドウへ動かし、左クリックが届いた。確認用のウィンドウが前面になった。
- 結果：同じ手順を2回通して、2回とも合格。それより前の試行の1回で、操作先の表示が出た直後の最初のスワイプでOSのカーソルが動かなかった。その後の2回（スワイプ計8回）では再現しなかった。利用者のPCのマウスと同時に動いていた可能性もあり、原因は分かっていない。
- 未確認：実際のMinecraftのランチャーでの操作（#287 で確かめる）、準備中・一時停止中の実機での経路、100%など別の表示倍率。

## 2026-11-13 — Rustの版を固定する（#379）

- 下書きPR #423 で、11/08 に書いたコードが Clippy の新しい検査項目（`chunks_exact_to_as_chunks`、Rust 1.99）で失敗した。#379 の残り作業にあった「Rustの版が `stable` のままで、新しいRustでClippyの検査項目が増えた日に、PRの変更と無関係にCIが失敗する」が実際に起きた。
- リポジトリ直下に `rust-toolchain.toml`（`channel = "1.99.1"`、rustfmt・clippy）を置いた。手元の開発環境も同じ版になる。CIの `host-rs`・`desktop`・`cargo-audit` は最初にこの版を入れて `rustc --version` を出す。ビルドのキャッシュのキーに `rust-toolchain.toml` を加えた。
- 版を上げるときは、`channel` の行だけを変える専用のPRで確かめる（`CI_VERIFICATION.md`）。RustSecの監視を定期実行へ分ける件は扱っていない。

## 2026-11-13 — 2〜4人の実機プレイと3台同時操作の受入（#224・#38、Claude Code）

- 対象：main `faf006c` のCI配布版（SHA-256一致、dirtyなし）、実入力。PCはWindows 11、Minecraft Java Edition（版は記録していない）。スマホはiPhone 2台・Android 3台（うち1台は `25118PC98G`・Android 16・Chrome 157、USBはCDPの制御だけ）。製品の通信は全台WindowsモバイルホットスポットのWi-Fi。操作は利用者、確認はホストのログ（`session-2026-11-13T10-41-54-210Z`・`T11-03-41-582Z`）。
- #224 満員：4台（P1 iPhone・P2〜P4 Android）が参加した状態で、5台目のiPhoneはホストに断られた（`reject_full`）。画面に「部屋が満員です（4人まで）。空きが出たら再読み込みしてください。」と出て、読めた。
- #224 4人：分担はP1 移動系7・P2 視点・P3 攻撃と使う・P4 持ち物と捨てるとホットバー。約72秒の協力プレイで、4人全員の操作がPCに届いた。ホストの一時停止と同じミリ秒に押下中の左クリックを解放し、停止後に届いた入力はPCへ送らなかった。再開できた。
- #224 2人：P1 移動系7・P2 視点と操作6。約58秒で両者の操作が届いた。
- #38 3人（P1 iPhone・P2 有線Android・P3 Android）：Readyから約30秒の同時操作（移動・視点・攻撃）。P2のページから、担当外の入力（ジャンプ・攻撃・ホストのリモコンの左クリック）、ホスト専用の命令（PAUSE・END）、PC専用の `swap_roles` を細工して送った。PCへの出力は0件、段階は協力プレイのまま、交換は起きなかった。
- #38 担当の交換と復帰：一時停止中にP1とP2を交換し、約50秒操作した（P1 視点305回、P2 移動62回）。元に戻して約40秒操作した（P1 移動85回、P2 視点312回）。交換中も一時停止・再開はP1からできた。
- 遅延（ホストの観測）：押下の受信からPCへの出力まで、中央値2ms・95%で48ms・最大135ms（259件）。往復時間の平均の中央値は、P1 61ms・P2 89ms・P3 77ms。利用者の感想：操作の遅れは感じなかった。分担の偏りはあまり感じず適切。ジャンプやスニークを持ち物の担当にまとめてもよかったかもしれない。
- 途中の記録：細工の送信の約20秒後に、P2が `replaced` で張り直して一時停止した（細工の影響を否定できない）。ページを再読み込みした後、一時停止中にもう1回 `replaced` が起きた（#426）。P3の2回の切断は、利用者の操作ミス。準備中にMinecraftを閉じると、分担の画面へ戻るボタンがない（#427）。ロビーでホストが15秒戻らず、ホストが次の枠へ移った。
- 未確認：Minecraftの版、AT-D05の同じ台本での3回（#217）、同意を得た動画。

## 2026-11-13 — PC画面の背景をスマホにそろえる（Claude Code）

- ユーザーが比較ページで、PC画面（Windowsアプリ）の背景をスマホと同じ模様にし、真ん中の大きな星は「平たい5つ角の星の内側に一回り小さな星の線を入れ、その線を切り抜いて後ろの空を見せる」案（A2-透過）を選んだ。周りの模様は普通の星を減らして流れ星を増やした（流れ星14・星13）。
- `.desktop-shell` の背景を `pc-stars.png` から、水色→クリーム→レモンのグラデーション（`--color-cyan`・`--color-cream`・`--color-lemon` から作る）と、`assets/pc-big-star.svg`（大きな星。サイドバーの右側の中央）・`assets/pc-stars-pattern.svg`（星と3本線の流れ星）の重ねに変えた。`pc-stars.png` は使わなくなったが削除していない。
- `npm run build`・`controller-preview-test`・`product-web-test`・`check-static-pages`・`verify-ui-evidence` が成功。ビルドした `/pc/` をheadless Chromeで開き、背景と大きな星の位置を目視確認した。Rustホスト・Tauri上の表示は未確認。

## 2026-11-13 — ホストのリモコンをリモコン型にする（Claude Code）

- ユーザーが比較ページでB案（リモコン型）を選び、上下左右・Enter・Eキーを外すと判断した（`2026-10-24-user-decisions.md` に追記）。`HostRemoteScreen` を、参加状況を入れた見出し、タッチパッドと下の縁の左右クリック（`.trackpad`）、カーソル感度、Escの丸ボタンと上下に分けたホイール（`.remote-keys`）、画面の下に固定した進めるボタン（`.host-actions`）の順にした。見た目は `styles/phone-host-remote.css`。要素のidは変えていない。
- 表示しなくなったEキーのための `PhoneDisplay.inventory` と、矢印・Enterのボタン、関係するCSSを削除した。ホスト側の `UP`・`ENTER`・`REMOTE_E` などの受け付けはそのまま（PCのキーボード操作や古い画面との互換のため）。`phone-view-test` からEキー表示の確認を削除した。
- `npm run build`（型検査を含む）、`phone-view-test`・`phone-lifecycle-test`・`phone-session-test`・`product-web-test`・`ui-input-test`・`app-view-test`・`check-static-pages`・`verify-ui-evidence`・`controller-preview-test`・`phone-layout-test` が成功。ビルドしたスマホ画面を模擬ホストにつないでheadless Chromeで開き、受付中と一時停止中の表示を目視確認した。Rustホスト・実機は未確認。
- レビューでの修正（Claude Code）：リモコンから◀▶を外すと、PCアプリのキー割当（プルダウン）をスマホから変えられなくなる。リモコンのクリックではプルダウンの一覧を開けないため（#294）。キー割当の各行に「◀」「▶」のボタンを置き、クリックで1つ前・1つ後のキーへ切り替えられるようにした（`stepKey`、送らない→先頭→…→末尾→送らないと巡回）。プルダウンはPCのマウス用に残す。説明文「ホストのスマホでは▲▼で項目を選び、◀▶でキーを切り替えます」を、ボタンの説明に直した。確認：型検査、`npm run build`、`app-view` 36/36（`stepKey` の試験を追加）、`phone-view`、`phone-lifecycle` 34/34、`ui-input` 20/20、`product-web-test`、`check-static-pages`。実機は未確認。

## 2026-11-14 — 押してから実入力までの遅延の計測用ビルド（Claude Code）

- 利用者の依頼：ユーザーがボタンを押してから操作が実入力（SendInput）されるまでの遅延を、iPhoneで測り、平均・中央・最大を出したい。計測したいときだけこの経路を通し、通常のデバッグやリリースには含めない。
- 方法：スマホとPCの時計は合わないので、押下ごとに3区間を測って足す。①触れてから送信まで（スマホ、イベントの `timeStamp` と送信時刻）、②送信から押下のACKまでの往復（スマホ）、③ホストでの処理の開始からSendInputまで（ホスト、最低押下・解放時間による待ちを含む）。合計＝①＋②÷2＋③。**片道は往復の半分とみなす仮定**が残る。順序待ちの時間は②に含まれ、半分ずつに割り振られる。
- 切り替え：ホストは feature `latency-measure`（`#[cfg]` で囲み、通常のビルドではコンパイルされない）、スマホは `npm run build:latency`（Viteの `define` で `__LATENCY_MEASURE__` を true にする。通常のビルドでは false として取り除かれる）。通常のビルドの成果物に計測の処理が入らないことを、ビルドした結果の文字列の検索で確かめた（通常0件、計測用1件）。
- CI：必須の `host-rs` は、配布物を保存した後に、featureを付けたClippyと試験を行う。計測用の配布zipは、手動で起動する `latency-measure.yml` で作る（`-latency-measure` 付きの名前）。
- 確認：手元で型検査、`npm run build` と `npm run build:latency`、`phone-lifecycle` 34/34（計測の送信の有無の試験を追加）、`phone-view`、`ui-input` 20/20、`phone-session` 7/7、`protocol-boundary` 8/8、`verify_overlay.py`、`check-public-docs.py`、`rustfmt --check` が合格。Rustのビルドと試験（`latency.rs` の単体試験2件を含む）は、手元でOpenSSLのビルド（Perl）ができないためCIで確かめる。

## 2026-11-14 — ゲーム選択のダブルクリック（#445、Codex）

- 同じタイルへの400ms以内の2回のクリックで分担へ進む。PCのクリックと仮想カーソルのクリックを同じ処理で判定する。選択中のタイルの「▶」とEnterからも進める。
- 合格：`npm --prefix apps/web run build`、`NODE_OPTIONS=--experimental-strip-types` を指定した `node scripts/sim/product-web-test.mjs`（app-view 37/37、ui-input 20/20）、`node scripts/sim/check-static-pages.mjs`、`git diff --check`。
- Tauri・WebView2での表示と、PCマウス・スマホの仮想カーソルを使った通し操作は実機受入に残す。
