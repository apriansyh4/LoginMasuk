# Starts the AR-LOKAL ai-service and a Cloudflare quick tunnel in two windows (Windows).
# Usage: double-click scripts\start-ai.cmd  (or: powershell -ExecutionPolicy Bypass -File scripts\start-ai.ps1)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$ai = Join-Path $root 'ai-service'
$envFile = Join-Path $ai 'ai.env'

if (-not (Test-Path $envFile)) {
  Copy-Item (Join-Path $ai 'ai.env.example') $envFile
  Write-Host "Dibuat: $envFile" -ForegroundColor Yellow
  Write-Host 'Isi nilainya (secret, Supabase URL & secret key), simpan, lalu jalankan script ini lagi.' -ForegroundColor Yellow
  notepad $envFile
  exit 1
}
foreach ($line in Get-Content $envFile) {
  if ($line -match '^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$') {
    [Environment]::SetEnvironmentVariable($Matches[1], $Matches[2].Trim(), 'Process')
  }
}
foreach ($k in 'AILOKAL_SERVICE_SECRET', 'AILOKAL_SUPABASE_URL', 'AILOKAL_SUPABASE_SERVICE_KEY') {
  if (-not [Environment]::GetEnvironmentVariable($k, 'Process')) { throw "$k kosong di $envFile" }
}
if (-not (Test-Path (Join-Path $ai '.venv\Scripts\Activate.ps1'))) { throw 'ai-service\.venv belum dibuat (lihat README).' }

# refresh PATH so a freshly installed cloudflared is found
$env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User')

$running = $false
try {
  Invoke-RestMethod http://localhost:8000/health -Headers @{ 'x-service-token' = $env:AILOKAL_SERVICE_SECRET } -TimeoutSec 3 | Out-Null
  $running = $true
  Write-Host 'ai-service sudah berjalan, tidak dijalankan dua kali.' -ForegroundColor Yellow
} catch { }
if (-not $running) {
  Start-Process powershell -WorkingDirectory $ai -WindowStyle Minimized -ArgumentList @('-NoExit', '-ExecutionPolicy', 'Bypass', '-Command',
    '$host.UI.RawUI.WindowTitle = ''AR-LOKAL ai-service''; .\.venv\Scripts\Activate.ps1; uvicorn ai_service.app:app --port 8000')
}

Write-Host 'Menunggu ai-service siap (model dimuat)...'
$ok = $false
for ($i = 0; $i -lt 180; $i++) {
  Start-Sleep -Seconds 2
  try {
    $h = Invoke-RestMethod http://localhost:8000/health -Headers @{ 'x-service-token' = $env:AILOKAL_SERVICE_SECRET } -TimeoutSec 5
    $ok = $true; break
  } catch { }
}
if (-not $ok) { throw 'ai-service tidak merespons. Lihat jendela "AR-LOKAL ai-service".' }
Write-Host ("Validasi: {0} | 3D: {1} ({2}) | mode CPU: {3}" -f $h.validationAvailable, $h.reconstructionAvailable, $h.reconstructionReason, $h.cpuMode) -ForegroundColor Green

$ngrokDomain = [Environment]::GetEnvironmentVariable('NGROK_DOMAIN', 'Process')
if ($ngrokDomain) {
  # Fixed address: Vercel's AI_SERVICE_URL never has to change.
  $ngrokDomain = $ngrokDomain -replace '^https?://', '' -replace '/$', ''
  if (-not (Get-Command ngrok -ErrorAction SilentlyContinue)) { throw 'ngrok belum terpasang. Jalankan: winget install ngrok.ngrok' }
  if (Get-Process ngrok -ErrorAction SilentlyContinue) {
    Write-Host 'ngrok sudah berjalan.' -ForegroundColor Yellow
  } else {
    Start-Process powershell -WindowStyle Minimized -ArgumentList @('-NoExit', '-ExecutionPolicy', 'Bypass', '-Command',
      "`$host.UI.RawUI.WindowTitle = 'AR-LOKAL tunnel'; ngrok http --url=https://$ngrokDomain 8000")
  }
  Write-Host ''
  Write-Host "AI aktif di alamat tetap: https://$ngrokDomain" -ForegroundColor Cyan
  Write-Host 'Alamat ini tidak berubah; AI_SERVICE_URL di Vercel cukup diisi sekali. Jendela boleh di-minimize, jangan ditutup.' -ForegroundColor Cyan
} else {
  Start-Process powershell -ArgumentList @('-NoExit', '-ExecutionPolicy', 'Bypass', '-Command',
    '$host.UI.RawUI.WindowTitle = ''AR-LOKAL tunnel''; cloudflared tunnel --protocol http2 --url http://localhost:8000')
  Write-Host ''
  Write-Host 'Di jendela "AR-LOKAL tunnel", salin alamat https://....trycloudflare.com' -ForegroundColor Cyan
  Write-Host 'lalu isi AI_SERVICE_URL di Vercel dan Redeploy. Jangan tutup kedua jendela.' -ForegroundColor Cyan
}
