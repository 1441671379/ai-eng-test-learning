param([switch]$RefreshUI, [switch]$RefreshInference)
$ErrorActionPreference = 'Stop'
$projectRoot = $PSScriptRoot
$desktopExe = Join-Path $projectRoot 'deployment/electron/build/EnglishLearning/EnglishLearning.exe'
$runningDesktop = @(Get-Process EnglishLearning -ErrorAction SilentlyContinue | Where-Object Path -EQ $desktopExe)
if ($runningDesktop.Count) { throw 'Close the desktop app before rebuilding its UI.' }
Push-Location $projectRoot
try {
    & pnpm.cmd --dir apps/web build
    if ($LASTEXITCODE -ne 0) { throw 'Production web build failed.' }
    $buildArgs = @('deployment/electron/build_desktop.py')
    if ($RefreshInference) { $buildArgs += '--refresh-inference' }
    elseif ($RefreshUI) { $buildArgs += '--refresh' }
    $buildPython = 'runtimes/inference-kokoro/Scripts/python.exe'
    if (Test-Path 'deployment/tts/runtime.json') {
        $runtimeChoice = Get-Content 'deployment/tts/runtime.json' -Raw -Encoding UTF8 | ConvertFrom-Json
        $buildPython = $runtimeChoice.python
    }
    & $buildPython -X utf8 @buildArgs
    if ($LASTEXITCODE -ne 0) { throw 'Desktop assembly failed.' }
} finally { Pop-Location }
