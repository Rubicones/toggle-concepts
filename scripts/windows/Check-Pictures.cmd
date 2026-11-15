@echo off
rem Checks the picture provider for the key in the studio settings: what the key and the account say about credit,
rem what one picture reserves, and (if you answer y) buys one test picture. The key is never shown: only its last 4 characters.
echo Checking the picture provider...
wsl.exe -d Ubuntu-24.04 -u root --exec bash -lc "PATH=/root/toggle/tools/node-v22.22.0-linux-x64/bin:/usr/local/bin:/usr/bin:/bin; cd ~/toggle/toggle-concepts && node --import tsx scripts/check-picture-provider.ts"
pause
