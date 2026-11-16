<# :
@echo off
chcp 65001 >nul
rem Forma Studio: install or update. Double-click; nothing needs to be typed.
set "FORMA_SELF=%~f0"
powershell -NoProfile -ExecutionPolicy Bypass -Command "iex ((Get-Content -LiteralPath $env:FORMA_SELF -Raw -Encoding UTF8))"
pause
exit /b
#>
# Forma Studio на Windows: установка и обновление одним файлом. Двойной клик по Install-Forma.cmd; можно запускать
# сколько угодно раз: делает только недостающее и заодно обновляет код. Forma работает в том же фоновом Ubuntu (WSL),
# что и прежняя студия Toggle. Старые файлы Toggle из C:\toggle переносятся в C:\toggle\old-toggle-studio.
$ErrorActionPreference = 'Continue'
# Russian text from Ubuntu reaches this window as UTF-8; without this it shows as question marks.
try { [Console]::OutputEncoding = [Text.Encoding]::UTF8 } catch {}
$Distro = 'Ubuntu-24.04'; $Dir = 'C:\toggle'; $Old = Join-Path $Dir 'old-toggle-studio'
# Your name in the shared base, and the code you test: main, as Dima publishes it. forma-author.txt / forma-branch.txt override them.
$Author = 'Roman'; $Branch = 'main'
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
# Файл от Димы под любым именем (doc_....env, .env, forma.env.txt): самый новый в C:\toggle, в «Загрузках» или в папке внутри них,
# в котором есть строка FORMA_STORE=. Более новый заменяет прежний.
# Also one level down in Downloads: Telegram saves files into Downloads\Telegram Desktop.
$found = @(@($Dir, (Join-Path $env:USERPROFILE 'Downloads')) | ForEach-Object { Get-ChildItem -LiteralPath $_ -File -Force -ErrorAction SilentlyContinue }) + @(Get-ChildItem -LiteralPath (Join-Path $env:USERPROFILE 'Downloads') -Directory -ErrorAction SilentlyContinue | ForEach-Object { Get-ChildItem -LiteralPath $_.FullName -File -Force -ErrorAction SilentlyContinue }) |
  Where-Object { $_.FullName -ne $envFile -and $_.Length -lt 65536 -and $_.Extension -notin '.cmd','.sh','.lnk','.ps1' -and (Select-String -LiteralPath $_.FullName -Pattern '^\s*FORMA_STORE=' -Quiet) } |
  Sort-Object LastWriteTime -Descending | Select-Object -First 1
if ($found -and (-not (Test-Path $envFile) -or $found.LastWriteTime -gt (Get-Item $envFile).LastWriteTime)) { Copy-Item -Force $found.FullName $envFile; Write-Host "Настройки взяты из $($found.FullName)" }
if (Test-Path $envFile) {
  $text = [IO.File]::ReadAllText($envFile)
  $authorFile = Join-Path $Dir 'forma-author.txt'
  if (Test-Path $authorFile) { $named = (Get-Content -LiteralPath $authorFile -TotalCount 1 -Encoding UTF8).Trim(); if ($named) { $Author = $named } }
  if ($text -match '(?m)^FORMA_AUTHOR=') { $text = [regex]::Replace($text, '(?m)^FORMA_AUTHOR=[^\r\n]*', "FORMA_AUTHOR=$Author") } else { $text += "`nFORMA_AUTHOR=$Author`n" }
  # Dima's own model keys stay out: Claude runs on your subscription, and Codex is not used. The shared base (Supabase,
  # R2) and the picture key stay.
  $text = [regex]::Replace($text, '(?m)^(ANTHROPIC_API_KEY|CODEX_API_KEY|OPENAI_API_KEY)=[^\r\n]*', '# $1 removed by Install-Forma: Claude runs on your subscription')
  [IO.File]::WriteAllText($envFile, $text, (New-Object Text.UTF8Encoding $false))
  $pictures = if ($text -match '(?m)^OPENROUTER_API_KEY=\s*(\S+)') { 'ключ OpenRouter …' + $Matches[1].Substring([Math]::Max(0, $Matches[1].Length - 4)) } else { 'ключа OpenRouter нет: картинки и видео не генерируются' }
  Write-Host "Настройки: $envFile. Автор: $Author. Claude: ваша подписка. Картинки: $pictures." -ForegroundColor Green
} else { Write-Host "Файла настроек нет. Положите файл от Димы в $Dir и запустите установщик ещё раз. Без него Forma работает только в тестовом режиме." -ForegroundColor Yellow }

$BranchFile = Join-Path $Dir 'forma-branch.txt'
if (Test-Path $BranchFile) { $Named = (Get-Content -LiteralPath $BranchFile -TotalCount 1).Trim(); if ($Named -match '^[A-Za-z0-9._/-]+$') { $Branch = $Named } }
Write-Host "Рабочая ветка: $Branch"

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
rem Updates Forma (code, settings, dependencies, lab): fetches the newest installer, then runs it.
curl.exe -fsSL -o "C:\toggle\Install-Forma.new.cmd" "https://raw.githubusercontent.com/Rubicones/forma/roman/work/windows/Install-Forma.cmd" && move /y "C:\toggle\Install-Forma.new.cmd" "C:\toggle\Install-Forma.cmd" >nul
call "C:\toggle\Install-Forma.cmd"
'@ | Set-Content -Encoding ASCII (Join-Path $Dir 'Update-Forma.cmd')
@'
@echo off
title Forma Lab
rem Forma Lab: starts Forma and connects the lab to the Claude app (phone or claude.ai/code). Keep the window open while you work.
rem Runs the script directly (-e, no shell command line), so no quotes can get lost on the way.
wsl.exe -d Ubuntu-24.04 -u root -e test -x /root/forma/lab-chat.sh
if errorlevel 1 (
  echo Lab is not installed. Double-click C:\toggle\Update-Forma.cmd
  pause
  exit /b 1
)
wsl.exe -d Ubuntu-24.04 -u root -e bash /root/forma/lab-chat.sh
'@ | Set-Content -Encoding ASCII (Join-Path $Dir 'Forma-Lab.cmd')
@'
@echo off
rem Opens the folder with batch results (each run has index.html) and reports for Dima.
if not exist "C:\toggle\lab" mkdir "C:\toggle\lab"
explorer.exe C:\toggle\lab
'@ | Set-Content -Encoding ASCII (Join-Path $Dir 'Open-Lab-Results.cmd')
@'
@echo off
chcp 65001 >nul
rem Exports a Forma campaign for a report into C:\toggle\exports (one zip to attach in the chat). Without a name it takes
rem the newest campaign; with words after the file name it takes the campaign whose name contains them. Read-only.
wsl.exe -d Ubuntu-24.04 -u root -- bash -lc "export PATH=$(ls -d /root/toggle/tools/node-v22.22.0-linux-x64/bin /root/forma/tools/node-v22.22.0-linux-x64/bin 2>/dev/null | head -1):$PATH; cd /root/forma/forma && mkdir -p /mnt/c/toggle/exports && node --env-file-if-exists=.env /root/forma/tools/export-campaign.mjs %*"
explorer.exe C:\toggle\exports
pause
'@ | Set-Content -Encoding ASCII (Join-Path $Dir 'Export-Forma-Campaign.cmd')
@'
@echo off
rem Opens the Forma folder inside Ubuntu (code, .env, local data cache) in Explorer.
explorer.exe \\wsl.localhost\Ubuntu-24.04\root\forma\forma
'@ | Set-Content -Encoding ASCII (Join-Path $Dir 'Open-Forma-Folder.cmd')
$l = (New-Object -ComObject WScript.Shell).CreateShortcut((Join-Path ([Environment]::GetFolderPath('Desktop')) 'Forma Studio.lnk'))
$l.TargetPath = Join-Path $Dir 'Start-Forma.cmd'; $l.WorkingDirectory = $Dir; $l.Save()
$l = (New-Object -ComObject WScript.Shell).CreateShortcut((Join-Path ([Environment]::GetFolderPath('Desktop')) 'Forma Lab.lnk'))
$l.TargetPath = Join-Path $Dir 'Forma-Lab.cmd'; $l.WorkingDirectory = $Dir; $l.Save()
Write-Host 'Start-Forma.cmd, Update-Forma.cmd, Export-Forma-Campaign.cmd, Open-Forma-Folder.cmd, Forma-Lab.cmd, Open-Lab-Results.cmd и значки «Forma Studio» и «Forma Lab» на рабочем столе.'

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
else
  # The working branch is made by the chat on its first push; until then the code comes from main.
  if git ls-remote --exit-code --heads origin "$BRANCH" >/dev/null 2>&1; then USE="$BRANCH"; else USE=main; [ "$BRANCH" != main ] && echo "Ветки $BRANCH ещё нет (её создаст чат при первой правке): пока беру main."; fi
  { git fetch -q origin "$USE" && git checkout -q -B "$USE" "origin/$USE"; } || echo "Не удалось обновить код; продолжаю с текущей версией."
fi
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

step "Экспорт кампаний для отчётов"
command -v zip >/dev/null || { DEBIAN_FRONTEND=noninteractive apt-get install -y -qq zip >/dev/null || true; }
mkdir -p "$HOME_DIR/tools"
cat > "$HOME_DIR/tools/export-campaign.mjs" <<'FORMA_EXPORT_JS'
// Exports one Forma campaign for a report: every step (brief, script, styles, preview, final, revisions) with its full
// run log, and the campaign's files (materials, generated pictures and videos, creative HTML), into one zip in
// C:\toggle\exports. Read-only: nothing in the shared base changes. Keys and settings are never exported.
// Run from the Forma folder: node --env-file-if-exists=.env export-campaign.mjs [part of the campaign name | campaign id]
import path from 'node:path';
import fs from 'node:fs/promises';
import {execFileSync} from 'node:child_process';

const repo = process.cwd(), outRoot = process.env.EXPORT_DIR || '/mnt/c/toggle/exports';
const {store} = await import(path.join(repo, 'store/index.mjs'));
const dataDir = path.resolve(process.env.DATA_DIR || path.join(repo, 'data'));
await store.history.open(dataDir);
const wanted = process.argv.slice(2).join(' ').trim().toLowerCase();

async function all(filter) {
  const out = []; let before;
  for (let i = 0; i < 50; i++) { const page = await store.history.list({...filter, limit: 200, ...(before ? {before} : {})}); out.push(...page.items); if (!page.next) break; before = page.next; }
  return out;
}
const campaigns = await all({type: 'campaign'});
if (!campaigns.length) { console.log('Кампаний нет.'); process.exit(1); }
const pick = wanted ? campaigns.find(c => c.id === wanted) || campaigns.find(c => String(c.name || '').toLowerCase().includes(wanted)) : campaigns[0];
if (!pick) { console.log(`Кампания «${wanted}» не найдена. Последние: ${campaigns.slice(0, 8).map(c => c.name).join(' · ')}`); process.exit(1); }

const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
const safe = String(pick.name || 'campaign').replace(/[^\p{L}\p{N}._-]+/gu, '-').slice(0, 40);
const dir = path.join(outRoot, `${safe}-${stamp}`);
await fs.mkdir(path.join(dir, 'steps'), {recursive: true});
console.log(`Кампания: ${pick.name} (${pick.id})`);

const campaign = await store.history.get(pick.id, {withLog: true});
await fs.writeFile(path.join(dir, 'campaign.json'), JSON.stringify(campaign, null, 1));
const steps = await all({campaign: pick.id});
const projects = new Set([campaign.project].filter(Boolean));
for (const s of steps) {
  if (s.id === pick.id) continue;
  const full = await store.history.get(s.id, {withLog: true});
  if (full?.project) projects.add(full.project);
  await fs.writeFile(path.join(dir, 'steps', `${(full.createdAt || '').slice(0, 19).replace(/[:T]/g, '-')}-${full.type || 'step'}-${full.id.slice(0, 8)}.json`), JSON.stringify(full, null, 1));
}
console.log(`Шагов: ${steps.length}. Проекты с файлами: ${projects.size}.`);

const files = path.join(dir, 'files');
for (const p of projects) {
  if (store.driver === 'file') await fs.cp(path.join(dataDir, p), path.join(files, p), {recursive: true}).catch(() => {});
  else { const r = await store.sync.down(p, {dataDir: files}); console.log(`Файлы проекта ${p.slice(0, 8)}: ${r.downloaded + r.skipped}`); }
}
await fs.writeFile(path.join(dir, 'README.txt'), [
  `Экспорт кампании Forma «${pick.name}» (${pick.id}), ${new Date().toISOString()}.`,
  'campaign.json — кампания: бриф, варианты стилей, шаги, стоимость, и её журнал.',
  'steps/ — каждый шаг (сценарий, стили, превью, финал, правки) с полным журналом сборки: промпты, ответы модели, запросы картинок и видео, время, стоимость.',
  'files/ — файлы кампании: материалы бренда, сгенерированные картинки и видео, HTML креативов.',
  'Ключи и настройки не экспортируются.',
].join('\n') + '\n');
try { execFileSync('zip', ['-qr', `${dir}.zip`, path.basename(dir)], {cwd: outRoot}); console.log(`Готово: ${dir}.zip`); }
catch { console.log(`Готово (без архива): ${dir}`); }
process.exit(0);
FORMA_EXPORT_JS
echo "$HOME_DIR/tools/export-campaign.mjs"

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

step "Лаборатория: пачки прогонов и чат"
# Lab tools live on Roman's branch (lab/), separate from Dima's code. Tools are refreshed on every update;
# brands/ and batches/ only gain new files, so Roman's own brands and batches are never overwritten.
LAB="$HOME_DIR/lab"; LAB_TMP="$(mktemp -d)"
if git -C "$REPO" fetch -q origin roman/work 2>/dev/null && git -C "$REPO" archive FETCH_HEAD lab | tar -x -C "$LAB_TMP"; then
  mkdir -p "$LAB/brands" "$LAB/batches"
  for f in "$LAB_TMP"/lab/* "$LAB_TMP"/lab/.claude; do
    [ -e "$f" ] || continue
    case "$(basename "$f")" in
      brands|batches) cp -r --update=none "$f/." "$LAB/$(basename "$f")/" ;;
      *) cp -rf "$f" "$LAB/" ;;
    esac
  done
  mkdir -p "$WIN_DIR/lab/reports" "$WIN_DIR/lab/inbox"
  echo "$LAB"
  # A headless browser so the lab can take pictures of directions and previews (the chat looks at them).
  if [ ! -d "$LAB/node_modules/playwright" ] || ! ls /root/.cache/ms-playwright 2>/dev/null | grep -q '^chromium'; then
    echo "Ставлю браузер для снимков (один раз, пара минут)..."
    ( cd "$LAB" && npm install --no-audit --no-fund --loglevel=error && npx playwright install --with-deps chromium >/dev/null ) \
      || echo "Браузер для снимков не поставился: лаборатория работает, но без картинок в чате."
  fi
else
  echo "Не удалось скачать лабораторию (ветка roman/work). Forma работает и без неё."
fi
rm -rf "$LAB_TMP"
cat > "$HOME_DIR/lab-chat.sh" <<'LABCHAT'
#!/usr/bin/env bash
# Forma Lab: starts Forma if needed, then connects the lab folder to the Claude app (phone or claude.ai/code)
# through Remote Control. Work happens here on this computer; Roman writes from the app. "lab-chat.sh local" = chat in this window.
export PATH="@NODE_DIR@/bin:$PATH"
cd "@LAB@" || { echo "Лаборатория не установлена. Запустите C:\\toggle\\Update-Forma.cmd."; read -r _; exit 1; }
CLAUDE_BIN="$(cd "@REPO@" && node -e "import('./claude-auth.mjs').then(m=>console.log(m.executable()))")"
up(){ curl -s -o /dev/null --max-time 2 http://127.0.0.1:4317/api/status; }
if ! up; then
  echo "Запускаю Forma..."
  nohup "@HOME_DIR@/start.sh" > "@HOME_DIR@/forma.log" 2>&1 &
  for i in $(seq 1 60); do up && break; sleep 2; done
  up && echo "Forma работает: http://127.0.0.1:4317" || echo "Forma не запустилась, подробности: @HOME_DIR@/forma.log"
fi
if [ "${1:-}" = "local" ]; then shift; "$CLAUDE_BIN" "$@"; exit; fi
echo
echo "Лаборатория подключается к приложению Claude."
echo "Откройте Claude на телефоне (раздел Code) или claude.ai/code в браузере и выберите сессию «Forma Lab»."
echo "Это окно не закрывайте: пока оно открыто, Forma и лаборатория работают. Закрыть = остановить всё."
echo
"$CLAUDE_BIN" remote-control --name "Forma Lab" --spawn same-dir \
  || { echo; read -r -p "Подключение не удалось (сообщение выше). Нажмите Enter, чтобы закрыть окно. " _; }
LABCHAT
sed -i -e "s|@NODE_DIR@|$NODE_DIR|g" -e "s|@LAB@|$LAB|g" -e "s|@REPO@|$REPO|g" -e "s|@HOME_DIR@|$HOME_DIR|g" "$HOME_DIR/lab-chat.sh"
chmod +x "$HOME_DIR/lab-chat.sh"; echo "$HOME_DIR/lab-chat.sh"
# Claude's first-run screens (theme, "trust this folder") take only arrows and Enter, so typed messages seemed to vanish.
# Mark them as done for the lab folder; keeps the theme if one was already chosen. Login stays as it is.
LAB="$LAB" node -e '
const fs=require("fs"),f=process.env.HOME+"/.claude.json";
let c={};try{c=JSON.parse(fs.readFileSync(f,"utf8"))}catch{}
c.hasCompletedOnboarding=true;c.theme=c.theme||"dark";
c.projects=c.projects||{};const p=c.projects[process.env.LAB]||{};
c.projects[process.env.LAB]={...p,hasTrustDialogAccepted:true,hasCompletedProjectOnboarding:true};
fs.writeFileSync(f,JSON.stringify(c,null,2));console.log("Первый запуск чата подготовлен.")'

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
printf '\n\033[32mГотово. Запуск: значок «Forma Studio» на рабочем столе (или C:\\toggle\\Start-Forma.cmd). Чат-лаборатория: значок «Forma Lab».\033[0m\n'
'@
[IO.File]::WriteAllText((Join-Path $Dir 'forma-setup.sh'), ($setup -replace "`r", ''), (New-Object Text.UTF8Encoding $false))
wsl.exe -d $Distro -u root -- bash /mnt/c/toggle/forma-setup.sh $Branch
if ($LASTEXITCODE -ne 0) { Write-Host "`nУстановка остановилась (сообщение выше). Исправьте и снова дважды кликните Install-Forma.cmd." -ForegroundColor Red; exit 1 }
