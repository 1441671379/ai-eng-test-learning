@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Stop-LearningApps.ps1" %*
set "learningAppsExit=%errorlevel%"
if not "%learningAppsExit%"=="0" echo Shutdown failed. See the error above.
pause
exit /b %learningAppsExit%
