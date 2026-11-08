# 通常権限での開発と検証

## 確認結果

2026-11-08、管理者トークンではないプロセスでRustホストとTauriのreleaseビルドを実行した。Vite・strict型チェック・無注入試験も通常権限で実行できる。Codexのサンドボックス外実行の承認は必要だったが、これはWindowsのUAC昇格とは別であり、管理者として起動していない。

現在のTauriは `bundle.active=false`。開発ビルドはNSIS/WiXを呼ばず、配布も既存のzip方式でインストール不要。スクリプトにはrunasやランタイムの自動導入を追加しない。既存のユーザー領域のRust・Perl・libclangとCargoキャッシュを再利用する。

過去に表示されたポップアップの実行ファイル・発行元・画面の記録はないため、その原因は断定できない。今回、通常ビルドでUACは再現しなかった。起動中のEXEがビルド先をロックするとアクセス拒否になるため、まずアプリを終了して再実行する。管理者実行で解決しようとしない。

## 再実行するコマンド

リポジトリのルートで実行する。PowerShell 5.1用にスクリプトはUTF-8 BOM付きで保存している。

```powershell
# 初回・lock変更時だけ
npm ci --prefix apps/web

powershell -NoProfile -ExecutionPolicy Bypass -File scripts/windows/dev.ps1 -Task web
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/windows/dev.ps1 -Task host
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/windows/dev.ps1 -Task desktop
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/windows/dev.ps1 -Task verify
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/windows/dev.ps1 -Task dry-run
```

`-ExecutionPolicy Bypass` はこのPowerShellプロセスで既存のローカルスクリプトを実行する指定であり、UAC設定やシステム全体の実行ポリシーを変更しない。`dry-run` はOS入力を送らず、設定ファイルを読まず、空きポートを割り当てる。表示されたポートのReact確認URLを開き、`quit` で終了する。

キャッシュは既定 `%LOCALAPPDATA%/ReCooplay/cargo-target`。別の既存キャッシュを使う場合は `CARGO_TARGET_DIR` を指定する。必要なツールがないときは [SETUP_WINDOWS.md](SETUP_WINDOWS.md) に従って準備する。開発コマンドから自動インストールしない。

## 管理者権限が必要になり得る処理

| 処理 | 開発時の扱い |
|:--|:--|
| Cargo・Vite・型チェック・テスト | 通常権限。書き込み可能なキャッシュを使用 |
| EXEの直接起動・zip作成 | インストーラー不要。通常権限 |
| Firewallルールの追加・削除 | `allow-firewall.ps1` に分離。今回変更していない |
| WebView2・VC++ランタイム・開発ツールの導入 | 不足時だけ公式の導入手順を使う。今回再導入していない |
| 将来のインストーラー | 開発経路と分離。正式配布の要件を別途確認 |

[Microsoftの実行権限の説明](https://learn.microsoft.com/en-us/windows/win32/secbp/running-with-administrator-privileges)では、manifestの `asInvoker` は親と同じトークン、`requireAdministrator` は昇格要求となる。UAC、SmartScreenの警告、Defender検出、Codexのサンドボックス承認を同じ原因と扱わない。

[TauriのWindows配布資料](https://v2.tauri.app/distribute/windows-installer/)にはNSISのユーザー単位インストールがあるが、現在はzipで足りるため、今回インストーラー設定を変更していない。UAC・セキュアデスクトップ・保護機能は変更しない。
