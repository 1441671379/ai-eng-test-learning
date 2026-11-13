param([ValidateSet('all','web','services')][string]$App = 'all', [ValidateSet('dev','start')][string]$WebMode = 'dev')
$ErrorActionPreference = 'Stop'
$projectRoot = $PSScriptRoot
# Serialize launcher and automatic recovery so they cannot start duplicate models
# or overwrite each other's runtime process records.
$rootHash = [System.Security.Cryptography.SHA256]::Create()
$mutexId = ([BitConverter]::ToString($rootHash.ComputeHash([Text.Encoding]::UTF8.GetBytes($projectRoot.ToLowerInvariant())))).Replace('-','')
$rootHash.Dispose()
$launchMutex = [Threading.Mutex]::new($false, "Local\EnglishLearningApps-$mutexId")
$lockHeld = $false
try {
    try { $lockHeld = $launchMutex.WaitOne(180000) } catch [Threading.AbandonedMutexException] { $lockHeld = $true }
    if (-not $lockHeld) { throw 'Another startup is still in progress. Please retry shortly.' }
$deployDir = Join-Path $projectRoot 'deployment'
$logDir = Join-Path $deployDir 'logs'
New-Item -ItemType Directory -Force $logDir | Out-Null
$stateFile = Join-Path $deployDir 'runtime.json'
$entries = @()
if (Test-Path -LiteralPath $stateFile) {
    # Windows PowerShell 5.1 emits a JSON array as one pipeline object.
    $savedEntries = Get-Content -LiteralPath $stateFile -Raw -Encoding UTF8 | ConvertFrom-Json
    $entries = @($savedEntries)
}
function Get-RecordedUtcTime($value) {
    if ($value -is [datetime]) { return $value.ToUniversalTime() }
    return [datetimeoffset]::Parse([string]$value, [Globalization.CultureInfo]::InvariantCulture).UtcDateTime
}
$env:HF_HOME = Join-Path $projectRoot 'models'
$env:PYTHONIOENCODING = 'utf-8'
$env:PYTHONUTF8 = '1'
$env:NEXT_TELEMETRY_DISABLED = '1'
$env:ENGLISH_APP_ROOT = $projectRoot
# This launcher binds the web server exclusively to 127.0.0.1.
$env:ENGLISH_LOCAL_HTTP = '1'
$env:ENGLISH_EXTERNAL_LLM_ONLY = '1'
$env:ENGLISH_DATA_DIR = Join-Path $deployDir 'learning-data'
$env:ENGLISH_TTS_PROVIDER = 'kokoro'
$env:ENGLISH_TTS_CONFIG = Join-Path $deployDir 'kokoro/settings.json'
$inferencePython = Join-Path $projectRoot 'runtimes/inference-kokoro/Scripts/python.exe'
$ttsRuntime = @{provider='kokoro'}
$ttsRuntimeFile = Join-Path $deployDir 'tts/runtime.json'
if (Test-Path -LiteralPath $ttsRuntimeFile) {
    $ttsRuntime = Get-Content -LiteralPath $ttsRuntimeFile -Raw -Encoding UTF8 | ConvertFrom-Json
    $env:ENGLISH_TTS_PROVIDER = $ttsRuntime.provider
    $env:ENGLISH_TTS_CONFIG = Join-Path $projectRoot $ttsRuntime.config
    $inferencePython = Join-Path $projectRoot $ttsRuntime.python
}
$env:ENGLISH_WORDBOOKS_DIR = Join-Path $deployDir 'vocabulary/books'
# Browsers may bind low ports for outbound connections on this Windows setup.
# Persist a free model port; the web runtime rereads it during backend recovery.
$portsFile = Join-Path $deployDir 'service-ports.json'
$modelPort = 8001
if (Test-Path -LiteralPath $portsFile) {
    $savedPorts = Get-Content -LiteralPath $portsFile -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($savedPorts.model -ge 1024 -and $savedPorts.model -le 65535) { $modelPort = [int]$savedPorts.model }
}
function Test-ServicePort([int]$Port) {
    $probe = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback,$Port)
    try { $probe.Start(); return $true } catch { return $false } finally { $probe.Stop() }
}
if ($App -in 'all','services') {
    $knownModel = $entries | Where-Object Name -eq 'model-service' | Select-Object -First 1
    $modelRunning = $false
    if ($knownModel) {
        $knownProcess = Get-Process -Id $knownModel.ProcessId -ErrorAction SilentlyContinue
        $modelRunning = $knownProcess -and [math]::Abs(($knownProcess.StartTime.ToUniversalTime() - (Get-RecordedUtcTime $knownModel.StartedAt)).TotalSeconds) -lt 2
        if ($modelRunning) { $modelPort = [int]$knownModel.Port }
    }
    if (-not $modelRunning -and -not (Test-ServicePort $modelPort)) {
        $previousPort = $modelPort
        $modelPort = 0
        foreach ($candidate in 18001..18100) {
            if (Test-ServicePort $candidate) { $modelPort = $candidate; break }
        }
        if (-not $modelPort) { throw 'No available model-service port in 18001..18100.' }
        Write-Host "Model port $previousPort is unavailable; using $modelPort."
    }
    $portsTemporary = $portsFile + '.tmp'
    @{model=$modelPort} | ConvertTo-Json | Set-Content -LiteralPath $portsTemporary -Encoding UTF8
    Move-Item -LiteralPath $portsTemporary -Destination $portsFile -Force
}
$env:COACH_ENGINE_PORT = [string]$modelPort
$services = @()
if ($App -in 'all','services') {
    $services += @{Name='tts-service'; Port=9881; Exe=$inferencePython; Args=@((Join-Path $projectRoot 'services/launch.py'),'tts'); Cwd=$projectRoot}
}
if ($App -in 'all','services') {
    $services += @{Name='speech-service'; Port=8000; Exe=$inferencePython; Args=@((Join-Path $projectRoot 'services/launch.py'),'speech'); Cwd=$projectRoot}
    $services += @{Name='model-service'; Port=$modelPort; Exe=$inferencePython; Args=@((Join-Path $projectRoot 'services/launch.py'),'language'); Cwd=$projectRoot}
}
if ($App -in 'all','web') {
    $webArgs = if ($WebMode -eq 'start') { @((Join-Path $projectRoot 'apps/web/scripts/start.mjs')) } else { @((Join-Path $projectRoot 'apps/web/node_modules/next/dist/bin/next'),'dev','--hostname','127.0.0.1','--port','3000') }
    $services += @{Name='learning-web'; Port=3000; Exe=(Get-Command node.exe).Source; Args=$webArgs; Cwd=(Join-Path $projectRoot 'apps/web')}
}
foreach ($service in $services) {
    $existing = $entries | Where-Object Name -eq $service.Name | Select-Object -First 1
    if ($existing) {
        $running = Get-Process -Id $existing.ProcessId -ErrorAction SilentlyContinue
        if ($running -and [math]::Abs(($running.StartTime.ToUniversalTime() - (Get-RecordedUtcTime $existing.StartedAt)).TotalSeconds) -lt 2) {
            Write-Host "$($service.Name) is already running (PID $($running.Id))."
            continue
        }
    }
    $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback,$service.Port)
    try { $listener.Start() } catch { throw "Port $($service.Port) is occupied. Close its existing service before starting $($service.Name)." } finally { $listener.Stop() }
    if (-not (Test-Path -LiteralPath $service.Exe)) { throw "Missing runtime: $($service.Exe)" }
    $quotedArgs = ($service.Args | ForEach-Object { '"' + $_ + '"' }) -join ' '
    $process = Start-Process -FilePath $service.Exe -ArgumentList $quotedArgs -WorkingDirectory $service.Cwd -WindowStyle Hidden -RedirectStandardOutput (Join-Path $logDir "$($service.Name).out.log") -RedirectStandardError (Join-Path $logDir "$($service.Name).err.log") -PassThru
    $entries = @($entries | Where-Object Name -ne $service.Name)
    $entries += [PSCustomObject]@{Name=$service.Name; ProcessId=$process.Id; StartedAt=$process.StartTime.ToUniversalTime().ToString('o'); Exe=$service.Exe; Port=$service.Port}
    ConvertTo-Json -InputObject @($entries) | Set-Content -LiteralPath $stateFile -Encoding UTF8
    Write-Host "Started $($service.Name) (PID $($process.Id)), port $($service.Port)."
}
if ($App -in 'all','services') {
    Write-Host "Waiting for the $($ttsRuntime.provider) reference voice..."
    $ttsDeadline = [datetime]::UtcNow.AddSeconds(120)
    $ttsReady = $false
    do {
        try {
            $ttsResponse = Invoke-RestMethod -Uri 'http://127.0.0.1:9881/health' -TimeoutSec 2
            $ttsReady = $ttsResponse.ttsReady -eq $true
        } catch { }
        if (-not $ttsReady) { Start-Sleep -Milliseconds 500 }
    } while (-not $ttsReady -and [datetime]::UtcNow -lt $ttsDeadline)
    if (-not $ttsReady) { throw "TTS did not become ready. Check $logDir/tts-service.err.log." }
    Write-Host 'Reference voice is ready.'
}
Write-Host 'Shared speech API: http://127.0.0.1:8000/docs'
Write-Host 'English Learning: http://127.0.0.1:3000/dashboard'
Write-Host "Logs: $logDir"
Write-Host 'Models warm up after startup. Allow about 30-90 seconds before recording.'
} finally {
    if ($lockHeld) { $launchMutex.ReleaseMutex() }
    $launchMutex.Dispose()
}
