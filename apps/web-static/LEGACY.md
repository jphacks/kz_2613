# 配信資産と比較用旧版の区別

製品の実装は `apps/web/src/`、製品HTMLは `apps/web/pages/` が正本。`npm run build --prefix apps/web` がこのフォルダーへ `react/` と `phone-react.html`・`app-react.html` を生成する。生成物を直接編集しない。

## 保全する旧版

次のソースは移行前後の比較・参照・復元用として保全する。製品への機能追加は行わず、新しいReact bundleからimportしない。

- `index.html`・`app.html`
- `app-view.js`
- `scripts/controller.js`・`phone-runtime.js`・`phone-view.js`・`desktop.js`・`desktop-runtime.js`
- `scripts/cooperative-input.js`・`input-owners.js`・`stick.js`・`touchpad.js`・`phone-session.js`・`transport.js`・`protocol.js`
- `scripts/generated-controls.js`・`phone-model.js`・`phone-model.d.ts`・`phone-skin.js`・`ui-metrics.js`・`view-transition.js`・`virtual-cursor.js`

`styles/`・`assets/` は現役の共通配信資産。`host.html`・`game.html`・`overlay.html` と `scripts/overlay.js` は診断・観客表示として継続使用する。観客表示が参照する旧 `app-view.js` の純粋関数も保存する。診断画面のReact再実装は今回の移行範囲に含めない。

旧ソースを同じパスに置くのは、比較試験・診断の参照と過去の再現手順を保つため。製品ビルドは旧HTMLもJSも入力にしない。`product-module-graph-test.mjs` が製品TSからの旧JS依存を拒否する。

## 比較と復元

旧スマホは明示URL `/index.html`、旧PC画面はPC内から `/app.html` で開く。PC用ページのループバック制限は旧版でも維持する。標準URLの切替状態はPRの受入記録を参照する。

正確な移行前はmain `c271ebe2335af9bdff5f30d58304a30d74f847f7`、React UI移行後・エンジンJSの比較点は `9947391eb430dcc949877170e926b20e6a9d303b`。以下のように別worktreeを作り、現行作業を破棄せず再現する。

```powershell
git worktree add --detach data/local/restore-main c271ebe2335af9bdff5f30d58304a30d74f847f7
```

旧mainの静的画面はWebビルド不要。ホストはその版のWindows構築手順に従って別の `CARGO_TARGET_DIR` へ構築する。入力・通信エンジンを含めた厳密な復元はworktreeを使い、現行製品へ旧ソースをコピーして混在させない。配布物を戻す場合も、版と資産が一致した検証済みzipを一組で使う。
