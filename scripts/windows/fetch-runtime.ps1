# Re:Cooplay インストーラー用：必須ランタイムをMicrosoft公式の配布元から取得し、Microsoftの署名を確かめる (#219)
# インストーラーが、本人の同意を得た後にだけ呼ぶ。取得先は下の2つに固定し、ほかのURLは拒否する。
#   取得と確認:   powershell -NoProfile -ExecutionPolicy Bypass -File fetch-runtime.ps1 -Url <URL> -Out <保存先>
#   確認だけ:     powershell -NoProfile -ExecutionPolicy Bypass -File fetch-runtime.ps1 -Out <ファイル> -VerifyOnly
# 終了コード: 0=取得・署名確認OK / 1=取得失敗 / 2=許可していない取得元 / 3=Microsoftの署名を確認できない (ファイルは消す)
# 出力はインストーラーがそのまま記録するため、文字化けしないよう英数字だけにする。
param(
  [Parameter(Mandatory = $true)][string]$Out,
  [string]$Url = "",
  [switch]$VerifyOnly
)

$ErrorActionPreference = "Stop"
$allowed = @(
  # Microsoft Visual C++ v14 Redistributable (x64) の最新版
  "https://aka.ms/vs/17/release/vc_redist.x64.exe",
  # WebView2 ランタイムの Evergreen Bootstrapper
  "https://go.microsoft.com/fwlink/p/?LinkId=2124703"
)

try {
  if (-not $VerifyOnly) {
    if ($allowed -notcontains $Url) { Write-Output "REJECTED-URL $Url"; exit 2 }
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    $ProgressPreference = "SilentlyContinue"
    Invoke-WebRequest -UseBasicParsing -Uri $Url -OutFile $Out
  }
  # 埋め込みのAuthenticode署名が有効で、署名者がMicrosoft Corporationのときだけ実行を許す。
  # カタログ署名 (OS同梱のファイル) は、取得したインストーラーでは使われないので受け付けない。
  $sig = Get-AuthenticodeSignature -LiteralPath $Out
  $subject = if ($sig.SignerCertificate) { $sig.SignerCertificate.Subject } else { "" }
  $type = if ($sig.PSObject.Properties["SignatureType"]) { [string]$sig.SignatureType } else { "Authenticode" }
  if ($sig.Status -ne "Valid" -or $type -ne "Authenticode" -or $subject -notmatch '(^|,\s*)O=Microsoft Corporation(,|$)') {
    if (-not $VerifyOnly) { Remove-Item -LiteralPath $Out -Force -ErrorAction SilentlyContinue }
    Write-Output "BAD-SIGNATURE status=$($sig.Status) type=$type"
    exit 3
  }
  Write-Output "OK"
  exit 0
} catch {
  if (-not $VerifyOnly) { Remove-Item -LiteralPath $Out -Force -ErrorAction SilentlyContinue }
  Write-Output "FETCH-FAILED $($_.Exception.GetType().Name)"
  exit 1
}
