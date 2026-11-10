@echo off
rem Applies the studio's pending database updates (migrations) to the shared Supabase project, using the access
rem token in the settings file. Already applied updates are skipped, so it is safe to run again. Run it when the
rem studio asks for a migration, or after updating the studio.
echo Updating the studio database...
wsl.exe -d Ubuntu-24.04 -u root --exec bash -lc "PATH=/root/toggle/tools/node-v22.22.0-linux-x64/bin:/usr/local/bin:/usr/bin:/bin; cd ~/toggle/toggle-concepts && if [ /mnt/c/toggle/.env.local -nt .env.local ]; then tr -d '\r' < /mnt/c/toggle/.env.local > .env.local.new && grep -v -E '^(DIRECTOR_)?CHROME_PATH=' .env.local.new > .env.local.tmp && grep -E '^CHROME_PATH=' .env.local >> .env.local.tmp; mv .env.local.tmp .env.local; rm -f .env.local.new; chmod 600 .env.local; echo Using the settings from C:\\toggle\\.env.local; fi; npm run -s data:deploy && echo && echo The database is up to date."
pause
