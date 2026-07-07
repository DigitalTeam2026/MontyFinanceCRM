<#
    setup-iis-reverse-proxy.ps1

    One-time setup so IIS is the single entry point for the Monty Finance CRM:
      - IIS serves the built frontend (static files).
      - IIS reverse-proxies /api, /health and /storage to the local Node API
        (the MontyFinanceAPI service on localhost:3001).

    This removes CORS and the hardcoded IP:port from the browser entirely.

    RUN THIS IN AN ELEVATED (Administrator) PowerShell on the server.
      Right-click PowerShell -> Run as administrator, then:
      Set-ExecutionPolicy -Scope Process Bypass -Force
      & "c:\Monty Finance CRM\MontyFinanceCRM\deploy\setup-iis-reverse-proxy.ps1"
#>

$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$repo    = 'c:\Monty Finance CRM\MontyFinanceCRM'
$dist    = Join-Path $repo 'dist'
$siteDir = 'C:\inetpub\wwwroot\montyfinancecrm'
$appcmd  = Join-Path $env:windir 'system32\inetsrv\appcmd.exe'
$tmp     = Join-Path $env:TEMP 'iis-modules'

function Step($m) { Write-Host "`n=== $m ===" -ForegroundColor Cyan }

# --- 0. sanity ------------------------------------------------------------
if (-not (Test-Path $dist))    { throw "Build output not found at $dist. Run 'npm run build' first." }
if (-not (Test-Path $siteDir)) { throw "IIS site folder not found at $siteDir." }
New-Item -ItemType Directory -Force -Path $tmp | Out-Null

# --- 1. install URL Rewrite + ARR if missing ------------------------------
$rewriteInstalled = Test-Path 'HKLM:\SOFTWARE\Microsoft\IIS Extensions\URL Rewrite'
$arrInstalled     = Test-Path 'HKLM:\SOFTWARE\Microsoft\IIS Extensions\Application Request Routing'

if (-not $rewriteInstalled) {
    Step 'Installing IIS URL Rewrite 2.1'
    $u = 'https://download.microsoft.com/download/1/2/8/128E2E22-C1B9-44A4-BE2A-5859ED1D4592/rewrite_amd64_en-US.msi'
    $f = Join-Path $tmp 'rewrite_amd64_en-US.msi'
    Invoke-WebRequest -Uri $u -OutFile $f
    $p = Start-Process msiexec.exe -ArgumentList "/i `"$f`" /qn /norestart" -Wait -PassThru
    if ($p.ExitCode -ne 0 -and $p.ExitCode -ne 3010) { throw "URL Rewrite install failed (exit $($p.ExitCode))." }
} else { Write-Host 'URL Rewrite already installed.' -ForegroundColor Green }

if (-not $arrInstalled) {
    Step 'Installing Application Request Routing 3.0'
    $u = 'https://download.microsoft.com/download/E/9/8/E9849D6A-020E-47E4-9FD0-A023E99B54EB/requestRouter_amd64.msi'
    $f = Join-Path $tmp 'requestRouter_amd64.msi'
    Invoke-WebRequest -Uri $u -OutFile $f
    $p = Start-Process msiexec.exe -ArgumentList "/i `"$f`" /qn /norestart" -Wait -PassThru
    if ($p.ExitCode -ne 0 -and $p.ExitCode -ne 3010) { throw "ARR install failed (exit $($p.ExitCode))." }
} else { Write-Host 'ARR already installed.' -ForegroundColor Green }

# --- 2. enable the ARR proxy at the server level --------------------------
Step 'Enabling ARR reverse proxy'
& $appcmd set config -section:system.webServer/proxy /enabled:"True" /commit:apphost
# Do not let the proxy rewrite the Host header to localhost for the backend.
& $appcmd set config -section:system.webServer/proxy /preserveHostHeader:"True" /commit:apphost

# --- 3. deploy the freshly built frontend (mirror dist -> site) -----------
Step "Deploying build to $siteDir"
# /MIR mirrors dist into the site folder, removing stale hashed assets.
robocopy $dist $siteDir /MIR /NFL /NDL /NJH /NJS /NP | Out-Null
if ($LASTEXITCODE -ge 8) { throw "robocopy failed (exit $LASTEXITCODE)." }
Write-Host 'Frontend deployed (web.config included).' -ForegroundColor Green

# Keep the IIS proxy target in sync with API_PORT from the single .env.
$apiPort = (((Get-Content (Join-Path $repo '.env')) |
    Where-Object { $_ -match '^\s*API_PORT\s*=' } | Select-Object -First 1) -replace '^\s*API_PORT\s*=\s*','').Trim()
if ($apiPort) {
    $wc = Join-Path $siteDir 'web.config'
    # Only sync the API proxy action (the one that forwards {R:0}). Do NOT touch
    # the file-server rule (localhost:4000/{R:1}) — a blind localhost:\d+ replace
    # would rewrite 4000 -> API port and break document upload/provision.
    (Get-Content $wc -Raw) -replace 'localhost:\d+/\{R:0\}', "localhost:$apiPort/{R:0}" | Set-Content $wc -Encoding UTF8
    Write-Host "web.config API proxy target set to localhost:$apiPort" -ForegroundColor Green
}

# --- 4. restart the Node API service so the CORS change loads -------------
Step 'Restarting MontyFinanceAPI service'
Restart-Service MontyFinanceAPI -Force
Start-Sleep -Seconds 2
(Get-Service MontyFinanceAPI).Status

# --- 5. self-verify the reverse proxy ------------------------------------
Step 'Verifying reverse proxy (http://localhost/health)'
try {
    $r = Invoke-WebRequest -Uri 'http://localhost/health' -UseBasicParsing -TimeoutSec 15
    Write-Host "HTTP $($r.StatusCode): $($r.Content)" -ForegroundColor Green
    if ($r.Content -notmatch '"ok"\s*:\s*true') {
        Write-Warning 'Proxy responded but backend health did not report ok:true. Check the MontyFinanceAPI service.'
    }
} catch {
    Write-Warning "Health check via IIS failed: $($_.Exception.Message)"
    Write-Warning 'If this is a 404/502, run `iisreset` and retry. If 502, confirm the MontyFinanceAPI service is running on port 3001.'
}

Step 'Done'
Write-Host @'
Reverse proxy is live. Test from a browser on the network:

  http://172.16.78.27:8080/          -> the CRM (log in should work now)
  http://172.16.78.27:8080/health    -> {"ok":true,"database":"connected"}

The frontend now calls same-origin /api/* which IIS forwards to localhost:3001.
No CORS, no hardcoded IP. You no longer need to expose port 3001 externally.
'@ -ForegroundColor Green
