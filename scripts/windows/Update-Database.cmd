@echo off
rem Applies the studio's pending database updates (migrations) to the shared Supabase project, using the access
rem token in the settings file. Already applied updates are skipped, so it is safe to run again. Run it when the
rem studio asks for a migration, or after updating the studio.
echo Updating the studio database...
wsl.exe -d Ubuntu-24.04 -u root -- bash -lc "export PATH=$HOME/toggle/tools/node-v22.22.0-linux-x64/bin:$PATH; cd ~/toggle/toggle-concepts && npm run -s data:deploy && echo && echo The database is up to date."
pause
