# Re:Cooplay の Windows インストーラー (setup.exe) を作る (#219)
# 先に package.ps1 で配布フォルダとzipを作っておく。インストーラーにはそのフォルダをそのまま入れるので、
# zipとインストーラーの同梱物・版・commitは必ず一致する (package-manifest.json も同梱される)。
# 実行:  powershell -ExecutionPolicy Bypass -File scripts\windows\build-installer.ps1 [-Out dist]
# NSIS 3 (makensis) が必要。MAKENSIS → PATH → Program Files の NSIS の順に探す。
# 出力: <Out>\ReCooplay-<版>-windows-x64-setup.exe と .sha256
param([string]$Out = "dist")

$ErrorActionPreference = "Stop"
$root = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$version = (Get-Content (Join-Path $root "apps\desktop\tauri.conf.json") -Raw | ConvertFrom-Json).version
# Windowsのファイルの版 (a.b.c.d) に変換できる版だけを受け付ける
if ($version -notmatch '^\d+\.\d+\.\d+$') { throw "インストーラーの版は 数字.数字.数字 にしてください: $version" }
$name = "ReCooplay-$version-windows-x64"
$outDir = [IO.Path]::GetFullPath((Join-Path $root $Out))
$stage = Join-Path $outDir $name
$manifest = Join-Path $stage "package-manifest.json"
if (-not (Test-Path -LiteralPath $manifest)) { throw "$stage がありません。先に scripts\windows\package.ps1 -Out $Out を実行してください" }
$setup = Join-Path $outDir "$name-setup.exe"
if (Test-Path -LiteralPath $setup) { throw "インストーラーが既にあります。-Outで新しい出力先を指定してください: $setup" }

$makensis = $null
foreach ($candidate in @($env:MAKENSIS, (Get-Command makensis.exe -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty Source),
    (Join-Path ${env:ProgramFiles(x86)} "NSIS\makensis.exe"), (Join-Path $env:ProgramFiles "NSIS\makensis.exe"))) {
  if ($candidate -and (Test-Path -LiteralPath $candidate)) { $makensis = $candidate; break }
}
if (-not $makensis) { throw "makensis.exe (NSIS 3) が見つかりません。NSIS を導入するか MAKENSIS で場所を指定してください" }

$icon = Join-Path $root "apps\desktop\icons\icon.ico"
$script = Join-Path $PSScriptRoot "installer.nsi"
& $makensis /V2 /INPUTCHARSET UTF8 "/DVERSION=$version" "/DVIVERSION=$version.0" "/DSRC=$stage" "/DOUTFILE=$setup" "/DICON=$icon" $script
if ($LASTEXITCODE -ne 0) { throw "makensis が失敗しました (終了コード $LASTEXITCODE)" }
if (-not (Test-Path -LiteralPath $setup)) { throw "インストーラーが作られていません: $setup" }

$hash = (Get-FileHash -LiteralPath $setup -Algorithm SHA256).Hash.ToLowerInvariant()
"$hash  $name-setup.exe" | Set-Content -Encoding ascii "$setup.sha256"
$size = [math]::Round((Get-Item -LiteralPath $setup).Length / 1MB, 1)
Write-Host "作成しました: $setup ($size MB)"
