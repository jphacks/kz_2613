# Re:Cooplay 通信テスト用: Windows Defender Firewall で受信を許可する
# 管理者 PowerShell で実行:  powershell -ExecutionPolicy Bypass -File scripts\allow-firewall.ps1
# 削除:                       Remove-NetFirewallRule -DisplayName "Re:Cooplay test*"
param([int]$Port = 8080)

# ホットスポットの共有ネットワークは「パブリック」扱いになることがあるため全プロファイルで許可する。
# ただし相手はローカルサブネットのみに限定する。
Remove-NetFirewallRule -DisplayName "Re:Cooplay test*" -ErrorAction SilentlyContinue

# Web ページ / WebSocket (TCP)
New-NetFirewallRule -DisplayName "Re:Cooplay test (TCP $Port)" -Direction Inbound -Protocol TCP -LocalPort $Port `
  -RemoteAddress LocalSubnet -Action Allow -Profile Any | Out-Null

# WebRTC データチャネル (UDP, ポートは毎回変わるので node.exe 単位で許可)
$node = (Get-Item (Get-Command node).Source).ResolveLinkTarget($true)
if (-not $node) { $node = Get-Item (Get-Command node).Source }
New-NetFirewallRule -DisplayName "Re:Cooplay test (UDP node)" -Direction Inbound -Protocol UDP -Program $node.FullName `
  -RemoteAddress LocalSubnet -Action Allow -Profile Any | Out-Null

Write-Host "TCP $Port と $($node.FullName) の UDP 受信を許可しました (LocalSubnet のみ)"
