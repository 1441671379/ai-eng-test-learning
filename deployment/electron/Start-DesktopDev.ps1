$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '../..')).Path
$desktopExe = Join-Path $PSScriptRoot 'build/EnglishLearning/EnglishLearning.exe'
if (-not (Test-Path -LiteralPath $desktopExe)) { throw 'Build the desktop directory first with Build-Desktop.ps1.' }
$env:ENGLISH_DESKTOP_DEV_ROOT = $projectRoot
$env:ENGLISH_DESKTOP_RESOURCE_ROOT = Join-Path $PSScriptRoot 'build/EnglishLearning/resources'
Start-Process -FilePath $desktopExe -ArgumentList '--ui-dev' -WorkingDirectory (Split-Path $desktopExe) -WindowStyle Hidden
