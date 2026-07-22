# Restarts the MontyFileServer Windows service so it loads the current server.mjs.
# Must run from an ELEVATED shell (service control requires admin).
# Usage (in an Administrator PowerShell):
#   & 'C:\Monty Finance CRM\MontyFinanceCRM\tools\file-server\restart-service.ps1'
$ErrorActionPreference = 'Continue'

function Test-BatchRoute {
  try {
    $r = Invoke-WebRequest -Uri 'http://localhost:4000/provision/batch' -Method POST `
      -Body '{"entity":"lead"}' -ContentType 'application/json' -UseBasicParsing -TimeoutSec 4
    return $r.StatusCode
  } catch {
    if ($_.Exception.Response) { return [int]$_.Exception.Response.StatusCode }
    return 0
  }
}

Write-Host "Restarting MontyFileServer..." -ForegroundColor Cyan

# nssm restart is the normal path; fall back to sc.exe if nssm has any trouble.
& C:\nssm.exe restart MontyFileServer
if ($LASTEXITCODE -ne 0) {
  Write-Host "nssm restart returned $LASTEXITCODE; falling back to sc.exe stop/start" -ForegroundColor Yellow
  & sc.exe stop  MontyFileServer | Out-Null
  Start-Sleep -Seconds 2
  & sc.exe start MontyFileServer | Out-Null
}

# Wait for the new process to come up and start serving the new route.
$code = 0
for ($i = 0; $i -lt 10; $i++) {
  Start-Sleep -Seconds 1
  $code = Test-BatchRoute
  if ($code -eq 401) { break }
}

$owner = (Get-NetTCPConnection -LocalPort 4000 -State Listen -ErrorAction SilentlyContinue).OwningProcess
$proc  = Get-CimInstance Win32_Process -Filter "ProcessId=$owner" -ErrorAction SilentlyContinue

if ($code -eq 401) {
  Write-Host "SUCCESS - /provision/batch is live (HTTP 401 = route present, wants auth)." -ForegroundColor Green
  Write-Host ("File server now PID {0}, started {1}" -f $owner, $proc.CreationDate) -ForegroundColor Green
  Write-Host "Reload the Document Location page and click 'Scan all records'." -ForegroundColor Green
} else {
  Write-Host ("STILL FAILING - batch route returned {0}. File server PID {1} started {2}." -f $code, $owner, $proc.CreationDate) -ForegroundColor Red
  Write-Host "If PID/start time did not change, the shell is not elevated (Run as administrator)." -ForegroundColor Red
}
