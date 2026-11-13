# 分担のモデルの版2 (多言語 MiniLM の小型版、#430) を Hugging Face から取得し、SHA-256 を確かめる。
# 取得元・版・ファイルは preset-model-v2.json に固定する (版を変えるときは、そのファイルのハッシュも更新する)。
# 重みは CC BY-NC-ND 4.0 (text-encoder.bin とトークナイザーは Apache-2.0 の改変物) なので、ライセンス表示のファイルも一緒に取る。
#   配布物へ:  powershell -ExecutionPolicy Bypass -File scripts\windows\fetch-preset-model.ps1 -Dest <フォルダ>
#   試験用:    ... -Dest data\local\preset-model\export-v2 -IncludeTests   (照合の正解 parity.json も取る)
# 同じハッシュのファイルが既にあれば取り直さない。
param(
  [Parameter(Mandatory = $true)][string]$Dest,
  [switch]$IncludeTests
)

$ErrorActionPreference = "Stop"
$manifest = Get-Content -Raw -Encoding utf8 (Join-Path $PSScriptRoot "preset-model-v2.json") | ConvertFrom-Json
if ($manifest.repo -notmatch '^[A-Za-z0-9._-]+/[A-Za-z0-9._-]+$' -or $manifest.revision -notmatch '^[0-9a-f]{40}$') {
  throw "preset-model-v2.json の取得元・版が不正です"
}
New-Item -ItemType Directory -Force $Dest | Out-Null
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$ProgressPreference = "SilentlyContinue"
foreach ($p in $manifest.files.PSObject.Properties) {
  $name = $p.Name
  $info = $p.Value
  if (-not $info.bundle -and -not $IncludeTests) { continue }
  if ($name -notmatch '^[A-Za-z0-9._-]+$') { throw "ファイル名が不正です: $name" }
  $out = Join-Path $Dest $name
  if ((Test-Path -LiteralPath $out) -and (Get-FileHash -LiteralPath $out -Algorithm SHA256).Hash.ToLowerInvariant() -eq $info.sha256) {
    continue
  }
  $url = "https://huggingface.co/$($manifest.repo)/resolve/$($manifest.revision)/$name"
  $tmp = "$out.download"
  Invoke-WebRequest -UseBasicParsing -Uri $url -OutFile $tmp
  $hash = (Get-FileHash -LiteralPath $tmp -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($hash -ne $info.sha256) {
    Remove-Item -LiteralPath $tmp -Force
    throw "SHA-256 が一致しません: $name ($hash)"
  }
  Move-Item -LiteralPath $tmp -Destination $out -Force
}
Write-Output "分担のモデル (版2) を確認しました: $Dest"
