$ErrorActionPreference = "Stop"

$BASE = "http://127.0.0.1:3000"

# 讓 cookie（refresh_token）自動保存
$session = New-Object Microsoft.PowerShell.Commands.WebRequestSession

# 測試帳號（避免撞到舊的）
$rand = Get-Random -Minimum 1000 -Maximum 9999
$email = "test$rand@example.com"
$password = "123456"
$username = "tester$rand"

Write-Host "== Register ==" -ForegroundColor Cyan

$registerBody = @{
  email    = $email
  password = $password
  username = $username
} | ConvertTo-Json

$registerResp = Invoke-RestMethod `
  -Uri "$BASE/api/auth/register" `
  -Method POST `
  -ContentType "application/json" `
  -Body $registerBody `
  -WebSession $session

$registerResp | ConvertTo-Json -Depth 5

Write-Host "`n== Login ==" -ForegroundColor Cyan

$loginBody = @{
  email    = $email
  password = $password
} | ConvertTo-Json

$loginResp = Invoke-RestMethod `
  -Uri "$BASE/api/auth/login" `
  -Method POST `
  -ContentType "application/json" `
  -Body $loginBody `
  -WebSession $session

$loginResp | ConvertTo-Json -Depth 5

if (-not $loginResp.accessToken) {
  Write-Host "❌ Login failed: no accessToken" -ForegroundColor Red
  exit 1
}

Write-Host "`n✅ SUCCESS: accessToken received" -ForegroundColor Green
