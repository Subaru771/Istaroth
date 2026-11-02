# Requires an existing, publicly trusted code-signing certificate, Windows SDK SignTool, and Windows.
# Usage: .\scripts\sign-windows-installer.ps1 -CertificateThumbprint 'CERT_SHA1_HEX' -Installer .\Istaroth_Setup_v1.0.exe
[CmdletBinding()]
param(
  [Parameter(Mandatory=$true)][string]$CertificateThumbprint,
  [string]$Installer = '.\Istaroth_Setup_v1.0.exe',
  [string]$TimestampUrl = 'http://timestamp.digicert.com'
)
$ErrorActionPreference = 'Stop'
$thumbprint = ($CertificateThumbprint -replace '\s','').ToUpperInvariant()
if ($thumbprint -notmatch '^[0-9A-F]{40}$') { throw 'Provide a 40-digit hexadecimal SHA-1 certificate thumbprint.' }
$Installer = (Resolve-Path -LiteralPath $Installer).Path
if ([IO.Path]::GetExtension($Installer) -ine '.exe') { throw 'Target is not an EXE.' }
$cert = Get-ChildItem -Path Cert:\CurrentUser\My,Cert:\LocalMachine\My -ErrorAction SilentlyContinue |
  Where-Object { $_.Thumbprint -eq $thumbprint -and $_.HasPrivateKey -and $_.NotAfter -gt (Get-Date) } |
  Select-Object -First 1
if (-not $cert) { throw 'Signing certificate and private key not found in Windows certificate store.' }
$eku = @($cert.EnhancedKeyUsageList | Where-Object { $_.ObjectId -eq '1.3.6.1.5.5.7.3.3' })
if ($eku.Count -eq 0) { throw 'Certificate is not authorized for code signing.' }
$tool = Get-Command signtool.exe -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source -First 1
if (-not $tool) {
  $sdkPath = Join-Path ([Environment]::GetFolderPath('ProgramFilesX86')) 'Windows Kits\10\bin\*\x64\signtool.exe'
  $sdk = @(Get-ChildItem $sdkPath -ErrorAction SilentlyContinue | Sort-Object FullName -Descending)
  if ($sdk.Count) { $tool = $sdk[0].FullName }
}
if (-not $tool) { throw 'SignTool not found. Install Windows SDK signing tools.' }
Write-Host "Signing $Installer using $($cert.Subject)"
& $tool sign /sha1 $thumbprint /fd SHA256 /tr $TimestampUrl /td SHA256 /d Istaroth /du https://github.com/Subaru771/Istaroth $Installer
if ($LASTEXITCODE -ne 0) { throw 'Signing failed.' }
& $tool verify /pa /v $Installer
if ($LASTEXITCODE -ne 0) { throw 'Signature verification failed.' }
$sig = Get-AuthenticodeSignature -LiteralPath $Installer
if ($sig.Status -ne 'Valid') { throw "Signature status: $($sig.Status)" }
$hash = (Get-FileHash -Algorithm SHA256 -LiteralPath $Installer).Hash.ToLowerInvariant()
Set-Content -LiteralPath ($Installer + '.sha256') -Encoding Ascii -Value "$hash  $([IO.Path]::GetFileName($Installer))"
Write-Host "Valid signature. New SHA-256: $hash"
