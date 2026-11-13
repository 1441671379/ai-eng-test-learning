@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0deployment\electron\Start-DesktopDev.ps1"
if errorlevel 1 pause
