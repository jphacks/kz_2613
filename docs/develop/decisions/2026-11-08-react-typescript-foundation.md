# React + TypeScript製品UI基盤（#235）

## 判断と適用範囲

2026-11-08のユーザー指示に基づき、React Islandsを最終形とする方針を更新する。スマホを先に、PCの主要画面もReact + TypeScript strictへ移す。従来版は実機受入の比較対象として保持し、既定URLの採用と開発完了を分ける。mainへのマージ、Issueクローズ、正式配布は今回の権限に含めない。

## 構成

| 対象 | 正本・責務 |
|:--|:--|
| スマホの画面構造と表示 | `apps/web/src/phone/PhoneApp.tsx` と `view.ts` |
| コントローラー描画 | `controller-layout.ts` の担当IDから作るモデルと `phone/Controller.tsx` |
| PCの画面構造と表示 | `pc/PcApp.tsx`、`model.ts`、`parts.tsx`、`PlayerCards.tsx` |
| UIと入力エンジンの境界 | `contracts.ts` と型付きの描画・設定API |
| 接続・再接続・保持元・視点30Hz | 既存JSの入力エンジン。Reactの状態や再描画を経由しない |
| 従来版 | `index.html`・`app.html` と旧描画処理。既定ルートと比較試験で使用 |
| 診断・疑似ゲーム・観客表示 | 既存の静的画面を維持 |

生成HTMLは従来版からheadのローカルCSS・素材参照を引き継ぎ、bodyをReactのrootに置き換える。TSX側が製品画面の本文を持つ。Portal・Islands用のglobal storeは削除する。Reactと従来描画が同じ可変DOMを書き換える分岐には入らない。

パッドのノード、Pointer Events、押下クラス、感度の値、診断統計は入力エンジンが保持する。コントローラー変更前に全解放し、視点パッドを再生成せず移す。操作面の反復再表示でもパッド・感度が1組であることを試験する。同期描画は低頻度の進行・担当変更と設定反映に限定する。

## 編集機能と通信契約の境界

コントローラーは操作ID、部品種別、ラベル、担当操作との対応を持つ純粋な描画モデルから生成する。ボタン、スティック、ホイール、視点をReact部品で描き、同じ部品へ入力bindingsを渡さなければプレビューでは実入力へ接続しない。任意のOSキーを送るAPIをレイアウトへ追加しない。最終的な担当権限・出力キー・epochの検証はRustホストが行う。

この変更は#271の座標・サイズ・バージョン付き保存スキーマや、#50の編集・Undo/Redoを完了させるものではない。共通描画モデルと型付き境界を次の実装先にする。Zustand・interact.js・Ajvは今回の描画移行に不要なので導入しない。TypeScriptとReactの型定義だけを開発依存として追加する。

#272のRustからの型生成・生成差分CIは未実装で、今回のUI型をRust通信契約の正本とは扱わない。既存の `protocol.js` による実行時検証とprotocolVersion=4、WebSocket/WebRTCの順序・重複抑制・epochを維持する。型チェックの合格を実行時の認可や低遅延化の証明にはしない。

## 採用と検証

`npm run build` がstrictの型チェックを先に実行する。CIとzip配布の既存ビルド経路にも適用する。スマホ・PCの比較試験は文言、DOM、操作、安全停止を維持し、PCは設定の変更・復元まで確認する。画面切替の比較は両版で演出の完了を待つ。視点の計測はDataChannelの生存確認を除き、lookだけを数える。

AndroidのADB/CDP試験は実端末上のChromeで行うが、実指の試験ではない。USBの接続成立、CDPの複数接点、ADB回転・非表示と復帰、無注入での論理押下を観測する。LANの品質・iPhone Safari・Minecraftの実入力は別ゲートとして残す。

確認URLは `/phone-react.html` と `/app-react.html`。Tauriでは `RECOOPLAY_REACT_UI=1` の明示指定時だけReactのPC画面を開く。既定の `/` と `/app` は、iPhoneを含む実機受入と採用判断が揃うまで従来版を保つ。結果と限界は `../handoff/BUILD_LOG.md` に記録する。
