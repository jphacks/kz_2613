# Web画面の構成整理 設計書（React + TypeScript strict への一本化）

状態: #279 の実装仕様。5画面のReact + TypeScript strictへの移行実装済み。PR-A/B/Cを分離し、自動試験と製品の実機受入を区別する。作成: 2026-11-09。実装者: Codex。
マージ・Issue close・正式リリースは、利用者の承認を得てから行う。

## 1. 目的と判断（利用者確定）

1. ブラウザへ配信するコードは、すべて TypeScript（React）にする。疑似ゲーム・診断画面・観客表示も対象。
2. 旧JS版は main から削除する。保持はタグだけで行う（予備の配布zipや `--legacy` の仕組みは作らない）。
   - `legacy-js-before-react` = `702b872`（React移行前のmain。履歴更新前はc271ebe、tree一致）
   - `legacy-js-engine-before-ts` = `e265745`（React UI＋旧JSエンジン。履歴更新前は9947391、tree一致）
   - `legacy-js-last-with-react` = `6ad3153`（#274 マージ直後。React版と旧JSが併存する最後の点。履歴更新前はee77270、tree一致）
3. 旧JSを前提にした配信・試験の土台は、すべてTS版へ置き換える。旧版との比較専用の試験は廃止する。
4. HTML・ディレクトリ・ファイル名は、React + TypeScript strict の標準的な構成として自然な名前にする。
5. 入力・通信・安全停止の挙動、定数（最低押下60ms・最低解放50ms・視点30Hz・切断判定4秒など）は変更しない。UIの見た目・文言・DOM ID も原則変えない（変えるなら理由を記録）。

## 2. 変更前の構成（旧構成、タグ `legacy-js-last-with-react`）

```
apps/web/                    React + TS strict（Vite）
  pages/phone.html, pc.html  製品HTML（ビルドで apps/web-static/ へコピー）
  src/{phone,pc,input,transport,model}/, store.ts, contracts.ts, dom.ts, controller-layout.ts
  vite.config.js             出力先は ../web-static/react/（生成物）
apps/web-static/             配信ルート（ホストの WEB_DIR）
  index.html, app.html, app-view.js, scripts/*.js(19), LEGACY.md      ← 旧版（削除対象）
  host.html, game.html, overlay.html, scripts/overlay.js              ← JS（TS化対象）
  assets/（画像9点＋characters 4点）, styles/*.css（10点）             ← 配信資産
  react/, phone-react.html, app-react.html                            ← 生成物（git対象外）
```

問題点: ①旧JSとTSが併存し strict の対象外が残る ②`-react` という接尾辞が正本に付いている（React が標準なのに名前が過渡期のまま）③ソース（`apps/web`）と配信物（`apps/web-static`）の区別が名前から分からず、`index.html` が旧スマホ画面かつホスト・Tauri の配信ルート探索の目印を兼ねている ④診断・疑似ゲーム・観客表示がビルド対象外で型検査されない ⑤CSS が HTML の `<link>` で読まれ、TSから独立している。

## 3. 完成形

### 3.1 ディレクトリ

```
apps/web/                         ← 画面の唯一の正本。配信物もここへ出す
  package.json / package-lock.json
  tsconfig.json                   src を strict で検査（既存設定を維持）
  tsconfig.node.json              vite.config.ts 用
  vite.config.ts                  root=src、複数HTMLエントリ、outDir=../dist、publicDir=../public
  public/
    assets/                       旧 apps/web-static/assets をそのまま移動（URL /assets/... を維持）
  src/
    phone/      index.html  main.tsx  PhoneApp.tsx  screens/…  runtime.ts  view.ts  transition.ts  telemetry.ts  Controller.tsx
    pc/         index.html  main.tsx  PcApp.tsx  …
    overlay/    index.html  main.tsx            観客表示（旧 overlay.html + overlay.js）
    diagnostics/ index.html main.tsx            診断画面（旧 host.html）
    pseudo-game/ index.html main.tsx            疑似ゲーム画面（旧 game.html）
    shared/
      input/ transport/ model/                  旧 src/input, src/transport, src/model
      store.ts contracts.ts dom.ts controller-layout.ts
    styles/     tokens.css colors.css shared.css mobile.css … 旧 apps/web-static/styles を移動し、各エントリの main.tsx から import
  dist/                           ビルド出力（git対象外。ホストの配信ルート）
```

- Vite の `root` を `src` にし、各画面は「`src/<画面>/index.html` ＋ `main.tsx`」の自己完結したフォルダにする。HTMLを Vite に処理させるので、カスタムプラグイン `reactPages`（HTMLの手動コピー）と生成物の名前 `*-react.html` は廃止する。CSS は `main.tsx` から import し、Vite が各HTMLへ `<link>` を差し込む。
- 出力は `apps/web/dist/<画面>/index.html` ＋ ハッシュ付きの `assets-*/`（名称は Vite の既定に従う。`public/assets` の画像は `dist/assets/` へそのままコピーされ、URL `/assets/...` を維持）。ホストは `Cache-Control: no-store` で配信しているため、ハッシュ付きファイル名でも問題ない。
- `apps/web-static/` は削除する。`apps/web/dist` は git 対象外（`.gitignore` 更新）。

### 3.2 URL と配信の対応（URLは変えない）

| URL | 配信ファイル | 公開範囲 |
|---|---|---|
| `/` | `phone/index.html` | LAN（スマホ） |
| `/app` | `pc/index.html` | PCのループバックのみ |
| `/overlay` | `overlay/index.html` | PCのみ |
| `/host` | `diagnostics/index.html` | PCのみ |
| `/game` | `pseudo-game/index.html` | PCのみ |
| `/assets/...` ほか静的 | `dist/` 配下 | LAN |

- PC専用判定は、現在のファイル名一致（`host.html` 等）から「解決した実体パスが `dist/{pc,overlay,diagnostics,pseudo-game}/` 配下か」に変える。大文字小文字・末尾ドット・`::$DATA`・`//` 重複・`/pc/index.html` の直接指定でも、LANへ配信しないこと（#214 の既存試験を新パスで維持・拡張）。
- 旧 `/index.html`・`/app.html` は 404 にする（互換は残さない）。
- 配信ルート探索の目印は `apps/web/dist/phone/index.html` の存在に変える（`apps/host-rs/src/main.rs` の `WEB_DIR` と `find_root`、`apps/desktop/src/main.rs` の同様の探索）。環境変数 `RECOOPLAY_ROOT` の挙動は維持。
- Tauri は引き続き `/app` を開く。起動画面 `apps/desktop/ui/index.html` は別バンドルのため今回は変更しない（JSのまま許容）。

### 3.3 命名規約

- 画面フォルダ: kebab-case の名詞（`phone`, `pc`, `overlay`, `diagnostics`, `pseudo-game`）。HTML は常に `index.html`。
- コンポーネント: `PascalCase.tsx`。画面内の機能単位は `screens/`・`dialogs/`・`parts/` に分ける（`HostRemoteScreen`、`WaitingScreen`、`GameplayScreen`、`DiagnosticsDialog` など、#274 で分割済みの部品を移動するだけでよい）。
- ロジックは `camelCase.ts`（または既存の kebab-case を踏襲）。React を含まないものは `.ts`、JSXを含むものだけ `.tsx`。
- 共有コードは `shared/` から相対 import（`import type` を徹底）。画面間の相互 import を禁止し、`product-module-graph-test` で検査する（画面 → shared は可、shared → 画面は不可、画面 → 別画面は不可）。
- Node の試験・ツールは `scripts/` に残し `.mjs` のままでよい（製品コードではないため）。ただし `vite.config` は Vite+React+TS の標準に合わせ `.ts` にする。

## 4. 修正内容（全量）

### 4.1 削除
- `apps/web-static/index.html`, `app.html`, `app-view.js`, `LEGACY.md`
- `apps/web-static/scripts/` の `controller`, `cooperative-input`, `desktop`, `desktop-runtime`, `generated-controls`, `input-owners`, `overlay`, `phone-model`(+`.d.ts`), `phone-runtime`, `phone-session`, `phone-skin`, `phone-view`, `protocol`, `stick`, `touchpad`, `transport`, `ui-metrics`, `view-transition`, `virtual-cursor`（計19ファイル＋`.d.ts`）
- 廃止する試験: `react-phone-parity.mjs`, `react-pc-parity.mjs`（旧版との比較専用）。`android-dry-run.mjs` の `--legacy`／`--react` 切替と、その試験（`android-dry-run-test.mjs` の該当ケース）。
- 旧版との見た目比較ツール `audit-pc-fidelity.py`, `report-pc-fidelity.py`, `build-ui-gallery.py`, `ui-preview.mjs`, `measure-pc-reference.py`, `capture-screens.mjs` は、旧版依存を調べ、依存していれば廃止（新構成でも意味があるものだけ移行）。

### 4.2 移動・改名
- `apps/web-static/assets/` → `apps/web/public/assets/`
- `apps/web-static/styles/*.css` → `apps/web/src/styles/`
- `apps/web/src/{input,transport,model}`, `store.ts`, `contracts.ts`, `dom.ts`, `controller-layout.ts` → `apps/web/src/shared/`
- `apps/web/pages/phone.html` → `src/phone/index.html`、`pc.html` → `src/pc/index.html`
- `vite.config.js` → `vite.config.ts`（`reactPages` プラグインを削除）

### 4.3 TS化（新規）
- `overlay`: React 化。`decodePcMessage` で受信を検証し、`overlayModel`（`shared/model/presentation.ts` に既存）で描画。`?position=top`、1秒再接続、読み取り専用（ホストへ操作を送らない）を維持。
- `diagnostics`（旧 `host.html`, 278行）: React＋TS 化。ホストAPI・WSのメッセージは `unknown` から検証して型付きで扱う。
- `pseudo-game`（旧 `game.html`, 604行）: React＋TS 化。**最後に行い、別PRにする。** 実入力の照合に使うため、変換の前後で `input-probe-sim`（12/12）・疑似ゲームによる実入力照合の結果・押下/解放の順序が同一であることを合格条件にする。旧版との差が出たら、タグ `legacy-js-last-with-react` から再現して原因を調べる。

### 4.4 Rust・Tauri・配布
- `apps/host-rs/src/main.rs`: `WEB_DIR` を `apps/web/dist` に。静的配信の `/`・`/app`・`/overlay`・`/host`・`/game` の対応表と PC専用判定（§3.2）を更新。旧 `/index.html`・`/app.html` は404。
- `apps/host-rs/src/hub.rs` のコメント（`app-view.js` の GAMES）を `shared/model/presentation.ts` に修正。`input_probe` の `game.html` 言及があれば新名に更新。
- `apps/desktop/src/main.rs`: 配信ルート探索を新しい目印に。`apps/desktop/README.md` と `capabilities/default.json` の記述を更新。
- `scripts/windows/package.ps1`: コピー対象を `apps\web\dist` に変更。ビルド済み判定を `apps\web\dist\phone\index.html` に。配布物内のパス（`apps/web/dist`）とアプリの探索が一致することを `package-smoke` で確認。
- `.github/workflows/rust.yml`: 旧版・parity の工程を削除。React の `npm ci && npm run build` は維持。`.gitignore` に `apps/web/dist/` を追加し、旧生成物の行（`apps/web-static/react/` など）を削除。

### 4.5 試験の置き換え（旧JS依存 → TS）

| 試験 | 方針 |
|---|---|
| `app-view-test.mjs` | `shared/model/presentation.ts` だけを読む（`RECOOPLAY_TEST_TS` と旧パスの分岐を削除） |
| `phone-view-test.mjs` | 旧 `createPhoneView` のDOMモックを廃止。同じ観点（Ready可否・待機・担当画面・Pause・診断前解放・未検証案内・ゲーム名・INVキー表示）を `shared/model/phone.ts` の `waitModel`/`remoteModel`/`inputWarnText`/`roleView` と `phone/view.ts` の描画モデルの試験へ移す |
| `controller-diagnostics-test.mjs` | `shared/input/owners.ts`・`transport/session.ts`・`transport/protocol.ts`・`model/presentation.ts` の `phoneAdvice` へ。`phone-runtime.js` のソース文字列検査は、`phone/runtime.ts` に対する等価な検査へ |
| `fixtures/phone-harness.mjs` | 旧JSの読み込みを廃止し TS のみ。`phone-lifecycle`/`phone-session`/`protocol-boundary`/`product-lifetime` の各試験が使う分岐を整理 |
| `ui-input-test.mjs` | `generated-controls.js` 依存は `controller-layout.ts`／`model/actions.ts` へ。`RECOOPLAY_TEST_TS` 分岐を削除 |
| `input-owners-test`, `phone-session-test`, `phone-skin-test`, `protocol-boundary-test`, `view-transition-test` | TS側だけにする（旧パスの分岐・環境変数を削除） |
| `static-assets-sim.mjs` | 新しい配信構成（5つのエントリHTML、`/assets/` の配信、MIME、`no-store`）を検査。旧エンジン非起動の検査は「旧パス404」に置換 |
| `check-static-pages.mjs` | `dist/*/index.html` の存在・起動要素・構文を検査。`app.html` の動作環境文言の検査は、React版 `PcApp` の対応箇所へ |
| `package-smoke.mjs` | 配布物の `apps/web/dist/phone/index.html` で検査 |
| `protocol-sim.mjs` | PC専用ページの拒否一覧を新URL・新実体パス・表記ゆれ（大文字・`::$DATA`・`//`・`/pc/index.html` 直接指定）で更新 |
| `product-module-graph-test.mjs` | 旧JS参照の検査を、§3.3 の依存方向の検査に置換 |
| `verify_overlay.py` | 必須ファイル一覧を新構成に更新 |

追加: 新しい3画面（overlay/diagnostics/pseudo-game）の起動・受信検証・破棄の試験。

### 4.6 文書
- 新設: `docs/develop/architecture/web-structure.md`（この設計書の確定版）。
- 更新: `AGENTS.md` と `CLAUDE.md` の「ディレクトリ構成」「画面」「コマンド」、`docs/README.md`、`docs/develop/README.md`、`docs/develop/architecture/system-design.md`・`pc-screens.md`、`docs/develop/handoff/SETUP_WINDOWS.md`（`apps/web-static` の行と `LEGACY.md` リンク）、`apps/desktop/README.md`、`docs/develop/acceptance/README.md` の旧版・`--legacy` の記述。過去の受入記録（`evidence/`・`2026-11-09-*`）は事実の記録なので改変せず、旧構成の記述には「旧構成（タグ `legacy-js-last-with-react`）」と注記するに留める。
- `docs/develop/decisions/` に決定記録（日付付き）を追加: 旧JS削除・TS一本化・タグによる保持・構成の理由。
- `BUILD_LOG.md` に実行コマンドと結果を追記。

## 5. 実装順序（PR分割）

1. **PR-A（構成変更・旧版削除）**: §4.1〜§4.6 のうち pseudo-game と diagnostics を除く全部。コミットは次の順に分け、各コミットでCIが通るようにする。(1) **構成変更**＝ファイル移動（`git mv`）と、それに必要な参照更新（Vite設定、Rust・Tauriの配信ルート、配布スクリプト、試験、CI、docs）を**同一コミット**にする。旧パスを廃止するため、移動だけのコミットではCIが通らない。この段階で変えるのはパス・importの文字列だけでロジックは変えず、`git diff -M --stat` でパス以外の差分がないことを確認する。(2) 旧版に依存する試験のTS版への置き換え。(3) 旧版の削除。(4) overlay のTS化。(2)〜(4) は中身の変更なので(1)と混ぜない。
2. **PR-B（diagnostics の TS化）**
3. **PR-C（pseudo-game の TS化）**。§4.3 の同一性を合格条件にする。

デモの安全のため、PR-A〜C のマージ時期は利用者が決める。凍結（2026-11-12）後の main に大きな変更を入れる場合は、利用者の承認と、実機（Android 実Wi-Fi）の再確認を必須とする。

## 6. 受入条件

- `npm run build`（`tsc --noEmit` strict ＋ Vite）が通り、`apps/web/src` に `.js` が存在しない。`allowJs` を使わない。
- `apps/web-static` と旧JSへの参照が、コード・設定・CI・docs（過去の記録を除く）から消えている（`git grep` で確認）。
- CI（`.github/workflows` 全ジョブ）と、`cargo test`、`protocol-sim` 60/60、shutdown-sim、各 sim が成功。
- `/`・`/app`・`/overlay`・`/host`・`/game` が §3.2 の公開範囲どおりに配信される（LANから PC専用ページ403/404）。
- Tauri 実窓の起動（`apps/desktop` の試験）、配布 zip の起動（`package-smoke`）が成功。
- Android 実機（実Wi-Fi・dry-run・`scripts/device/android-dry-run.mjs --wifi-network`）で、移行前後とも全項目合格。入力の欠落・重複・未ACKは0。
- 未確認事項（iPhone、実指、Minecraft実入力、実無線断）は未確認のまま記録し、完了扱いしない。

## 7. リスクと対処

| リスク | 対処 |
|---|---|
| 配信ルート探索の目印を変え忘れ、ホスト/Tauri が起動時にフォルダを見つけられない | Rust のユニットテスト、`package-smoke`、Tauri 実窓で確認 |
| PC専用ページの判定漏れ（パスが `dist/<画面>/index.html` に変わる） | `protocol-sim` の拒否一覧を先に更新し、赤→緑で確認 |
| Vite のHTML処理でCSSの読み込み順が変わり見た目が崩れる | CSS を `main.tsx` で旧 `<link>` と同じ順に import。スクリーンショット比較（`capture-screens` 相当を新構成で作り直す）で確認 |
| 試験の移植で観点が落ちる | §4.5 の表を観点単位のチェックリストにして、移植前後の assert 数を `BUILD_LOG.md` に記録 |
| pseudo-game の変換で実入力の照合結果が変わる | PR-C で分離。タグから旧版を復元して差分比較 |
| ファイル移動でレビューしづらい | 移動と参照更新は同一コミット（旧パス廃止のためCIを通すには分けられない）にし、`git mv` と `git diff -M --stat` でパス以外の差分がないことを示す。TS化・分割・試験の置き換えは別コミット |

## 8. 範囲外

編集可能なコントローラーの保存・編集UI（#271/#50）、Rustとの型生成（#272）、#278（React画面の設計整理）、Node の `.mjs` スクリプトの TS 化、`apps/desktop/ui/index.html` の変更。


## 9. 実装時の補足

- §2の旧構成・§4の削除対象・過去記録はタグ `legacy-js-last-with-react` の履歴説明。現在の実行パスではない。
- コミットaは移動とパス/import更新だけを行い、CIを保つ一時配置を使用する。bで試験を移植、cで旧版を削除してViteの5 HTML入力とdistへ切替、dでoverlayをReact/TS化する。aの移動対象はgit diff -Mで100%またはimport行のみの差と確認する。
- PR-A時点ではdiagnostics/pseudo-gameのinline JSを新HTMLに一時保持し、PR-B/CでTS化する。恒久的な互換配信・予備zipは設けない。
- Vite設定にもstrict型検査を適用する。画像はpublic/assets、CSSはsrc/stylesから各main.tsxが順序を保持してimport。ビルド済みコードはVite既定のハッシュ付きassetsへ出る。
- PC専用ディレクトリはcanonicalize済みの実体と配信rootから判定し、root外のリンク先も配信しない。HTTP/WSの認可と入力定数は維持する。
- 実入力照合は明示許可がないため未実施。Android実Wi-Fiの移行前/PR-A/B/C比較は各16項目合格（詳細は[比較記録](../acceptance/2026-11-09-web-structure-wifi.md)）。全受入完了とはしない。

## 10. 旧版の再現

`git worktree add --detach data/local/legacy-reproduction legacy-js-last-with-react` で独立した旧版を再現できる。React移行前は `legacy-js-before-react`、旧エンジンとの併存点は `legacy-js-engine-before-ts`。元作業ツリーをresetしない。生成物が必要な版ではそのworktreeのapps/webでnpm ciとnpm run buildを実行する。


## 11. 5画面移行後の確認範囲

5画面すべてsrc/<画面>/index.htmlとmain.tsxを入口にし、配信ルートをdistへ統一した。疑似ゲームのcanvas/入力照合はReact描画の外で動かし、Reactの静的な殻のunmountで購読・タイマー・フレーム・monitorを破棄する。疑似ゲームのCSSは、共通色と画面色の順をCSS内の@importで固定する（Viteの共有CSS抽出による上書きを防ぐ）。

移行前12系列の固定trace、受信境界・寿命管理、実ブラウザの3画面、通信60件・入力プローブ12件を自動確認した。実OS入力の照合は未実施で、固定traceやdry-runを実入力の合格と読み替えない。Android実Wi-Fi比較の結果と未確認事項はBUILD_LOGを参照する。
