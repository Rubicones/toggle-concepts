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
