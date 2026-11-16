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
cat > "$HOME_DIR/lab-chat.sh" <<LABCHAT
#!/usr/bin/env bash
# Opens the Forma Lab chat: Claude Code on Roman's subscription, in /root/forma/lab, next to his local Forma.
export PATH="$NODE_DIR/bin:\$PATH"
cd "$LAB" || { echo "Лаборатория не установлена. Запустите C:\\\\toggle\\\\Update-Forma.cmd."; exit 1; }
CLAUDE_BIN="\$(cd "$REPO" && node -e "import('./claude-auth.mjs').then(m=>console.log(m.executable()))")"
curl -s -o /dev/null http://127.0.0.1:4317/api/status || echo "Внимание: Forma не запущена. Запустите значок «Forma Studio», чат подождёт."
"\$CLAUDE_BIN" "\$@" || { echo; read -r -p "Чат закрылся с ошибкой (сообщение выше). Нажмите Enter, чтобы закрыть окно. " _; }
LABCHAT
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
