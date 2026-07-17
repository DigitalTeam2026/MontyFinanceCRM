# Installs the Monty document file server as a persistent, auto-starting
# Windows service via nssm — mirrors the existing MontyFinanceAPI service so
# the file server survives reboots and no longer needs a manual `node server.mjs`.
#
# Run ELEVATED (Administrator). Idempotent: re-running reconfigures in place.
#
#   powershell -ExecutionPolicy Bypass -File install-service.ps1

$ErrorActionPreference = 'Stop'

$Nssm    = 'C:\nssm.exe'
$Service = 'MontyFileServer'
$Node    = 'C:\Program Files\nodejs\node.exe'
$AppDir  = 'C:\Monty Finance CRM\MontyFinanceCRM\tools\file-server'
$Script  = 'server.mjs'
$LogDir  = Join-Path $AppDir 'logs'

if (-not (Test-Path $Nssm))   { throw "nssm not found at $Nssm" }
if (-not (Test-Path $Node))   { throw "node not found at $Node" }
if (-not (Test-Path (Join-Path $AppDir $Script))) { throw "$Script not found in $AppDir" }
if (-not (Test-Path $LogDir)) { New-Item -ItemType Directory -Path $LogDir | Out-Null }

# Free port 4000: stop any existing service and kill stray node instances holding it.
if (Get-Service -Name $Service -ErrorAction SilentlyContinue) {
    Write-Host "Stopping existing $Service ..."
    & $Nssm stop $Service | Out-Null
    Start-Sleep -Seconds 1
} else {
    Write-Host "Installing service $Service ..."
    & $Nssm install $Service $Node $Script
}

$owner = Get-NetTCPConnection -LocalPort 4000 -State Listen -ErrorAction SilentlyContinue |
         Select-Object -ExpandProperty OwningProcess -Unique
foreach ($procId in $owner) {
    try { Stop-Process -Id $procId -Force -ErrorAction Stop; Write-Host "Freed port 4000 (killed PID $procId)" } catch {}
}

# (Re)apply configuration — mirrors MontyFinanceAPI.
& $Nssm set $Service Application       $Node
& $Nssm set $Service AppDirectory      $AppDir
& $Nssm set $Service AppParameters     $Script
& $Nssm set $Service Start             SERVICE_DELAYED_AUTO_START
& $Nssm set $Service AppStdout         (Join-Path $LogDir 'file-server.out.log')
& $Nssm set $Service AppStderr         (Join-Path $LogDir 'file-server.err.log')
& $Nssm set $Service AppRotateFiles    1
& $Nssm set $Service AppRotateBytes    10485760
& $Nssm set $Service DisplayName       'MontyFileServer'
& $Nssm set $Service Description       'Monty Finance CRM document file server (port 4000). Provisions record folders and serves uploads via the IIS /files proxy.'

Write-Host "Starting $Service ..."
& $Nssm start $Service
Start-Sleep -Seconds 2

Get-Service $Service | Format-List Name,Status,StartType
Write-Host "Done. Verify: curl http://localhost:4000/  and  http://localhost/files/"
