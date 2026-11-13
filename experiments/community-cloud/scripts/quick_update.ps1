# Istaroth Community v0.10.1 - existing deployment update only.
# Safe existing-deployment updater. Does not change credentials or activate Telegram.
$ErrorActionPreference='Stop'
Set-Location (Resolve-Path (Join-Path $PSScriptRoot '..'))
$Name='istaroth-community'
$ExpectedDb='be0700c0-6848-4ca7-bdba-b3c84313395c'
$Url='https://istaroth-community.gxcccgx123.workers.dev'
function Wrangler([string[]]$Arg){
    & npx.cmd --yes wrangler@4.160.0 @Arg
    if($LASTEXITCODE -ne 0){throw "Cloudflare command failed: wrangler $($Arg -join ' ')"}
}
try{
 Write-Host "`nISTAROTH - SAFE COMMUNITY UPDATE" -ForegroundColor Cyan
 if(-not(Get-Command npx.cmd -ErrorAction SilentlyContinue)){throw 'Node.js is required. Install from https://nodejs.org.'}
 $config=Get-Content 'wrangler.toml' -Raw -Encoding UTF8
 if($config -notmatch [regex]::Escape($ExpectedDb)){throw 'Database ID does not match your existing account. Stopping to protect D1.'}
 if($config -notmatch 'BOT_USERNAME\s*=\s*"Istaroth771_bot"'){throw 'Bot username is different. Stopping to protect the Telegram setup.'}
 Write-Host '1/3 Checking Cloudflare sign-in'
 Wrangler @('whoami')
 Write-Host '2/3 Applying ONLY additive database migrations'
 Wrangler @('d1','migrations','apply',$Name,'--remote')
 Write-Host '3/3 Uploading new website and Worker code'
 Wrangler @('deploy')
 $health=Invoke-RestMethod -Uri "$Url/health" -Method Get -TimeoutSec 20
 if($health.online -ne $true){throw 'Upload finished but health verification did not succeed.'}
 [IO.File]::WriteAllText((Join-Path (Get-Location) 'COMMUNITY-URL.txt'),$Url+[Environment]::NewLine)
 Write-Host "`nSUCCESS: $Url" -ForegroundColor Green
 Write-Host 'Previous users, D1 database, DATA_KEY, Telegram bot and webhook preserved.'
 Write-Host 'No Telegram activation was attempted, so the previous 502 cannot block this upgrade.'
} catch{
 Write-Host "`nUPDATE STOPPED: $($_.Exception.Message)" -ForegroundColor Red
 Write-Host 'No secrets or D1 databases were intentionally changed.'
 exit 1
}
