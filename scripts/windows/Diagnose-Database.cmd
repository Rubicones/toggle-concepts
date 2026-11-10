@echo off
rem Read-only check of the connection to the studio database (small and large requests, waiting sessions).
rem Changes nothing. Send a screenshot of the result.
wsl.exe -d Ubuntu-24.04 -u root -- bash -lc "export PATH=$HOME/toggle/tools/node-v22.22.0-linux-x64/bin:$PATH; cd ~/toggle/toggle-concepts && git fetch -q origin fix/windows-db-diagnose && git show origin/fix/windows-db-diagnose:scripts/diagnose-db.ts > /tmp/diagnose-db.ts && cp /tmp/diagnose-db.ts scripts/.diagnose-db.ts && node --import tsx scripts/.diagnose-db.ts; rm -f scripts/.diagnose-db.ts"
pause
