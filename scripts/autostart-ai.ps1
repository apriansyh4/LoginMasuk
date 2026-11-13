# Start the AR-LOKAL AI (ai-service + tunnel) automatically every time you log in to Windows.
# Usage:  powershell -ExecutionPolicy Bypass -File scripts\autostart-ai.ps1          (turn on)
#         powershell -ExecutionPolicy Bypass -File scripts\autostart-ai.ps1 -Off     (turn off)
param([switch]$Off)
$startup = [Environment]::GetFolderPath('Startup')
$lnk = Join-Path $startup 'AR-LOKAL AI.lnk'
if ($Off) {
  Remove-Item $lnk -ErrorAction SilentlyContinue
  Write-Host 'Nyala otomatis dimatikan.' -ForegroundColor Yellow
  exit 0
}
$shortcut = (New-Object -ComObject WScript.Shell).CreateShortcut($lnk)
$shortcut.TargetPath = 'powershell.exe'
$shortcut.Arguments = '-NoProfile -ExecutionPolicy Bypass -File "' + (Join-Path $PSScriptRoot 'start-ai.ps1') + '"'
$shortcut.WorkingDirectory = Split-Path -Parent $PSScriptRoot
$shortcut.WindowStyle = 7   # minimized
$shortcut.Save()
Write-Host "Nyala otomatis aktif: $lnk" -ForegroundColor Green
Write-Host 'Setiap login Windows, AI dan tunnel akan menyala sendiri (±1-3 menit).' -ForegroundColor Green
