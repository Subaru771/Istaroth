# Build the latest Istaroth Windows app without downloading Electron or NSIS again.
# The only runtime source is the SHA-256-verified Istaroth v1.0.1 portable release.
$ErrorActionPreference = 'Stop'
$localElectron = Join-Path $env:GITHUB_WORKSPACE 'app\node_modules\electron\dist'
if (Test-Path (Join-Path $localElectron 'electron.exe')) {
    $runtime = $localElectron
    Write-Host 'Using the already-installed locked Electron runtime (no extra downloads).'
} else {
$asset = 'Istaroth-v1.0.1-Portable-Windows-x64-UNSIGNED.zip'
$bootstrap = Join-Path $env:RUNNER_TEMP 'istaroth-bootstrap'
New-Item -ItemType Directory -Force -Path $bootstrap | Out-Null
$zip = Join-Path $bootstrap $asset

$downloaded = $false
for ($attempt = 1; $attempt -le 4; $attempt++) {
    Write-Host "Downloading verified previous runtime: attempt $attempt"
    gh release download v1.0.1 --repo $env:GITHUB_REPOSITORY --pattern $asset --dir $bootstrap --clobber
    if ($LASTEXITCODE -eq 0 -and (Test-Path -LiteralPath $zip)) {
        $downloaded = $true
        break
    }
    Start-Sleep -Seconds 6
}
if (-not $downloaded) { throw 'Could not download the previously released Electron runtime.' }
$expected = '72cf60ef0a6ded11f6b43e9de29f79f3018130fa127013d33964bad6e9fc62d9'
$actual = (Get-FileHash -LiteralPath $zip -Algorithm SHA256).Hash.ToLowerInvariant()
if ($actual -ne $expected) { throw "Prior release SHA256 mismatch: $actual" }

$unpacked = Join-Path $env:RUNNER_TEMP 'istaroth-electron-dist'
Expand-Archive -LiteralPath $zip -DestinationPath $unpacked -Force
$oldExe = Get-ChildItem -Path $unpacked -Filter Istaroth.exe -File -Recurse | Select-Object -First 1
if (-not $oldExe) { throw 'Previous portable release is missing Istaroth.exe.' }
$runtime = Split-Path -Parent $oldExe.FullName
$asar = Join-Path $runtime 'resources\app.asar'
if (-not (Test-Path $asar)) { throw 'Previous portable release is missing app.asar.' }
Rename-Item -LiteralPath $oldExe.FullName -NewName 'electron.exe'
Remove-Item -LiteralPath $asar -Force
$unpackedAsar = Join-Path $runtime 'resources\app.asar.unpacked'
if (Test-Path $unpackedAsar) { Remove-Item -LiteralPath $unpackedAsar -Force -Recurse }
Write-Host 'Trusted Electron base obtained and verified.'
}

Push-Location (Join-Path $env:GITHUB_WORKSPACE 'app')
try {
    $env:CSC_IDENTITY_AUTO_DISCOVERY = 'false'
    npx electron-builder --win dir --x64 --publish never "--config.electronDist=$runtime"
    if ($LASTEXITCODE -ne 0) { throw 'Repackaging with the existing Electron distribution failed.' }
    $newExe = 'dist\win-unpacked\Istaroth.exe'
    $newAsar = 'dist\win-unpacked\resources\app.asar'
    if (-not (Test-Path $newExe) -or -not (Test-Path $newAsar)) {
        throw 'Repackaged application is incomplete.'
    }
    # The archive must contain the new color-only stylesheet and all start-up sources.
    node -e 'const a=require("@electron/asar");const p=a.listPackage("dist/win-unpacked/resources/app.asar").map(s=>s.replaceAll("\\","/"));for(const f of ["main.js","index.html","color-only.css","settings-compact.css"]){if(!p.some(x=>x.endsWith("/"+f)))throw new Error("Missing packaged source: "+f)}console.log("Packaged sources verified")'
    if ($LASTEXITCODE -ne 0) { throw 'Packaged ASAR content validation failed.' }
} finally {
    Pop-Location
}

$iscc = (Get-Command iscc -ErrorAction SilentlyContinue).Source
if (-not $iscc) { $iscc = 'C:\Program Files (x86)\Inno Setup 6\ISCC.exe' }
if (-not (Test-Path $iscc)) { throw 'Inno Setup compiler is missing from the Windows runner.' }
$source = Join-Path $env:GITHUB_WORKSPACE 'app\dist\win-unpacked'
& $iscc '/DAppVersion=1.1.1' "/DAppSource=$source" (Join-Path $env:GITHUB_WORKSPACE 'installer\color-only.iss')
if ($LASTEXITCODE -ne 0) { throw 'Inno Setup compilation failed.' }

$installer = Join-Path $env:GITHUB_WORKSPACE 'app\dist\Istaroth-v1.1.1-Color-Only-Setup-Windows-x64-UNSIGNED.exe'
if (-not (Test-Path $installer)) { throw 'Installer EXE was not generated.' }
$auth = Get-AuthenticodeSignature $installer
if ($auth.Status -ne 'NotSigned') { throw "Unexpected executable signing state: $($auth.Status)" }

# Verify real installation in an isolated directory (no active GUI launch).
$installDir = Join-Path $env:RUNNER_TEMP 'IstarothColorOnlySmoke'
$p = Start-Process -FilePath $installer -ArgumentList @('/VERYSILENT','/SUPPRESSMSGBOXES','/NORESTART',"/DIR=$installDir") -Wait -PassThru
if ($p.ExitCode -ne 0) { throw "Installer smoke test failed with exit $($p.ExitCode)." }
foreach ($relative in @('Istaroth.exe','resources\app.asar')) {
    if (-not (Test-Path (Join-Path $installDir $relative))) {
        throw "Installed file missing: $relative"
    }
}
$name = Split-Path -Leaf $installer
$hash = (Get-FileHash -LiteralPath $installer -Algorithm SHA256).Hash.ToLowerInvariant()
Set-Content -NoNewline -Encoding ASCII -Path "$installer.sha256" -Value "$hash  $name"
Write-Host "EXE smoke-install successful; SHA256=$hash"
