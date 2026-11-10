<# :
@echo off
rem One file: a batch launcher on top, the PowerShell installer below. Double-click to install or update.
set "TOGGLE_SELF=%~f0"
powershell -NoProfile -ExecutionPolicy Bypass -Command "iex ((Get-Content -LiteralPath $env:TOGGLE_SELF -Raw))"
pause
exit /b
#>
# Toggle Creative Studio on Windows, on par with the studio Mac. One file: double-click Install-Toggle.cmd;
# nothing needs to be typed. The studio runs in a light background Ubuntu (WSL), capped so it never slows the computer.
# Safe to run again: it only does what is missing, and doubles as the updater.
$Branch = 'main'; $Distro = 'Ubuntu-24.04'; $Launchers = 'C:\toggle'
# Continue: Windows PowerShell treats any message a program writes to its error stream as a failure; each step
# checks the program's exit code instead.
$ErrorActionPreference = 'Continue'
function Step($t) { Write-Host "`n== $t" -ForegroundColor Cyan }
$Self = Join-Path $Launchers 'Install-Toggle.cmd'
# The installer keeps a copy of itself in C:\toggle (used to continue after the restart and to update).
New-Item -ItemType Directory -Force $Launchers | Out-Null
if ($env:TOGGLE_SELF -and ((Resolve-Path $env:TOGGLE_SELF).Path -ne $Self)) { Copy-Item -Force $env:TOGGLE_SELF $Self }
# Registered WSL distributions are listed in the registry; asking wsl.exe instead would make it wait for a key press
# when WSL is not installed yet.
function Registered { @(Get-ChildItem 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Lxss' -ErrorAction SilentlyContinue | ForEach-Object { (Get-ItemProperty $_.PSPath).DistributionName }) -contains $Distro }
function Ready { if (-not (Registered)) { return $false }; try { '' | & wsl.exe -d $Distro -u root -- true *> $null } catch { return $false }; return $LASTEXITCODE -eq 0 }

Step 'Ubuntu in the background (WSL)'
if (-not (Ready)) {
  Write-Host 'Installing WSL and Ubuntu. Windows asks once for permission.' -ForegroundColor Yellow
  # --no-launch: no Ubuntu window and no user to create; the studio runs as Ubuntu's built-in administrator.
  try { $p = Start-Process wsl.exe -Verb RunAs -Wait -PassThru -ArgumentList "--install -d $Distro --no-launch" } catch { Write-Host 'Windows did not allow the installation. Run the installer again and answer Yes.' -ForegroundColor Red; exit 1 }
  # Older WSL versions do not know --no-launch: then Ubuntu asks for a user name once after the restart.
  if ($p.ExitCode -ne 0) { $p = Start-Process wsl.exe -Verb RunAs -Wait -PassThru -ArgumentList "--install -d $Distro" }
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
rem Starts the studio (keep this window open while you work; close it to stop). The browser opens when it is ready.
start "" /min powershell -NoProfile -WindowStyle Hidden -Command "for(`$i=0;`$i -lt 300;`$i++){try{(New-Object Net.Sockets.TcpClient).Connect('127.0.0.1',3100);break}catch{Start-Sleep 2}};Start-Process 'http://127.0.0.1:3100/settings'"
wsl.exe -d $Distro -u root -- bash -lc "test -x ~/toggle/start.sh && exec ~/toggle/start.sh; echo; echo Setup is not finished yet. Double-click C:\toggle\Install-Toggle.cmd and follow it to the end.; exit 1"
if errorlevel 1 pause
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
# Windows often hides a .txt ending: .env.local.txt, env.local or env.local.txt are taken as the settings file too.
$envFile = Join-Path $Launchers '.env.local'
# The developer's settings file under any name a messenger or browser gave it (doc_2026-...env.local, .env.local.txt,
# env.local): the newest one in C:\toggle, else in Downloads. A newer file replaces an older copy.
$found = @($Launchers, (Join-Path $env:USERPROFILE 'Downloads')) | ForEach-Object { Get-ChildItem -LiteralPath $_ -File -Force -ErrorAction SilentlyContinue } |
  Where-Object { $_.Name -match 'env\.local' -and $_.FullName -ne $envFile -and $_.Length -lt 65536 -and (Select-String -LiteralPath $_.FullName -Pattern '^\s*NEXT_PUBLIC_SUPABASE_URL=\S' -Quiet) } |
  Sort-Object LastWriteTime -Descending | Select-Object -First 1
if ($found -and (-not (Test-Path $envFile) -or $found.LastWriteTime -gt (Get-Item $envFile).LastWriteTime)) { Copy-Item -Force $found.FullName $envFile; Write-Host "Using $($found.FullName) as the settings file." }
if (Test-Path $envFile) { Write-Host "Settings file found: $envFile" -ForegroundColor Green }
if (-not (Test-Path $envFile)) { Write-Host "Tip: put the settings file from the developer at $Launchers\.env.local and it is used automatically." -ForegroundColor Yellow }
wsl.exe -d $Distro -u root -- bash "$wslPath/bootstrap.sh"
if ($LASTEXITCODE -ne 0) { Write-Host "`nSetup stopped before the end (see the message above). Fix it and double-click Install-Toggle.cmd again." -ForegroundColor Red; exit 1 }
Write-Host "`nDone. Start the studio with the 'Toggle Studio' icon on the desktop." -ForegroundColor Green
