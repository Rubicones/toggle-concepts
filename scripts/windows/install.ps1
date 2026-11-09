# Toggle Creative Studio on Windows, on par with the studio Mac. Double-click Install-Toggle.cmd (next to this file);
# nothing needs to be typed. The studio runs in a light background Ubuntu (WSL), capped so it never slows the computer.
# Safe to run again: it only does what is missing, and doubles as the updater.
param([string]$Branch = 'main', [string]$Distro = 'Ubuntu-24.04', [string]$Launchers = 'C:\toggle')
$ErrorActionPreference = 'Stop'
function Step($t) { Write-Host "`n== $t" -ForegroundColor Cyan }
$Self = Join-Path $Launchers 'Install-Toggle.cmd'
function Ready { wsl.exe -d $Distro -u root -- true 2>$null; return $LASTEXITCODE -eq 0 }

Step 'Ubuntu in the background (WSL)'
if (-not (Ready)) {
  Write-Host 'Installing WSL and Ubuntu. Windows asks once for permission.' -ForegroundColor Yellow
  # --no-launch: no Ubuntu window and no user to create; the studio runs as Ubuntu's built-in administrator.
  Start-Process wsl.exe -Verb RunAs -Wait -ArgumentList "--install -d $Distro --no-launch"
  if (-not (Ready)) {
    # The first WSL install switches on Windows' virtualization feature, which takes effect after one restart.
    # The installer continues by itself after you sign in again.
    Set-ItemProperty 'HKCU:\Software\Microsoft\Windows\CurrentVersion\RunOnce' 'ToggleStudioInstall' "`"$Self`""
    Add-Type -AssemblyName PresentationFramework
    $answer = [System.Windows.MessageBox]::Show("Windows needs one restart to turn on Ubuntu (only this once).`n`nRestart now? Setup continues by itself after you sign in.", 'Toggle Studio', 'YesNo', 'Question')
    if ($answer -eq 'Yes') { Restart-Computer -Force } else { Write-Host 'Restart later; setup continues by itself after the restart.' }
    exit 0
  }
}

Step 'Limits: Ubuntu never takes the whole computer'
$wslconfig = Join-Path $env:USERPROFILE '.wslconfig'
if (-not (Test-Path $wslconfig)) {
  $ramGb = [math]::Floor((Get-CimInstance Win32_ComputerSystem).TotalPhysicalMemory / 1GB)
  $memGb = [math]::Max(3, [math]::Min(6, [math]::Floor($ramGb / 3)))
  $cpus = [math]::Max(2, [math]::Floor([Environment]::ProcessorCount / 2))
  $lines = @('[wsl2]', "memory=${memGb}GB", "processors=$cpus", 'swap=2GB', 'vmIdleTimeout=60000')
  if ([Environment]::OSVersion.Version.Build -ge 22621) { $lines += 'networkingMode=mirrored'; $lines += '[experimental]'; $lines += 'autoMemoryReclaim=dropcache' }
  ($lines -join "`n") + "`n" | Set-Content -Encoding ASCII $wslconfig; wsl.exe --shutdown
  Write-Host "Ubuntu gets at most ${memGb} GB of $ramGb GB memory and $cpus of $([Environment]::ProcessorCount) cores."
} else { Write-Host "Keeping your existing $wslconfig." }

Step 'Git for Windows (only for the GitHub sign-in)'
if (-not (Test-Path 'C:\Program Files\Git\mingw64\bin\git-credential-manager.exe')) { winget install --id Git.Git -e --source winget --silent --accept-package-agreements --accept-source-agreements }

Step "Launchers in $Launchers"
New-Item -ItemType Directory -Force $Launchers | Out-Null
$wslPath = '/mnt/' + $Launchers.Substring(0,1).ToLower() + ($Launchers.Substring(2) -replace '\\','/')
$bootstrap = @(
  '#!/usr/bin/env bash', 'set -e',
  'git config --global credential.helper "/mnt/c/Program Files/Git/mingw64/bin/git-credential-manager.exe"',
  'mkdir -p ~/toggle && cd ~/toggle',
  '[ -d toggle-concepts/.git ] || git clone https://github.com/Rubicones/toggle-concepts.git',
  "cd toggle-concepts && { git fetch -q origin $Branch && git checkout -q $Branch && git pull -q --ff-only origin $Branch; } || true",
  "ENV_SOURCE=$wslPath/.env.local BRANCH=$Branch bash scripts/linux/setup.sh"
) -join "`n"
[IO.File]::WriteAllText((Join-Path $Launchers 'bootstrap.sh'), $bootstrap + "`n")
@"
@echo off
rem Starts the studio (keep this window open while you work; close it to stop). The browser opens by itself.
start "" cmd /c "timeout /t 25 >nul & start http://127.0.0.1:3100/settings"
wsl.exe -d $Distro -u root -- bash -lc ~/toggle/start.sh
"@ | Set-Content -Encoding ASCII (Join-Path $Launchers 'Start-Studio.cmd')
@"
@echo off
rem Opens the studio folder (code, settings, reports) in Explorer.
explorer.exe \\wsl.localhost\$Distro\root\toggle
"@ | Set-Content -Encoding ASCII (Join-Path $Launchers 'Open-Studio-Folder.cmd')
# A desktop shortcut to start the studio.
$shell = New-Object -ComObject WScript.Shell; $link = $shell.CreateShortcut((Join-Path ([Environment]::GetFolderPath('Desktop')) 'Toggle Studio.lnk'))
$link.TargetPath = Join-Path $Launchers 'Start-Studio.cmd'; $link.WorkingDirectory = $Launchers; $link.Save()

Step 'Studio setup inside Ubuntu (GitHub and Claude sign-ins open in the browser)'
if (-not (Test-Path (Join-Path $Launchers '.env.local'))) { Write-Host "Tip: put the settings file from the developer at $Launchers\.env.local and it is used automatically." -ForegroundColor Yellow }
wsl.exe -d $Distro -u root -- bash "$wslPath/bootstrap.sh"
Write-Host "`nDone. Start the studio with the 'Toggle Studio' icon on the desktop." -ForegroundColor Green
