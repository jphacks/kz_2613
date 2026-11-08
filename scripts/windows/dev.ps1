# 通常権限の開発用経路。導入・Firewall変更・昇格・インストーラーは実行しない。
param(
  [ValidateSet('web', 'host', 'desktop', 'verify', 'dry-run')]
  [string]$Task = 'web'
)
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path

function Invoke-Checked([string]$Program, [string[]]$Arguments) {
  & $Program @Arguments
  if ($LASTEXITCODE -ne 0) { throw "$Program が終了コード $LASTEXITCODE で失敗しました" }
}

# 既存のユーザー領域ツール・ビルドキャッシュだけを使う。
$tools = Join-Path $env:LOCALAPPDATA 'ReCooplay'
if (-not $env:CARGO_TARGET_DIR) { $env:CARGO_TARGET_DIR = Join-Path $tools 'cargo-target' }
$candidates = @(
  (Join-Path $env:USERPROFILE '.cargo\bin'),
  (Join-Path $tools 'StrawberryPerl\perl\bin'),
  'C:\Program Files\Microsoft Visual Studio\2022\Community\Common7\IDE\CommonExtensions\Microsoft\CMake\CMake\bin'
)
$env:PATH = (@($candidates | Where-Object { Test-Path -LiteralPath $_ }) -join ';') + ';' + $env:PATH
if (-not $env:LIBCLANG_PATH) {
  $clang = Join-Path $tools 'tools-venv\Lib\site-packages\clang\native'
  if (Test-Path -LiteralPath $clang) { $env:LIBCLANG_PATH = $clang }
}
Push-Location $root
try {
  switch ($Task) {
    'web' {
      if (-not (Test-Path 'apps/web/node_modules/.package-lock.json')) {
        throw '先に apps/web で npm ci を実行してください。開発コマンドではツールを自動導入しません。'
      }
      Invoke-Checked 'npm.cmd' @('run', 'build', '--prefix', 'apps/web')
    }
    'host' { Invoke-Checked 'cargo' @('build', '--release', '--locked', '--manifest-path', 'apps/host-rs/Cargo.toml') }
    'desktop' { Invoke-Checked 'cargo' @('build', '--release', '--locked', '--manifest-path', 'apps/desktop/Cargo.toml') }
    'verify' {
      Invoke-Checked 'npm.cmd' @('run', 'typecheck', '--prefix', 'apps/web')
      Invoke-Checked 'node' @('--experimental-strip-types', 'scripts/sim/controller-layout-test.mjs')
      Invoke-Checked 'node' @('scripts/sim/phone-lifecycle-test.mjs')
      Invoke-Checked 'node' @('scripts/sim/phone-session-test.mjs')
      Invoke-Checked 'node' @('scripts/sim/protocol-boundary-test.mjs')
    }
    'dry-run' {
      $bin = Join-Path $env:CARGO_TARGET_DIR 'release\recooplay-host.exe'
      if (-not (Test-Path -LiteralPath $bin)) { throw '先に -Task host でビルドしてください' }
      $env:RECOOPLAY_ROOT = $root
      $env:RECOOPLAY_DRY_RUN = '1'
      $env:RECOOPLAY_NO_CONFIG = '1'
      $env:RECOOPLAY_STDIN_CONTROL = '1'
      $env:PORT = '0'
      Write-Host '無注入ホストを起動します。表示ポートの /phone-react.html を開き、quit またはCtrl+Cで終了します。'
      Invoke-Checked $bin @()
    }
  }
} finally { Pop-Location }
