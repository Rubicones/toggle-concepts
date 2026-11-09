@echo off
rem Double-click to install or update Toggle Studio. Keep Install-Toggle.ps1 in the same folder.
if not exist "C:\toggle" mkdir "C:\toggle"
if /i not "%~dp0"=="C:\toggle\" (
  copy /y "%~dp0Install-Toggle.ps1" "C:\toggle\Install-Toggle.ps1" >nul
  copy /y "%~f0" "C:\toggle\Install-Toggle.cmd" >nul
)
powershell -NoProfile -ExecutionPolicy Bypass -File "C:\toggle\Install-Toggle.ps1"
pause
