<#
    setup-https.ps1

    Adds HTTPS (TLS) to the Monty Finance CRM IIS site with a self-signed
    certificate that includes the server IP + hostname, so the app can be served
    over https://. Because the frontend already calls same-origin /api and /files
    (IIS-proxied to the Node API :3001 and the file server :4000), nothing else
    needs to change — TLS is terminated at IIS and proxied internally over http.

    RUN THIS IN AN ELEVATED (Administrator) PowerShell on the server:
      Set-ExecutionPolicy -Scope Process Bypass -Force
      & "c:\Monty Finance CRM\MontyFinanceCRM\deploy\setup-https.ps1"

    After running, import the exported .cer into "Trusted Root Certification
    Authorities" on each CLIENT PC (or push via Group Policy) to remove the
    browser "not trusted" warning. Without that, HTTPS still works but shows a
    one-time trust warning per machine.
#>

$ErrorActionPreference = 'Stop'
Import-Module WebAdministration

# --- Config: adjust if your server IP / hostname differs --------------------
$serverIp = '172.16.78.27'
$hostName = [System.Net.Dns]::GetHostName()   # e.g. the machine name; used as an extra SAN
$siteDir  = 'C:\inetpub\wwwroot\montyfinancecrm'
$certOut  = 'c:\Monty Finance CRM\MontyFinanceCRM\deploy\montycrm-cert.cer'
$httpsPort = 443

function Step($m) { Write-Host "`n=== $m ===" -ForegroundColor Cyan }

# --- 1. Find the IIS site by its physical path ------------------------------
Step 'Locating the IIS site'
$site = Get-Website | Where-Object { $_.PhysicalPath -and ($_.PhysicalPath.TrimEnd('\') -ieq $siteDir.TrimEnd('\')) } | Select-Object -First 1
if (-not $site) {
    # Fallback: the site is very likely named montyfinancecrm / MontyFinanceCRM
    $site = Get-Website | Where-Object { $_.Name -match 'monty' } | Select-Object -First 1
}
if (-not $site) { throw "Could not find the IIS site (physical path $siteDir). List sites with: Get-Website" }
$siteName = $site.Name
Write-Host "Site: $siteName  (bindings: $(($site.Bindings.Collection | ForEach-Object { $_.protocol + '/' + $_.bindingInformation }) -join ', '))" -ForegroundColor Green

# --- 2. Create the self-signed cert with IP + DNS SANs ----------------------
Step 'Creating self-signed certificate (IP + hostname SANs)'
# Reuse an existing cert with the same subject if present (idempotent re-runs).
$subject = 'CN=Monty Finance CRM'
$cert = Get-ChildItem Cert:\LocalMachine\My | Where-Object { $_.Subject -eq $subject -and $_.NotAfter -gt (Get-Date) } | Select-Object -First 1
if ($cert) {
    Write-Host "Reusing existing cert (thumbprint $($cert.Thumbprint))." -ForegroundColor Green
} else {
    $cert = New-SelfSignedCertificate `
        -Subject $subject `
        -CertStoreLocation 'Cert:\LocalMachine\My' `
        -KeyExportPolicy Exportable `
        -KeyLength 2048 -KeyAlgorithm RSA -HashAlgorithm SHA256 `
        -NotAfter (Get-Date).AddYears(5) `
        -TextExtension @("2.5.29.17={text}IPAddress=$serverIp&DNS=$serverIp&DNS=$hostName&DNS=localhost")
    Write-Host "Created cert (thumbprint $($cert.Thumbprint))." -ForegroundColor Green
}

# --- 3. Trust the cert on THIS server (so localhost/self checks pass) --------
Step 'Trusting the certificate on the server (LocalMachine\Root)'
$root = New-Object System.Security.Cryptography.X509Certificates.X509Store('Root','LocalMachine')
$root.Open('ReadWrite'); $root.Add($cert); $root.Close()
Write-Host 'Added to Trusted Root on the server.' -ForegroundColor Green

# --- 4. Bind HTTPS on port 443 and attach the cert --------------------------
Step "Binding HTTPS on port $httpsPort"
$existing = Get-WebBinding -Name $siteName -Protocol https -Port $httpsPort -ErrorAction SilentlyContinue
if (-not $existing) {
    New-WebBinding -Name $siteName -Protocol https -Port $httpsPort -IPAddress '*'
    Write-Host "Added https binding on *:$httpsPort" -ForegroundColor Green
} else {
    Write-Host "https binding on *:$httpsPort already exists." -ForegroundColor Green
}
# Attach the SSL cert to the 0.0.0.0:443 endpoint.
$binding = Get-WebBinding -Name $siteName -Protocol https -Port $httpsPort
$binding.AddSslCertificate($cert.GetCertHashString(), 'My')
Write-Host 'SSL certificate attached to the binding.' -ForegroundColor Green

# --- 5. Export the public cert for client distribution ----------------------
Step 'Exporting public certificate for client PCs'
Export-Certificate -Cert $cert -FilePath $certOut -Force | Out-Null
Write-Host "Exported to: $certOut" -ForegroundColor Green

# --- 6. Self-verify over HTTPS ---------------------------------------------
Step 'Verifying HTTPS locally'
try {
    $r = Invoke-WebRequest -Uri "https://localhost/health" -UseBasicParsing -TimeoutSec 15
    Write-Host "HTTPS HTTP $($r.StatusCode): $($r.Content)" -ForegroundColor Green
} catch {
    Write-Warning "HTTPS health check failed: $($_.Exception.Message)"
    Write-Warning "If this is a connection error, run 'iisreset' and retry. If a 502, confirm MontyFinanceAPI (:3001) is running."
}

Step 'Done'
Write-Host @"
HTTPS is live. Test from a client PC:

  https://$serverIp/           -> the CRM over TLS (upload/download: no more insecure warning)

The browser will warn 'not trusted' until you import the certificate:
  1. Copy $certOut to the client PC.
  2. Double-click -> Install Certificate -> Local Machine ->
     'Place all certificates in the following store' ->
     'Trusted Root Certification Authorities' -> Finish.
  (Or push it to all machines via Group Policy for a clean, warning-free rollout.)

Port 80 (http) still works. To FORCE https, ask to add an HTTP->HTTPS redirect
rule to web.config (kept off by default so the deploy script's http health
check keeps working).
"@ -ForegroundColor Green
