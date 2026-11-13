param([ValidateSet('all','web','services')][string]$App = 'all')
$ErrorActionPreference = 'Stop'
$stateFile = Join-Path $PSScriptRoot 'deployment/runtime.json'
if (-not (Test-Path -LiteralPath $stateFile)) { Write-Host 'No recorded services.'; return }
$rootHash = [System.Security.Cryptography.SHA256]::Create()
$mutexId = ([BitConverter]::ToString($rootHash.ComputeHash([Text.Encoding]::UTF8.GetBytes($PSScriptRoot.ToLowerInvariant())))).Replace('-','')
$rootHash.Dispose()
$launchMutex = [Threading.Mutex]::new($false, "Local\EnglishLearningApps-$mutexId")
$lockHeld = $false
try {
    try { $lockHeld = $launchMutex.WaitOne(180000) } catch [Threading.AbandonedMutexException] { $lockHeld = $true }
    if (-not $lockHeld) { throw 'Startup is still in progress. Retry shutdown shortly.' }
# Separate assignment keeps JSON arrays flat in both PowerShell 5.1 and 7.
$savedEntries = Get-Content -LiteralPath $stateFile -Raw -Encoding UTF8 | ConvertFrom-Json
$entries = @($savedEntries)
function Get-RecordedUtcTime($value) {
    if ($value -is [datetime]) { return $value.ToUniversalTime() }
    return [datetimeoffset]::Parse([string]$value, [Globalization.CultureInfo]::InvariantCulture).UtcDateTime
}
$remaining = @()
foreach ($entry in ($entries | Sort-Object { if ($_.Port -eq 3000) { 0 } else { 1 } })) {
    $selected = ($App -eq 'web' -and $entry.Port -eq 3000) -or $App -in 'all' -or ($App -eq 'services' -and $entry.Port -ne 3000)
    if ($entry.Port -eq 9881) { $selected = $App -in 'all','services' }
    if (-not $selected) { $remaining += $entry; continue }
    $process = Get-Process -Id $entry.ProcessId -ErrorAction SilentlyContinue
    if (-not $process) { continue }
    if ([math]::Abs(($process.StartTime.ToUniversalTime() - (Get-RecordedUtcTime $entry.StartedAt)).TotalSeconds) -ge 2) {
        Write-Warning "PID $($entry.ProcessId) was reused; leaving it untouched."
        continue
    }
    # Stop only the verified launcher process and its own descendants (Next.js spawns a worker).
    & taskkill.exe /PID $entry.ProcessId /T /F | Out-Null
    if ($LASTEXITCODE -ne 0) { $remaining += $entry; Write-Warning "Could not stop $($entry.Name)." } else { Write-Host "Stopped $($entry.Name)." }
}
ConvertTo-Json -InputObject @($remaining) | Set-Content -LiteralPath $stateFile -Encoding UTF8
$modelPort = 8001
$modelEntry = $entries | Where-Object Name -eq 'model-service' | Select-Object -First 1
if ($modelEntry) { $modelPort = [int]$modelEntry.Port }
$selectedPorts = @(switch ($App) {
    'services' { @(8000,$modelPort,9881) }
    'web' { @(3000) }
    'all' { @(3000,8000,$modelPort,9881) }
})
# Verify TCP listeners, rather than equating a successful taskkill with shutdown.
$deadline = [datetime]::UtcNow.AddSeconds(5)
do {
    $stillListening = @(Get-NetTCPConnection -State Listen -ErrorAction Stop | Where-Object { $_.LocalPort -in $selectedPorts })
    if ($stillListening.Count -eq 0) { break }
    Start-Sleep -Milliseconds 200
} while ([datetime]::UtcNow -lt $deadline)
if ($stillListening.Count -gt 0) {
    $occupiedPorts = ($stillListening.LocalPort | Sort-Object -Unique) -join ', '
    throw "Shutdown incomplete: ports $occupiedPorts are still listening. No unrelated process was stopped."
}
Write-Host 'All selected services stopped; their ports are closed.'
} finally {
    if ($lockHeld) { $launchMutex.ReleaseMutex() }
    $launchMutex.Dispose()
}
