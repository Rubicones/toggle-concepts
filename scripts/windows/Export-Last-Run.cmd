@echo off
rem Exports the most recent run (or the run whose id you pass) for diagnosis into C:\toggle\exports: one folder and
rem one zip to send. It only reads; keys and settings are never exported. Drag nothing here: just double-click.
echo Exporting the last run...
wsl.exe -d Ubuntu-24.04 -u root --exec bash -lc "PATH=/root/toggle/tools/node-v22.22.0-linux-x64/bin:/usr/local/bin:/usr/bin:/bin; cd ~/toggle/toggle-concepts && mkdir -p /mnt/c/toggle/exports && node --import tsx scripts/export-run.ts %* --out /mnt/c/toggle/exports"
pause
