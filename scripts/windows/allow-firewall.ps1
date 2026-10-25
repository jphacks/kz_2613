# Re:Cooplay 通信テスト用: Windows Defender Firewall で受信を許可する
# 管理者 PowerShell で実行:  powershell -ExecutionPolicy Bypass -File scripts\windows\allow-firewall.ps1 [-Program <ホストの exe>]
#   -Program 省略時は Rust 版ホスト (apps\host-rs\target\release\recooplay-host.exe)
# 削除:                       Remove-NetFirewallRule -DisplayName "Re:Cooplay test*"
param([int]$Port = 8080, [string]$Program = "")

# ホットスポットの共有ネットワークは「パブリック」扱いになることがあるため全プロファイルで許可する。
# ただし相手はローカルサブネットのみに限定する。
Remove-NetFirewallRule -DisplayName "Re:Cooplay test*" -ErrorAction SilentlyContinue

# Web ページ / WebSocket (TCP)
New-NetFirewallRule -DisplayName "Re:Cooplay test (TCP $Port)" -Direction Inbound -Protocol TCP -LocalPort $Port `
  -RemoteAddress LocalSubnet -Action Allow -Profile Any | Out-Null

# WebRTC データチャネル (UDP, ポートは毎回変わるので実行ファイル単位で許可)
if (-not $Program) {
  $Program = Join-Path $PSScriptRoot "..\..\apps\host-rs\target\release\recooplay-host.exe"
}
$exe = Get-Item $Program
New-NetFirewallRule -DisplayName "Re:Cooplay test (UDP $($exe.Name))" -Direction Inbound -Protocol UDP -Program $exe.FullName `
  -RemoteAddress LocalSubnet -Action Allow -Profile Any | Out-Null

Write-Host "TCP $Port と $($exe.FullName) の UDP 受信を許可しました (LocalSubnet のみ)"
