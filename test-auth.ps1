[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

curl.exe --ipv4 -s -D D:\headers.txt -o D:\body.txt `
  -H "Content-Type: application/json" `
  --data-binary "@D:\login.json" `
  http://127.0.0.1:3000/api/auth/login

$access1 = (Get-Content D:\body.txt | ConvertFrom-Json).accessToken
$line = (Get-Content D:\headers.txt | Select-String "Set-Cookie: refresh_token=").Line
$cookie = ($line -replace "^Set-Cookie:\s*", "").Split(";")[0]

curl.exe --ipv4 -s -D D:\headers2.txt -o D:\body2.txt -X POST `
  http://127.0.0.1:3000/api/auth/refresh `
  -H "Cookie: $cookie"

# 取 refresh 回來的 access token
$access2 = (Get-Content D:\body2.txt | ConvertFrom-Json).accessToken

# Debug：印出 token 是否真的有值（只印前 30 字，避免太長）
Write-Host ("access2 length = " + ($access2 | Measure-Object -Character).Characters)
if (-not $access2) {
  Write-Host "ERROR: access2 is EMPTY. body2.txt content:"
  Get-Content D:\body2.txt
  exit 1
}
Write-Host ("access2 prefix: " + $access2.Substring(0,30) + "...")

Write-Host "Planner with access2:"
$resp = curl.exe --ipv4 -s http://127.0.0.1:3000/api/planner -H "Authorization: Bearer $access2"
Write-Host $resp
Write-Host ""


