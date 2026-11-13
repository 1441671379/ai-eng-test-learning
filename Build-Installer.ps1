param([switch]$RefreshUI)
$ErrorActionPreference = 'Stop'
Push-Location $PSScriptRoot
try {
    if ($RefreshUI) { & (Join-Path $PSScriptRoot 'Build-Desktop.ps1') -RefreshUI }
    & 'runtimes/inference-kokoro/Scripts/python.exe' -X utf8 'deployment/electron/build_installer.py'
    if ($LASTEXITCODE -ne 0) { throw 'Installer build failed. See deployment/electron/installer-reports.' }
} finally { Pop-Location }
