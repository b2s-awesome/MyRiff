[CmdletBinding()]
param(
    [switch]$SkipTypecheck,
    [switch]$SkipTests,
    [switch]$KeepGoing
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$LogPath = Join-Path $ProjectRoot 'myriff-build.log'
Set-Location $ProjectRoot

function Invoke-BuildStep {
    param([Parameter(Mandatory)][string]$Label, [Parameter(Mandatory)][string]$Command, [Parameter(Mandatory)][string[]]$Arguments)
    Write-Host "`n=== $Label ===" -ForegroundColor Cyan
    "`n=== $Label ===" | Out-File -FilePath $LogPath -Append -Encoding utf8
    & $Command @Arguments 2>&1 | Tee-Object -FilePath $LogPath -Append | Out-Host
    $code = $LASTEXITCODE
    if ($code -ne 0) {
        Write-Host "$Label failed (exit code $code). Log: $LogPath" -ForegroundColor Red
        if (-not $KeepGoing) { exit $code }
        return $false
    }
    return $true
}

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    throw 'Node.js was not found. Install Node.js 22 LTS, reopen PowerShell, and rerun this script.'
}
$nodeMajor = [int]((node -p "process.versions.node.split('.')[0]") -replace '[^0-9]', '')
if ($nodeMajor -lt 22) { throw "Node.js 22+ is required; detected $(node -v). Install Node.js 22 LTS." }

'' | Set-Content -Path $LogPath -Encoding utf8
Write-Host "MyRiff Windows build | Node $(node -v) | Project $ProjectRoot" -ForegroundColor Green

if (-not (Test-Path (Join-Path $ProjectRoot 'node_modules'))) {
    if (-not (Invoke-BuildStep -Label 'Install npm dependencies' -Command 'npm' -Arguments @('install','--no-audit','--no-fund'))) { exit 1 }
} else {
    Write-Host 'node_modules exists; refreshing dependencies...' -ForegroundColor DarkGray
    if (-not (Invoke-BuildStep -Label 'Install/update npm dependencies' -Command 'npm' -Arguments @('install','--no-audit','--no-fund'))) { exit 1 }
}

if (-not $SkipTypecheck) {
    if (-not (Invoke-BuildStep -Label 'TypeScript typecheck' -Command 'npm' -Arguments @('run','typecheck'))) { exit 1 }
}
if (-not $SkipTests) {
    if (-not (Invoke-BuildStep -Label 'Source tests' -Command 'npm' -Arguments @('test'))) { exit 1 }
    if (-not (Invoke-BuildStep -Label 'TypeScript syntax check' -Command 'npm' -Arguments @('run','lint:syntax'))) { exit 1 }
    if (-not (Invoke-BuildStep -Label 'Source sanity' -Command 'npm' -Arguments @('run','lint:source'))) { exit 1 }
}
if (-not (Invoke-BuildStep -Label 'Build Windows installer and ZIP' -Command 'npm' -Arguments @('run','dist:win'))) { exit 1 }

$ReleasePath = Join-Path $ProjectRoot 'release'
Write-Host "`nBuild completed. Output files:" -ForegroundColor Green
Get-ChildItem -Path $ReleasePath -File | Select-Object Name, Length, LastWriteTime | Format-Table -AutoSize
Write-Host "Full log: $LogPath"
