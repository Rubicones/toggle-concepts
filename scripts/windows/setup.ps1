# Toggle Creative Studio on Windows: one-time setup and update. Safe to run again (it only adds what is missing).
#   powershell -ExecutionPolicy Bypass -File scripts\windows\setup.ps1
# It installs a private Node 22 inside the folder, updates the code to the latest main, installs dependencies,
# prepares .env.local, installs Claude Code, signs you in and checks it (Local mode), and creates Start-Studio.cmd.
# It never reads or copies your Claude token; your keys stay in .env.local on this computer.
param([string]$Branch = 'main', [switch]$SkipClaude)
$ErrorActionPreference = 'Stop'
$Repo = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$Root = Split-Path $Repo -Parent
$NodeVersion = '22.22.0'
$Tools = Join-Path $Root 'tools'
$Node = Join-Path $Tools "node-v$NodeVersion-win-x64"
function Step($text) { Write-Host "`n== $text" -ForegroundColor Cyan }

Step 'Node.js 22 (private copy in tools\, nothing installed system-wide)'
if (-not (Test-Path (Join-Path $Node 'node.exe'))) {
  New-Item -ItemType Directory -Force $Tools | Out-Null
  $zip = Join-Path $env:TEMP "node-v$NodeVersion-win-x64.zip"
  Invoke-WebRequest "https://nodejs.org/dist/v$NodeVersion/node-v$NodeVersion-win-x64.zip" -OutFile $zip
  Expand-Archive $zip -DestinationPath $Tools -Force; Remove-Item $zip
}
$env:Path = "$Node;$env:USERPROFILE\.local\bin;$env:Path"
node --version

Step "Code: latest $Branch"
Push-Location $Repo
git fetch origin $Branch
$dirty = git status --porcelain --untracked-files=no
if ($dirty) { Write-Warning 'There are local code changes; they are kept and the update is skipped. Ask the developer.' }
else { git checkout $Branch; git pull --ff-only origin $Branch }

Step 'Dependencies (npm ci, a few minutes the first time)'
npm.cmd ci --no-audit --no-fund
if ($LASTEXITCODE -ne 0) { throw 'npm ci failed. If it says EPERM/EBUSY, pause Yandex Disk sync and run this script again.' }

Step 'Settings file .env.local'
$envFile = Join-Path $Repo '.env.local'
if (-not (Test-Path $envFile)) {
  $chrome = @("$env:ProgramFiles\Google\Chrome\Application\chrome.exe", "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe", "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe") | Where-Object { Test-Path $_ } | Select-Object -First 1
  @"
# Paste the values from the developer (the same shared Supabase, OpenRouter and R2 as the studio Mac).
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SERVICE_ROLE_KEY=
OPENROUTER_API_KEY=
S3_ENDPOINT=
S3_REGION=auto
S3_BUCKET=
S3_ACCESS_KEY_ID=
S3_SECRET_ACCESS_KEY=
MEDIA_BACKEND=supabase
STUDIO_SHARED_MODE=true
STUDIO_LOCAL_COMPUTE=true
CHROME_PATH=$chrome
"@ | Set-Content -Encoding UTF8 $envFile
  Write-Host 'Created .env.local. Notepad opens now: paste the values from the developer, save, close.' -ForegroundColor Yellow
  Start-Process notepad.exe $envFile -Wait
}
$missing = (Get-Content $envFile) | Where-Object { $_ -match '^(NEXT_PUBLIC_SUPABASE_URL|SUPABASE_SERVICE_ROLE_KEY|OPENROUTER_API_KEY)=\s*$' }
if ($missing) { Write-Warning ".env.local still has empty values: $($missing -join ', '). Fill them and run this script again."; Pop-Location; exit 1 }

if (-not $SkipClaude) {
  Step 'Claude Code (Local mode): install, sign in with your subscription, create this computer''s id'
  # Called through node directly: Windows PowerShell drops a bare `--` before npm arguments.
  node --import tsx apps/local-runner/local-claude/doctor.ts --fix
  $ready = $LASTEXITCODE -eq 0
  if (-not $ready) {
    Write-Host "`nTurn OFF paid extra usage in your Claude account settings ." -ForegroundColor Yellow
    $answer = Read-Host 'Done? Type yes to run the check (about ten short requests on your subscription)'
    if ($answer -eq 'yes') { node --import tsx apps/local-runner/local-claude/doctor.ts --fix --extra-usage-off }
  }
}

Step 'Start-Studio.cmd'
$start = Join-Path $Root 'Start-Studio.cmd'
@"
@echo off
rem Starts the studio at http://127.0.0.1:3100 (keep this window open while you work).
set "PATH=$Node;%USERPROFILE%\.local\bin;%PATH%"
cd /d "$Repo"
start "" cmd /c "timeout /t 20 >nul & start http://127.0.0.1:3100/settings"
npm.cmd run dev:shared
"@ | Set-Content -Encoding ASCII $start
$update = Join-Path $Root 'Update-Studio.cmd'
@"
@echo off
rem Updates the code to the latest main and dependencies, then checks Claude Code again if it changed.
powershell -NoProfile -ExecutionPolicy Bypass -File "$Repo\scripts\windows\setup.ps1"
pause
"@ | Set-Content -Encoding ASCII $update
Pop-Location
Write-Host "`nReady. Start the studio with $start" -ForegroundColor Green
