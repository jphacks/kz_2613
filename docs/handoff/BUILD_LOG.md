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

以下はNode.js試作品について報告された過去の観測記録であり、採用方針や今後の明示的なユーザー判断より優先する規則ではない（`docs/decisions/2026-10-24-prototype-validated.md`）。**Minecraftでの試験は行っていない。** 端末は端末A（Android、安定）、端末B（Android、無線が不安定）、iPhoneと呼ぶ。IPなど環境固有の値は記載しない。

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

## 2026-10-24 — PR #77の切断待ち中の緊急停止を修正（Codex）

- 切断でpausedのときも緊急停止の理由を記録し、復帰期限を0にして自動復帰を解除する。epochも更新し、停止前の入力を持ち越さない。
- 自動復帰ONで切断待ちになった後にstopし、全員が戻ってもcoopにならない回帰試験を追加した。試験スクリプトの構文検査は成功。先行PR統合後にRust版で実行する。
