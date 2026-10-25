# Re:Cooplay の Windows 配布フォルダ (zip) を作る (#41)
# 先に両方を release ビルドしておく:
#   cargo build --release --locked --manifest-path apps/host-rs/Cargo.toml
#   cargo build --release --locked --manifest-path apps/desktop/Cargo.toml
# 実行:  powershell -ExecutionPolicy Bypass -File scripts\windows\package.ps1 [-Out dist]
#
# 中身 (インストール不要。展開したフォルダから recooplay-desktop.exe を起動する):
#   recooplay-desktop.exe / recooplay-host.exe   アプリと PC ホスト (アプリは同じフォルダのホストを使う)
#   apps\web-static\                              スマホ・PC の画面 (アプリはこのフォルダの場所をルートとして探す)
#   config.example.json                           設定の例 (config.json にコピーして使う)
#   allow-firewall.ps1                            受信の許可 (管理者 PowerShell で実行)
#   README.txt                                    起動・ファイアウォール・注意事項
# ログは展開したフォルダの logs\ に書く。Program Files のような書き込めない場所には置かない。
# WebView2 ランタイムが必要 (Windows 11 は標準で入っている)。Minecraft のファイル・素材は含めない。
param([string]$Out = "dist")

$ErrorActionPreference = "Stop"
$root = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$desktop = Join-Path $root "apps\desktop\target\release\recooplay-desktop.exe"
$host_ = Join-Path $root "apps\host-rs\target\release\recooplay-host.exe"
if ($env:CARGO_TARGET_DIR) {
  $targetDir = [IO.Path]::GetFullPath($env:CARGO_TARGET_DIR)
  $desktop = Join-Path $targetDir "release\recooplay-desktop.exe"
  $host_ = Join-Path $targetDir "release\recooplay-host.exe"
}
foreach ($f in @($desktop, $host_)) {
  if (-not (Test-Path $f)) { throw "$f がありません。先に cargo build --release を実行してください" }
  # zip名のx64と実際の実行ファイルを照合する。誤ったアーキテクチャを配らない。
  $bytes = [IO.File]::ReadAllBytes($f)
  if ($bytes.Length -lt 64 -or $bytes[0] -ne 0x4d -or $bytes[1] -ne 0x5a) { throw "$f はPE実行ファイルではありません" }
  $pe = [BitConverter]::ToInt32($bytes, 0x3c)
  if ($pe -lt 0 -or $pe + 6 -gt $bytes.Length -or [BitConverter]::ToUInt32($bytes, $pe) -ne 0x4550 -or [BitConverter]::ToUInt16($bytes, $pe + 4) -ne 0x8664) {
    throw "$f はWindows x64用ではありません"
  }
}

$version = (Get-Content (Join-Path $root "apps\desktop\tauri.conf.json") -Raw | ConvertFrom-Json).version
if ($version -notmatch '^[0-9A-Za-z.+-]+$') { throw "配布名に使えない版です: $version" }
$commit = (git -C $root rev-parse --short HEAD)
$dirty = if (git -C $root status --porcelain) { "-dirty" } else { "" }
$name = "ReCooplay-$version-windows-x64"
$outDir = [IO.Path]::GetFullPath((Join-Path $root $Out))
$rootPrefix = $root.Path.TrimEnd('\') + '\'
if (-not $outDir.StartsWith($rootPrefix, [StringComparison]::OrdinalIgnoreCase)) { throw "出力先はリポジトリ内の専用フォルダにしてください" }
# 既存の出力やリンク先の内容を削除・上書きしない。
for ($ancestor = [IO.DirectoryInfo]$outDir; $null -ne $ancestor; $ancestor = $ancestor.Parent) {
  if ($ancestor.Exists -and ($ancestor.Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw "リンクされた出力先には書き込めません: $ancestor" }
}
$stage = Join-Path $outDir $name
$zip = Join-Path $outDir "$name.zip"
if ((Test-Path -LiteralPath $stage) -or (Test-Path -LiteralPath $zip)) { throw "配布物が既にあります。-Outで新しい出力先を指定してください: $outDir" }
New-Item -ItemType Directory -Force (Join-Path $stage "apps") | Out-Null

Copy-Item $desktop, $host_ $stage
Copy-Item -Recurse (Join-Path $root "apps\web-static") (Join-Path $stage "apps\web-static")
Copy-Item -Recurse (Join-Path $root "apps\game-profiles") (Join-Path $stage "apps\game-profiles")
Copy-Item (Join-Path $root "config.example.json") $stage
Copy-Item (Join-Path $root "scripts\windows\allow-firewall.ps1") $stage
Copy-Item (Join-Path $root "LICENSE") $stage

@"
Re:Cooplay $version (commit $commit$dirty)
NOT AN OFFICIAL MINECRAFT PRODUCT. NOT APPROVED BY OR ASSOCIATED WITH MOJANG OR MICROSOFT.
Minecraft の公式製品ではありません。Mojang・Microsoft の承認・提携はありません。

■ 起動
  1. このフォルダを書き込みできる場所 (デスクトップ・ドキュメントなど) に展開する
  2. recooplay-desktop.exe をダブルクリックする
  3. 画面の QR コードをスマホで読み取って参加する (PC とスマホを同じ Wi-Fi、または PC のモバイルホットスポットにつなぐ)

■ ファイアウォール (初回だけ)
  スマホから接続できないときは、管理者の PowerShell でこのフォルダを開いて実行する:
    powershell -ExecutionPolicy Bypass -File .\allow-firewall.ps1 -Program .\recooplay-host.exe
  許可はローカルサブネットからだけ。削除: Remove-NetFirewallRule -DisplayName "Re:Cooplay test*"

■ 安全
  - 緊急停止: Ctrl+Alt+F12 (すべてのキー・マウスボタンを離し、ゲームへの入力を OFF にする)
  - ゲームへの入力は「常時ON」かつ Minecraft のウィンドウが前面のときだけ送る
  - ウィンドウを閉じると、押しっぱなしのキーを離してから終了する

■ 設定
  ポートなどを変えるときは config.example.json を config.json にコピーして編集する。

■ 必要なもの
  Windows 11 (WebView2 ランタイム)。Minecraft Java Edition は各自で用意して手動で起動する。

■ 検証状況
  Minecraft・スマホ実機との組み合わせ、開発環境のない PC での起動は検証中。詳しくは
  https://github.com/jphacks/kz_2613 の Issue を参照。
  発表素材の利用条件・公開する責任者と直接連絡先は確認中。公開配布の適合確認は未完了。
"@ | Set-Content -Encoding utf8 (Join-Path $stage "README.txt")

Compress-Archive -Path $stage -DestinationPath $zip
$size = [math]::Round((Get-Item $zip).Length / 1MB, 1)
Write-Host "作成しました: $zip ($size MB, commit $commit$dirty)"
