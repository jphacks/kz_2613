# 画面のReact移行（#235）

2026-11-07、ユーザーがReact移行を最優先にすると判断した。これまでの「Reactは任意」「ビルド不要の静的画面」を、移行の完了まで段階的に置き換える。

## 方針

| 項目 | 判断 |
|:--|:--|
| ソース | `apps/web/`（React 19、Vite）。JSXで書く |
| ビルド結果 | `apps/web-static/react/`。Git対象外で、CIと配布の前に作る |
| 配信 | 既存の静的配信のまま。外部CDNは使わず、オフラインのLANで動く |
| 切替 | 同等性を確認するまで、既存の画面を既定のまま残す |
| 確認用の入口 | スマホは `/phone-react.html`、PCは `/app-react.html`（どちらもビルドで生成、Git対象外。PCの入口はPC本体だけが開ける） |

## 入力処理の境界

Pointer Events、保持元の管理、接続、受信の検証、視点の送信はReactの状態管理に載せない。再描画の遅れが押下と解放に影響しないようにするためである。Reactは描画だけを担当し、既存のモジュールを呼び出す。

画面の定義は `apps/web-static/index.html` だけに置く。`phone-react.html` はビルド時に `index.html` から生成する。Reactは変わる部分だけを `createPortal` で既存の要素の中へ描き、入力の要素には触れない。`index.html` を変えるときにReact側の修正は要らない。

既定の画面を切り替えるときに、`index.html` の本文をコンポーネントへ移す。

## 確認の基準

`scripts/sim/react-phone-parity.mjs` が、既存の画面とReact版を同じ手順で動かして比べる。DOMの構造、要素の位置、WebRTCの成立、押下と解放の順序、スティック、保持中のPauseの解放、再読み込み後の枠、実行時のエラー、タップの遅延、視点の送信周期を対象とする。

この試験はheadless Chromeの模擬タッチで、実端末の代替ではない。既定の画面を切り替える前に、Android Chrome・iPhone SafariでAT-D01を実施する。

## 影響

開発と配布にNode.jsのビルドが必要になる。実機受入の版へ入れる時期はチームで判断する。
