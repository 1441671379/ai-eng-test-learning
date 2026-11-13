@echo off
if not exist "%~dp0deployment\electron\build\EnglishLearning\EnglishLearning.exe" (
  echo Desktop app is missing. Run Build-Desktop.ps1 first.
  pause
  exit /b 1
)
start "" "%~dp0deployment\electron\build\EnglishLearning\EnglishLearning.exe"
