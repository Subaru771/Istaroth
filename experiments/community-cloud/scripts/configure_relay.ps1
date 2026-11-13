# Istaroth Community optional relay connection. Never changes D1, DATA_KEY, BOT_TOKEN or webhook.
$ErrorActionPreference='Stop'
Set-Location (Resolve-Path (Join-Path $PSScriptRoot '..'))
function Wrangler([string[]]$Arg){
  & npx.cmd --yes wrangler@4.160.0 @Arg
  if($LASTEXITCODE -ne 0){throw 'Cloudflare command did not succeed.'}
}
try{
  Write-Host "`nISTAROTH - CONNECT PRIVATE TELEGRAM RELAY" -ForegroundColor Cyan
  Write-Host 'Use ONLY a relay you control. This script never asks for your BotFather token.'
  if(-not(Get-Command npx.cmd -ErrorAction SilentlyContinue)){throw 'Install Node.js first.'}
  $config=Get-Content 'wrangler.toml' -Raw -Encoding UTF8
  if($config -notmatch 'be0700c0-6848-4ca7-bdba-b3c84313395c'){throw 'Wrong D1 database. Stopping.'}
  if($config -notmatch 'BOT_USERNAME\s*=\s*"Istaroth771_bot"'){throw 'Wrong bot username. Stopping.'}
  $relay=(Read-Host 'Private relay URL (https://your-service.onrender.com)').Trim().TrimEnd('/')
  $uri=$null
  if(-not([uri]::TryCreate($relay,[UriKind]::Absolute,[ref]$uri)) -or $uri.Scheme -ne 'https' -or
     $uri.UserInfo -or $uri.Query -or $uri.Fragment -or $uri.AbsolutePath -ne '/'){
    throw 'Enter only the base HTTPS URL of your own relay (no path, query, or credentials).'
  }
  Write-Host 'Checking the relay health endpoint (the health check does not include credentials)...'
  $health=Invoke-RestMethod -Uri ($relay+'/health') -TimeoutSec 40
  if($health.online -ne $true -or $health.service -ne 'Istaroth Telegram Relay'){throw 'This URL is not an Istaroth private relay.'}
  $secure=Read-Host 'RELAY_KEY exactly as configured at your relay host (hidden)' -AsSecureString
  $ptr=[IntPtr]::Zero
  try{$ptr=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure);$key=[Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)}
  finally{if($ptr -ne [IntPtr]::Zero){[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)}}
  if($key.Length -lt 32 -or $key -notmatch '^[A-Za-z0-9_-]+$'){throw 'RELAY_KEY must be 32+ alphanumeric, underscore or dash characters.'}
  Write-Host '1/3 Checking Cloudflare authorization'
  Wrangler @('whoami')
  Write-Host '2/3 Adding ONLY the relay authentication secret'
  # Write to process stdin, not a command line, environment variable or on-disk temporary file.
  $start=New-Object System.Diagnostics.ProcessStartInfo
  $start.FileName=$env:ComSpec
  $start.Arguments='/d /c npx.cmd --yes wrangler@4.160.0 secret put TELEGRAM_RELAY_KEY'
  $start.UseShellExecute=$false
  $start.RedirectStandardInput=$true
  $start.CreateNoWindow=$false
  $proc=[System.Diagnostics.Process]::Start($start)
  try{
    $proc.StandardInput.WriteLine($key)
    $proc.StandardInput.Close()
    $proc.WaitForExit()
    if($proc.ExitCode -ne 0){throw 'Could not save the relay secret in Cloudflare.'}
  }finally{$proc.Dispose();$key=$null}
  Write-Host '3/3 Updating ONLY the public relay URL and deploying Worker'
  if($config -match '(?m)^TELEGRAM_RELAY_URL\s*='){
    $config=[regex]::Replace($config,'(?m)^TELEGRAM_RELAY_URL\s*=.*$',('TELEGRAM_RELAY_URL = "'+$relay+'"'))
  }else{
    $config=[regex]::Replace($config,'(?m)^(BOT_USERNAME\s*=\s*"[^"]+")$',('$1'+"`n"+'TELEGRAM_RELAY_URL = "'+$relay+'"'))
  }
  [IO.File]::WriteAllText((Join-Path (Get-Location) 'wrangler.toml'),$config,(New-Object System.Text.UTF8Encoding($false)))
  Wrangler @('deploy')
  Write-Host "`nRELAY CONNECTED (delivery not yet verified)." -ForegroundColor Green
  Write-Host 'Open Community and use Send a test notification. Only a successful test confirms delivery.'
} catch{
  Write-Host "`nRELAY SETUP STOPPED: $($_.Exception.Message)" -ForegroundColor Red
  Write-Host 'Your database and DATA_KEY were not deliberately changed.'
  exit 1
}
