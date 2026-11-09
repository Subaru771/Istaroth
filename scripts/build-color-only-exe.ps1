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
    # File presence alone was insufficient: verify the actual bundled HTML is
    # the new color-only UI, not the old illustrated "Your journal" interface.
    node -e 'const a=require("@electron/asar");const read=f=>a.extractFile("dist/win-unpacked/resources/app.asar",f).toString("utf8");const h=read("index.html");const p=JSON.parse(read("package.json"));const c=read("color-only.css");if(p.version!=="1.1.2")throw Error("Wrong bundled version: "+p.version);for(const s of ["Customize Istaroth","ISTAROTH · v1.1.2 · PREFERENCES","layout-rescue.css","color-only.css"]){if(!h.includes(s))throw Error("Missing new UI marker: "+s)}for(const s of ["Your journal, your world.","THE ATELIER · CUSTOMIZE YOUR JOURNAL","data-tab=\"main-wallpaper\"","data-tab=\"mini-wallpaper\""]){if(h.includes(s))throw Error("OLD UI is still bundled: "+s)}if(!c.includes("html .resin-card"))throw Error("Color-only appearance missing");console.log("Packaged Istaroth v1.1.2 contains the actual color-only UI, not the old theme")'
    if ($LASTEXITCODE -ne 0) { throw 'Actual packaged UI version check failed.' }

} finally {
    Pop-Location
}

$iscc = (Get-Command iscc -ErrorAction SilentlyContinue).Source
if (-not $iscc) { $iscc = 'C:\Program Files (x86)\Inno Setup 6\ISCC.exe' }
if (-not (Test-Path $iscc)) { throw 'Inno Setup compiler is missing from the Windows runner.' }
$source = Join-Path $env:GITHUB_WORKSPACE 'app\dist\win-unpacked'
& $iscc '/DAppVersion=1.1.2' "/DAppSource=$source" (Join-Path $env:GITHUB_WORKSPACE 'installer\color-only.iss')
if ($LASTEXITCODE -ne 0) { throw 'Inno Setup compilation failed.' }

$installer = Join-Path $env:GITHUB_WORKSPACE 'app\dist\Istaroth-v1.1.2-Color-Only-Setup-Windows-x64-UNSIGNED.exe'
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

# Inspect the app archive inside the ACTUAL installed EXE, not only the build
# directory. This detects an outdated runtime/shortcut combination.
$installedAsar = Join-Path $installDir 'resources\app.asar'
node -e 'const a=require("./app/node_modules/@electron/asar");const f=process.argv[1];const h=a.extractFile(f,"index.html").toString("utf8");const p=JSON.parse(a.extractFile(f,"package.json").toString("utf8"));if(p.version!=="1.1.2"||!h.includes("ISTAROTH · v1.1.2 · PREFERENCES")||!h.includes("color-only.css")||h.includes("Your journal, your world."))throw Error("Installed executable contains outdated UI: "+p.version);console.log("Installed EXE includes the correct v1.1.2 Settings interface")' $installedAsar
if ($LASTEXITCODE -ne 0) { throw 'Installed UI does not match source.' }

# The old 1.0.x and 1.1.1 installers left shortcuts at the previous location.
# Verify the new install overwrote Istaroth.lnk and targets the new executable.
$shortcut = Join-Path ([Environment]::GetFolderPath('Desktop')) 'Istaroth.lnk'
if (-not (Test-Path -LiteralPath $shortcut)) { throw 'Istaroth desktop shortcut was not created.' }
$wsh = New-Object -ComObject WScript.Shell
$shortcutTarget = $wsh.CreateShortcut($shortcut).TargetPath
$expectedTarget = Join-Path $installDir 'Istaroth.exe'
if (-not [string]::Equals([System.IO.Path]::GetFullPath($shortcutTarget),
                          [System.IO.Path]::GetFullPath($expectedTarget),
                          [StringComparison]::OrdinalIgnoreCase)) {
    throw "Installer desktop shortcut targets the OLD app: $shortcutTarget, expected $expectedTarget"
}
Write-Host "Shortcut points to current version: $shortcutTarget"

$name = Split-Path -Leaf $installer
$hash = (Get-FileHash -LiteralPath $installer -Algorithm SHA256).Hash.ToLowerInvariant()
Set-Content -NoNewline -Encoding ASCII -Path "$installer.sha256" -Value "$hash  $name"
Write-Host "EXE smoke-install successful; SHA256=$hash"
