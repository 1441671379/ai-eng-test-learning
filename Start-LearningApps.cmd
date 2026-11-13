@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Start-LearningApps.ps1" %*
set "learningAppsExit=%errorlevel%"
if not "%learningAppsExit%"=="0" echo Startup failed. See the error above.
pause
exit /b %learningAppsExit%
