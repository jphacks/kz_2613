# 通信版定数の正本

[#272](https://github.com/jphacks/kz_2613/issues/272) の通信版は、`apps/host-rs/protocol-version.txt` の整数を正本とする。Rustの `protocol_version.rs` とWebの `version.ts` をPythonの標準ライブラリで生成し、生成物もGitに含める。GitHub Actionsの `structure` で、正本と生成物・仕様書の版表記に差分があれば失敗させる。`protocol-sim.mjs` では従来どおり、ビルド済みホストの拒否と応答をWebの版で検査する。

RustとWebに定数を手書きする方式では二箇所の更新が要る。ビルド時の生成はCargoとWebの両方に生成環境が要る。今回は既存のPythonを更新時とCIで利用し、Cargo・Vite・Node.jsの既存のビルドや読み込み方を使う。

この手順の導入に伴う通信版の変更はない。メッセージ本体・設定の型と実行時検証を共有する方式は #272 の後続で扱う。
