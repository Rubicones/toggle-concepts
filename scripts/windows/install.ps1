# Toggle Creative Studio on Windows, on par with the studio Mac: the studio runs inside WSL (Ubuntu 24.04), where agent
# code gets the same OS sandbox as on macOS. Run in PowerShell (not as admin):
#   powershell -ExecutionPolicy Bypass -File Install-Toggle.ps1
# Run it again after a restart or to update; it only does what is missing.
param([string]$Branch = 'main', [string]$Distro = 'Ubuntu-24.04', [string]$Launchers = 'C:\toggle')
$ErrorActionPreference = 'Stop'
function Step($t) { Write-Host "`n== $t" -ForegroundColor Cyan }

Step 'WSL with Ubuntu'
$distros = ((wsl.exe -l -q 2>$null) -join "`n") -replace "`0", ''
if ($LASTEXITCODE -ne 0 -or $distros -notmatch [regex]::Escape($Distro)) {
  Write-Host 'Installing WSL and Ubuntu (a Windows prompt asks for permission).' -ForegroundColor Yellow
  Start-Process wsl.exe -Verb RunAs -Wait -ArgumentList "--install -d $Distro"
  Write-Host "`nRestart the computer. After the restart an Ubuntu window opens: choose a user name and password (remember the password)." -ForegroundColor Yellow
  Write-Host 'Then run this installer again.' -ForegroundColor Yellow
  exit 0
}
# Windows 11: mirrored networking, so http://127.0.0.1:3100 in Windows reaches the studio in Ubuntu.
$wslconfig = Join-Path $env:USERPROFILE '.wslconfig'
if ([Environment]::OSVersion.Version.Build -ge 22621 -and -not (Test-Path $wslconfig)) {
  "[wsl2]`nnetworkingMode=mirrored`n" | Set-Content -Encoding ASCII $wslconfig; wsl.exe --shutdown
}

Step 'Git for Windows (only for signing in to GitHub from Ubuntu)'
$gcm = 'C:\Program Files\Git\mingw64\bin\git-credential-manager.exe'
if (-not (Test-Path $gcm)) { winget install --id Git.Git -e --source winget --accept-package-agreements --accept-source-agreements }

Step "Launchers in $Launchers"
New-Item -ItemType Directory -Force $Launchers | Out-Null
$bootstrap = @(
  '#!/usr/bin/env bash', 'set -e',
  'git config --global credential.helper "/mnt/c/Program Files/Git/mingw64/bin/git-credential-manager.exe"',
  'mkdir -p ~/toggle && cd ~/toggle',
  '[ -d toggle-concepts/.git ] || git clone https://github.com/Rubicones/toggle-concepts.git',
  "cd toggle-concepts && { git fetch -q origin $Branch && git checkout -q $Branch && git pull -q --ff-only origin $Branch; } || true",
  "BRANCH=$Branch bash scripts/linux/setup.sh"
) -join "`n"
[IO.File]::WriteAllText((Join-Path $Launchers 'bootstrap.sh'), $bootstrap + "`n")
$wslPath = '/mnt/' + $Launchers.Substring(0,1).ToLower() + ($Launchers.Substring(2) -replace '\\','/')
@"
@echo off
rem Starts the studio (keep this window open while you work). The browser opens by itself.
start "" cmd /c "timeout /t 25 >nul & start http://127.0.0.1:3100/settings"
wsl.exe -d $Distro -- bash -lc ~/toggle/start.sh
"@ | Set-Content -Encoding ASCII (Join-Path $Launchers 'Start-Studio.cmd')
@"
@echo off
rem Updates the code to the latest $Branch and everything it needs.
wsl.exe -d $Distro -- bash $wslPath/bootstrap.sh
pause
"@ | Set-Content -Encoding ASCII (Join-Path $Launchers 'Update-Studio.cmd')
@"
@echo off
rem Opens the studio folder (code, .env.local, reports) in Explorer.
explorer.exe \\wsl.localhost\$Distro\home
"@ | Set-Content -Encoding ASCII (Join-Path $Launchers 'Open-Studio-Folder.cmd')

Step 'Studio setup inside Ubuntu (asks for your Ubuntu password; GitHub sign-in opens in the browser)'
wsl.exe -d $Distro -- bash "$wslPath/bootstrap.sh"
Write-Host "`nDone. Start the studio with $Launchers\Start-Studio.cmd" -ForegroundColor Green
