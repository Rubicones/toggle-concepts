<# :
@echo off
chcp 65001 >nul
rem Forma Studio: install or update. Double-click; nothing needs to be typed except your name once.
set "FORMA_SELF=%~f0"
powershell -NoProfile -ExecutionPolicy Bypass -Command "iex ((Get-Content -LiteralPath $env:FORMA_SELF -Raw -Encoding UTF8))"
pause
exit /b
#>
# Forma Studio на Windows: установка и обновление одним файлом. Двойной клик по Install-Forma.cmd; можно запускать
# сколько угодно раз: делает только недостающее и заодно обновляет код. Forma работает в том же фоновом Ubuntu (WSL),
# что и прежняя студия Toggle. Старые файлы Toggle из C:\toggle переносятся в C:\toggle\old-toggle-studio.
$ErrorActionPreference = 'Continue'
$Distro = 'Ubuntu-24.04'; $Dir = 'C:\toggle'; $Old = Join-Path $Dir 'old-toggle-studio'; $Branch = 'main'
function Step($t) { Write-Host "`n== $t" -ForegroundColor Cyan }
New-Item -ItemType Directory -Force $Dir | Out-Null
$Self = Join-Path $Dir 'Install-Forma.cmd'
if ($env:FORMA_SELF -and ((Resolve-Path $env:FORMA_SELF).Path -ne $Self)) { Copy-Item -Force $env:FORMA_SELF $Self }

Step 'Старая студия Toggle: в папку old-toggle-studio'
$toggleItems = 'Install-Toggle.cmd','Start-Studio.cmd','Open-Studio-Folder.cmd','Update-Database.cmd','Repair-Database.cmd','Export-Last-Run.cmd','Check-Pictures.cmd','bootstrap.sh','branch.txt','exports'
$moved = @()
Get-ChildItem -LiteralPath $Dir -Force | Where-Object {
  ($toggleItems -contains $_.Name) -or ($_.Name -match 'env\.local' -and -not $_.PSIsContainer -and -not (Select-String -LiteralPath $_.FullName -Pattern '^\s*FORMA_STORE=' -Quiet))
} | ForEach-Object {
  New-Item -ItemType Directory -Force $Old | Out-Null
  $target = Join-Path $Old $_.Name
  if (Test-Path -LiteralPath $target) { $target = Join-Path $Old ($_.BaseName + '-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + $_.Extension) }
  Move-Item -LiteralPath $_.FullName -Destination $target; $moved += $_.Name
}
if ($moved.Count) {
  Write-Host ("Перенесено: " + ($moved -join ', '))
  "Прежняя студия Toggle. Её запуск: Start-Studio.cmd в этой папке. Сама студия (код и данные) лежит в Ubuntu: \\wsl.localhost\$Distro\root\toggle.`r`nInstall-Toggle.cmd больше не запускайте: он вернёт свои файлы в C:\toggle." | Set-Content -Encoding UTF8 (Join-Path $Old 'README.txt')
  $lnk = Join-Path ([Environment]::GetFolderPath('Desktop')) 'Toggle Studio.lnk'
  if ((Test-Path $lnk) -and (Test-Path (Join-Path $Old 'Start-Studio.cmd'))) { $l = (New-Object -ComObject WScript.Shell).CreateShortcut($lnk); $l.TargetPath = Join-Path $Old 'Start-Studio.cmd'; $l.WorkingDirectory = $Old; $l.Save() }
} else { Write-Host 'Переносить нечего.' }
Remove-ItemProperty 'HKCU:\Software\Microsoft\Windows\CurrentVersion\RunOnce' 'ToggleStudioInstall' -ErrorAction SilentlyContinue

Step 'Ubuntu в фоне (WSL)'
function Registered { @(Get-ChildItem 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Lxss' -ErrorAction SilentlyContinue | ForEach-Object { (Get-ItemProperty $_.PSPath).DistributionName }) -contains $Distro }
function Ready { if (-not (Registered)) { return $false }; try { '' | & wsl.exe -d $Distro -u root -- true *> $null } catch { return $false }; return $LASTEXITCODE -eq 0 }
if (-not (Ready)) {
  Write-Host 'Устанавливаю WSL и Ubuntu. Windows один раз спросит разрешение.' -ForegroundColor Yellow
  try { $p = Start-Process wsl.exe -Verb RunAs -Wait -PassThru -ArgumentList "--install -d $Distro --no-launch" } catch { Write-Host 'Windows не разрешила установку. Запустите установщик снова и ответьте «Да».' -ForegroundColor Red; exit 1 }
  if ($p.ExitCode -ne 0) { Start-Process wsl.exe -Verb RunAs -Wait -ArgumentList "--install -d $Distro" | Out-Null }
  if (-not (Ready)) {
    Set-ItemProperty 'HKCU:\Software\Microsoft\Windows\CurrentVersion\RunOnce' 'FormaStudioInstall' "`"$Self`""
    Write-Host 'Нужна одна перезагрузка Windows. После входа установка продолжится сама.' -ForegroundColor Yellow; exit 0
  }
}
Write-Host 'Ubuntu готов.'

Step 'Сеть: браузер Windows видит Forma внутри Ubuntu'
# Forma слушает только 127.0.0.1 (так работает вход в Claude по подписке). Браузеру Windows этот адрес доступен в
# «зеркальном» режиме сети WSL (Windows 11 22H2 и новее).
$wslconfig = Join-Path $env:USERPROFILE '.wslconfig'
if ([Environment]::OSVersion.Version.Build -ge 22621) {
  $text = if (Test-Path $wslconfig) { Get-Content -Raw $wslconfig } else { '' }
  if ($null -eq $text) { $text = '' }
  if ($text -notmatch '(?m)^\s*networkingMode\s*=\s*mirrored') {
    if ($text -match '(?m)^\s*networkingMode\s*=') { $text = $text -replace '(?m)^\s*networkingMode\s*=[^\r\n]*', 'networkingMode=mirrored' }
    elseif ($text -match '(?m)^\[wsl2\]') { $text = $text -replace '(?m)^\[wsl2\][ \t]*(?=\r?$)', "[wsl2]`r`nnetworkingMode=mirrored" }
    else { $text = "[wsl2]`r`nnetworkingMode=mirrored`r`n" + $text }
    Set-Content -Encoding ASCII -NoNewline -Path $wslconfig -Value $text; wsl.exe --shutdown
    Write-Host 'Включён зеркальный режим сети WSL (Ubuntu перезапущен).' -ForegroundColor Green
  } else { Write-Host 'Уже настроено.' }
} else { Write-Host 'Windows старше 11 22H2: если браузер не откроет Forma, напишите в чат, что видите.' -ForegroundColor Yellow }

Step 'Файл настроек'
$envFile = Join-Path $Dir 'forma.env'
# Файл от Димы под любым именем (doc_....env, .env, forma.env.txt): самый новый в C:\toggle или в «Загрузках»,
# в котором есть строка FORMA_STORE=. Более новый заменяет прежний.
$found = @($Dir, (Join-Path $env:USERPROFILE 'Downloads')) | ForEach-Object { Get-ChildItem -LiteralPath $_ -File -Force -ErrorAction SilentlyContinue } |
  Where-Object { $_.FullName -ne $envFile -and $_.Length -lt 65536 -and $_.Extension -notin '.cmd','.sh','.lnk','.ps1' -and (Select-String -LiteralPath $_.FullName -Pattern '^\s*FORMA_STORE=' -Quiet) } |
  Sort-Object LastWriteTime -Descending | Select-Object -First 1
if ($found -and (-not (Test-Path $envFile) -or $found.LastWriteTime -gt (Get-Item $envFile).LastWriteTime)) { Copy-Item -Force $found.FullName $envFile; Write-Host "Настройки взяты из $($found.FullName)" }
if (Test-Path $envFile) {
  $text = [IO.File]::ReadAllText($envFile)
  $current = if ($text -match '(?m)^FORMA_AUTHOR=([^#\r\n]*)') { $Matches[1].Trim() } else { '' }
  $authorFile = Join-Path $Dir 'forma-author.txt'
  $author = if (Test-Path $authorFile) { (Get-Content -LiteralPath $authorFile -TotalCount 1 -Encoding UTF8).Trim() } else { '' }
  if (-not $author) {
    $answer = Read-Host "Ваше имя: им подписываются ваши запуски в общей базе (Enter — оставить «$current»)"
    $author = if ($answer.Trim()) { $answer.Trim() } else { $current }
    if ($author) { [IO.File]::WriteAllText($authorFile, $author) }
  }
  if ($author -and $author -ne $current) {
    if ($text -match '(?m)^FORMA_AUTHOR=') { $text = [regex]::Replace($text, '(?m)^FORMA_AUTHOR=[^\r\n]*', "FORMA_AUTHOR=$author") } else { $text += "`nFORMA_AUTHOR=$author`n" }
    [IO.File]::WriteAllText($envFile, $text, (New-Object Text.UTF8Encoding $false))
  }
  Write-Host "Настройки: $envFile (автор: $author)" -ForegroundColor Green
} else { Write-Host "Файла настроек нет. Положите файл от Димы в $Dir и запустите установщик ещё раз. Без него Forma работает только в тестовом режиме." -ForegroundColor Yellow }

$BranchFile = Join-Path $Dir 'forma-branch.txt'
if (Test-Path $BranchFile) { $Named = (Get-Content -LiteralPath $BranchFile -TotalCount 1).Trim(); if ($Named -match '^[A-Za-z0-9._/-]+$') { $Branch = $Named } }
Write-Host "Ветка кода: $Branch$(if ($Branch -ne 'main') { ' (из forma-branch.txt; удалите файл, чтобы вернуться на main)' })"

Step 'Ярлыки'
@'
@echo off
chcp 65001 >nul
rem Starts Forma Studio. Keep this window open while you work; close it to stop. The browser opens when it is ready.
start "" /min powershell -NoProfile -WindowStyle Hidden -Command "for($i=0;$i -lt 300;$i++){try{(New-Object Net.Sockets.TcpClient).Connect('127.0.0.1',4317);break}catch{Start-Sleep 2}};Start-Process 'http://127.0.0.1:4317'"
wsl.exe -d Ubuntu-24.04 -u root -- bash -lc "test -x /root/forma/start.sh && exec /root/forma/start.sh; echo; echo Setup is not finished. Double-click C:\toggle\Install-Forma.cmd.; exit 1"
if errorlevel 1 pause
'@ | Set-Content -Encoding ASCII (Join-Path $Dir 'Start-Forma.cmd')
@'
@echo off
rem Updates Forma (code, settings, dependencies): the installer doubles as the updater.
call "C:\toggle\Install-Forma.cmd"
'@ | Set-Content -Encoding ASCII (Join-Path $Dir 'Update-Forma.cmd')
@'
@echo off
rem Opens the Forma folder inside Ubuntu (code, .env, local data cache) in Explorer.
explorer.exe \\wsl.localhost\Ubuntu-24.04\root\forma\forma
'@ | Set-Content -Encoding ASCII (Join-Path $Dir 'Open-Forma-Folder.cmd')
$l = (New-Object -ComObject WScript.Shell).CreateShortcut((Join-Path ([Environment]::GetFolderPath('Desktop')) 'Forma Studio.lnk'))
$l.TargetPath = Join-Path $Dir 'Start-Forma.cmd'; $l.WorkingDirectory = $Dir; $l.Save()
Write-Host 'Start-Forma.cmd, Update-Forma.cmd, Open-Forma-Folder.cmd и значок «Forma Studio» на рабочем столе.'

Step 'Forma внутри Ubuntu'
$setup = @'
#!/usr/bin/env bash
# Forma Studio inside Ubuntu (WSL): first install and every update. Run by Install-Forma.cmd; safe to run again.
# Usage: bash forma-setup.sh [branch]. WIN_DIR is the Windows folder with forma.env (default /mnt/c/toggle).
set -euo pipefail
BRANCH="${1:-main}"; WIN_DIR="${WIN_DIR:-/mnt/c/toggle}"; HOME_DIR="${FORMA_HOME:-/root/forma}"; REPO="$HOME_DIR/forma"
NODE_VERSION=22.22.0
step(){ printf '\n\033[36m== %s\033[0m\n' "$1"; }
mkdir -p "$HOME_DIR"

step "Системные пакеты"
need=(); for c in git curl xz; do command -v "$c" >/dev/null || need+=("$c"); done
command -v wslview >/dev/null || need+=(wslview)
if [ ${#need[@]} -gt 0 ]; then
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -qq && apt-get install -y -qq git curl ca-certificates xz-utils wslu >/dev/null || apt-get install -y -qq git curl ca-certificates xz-utils >/dev/null
fi
echo "ok"

step "Node.js $NODE_VERSION"
NODE_DIR="/root/toggle/tools/node-v$NODE_VERSION-linux-x64"
if [ ! -x "$NODE_DIR/bin/node" ]; then
  NODE_DIR="$HOME_DIR/tools/node-v$NODE_VERSION-linux-x64"
  if [ ! -x "$NODE_DIR/bin/node" ]; then mkdir -p "$HOME_DIR/tools"; curl -fsSL "https://nodejs.org/dist/v$NODE_VERSION/node-v$NODE_VERSION-linux-x64.tar.xz" | tar -xJ -C "$HOME_DIR/tools"; fi
fi
export PATH="$NODE_DIR/bin:$PATH"; node --version

step "Код: ветка $BRANCH"
if [ ! -d "$REPO/.git" ]; then git clone -q https://github.com/Rubicones/forma.git "$REPO"; fi
cd "$REPO"
if [ -n "$(git status --porcelain --untracked-files=no)" ]; then echo "В папке есть локальные правки кода: оставляю как есть, обновление пропущено."
else { git fetch -q origin "$BRANCH" && git checkout -q -B "$BRANCH" "origin/$BRANCH"; } || echo "Не удалось обновить код; продолжаю с текущей версией."; fi
git log --oneline -1

step "Настройки (.env)"
if [ -f "$WIN_DIR/forma.env" ]; then
  if [ ! -f .env ] || [ "$WIN_DIR/forma.env" -nt .env ]; then tr -d '\r' < "$WIN_DIR/forma.env" > .env; chmod 600 .env; echo "Взяты настройки из C:\\toggle\\forma.env"; else echo "Настройки уже актуальны."; fi
elif [ ! -f .env ]; then cp .env.example .env; chmod 600 .env; echo "Файла настроек нет: создан пустой .env (режим только локальный, без генерации)."; fi

step "Зависимости"
LOCK_HASH="$(sha256sum package-lock.json | cut -d' ' -f1)"
if [ -d node_modules ] && [ "$(cat node_modules/.forma-lock-hash 2>/dev/null)" = "$LOCK_HASH" ]; then echo "Без изменений."
else npm ci --no-audit --no-fund && echo "$LOCK_HASH" > node_modules/.forma-lock-hash; fi

step "Codex CLI (для режима Codex)"
if grep -qE '^(CODEX_API_KEY|OPENAI_API_KEY)=\S' .env; then
  command -v codex >/dev/null || npm install -g --no-audit --no-fund @openai/codex >/dev/null && echo "codex: $(codex --version 2>/dev/null || echo установлен)"
else echo "В настройках нет CODEX_API_KEY: пропущено."; fi

step "Скрипт запуска"
cat > "$HOME_DIR/start.sh" <<START
#!/usr/bin/env bash
export PATH="$NODE_DIR/bin:\$PATH"
cd "$REPO"
if [ -f "$WIN_DIR/forma.env" ] && [ "$WIN_DIR/forma.env" -nt .env ]; then tr -d '\\r' < "$WIN_DIR/forma.env" > .env; chmod 600 .env; fi
echo "Forma запускается: http://127.0.0.1:4317 (закройте это окно, чтобы остановить)."
exec npm start
START
chmod +x "$HOME_DIR/start.sh"; echo "$HOME_DIR/start.sh"

if [ "${SKIP_CLAUDE:-}" != "1" ]; then
  step "Вход в Claude по подписке"
  if node -e "import('./claude-auth.mjs').then(m=>m.subscriptionReady()).then(r=>process.exit(r?0:1))"; then echo "Уже выполнен."
  else
    command -v wslview >/dev/null && export BROWSER=wslview
    echo "Откроется браузер: выберите аккаунт Claude с подпиской и разрешите доступ."
    echo "Если вместо этого показан код, скопируйте его, вставьте сюда правой кнопкой мыши и нажмите Enter."
    read -r -p "Нажмите Enter, чтобы войти, или напишите no, чтобы пропустить: " answer || answer=no
    # The same program Forma checks, run directly so the browser opener (BROWSER) reaches it; the login is kept in /root.
    CLAUDE_BIN="$(node -e "import('./claude-auth.mjs').then(m=>console.log(m.executable()))")"
    if [ "$answer" != "no" ]; then "$CLAUDE_BIN" auth login --claudeai || echo "Вход не завершён: повторите позже двойным кликом по Install-Forma.cmd."; fi
  fi
fi
printf '\n\033[32mГотово. Запуск: значок «Forma Studio» на рабочем столе (или C:\\toggle\\Start-Forma.cmd).\033[0m\n'
'@
[IO.File]::WriteAllText((Join-Path $Dir 'forma-setup.sh'), ($setup -replace "`r", ''), (New-Object Text.UTF8Encoding $false))
wsl.exe -d $Distro -u root -- bash /mnt/c/toggle/forma-setup.sh $Branch
if ($LASTEXITCODE -ne 0) { Write-Host "`nУстановка остановилась (сообщение выше). Исправьте и снова дважды кликните Install-Forma.cmd." -ForegroundColor Red; exit 1 }
