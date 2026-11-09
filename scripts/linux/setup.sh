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

step "System packages (asks for your Ubuntu password once)"
sudo apt-get update -qq
sudo apt-get install -y -qq git curl ca-certificates xz-utils unzip bubblewrap \
  libnss3 libdbus-1-3 libatk1.0-0 libatk-bridge2.0-0 libcups2 libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 \
  libxrandr2 libgbm1 libpango-1.0-0 libcairo2 libasound2t64 fonts-noto-core fonts-noto-color-emoji >/dev/null

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
npm ci --no-audit --no-fund

step "Renderer browser (Chrome Headless Shell, free download)"
node -e "require('@remotion/renderer').ensureBrowser({chromeMode:'headless-shell',logLevel:'error'}).then(()=>console.log('browser ok'))"
SHELL_PATH="$REPO/node_modules/.remotion/chrome-headless-shell/linux64/chrome-headless-shell-linux64/chrome-headless-shell"

step "Settings file .env.local"
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

step "Start script"
cat > "$HOME_DIR/start.sh" <<START
#!/usr/bin/env bash
export PATH="$NODE_DIR/bin:\$HOME/.local/bin:\$PATH"
cd "$REPO" && exec npm run dev:shared
START
chmod +x "$HOME_DIR/start.sh"

if [ "${SKIP_CLAUDE:-}" != "1" ]; then
  step "Claude Code for Local mode: install, sign in with your subscription, create this computer's id"
  if node --import tsx apps/local-runner/local-claude/doctor.ts --fix; then echo "Local mode ready."; else
    printf '\n\033[33mTurn OFF paid extra usage in your Claude account settings.\033[0m\n'
    read -r -p "Done? Type yes to run the check (about ten short requests on your subscription): " answer
    if [ "$answer" = "yes" ]; then node --import tsx apps/local-runner/local-claude/doctor.ts --fix --extra-usage-off || true; fi
  fi
fi
printf '\n\033[32mReady. Start: %s/start.sh (on Windows: C:\\toggle\\Start-Studio.cmd)\033[0m\n' "$HOME_DIR"
