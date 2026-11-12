#!/usr/bin/env bash
# Toggle Creative Studio on Linux / WSL (Ubuntu 24.04): one-time setup and update, safe to run again.
#   bash scripts/linux/setup.sh            (from the repository)
# Installs system packages (bubblewrap for the agent sandbox, browser libraries), a private Node 22, the latest
# main, dependencies, the renderer browser, .env.local, Claude Code (Local mode) and the start script.
set -euo pipefail
BRANCH="${BRANCH:-main}"
REPO="$(cd "$(dirname "$0")/../.." && pwd)"
HOME_DIR="$(dirname "$REPO")"
NODE_VERSION=22.22.0
NODE_DIR="$HOME_DIR/tools/node-v$NODE_VERSION-linux-x64"
step(){ printf '\n\033[36m== %s\033[0m\n' "$1"; }

SUDO=$([ "$(id -u)" = 0 ] && echo "" || echo sudo)
export DEBIAN_FRONTEND=noninteractive
step "System packages"
$SUDO apt-get update -qq
$SUDO apt-get install -y -qq git curl ca-certificates xz-utils unzip bubblewrap ffmpeg \
  libnss3 libdbus-1-3 libatk1.0-0 libatk-bridge2.0-0 libcups2 libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 \
  libxrandr2 libgbm1 libpango-1.0-0 libcairo2 libasound2t64 fonts-noto-core fonts-noto-color-emoji wslu >/dev/null || \
  $SUDO apt-get install -y -qq git curl ca-certificates xz-utils unzip bubblewrap ffmpeg libnss3 libdbus-1-3 libatk1.0-0 libatk-bridge2.0-0 libcups2 libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libgbm1 libpango-1.0-0 libcairo2 libasound2t64 fonts-noto-core fonts-noto-color-emoji >/dev/null

# Pictures and uploads are checked with ffprobe/ffmpeg before use (packages/media/inspect.local.ts).
ffprobe -version >/dev/null 2>&1 && ffmpeg -version >/dev/null 2>&1 && echo "media tools ok" || { echo "ffmpeg/ffprobe are missing: pictures cannot be checked." >&2; exit 1; }

step "Agent sandbox check (bubblewrap)"
bwrap --unshare-all --die-with-parent --ro-bind / / --dev /dev --proc /proc true && echo "sandbox ok"

step "Node.js $NODE_VERSION (private copy in $HOME_DIR/tools)"
if [ ! -x "$NODE_DIR/bin/node" ]; then
  mkdir -p "$HOME_DIR/tools"
  curl -fsSL "https://nodejs.org/dist/v$NODE_VERSION/node-v$NODE_VERSION-linux-x64.tar.xz" | tar -xJ -C "$HOME_DIR/tools"
fi
export PATH="$NODE_DIR/bin:$HOME/.local/bin:$PATH"
node --version

step "Code: latest $BRANCH"
cd "$REPO"
if [ -n "$(git status --porcelain --untracked-files=no)" ]; then echo "Local code changes found: kept, update skipped."; else { git fetch -q origin "$BRANCH" && git checkout -q "$BRANCH" && git pull -q --ff-only origin "$BRANCH"; } || echo "Could not update the code; continuing with the current version."; fi
git log --oneline -1

step "Dependencies"
# Reinstalling deletes node_modules under a running worker, so it happens only when package-lock.json changed.
LOCK_HASH="$(sha256sum package-lock.json | cut -d' ' -f1)"
# First run after this rule: an install newer than package-lock.json (npm's own node_modules/.package-lock.json) counts as current.
if [ -d node_modules ] && [ ! -f node_modules/.toggle-lock-hash ] && [ node_modules/.package-lock.json -nt package-lock.json ]; then echo "$LOCK_HASH" > node_modules/.toggle-lock-hash; fi
if [ -d node_modules ] && [ "$(cat node_modules/.toggle-lock-hash 2>/dev/null)" = "$LOCK_HASH" ]; then echo "Unchanged; kept as installed."
else npm ci --no-audit --no-fund && echo "$LOCK_HASH" > node_modules/.toggle-lock-hash; fi

step "Renderer browser (Chrome Headless Shell, free download)"
node -e "require('@remotion/renderer').ensureBrowser({chromeMode:'headless-shell',logLevel:'error'}).then(()=>console.log('browser ok'))"
SHELL_PATH="$REPO/node_modules/.remotion/chrome-headless-shell/linux64/chrome-headless-shell-linux64/chrome-headless-shell"

step "Start script"
cat > "$HOME_DIR/start.sh" <<START
#!/usr/bin/env bash
export PATH="$NODE_DIR/bin:\$HOME/.local/bin:\$PATH"
cd "$REPO"
if grep -qE '^(NEXT_PUBLIC_SUPABASE_URL|SUPABASE_SERVICE_ROLE_KEY|OPENROUTER_API_KEY)=\s*\$' .env.local 2>/dev/null || [ ! -f .env.local ]; then
  echo "The settings file has empty keys. Put the developer's .env.local in C:\\toggle and double-click Install-Toggle.cmd again."; exit 1
fi
echo "Starting the studio (the first start takes a minute or two)..."
exec npm run dev:shared
START
chmod +x "$HOME_DIR/start.sh"

step "Settings file .env.local"
# A settings file handed over by the developer (on Windows: C:\toggle\.env.local) is used as is.
EMPTY_KEYS='^(NEXT_PUBLIC_SUPABASE_URL|SUPABASE_SERVICE_ROLE_KEY|OPENROUTER_API_KEY)=\s*$'
if { [ ! -f .env.local ] || grep -qE "$EMPTY_KEYS" .env.local || [ "${ENV_SOURCE:-/nonexistent}" -nt .env.local ]; } && [ -n "${ENV_SOURCE:-}" ] && [ -f "$ENV_SOURCE" ]; then tr -d '\r' < "$ENV_SOURCE" > .env.local; chmod 600 .env.local; sed -i -E '/^(DIRECTOR_)?CHROME_PATH=/d' .env.local; echo "CHROME_PATH=$SHELL_PATH" >> .env.local; echo "Using the settings file from $ENV_SOURCE."; fi
if [ ! -f .env.local ]; then
  cat > .env.local <<ENV
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
CHROME_PATH=$SHELL_PATH
ENV
  chmod 600 .env.local
fi
if grep -qE '^(NEXT_PUBLIC_SUPABASE_URL|SUPABASE_SERVICE_ROLE_KEY|OPENROUTER_API_KEY)=\s*$' .env.local; then
  echo "Fill .env.local with the values from the developer."
  if command -v notepad.exe >/dev/null; then echo "Notepad opens now: paste, save, close."; notepad.exe "$(wslpath -w "$REPO/.env.local")" || true; else ${EDITOR:-nano} .env.local; fi
  if grep -qE '^(NEXT_PUBLIC_SUPABASE_URL|SUPABASE_SERVICE_ROLE_KEY|OPENROUTER_API_KEY)=\s*$' .env.local; then echo "Still empty values in .env.local: fill them and run this script again."; exit 1; fi
fi

if [ "${SKIP_CLAUDE:-}" != "1" ]; then
  step "Claude Code for Local mode: install, sign in with your subscription, create this computer's id"
  # In WSL the sign-in opens the Windows browser and finishes by itself (no code to paste).
  if command -v wslview >/dev/null; then export BROWSER=wslview; fi
  echo "A browser tab opens for the Claude sign-in: choose your subscription account and allow access."
  echo "If a code is shown instead, copy it, right-click inside this window to paste it, and press Enter."

  if node --import tsx apps/local-runner/local-claude/doctor.ts --fix; then echo "Local mode ready."; else
    printf '\n\033[33mTurn OFF paid extra usage in your Claude account settings.\033[0m\n'
    read -r -p "Done? Press Enter to run the check (about ten short requests on your subscription), or type no to skip: " answer
    if [ "$answer" != "no" ]; then node --import tsx apps/local-runner/local-claude/doctor.ts --fix --extra-usage-off || true; fi
  fi
fi
# On Windows the installer in C:\toggle is a copy made at the first install. Keep it and the database launcher equal to
# the repository's, so installer changes (Ubuntu's memory and core limits) arrive with an update: they apply the next
# time the installer runs.
if [ -n "${ENV_SOURCE:-}" ] && [ -d "$(dirname "$ENV_SOURCE")" ] && [ -d "$REPO/scripts/windows" ]; then
  LAUNCHERS="$(dirname "$ENV_SOURCE")"
  for f in Install-Toggle.cmd Update-Database.cmd; do
    if [ -f "$REPO/scripts/windows/$f" ] && ! cmp -s "$REPO/scripts/windows/$f" "$LAUNCHERS/$f"; then
      cp "$REPO/scripts/windows/$f" "$LAUNCHERS/$f.new" && mv "$LAUNCHERS/$f.new" "$LAUNCHERS/$f" && [ "$f" = Install-Toggle.cmd ] && INSTALLER_UPDATED=1
    fi
  done
  if [ "${INSTALLER_UPDATED:-}" = 1 ]; then printf '\n\033[33mThe installer itself was updated. Run Install-Toggle.cmd once more (with the studio closed) to apply its new settings.\033[0m\n'; fi
fi
printf '\n\033[32mReady. Start: %s/start.sh (on Windows: C:\\toggle\\Start-Studio.cmd)\033[0m\n' "$HOME_DIR"
