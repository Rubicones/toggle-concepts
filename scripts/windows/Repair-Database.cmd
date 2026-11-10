@echo off
rem One-time repair after the 2026-11-10 database update: records the migrations already applied by hand and restores
rem the idea review version. Checks first; changes nothing if the database is not up to date. Then run Update-Database.
wsl.exe -d Ubuntu-24.04 -u root --exec bash -lc "PATH=/root/toggle/tools/node-v22.22.0-linux-x64/bin:/usr/local/bin:/usr/bin:/bin; cd ~/toggle/toggle-concepts && git pull -q --ff-only origin main; if [ /mnt/c/toggle/.env.local -nt .env.local ]; then tr -d '\r' < /mnt/c/toggle/.env.local | grep -v -E '^(DIRECTOR_)?CHROME_PATH=' > .env.local.tmp && grep -E '^CHROME_PATH=' .env.local >> .env.local.tmp; mv .env.local.tmp .env.local; chmod 600 .env.local; fi; node --import tsx scripts/repair-migration-log.ts"
pause
