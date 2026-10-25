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
- 判断の記録：`docs/decisions/2026-10-25-session-keep.md`（[P]）。
- Rust版ホスト：PCアプリの画面を `monitor`（`page: app`）として区別し、`focus` を受け取る。協力プレイ中にPCアプリが前面になったら、全解放して `paused`（`app focus`、自動復帰なし）へ移す。選んだゲームを `game.title` として保持し、`select_game` で変更する。ロビー以外で変えたら全解放して `lobby`（`game change`）へ戻す。参加者と役割はそのまま。
- PCアプリ（`app.html`）：前面になった・外れたことを `focus` で送る。ゲームの選択をホストへ送り、ホストの値で表示する。スマホ画面は停止理由「PCアプリの画面に戻った」「PCの緊急停止」を表示する。
- `protocol.md` に `page: app`・`focus`（app）・`select_game`・`game.title` を追記した。
- 検証：`cargo build --release --locked`・`cargo test --release --locked`（3件）成功。`node scripts/sim/protocol-sim.mjs` を3回連続で **34/34合格**（PCアプリへの手動復帰→全解放・paused・リモコンがPC画面へ届く・役割維持・RESUME、協力プレイ中のゲーム変更→全解放・lobby・参加者維持、同じゲーム・未知のゲームは無視、を追加）。`--target node` **19/19合格**。`app-view-test` **11/11合格**。`check-static-pages` 構文OK。
- **未検証：** WebView2のウィンドウでの `focus` の届き方、Minecraftとの実際の切り替え（#37）。

## 2026-10-25 — #42 Minecraftの名称・画面・デモ素材の利用条件（Claude Code）
- 公式のMinecraft Usage Guidelines（<https://www.minecraft.net/en-us/usage-guidelines>、2026-10-25に取得）を読み、要点と本プロジェクトへの当てはめを `docs/decisions/2026-10-25-minecraft-usage-terms.md` に記録した（[E]は公式の記述、[P]は当てはめ）。
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
- 実PCアプリ・MinecraftのメニューとAndroid/iPhoneのタッチ操作は未実機検証。詳細は docs/architecture/host-remote.md。PR #90を先行依存とする。

## 2026-10-25 工程3・4：PC・スマホ同時UI刷新

- 提供PNG17枚の実画像を確認。背景専用PNG5枚を同梱し、画面全体の画像化はしていない。シアン #17C1FF、紫 #5F5B93、クリーム #FFFBEF 等を実画素から採色し、styles/colors.cssとdocs/design/color-palette.mdへ座標・用途・コントラストを記録した。
- PCの参加・ゲーム選択・固定分担・準備・停止と、スマホのホスト操作・待機・3担当・障害表示を同じデザインで実装した。CSS共通トークンと通信・入力・描画モジュールを分離した。React・新しい本番依存・自由配置編集は追加していない。
- Rust dry-runホストと3つのブラウザOriginで参加・WebRTC・準備→Ready→3担当・Pause・再接続を確認した。libdatachannelのバイナリ応答をJSONとして読めない問題を修正し、文字列・ArrayBuffer・Blobと旧接続を試験した。
- 内蔵Chromiumの縦画面6サイズ（320×568〜430×932）を計測。3担当×6、ホスト準備・一時停止×6の計30条件で横はみ出しと高さ44px未満の操作ボタンなし。前面化ボタン追加後にも12条件を再確認した。874×402では全解放して縦向き案内。PCは1920×1080と1280×720で3カードを保持する。小解像度では説明下部を縦スクロールする。
- 満員・トークン不一致・版不一致の固有説明、モジュール分離後のReady→Pauseを表示専用プレビューで確認した。証拠画像3枚と詳細はdocs/design/ui-validation.md。表示の模擬データを認可・OS入力の合格根拠には使わない。
- 実ブラウザ＋Rust dry-runで押下→送信20件のp95=1ms、視点移動→送信28件のp95=40.7ms、送信間隔27件の中央値33.4ms/p95=66msを観測。実タッチ・Wi-Fi・Minecraftまでの遅延ではない。変更前の同条件測定がなく改善率は不明。
- ホスト・Tauriのreleaseビルド成功。ホスト単体5件、Rust通信40/40、Node参照20/20、終了通知2経路、入力プローブ--mock12/12、画面ロジック12/12、UI入力4/4、外部JSを含む静的構文、構造確認が成功。
- static-assets-sim.mjsで23ファイルのHTTP 200・MIME・no-store・ローカル背景参照を確認（1,155,993 bytes、表示モジュール分離後）。PNG・JPEG・WebP・WOFF/WOFF2のMIMEを追加した。
- Windows配布スクリプトで約6.7MBのZIPを作成し、ZIP内のHTML/CSS/JS/PNG等23ファイルが作業ツリーとバイト単位で一致することを確認。別PCでの起動・新UIのMinecraft/スマホ実機受入は未実施。
- 追加の機能修正（既存ゲームへ戻るOPEN_GAME、固定3人、実入力の緊急停止登録必須）は機能PR #91側へ分離した。mainは更新せず、マージ・auto-merge・Issueクローズは行わない。

- 最終レビューで、paused等の定期state更新により手動ナビゲーションが分担画面へ戻る問題を修正。進行の変化時だけ案内し、同じ進行の定期更新はユーザーの画面選択を保持する回帰試験を追加した。

## 2026-10-25 #54・#93：Steam・Epicの検出と一覧からの起動（ホスト側）

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

- 最新のローカル監査v2を全文読み、指定パス `docs/design/pc-fidelity-audit-2026-10-25.md` に原文を保持した。素材5枚を1920×1080原寸で確認し、SHA256・採色領域・外接矩形を `pc-fidelity-reference.json` に記録。
- PCだけを参加／ゲーム選択／分担／準備中／準備可能の5構図へ変更。左561px・巨大コピー・楕円CTA・巨大半透明フレーム・横長操作帯・縦長仮キャラ枠を再現。3人固定とP1だけReadyを保持。開発情報は既存 `/host` と設定の詳細へ、ON/OFFとQRには常時到達可能。
- フォントはローカルのNoto Sans JPを使用。正式フォントは未取得、再配布・CDN・新しい本番依存・React移行なし。仮想カーソルのdialog最上位レイヤーとsummary押下を修正。入力定数、Rust、通信契約は変更していない。
- 反復撮影の途中で古いタブを閉じ込めた補助関数と画像寸法不一致を検出し、不採用として記録。DPR丸めの0.667px罫線は1pxの塗り線へ修正。最終製品コミットe2a4c7fでタブ25/26を別々に開き、10:44と10:45 JSTに5画面×2解像度をそれぞれ新規撮影・再計測。両回で主要矩形・ボタン画面内・ページスクロール・コンソール0件を確認。
- 自己監査の最終点は参加96、選択97、分担96、準備中96、準備可能97。各観点の最低比率86.7%、重大P0/P1差分0。画素一致率や実機検証済みを意味しない。計測・比較・差分・採点根拠は `docs/design/evidence/pc-fidelity-progress.md` と `pc-fidelity-element-matrix.md`。

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
- `scripts/windows/prepare-brand-assets.py` でPillowを開発時だけ使い、縦横比を維持したアイコン各サイズを生成。原画像SHA256と用途は `docs/design/brand-assets.md`。
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
