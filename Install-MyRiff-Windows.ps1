# MyRiff Windows one-click development setup
# Installs Node.js LTS, FFmpeg and yt-dlp using WinGet, then installs npm dependencies. Deno is optional; Node 22+ is the fallback JS runtime for yt-dlp.
# Optional native build tools are offered only if npm install fails.
# Native child processes are read through .NET Process to avoid PowerShell 5.1 stderr misclassification.

$ErrorActionPreference = 'Stop'
$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$LogPath = Join-Path $ProjectRoot 'myriff-setup.log'

try { Start-Transcript -Path $LogPath -Append | Out-Null } catch {}

function Write-Step([string]$Message) {
    Write-Host "`n==> $Message" -ForegroundColor Cyan
}

function Test-Command([string]$Name) {
    return [bool](Get-Command $Name -ErrorAction SilentlyContinue)
}

# Windows PowerShell 5.1 converts native-program stderr into PowerShell error records.
# npm commonly writes deprecation warnings to stderr even when installation succeeds.
# Run child processes through System.Diagnostics.Process so stderr cannot become a
# terminating PowerShell error; decide success using the child's real exit code.
function ConvertTo-WindowsQuotedArgument([string]$Value) {
    $builder = New-Object System.Text.StringBuilder
    [void]$builder.Append('"')
    $backslashes = 0
    foreach ($character in $Value.ToCharArray()) {
        if ([int][char]$character -eq 92) {
            $backslashes++
            continue
        }
        if ([int][char]$character -eq 34) {
            if ($backslashes -gt 0) {
                [void]$builder.Append(('\' * (($backslashes * 2) + 1)))
            } else {
                [void]$builder.Append('\')
            }
            [void]$builder.Append('"')
        } else {
            if ($backslashes -gt 0) { [void]$builder.Append(('\' * $backslashes)) }
            [void]$builder.Append($character)
        }
        $backslashes = 0
    }
    if ($backslashes -gt 0) { [void]$builder.Append(('\' * ($backslashes * 2))) }
    [void]$builder.Append('"')
    return $builder.ToString()
}

function Invoke-NativeProcess([string]$FilePath, [string[]]$Arguments, [switch]$ShowOutput) {
    $startInfo = New-Object System.Diagnostics.ProcessStartInfo
    $extension = [System.IO.Path]::GetExtension($FilePath).ToLowerInvariant()
    $quotedArguments = @()
    foreach ($argument in $Arguments) {
        $quotedArguments += (ConvertTo-WindowsQuotedArgument ([string]$argument))
    }

    if ($extension -eq '.cmd' -or $extension -eq '.bat') {
        # .cmd/.bat files must be launched via cmd.exe on Windows.
        $startInfo.FileName = $env:ComSpec
        $command = (ConvertTo-WindowsQuotedArgument $FilePath)
        if ($quotedArguments.Count -gt 0) { $command += ' ' + ($quotedArguments -join ' ') }
        $startInfo.Arguments = '/d /s /c "' + $command + '"'
    } else {
        $startInfo.FileName = $FilePath
        $startInfo.Arguments = ($quotedArguments -join ' ')
    }

    $startInfo.UseShellExecute = $false
    $startInfo.CreateNoWindow = $true
    $startInfo.RedirectStandardOutput = $true
    $startInfo.RedirectStandardError = $true

    $process = New-Object System.Diagnostics.Process
    $process.StartInfo = $startInfo
    $outputLines = New-Object 'System.Collections.Generic.List[string]'
    try {
        $null = $process.Start()
        $stdoutTask = $process.StandardOutput.ReadLineAsync()
        $stderrTask = $process.StandardError.ReadLineAsync()
        $stdoutDone = $false
        $stderrDone = $false

        # Read both pipes concurrently so neither can fill up and deadlock the child.
        while (-not ($stdoutDone -and $stderrDone)) {
            $didWork = $false
            if (-not $stdoutDone -and $stdoutTask.IsCompleted) {
                $line = $stdoutTask.Result
                if ($null -eq $line) {
                    $stdoutDone = $true
                } else {
                    $outputLines.Add($line)
                    if ($ShowOutput) { Write-Host $line }
                    $stdoutTask = $process.StandardOutput.ReadLineAsync()
                }
                $didWork = $true
            }
            if (-not $stderrDone -and $stderrTask.IsCompleted) {
                $line = $stderrTask.Result
                if ($null -eq $line) {
                    $stderrDone = $true
                } else {
                    $outputLines.Add($line)
                    if ($ShowOutput) { Write-Host $line }
                    $stderrTask = $process.StandardError.ReadLineAsync()
                }
                $didWork = $true
            }
            if (-not $didWork) { Start-Sleep -Milliseconds 25 }
        }
        $process.WaitForExit()
        $exitCode = [int]$process.ExitCode
    }
    finally {
        $process.Dispose()
    }

    return [pscustomobject]@{
        ExitCode = $exitCode
        Output = ($outputLines -join [Environment]::NewLine)
    }
}

function Invoke-NativeCommand([string]$FilePath, [string[]]$Arguments) {
    $result = Invoke-NativeProcess -FilePath $FilePath -Arguments $Arguments -ShowOutput
    return [int]$result.ExitCode
}

function Get-NativeCommandOutput([string]$FilePath, [string[]]$Arguments) {
    return (Invoke-NativeProcess -FilePath $FilePath -Arguments $Arguments)
}

function Get-FirstOutputLine([string]$Output) {
    $line = $Output -split "`r?`n" | Where-Object { -not [string]::IsNullOrWhiteSpace($_) } | Select-Object -First 1
    if ($null -eq $line) { return '' }
    return $line.ToString().Trim()
}

function Invoke-WinGetInstall([string]$Id, [string]$Name, [string]$Override = '') {
    Write-Step "Installing $Name ($Id) with WinGet"
    $args = @('install', '--exact', '--id', $Id, '--accept-package-agreements', '--accept-source-agreements', '--silent')
    if ($Override) { $args += @('--override', $Override) }
    $code = Invoke-NativeCommand -FilePath 'winget' -Arguments $args
    if ($code -ne 0) {
        throw "WinGet failed to install $Name (exit code $code). See https://learn.microsoft.com/windows/package-manager/winget/"
    }
    Refresh-Path
}

function Ensure-WinGetPackage([string]$CommandName, [string]$Id, [string]$Name, [string]$MinimumMajor = '') {
    $haveGoodVersion = $false
    if (Test-Command $CommandName) {
        if ($MinimumMajor -eq '') {
            $haveGoodVersion = $true
        } else {
            try {
                $versionResult = Get-NativeCommandOutput -FilePath $CommandName -Arguments @('--version')
                $rawVersionText = Get-FirstOutputLine $versionResult.Output
                $versionMatch = [regex]::Match($rawVersionText, '\d+(?:\.\d+)*')
                if (-not $versionMatch.Success) { throw "Could not parse $Name version: $rawVersionText" }
                $versionText = $versionMatch.Value
                $major = [int](($versionText -split '\.')[0])
                $haveGoodVersion = ($versionResult.ExitCode -eq 0 -and $major -ge [int]$MinimumMajor)
                if (-not $haveGoodVersion) {
                    Write-Host "$Name $versionText is too old or could not be verified; a newer LTS version is needed." -ForegroundColor Yellow
                }
            } catch { $haveGoodVersion = $false }
        }
    }
    if ($haveGoodVersion) {
        Write-Host "$Name is already available; skipping install." -ForegroundColor Green
        return
    }

    # Upgrade if WinGet knows about an older install; if that fails, attempt a fresh install.
    if ($CommandName -eq 'node' -and (Test-Command 'node')) {
        Write-Step "Updating Node.js to the current LTS"
        $upgradeCode = Invoke-NativeCommand -FilePath 'winget' -Arguments @('upgrade', '--exact', '--id', $Id, '--accept-package-agreements', '--accept-source-agreements', '--silent')
        if ($upgradeCode -ne 0) {
            Invoke-WinGetInstall $Id $Name
        } else {
            Refresh-Path
        }
    } else {
        Invoke-WinGetInstall $Id $Name
    }
}

function Refresh-Path {
    $machinePath = [Environment]::GetEnvironmentVariable('Path', 'Machine')
    $userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
    $env:Path = "$machinePath;$userPath"
    # Include common per-user WinGet/portable command directories in this running process.
    $extras = @(
        (Join-Path $env:LOCALAPPDATA 'Microsoft\WinGet\Links'),
        (Join-Path $env:LOCALAPPDATA 'Programs\Deno\bin'),
        (Join-Path $env:APPDATA 'npm')
    )
    foreach ($extra in $extras) {
        if ((Test-Path $extra) -and ($env:Path -notlike "*$extra*")) { $env:Path = "$env:Path;$extra" }
    }
}

function Test-NodeJsRuntime {
    if (-not (Test-Command 'node')) { return $false }
    try {
        $versionResult = Get-NativeCommandOutput -FilePath 'node' -Arguments @('--version')
        $rawVersionText = Get-FirstOutputLine $versionResult.Output
        $versionMatch = [regex]::Match($rawVersionText, '\d+(?:\.\d+)*')
        if (-not $versionMatch.Success) { return $false }
        $versionText = $versionMatch.Value
        $major = [int](($versionText -split '\.')[0])
        return ($versionResult.ExitCode -eq 0 -and $major -ge 22)
    } catch { return $false }
}

function Install-NativeBuildTools {
    Write-Step 'Installing optional native-module build prerequisites'
    if (-not (Test-Command 'python')) {
        Invoke-WinGetInstall 'Python.Python.3.12' 'Python 3.12'
    }
    # Use the documented Visual Studio C++ workload so better-sqlite3 can compile if no prebuilt binary is available.
    Invoke-WinGetInstall 'Microsoft.VisualStudio.2022.BuildTools' 'Visual Studio Build Tools 2022' '--wait --quiet --norestart --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended'
}

try {
    Write-Host @'
 __  __       ____  _  __  __
|  \/  |_   _|  _ \| |/ / |  \
| |\/| | | | | |_) | ' /  | |\/|
| |  | | |_| |  _ <| . \  | |  |
|_|  |_|\__, |_| \_\_|\_\ |_|  |_|
        |___/
MyRiff Windows Setup
'@ -ForegroundColor Magenta

    if (-not (Test-Path (Join-Path $ProjectRoot 'package.json'))) {
        throw 'package.json not found beside this script. Extract the MyRiff project ZIP first, then run Install-MyRiff-Windows.bat from its root folder.'
    }
    $package = Get-Content (Join-Path $ProjectRoot 'package.json') -Raw | ConvertFrom-Json
    if ($package.name -ne 'myriff') { throw 'This script must be run from the MyRiff project root.' }

    if (-not (Test-Command 'winget')) {
        throw 'WinGet is not available. Install or update App Installer from the Microsoft Store, then rerun this script.'
    }

    Write-Step 'Installing required tools'
    Ensure-WinGetPackage 'node' 'OpenJS.NodeJS.LTS' 'Node.js LTS' '22'
    Ensure-WinGetPackage 'ffmpeg' 'Gyan.FFmpeg' 'FFmpeg'
    Ensure-WinGetPackage 'yt-dlp' 'yt-dlp.yt-dlp' 'yt-dlp'

    # Deno is recommended by yt-dlp, but WinGet sometimes reports 0x8A15002B
    # (UPDATE_NOT_APPLICABLE) even when a package is already staged/registered.
    # MyRiff can use Node 22+ explicitly as yt-dlp's JavaScript runtime instead.
    try {
        Ensure-WinGetPackage 'deno' 'DenoLand.Deno' 'Deno (recommended yt-dlp JavaScript runtime)' '2'
    } catch {
        Refresh-Path
        if (Test-NodeJsRuntime) {
            Write-Host "Deno could not be installed through WinGet: $($_.Exception.Message)" -ForegroundColor Yellow
            Write-Host 'Continuing with Node.js 22+ as the yt-dlp JavaScript runtime.' -ForegroundColor Yellow
        } else {
            throw 'Deno installation failed and Node.js 22+ is not available as a fallback. Resolve the Deno/Node installation issue and rerun setup.'
        }
    }

    Refresh-Path
    Write-Step 'Verifying required tools'
    foreach ($tool in @('node', 'npm', 'ffmpeg', 'yt-dlp')) {
        if (-not (Test-Command $tool)) {
            throw "Required tool '$tool' is not available on PATH after installation. Open a new terminal and rerun setup; if it still fails, install '$tool' with WinGet manually."
        }
        $commandPath = if ($tool -eq 'npm') { 'npm.cmd' } else { $tool }
        # FFmpeg's CLI uses the single-dash -version option. Passing --version
        # makes FFmpeg return AVERROR_OPTION_NOT_FOUND (-1414549496 / 0xABAFB008).
        $versionArgs = if ($tool -eq 'ffmpeg') { @('-version') } else { @('--version') }
        $versionResult = Get-NativeCommandOutput -FilePath $commandPath -Arguments $versionArgs
        $version = Get-FirstOutputLine $versionResult.Output
        if ($versionResult.ExitCode -ne 0 -or [string]::IsNullOrWhiteSpace($version)) {
            throw "Required tool '$tool' was found but its version check failed (exit code $($versionResult.ExitCode)). Check that its installation is healthy and rerun setup."
        }
        Write-Host ("{0}: {1}" -f $tool, $version) -ForegroundColor Green
    }
    if (Test-Command 'deno') {
        $denoResult = Get-NativeCommandOutput -FilePath 'deno' -Arguments @('--version')
        $denoVersion = Get-FirstOutputLine $denoResult.Output
        if ($denoResult.ExitCode -eq 0 -and $denoVersion) {
            Write-Host ("deno: {0}" -f $denoVersion) -ForegroundColor Green
        } else {
            Write-Host 'deno is installed but its version probe failed; Node.js 22+ will be used if compatible.' -ForegroundColor Yellow
        }
    } else {
        Write-Host 'deno: not installed (optional; yt-dlp will use Node.js if supported).' -ForegroundColor Yellow
    }

    if (-not (Test-Command 'node') -or -not (Test-Command 'npm')) {
        throw 'Node.js/npm is not on PATH. Close this window, reopen it and run the setup again.'
    }
    if (-not (Test-NodeJsRuntime) -and -not (Test-Command 'deno')) {
        throw 'Neither a supported Deno runtime nor Node.js 22+ was detected. Install a supported yt-dlp JavaScript runtime and rerun setup.'
    }

    Push-Location $ProjectRoot
    try {
        Write-Step 'Installing MyRiff npm packages (including Electron native dependencies)'
        $installCode = Invoke-NativeCommand -FilePath 'npm.cmd' -Arguments @('install')
        if ($installCode -ne 0) {
            Write-Host "npm install failed with exit code $installCode." -ForegroundColor Yellow
            $answer = Read-Host 'Install Python and Visual Studio C++ Build Tools, then retry? This can take several GB of disk space. [y/N]'
            if ($answer -match '^(y|yes)$') {
                Install-NativeBuildTools
                Refresh-Path
                Write-Step 'Retrying npm install'
                $retryInstallCode = Invoke-NativeCommand -FilePath 'npm.cmd' -Arguments @('install')
                if ($retryInstallCode -ne 0) { throw "npm install still failed (exit code $retryInstallCode). Review myriff-setup.log and the npm output above." }
            } else {
                throw 'Setup stopped because npm install did not complete. The external tools may be installed; rerun setup after resolving the npm error.'
            }
        }

        Write-Step 'Checking TypeScript'
        $typecheckCode = Invoke-NativeCommand -FilePath 'npm.cmd' -Arguments @('run', 'typecheck')
        if ($typecheckCode -ne 0) {
            Write-Host 'TypeScript check reported errors. The dependencies are installed, but the source needs fixes before a clean build.' -ForegroundColor Yellow
        } else {
            Write-Host 'TypeScript check passed.' -ForegroundColor Green
        }

        Write-Host "`nSetup completed. Project folder: $ProjectRoot" -ForegroundColor Green
        Write-Host 'To launch MyRiff in development mode later, open a terminal here and run: npm run dev' -ForegroundColor Cyan
        $launch = Read-Host 'Launch MyRiff now? [Y/n]'
        if ($launch -notmatch '^(n|no)$') {
            $devCode = Invoke-NativeCommand -FilePath 'npm.cmd' -Arguments @('run', 'dev')
            if ($devCode -ne 0) { Write-Host "MyRiff development server exited with code $devCode." -ForegroundColor Yellow }
        }
    }
    finally {
        Pop-Location
    }
}
catch {
    Write-Host "`nSETUP FAILED: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "Log file: $LogPath" -ForegroundColor Yellow
    exit 1
}
finally {
    try { Stop-Transcript | Out-Null } catch {}
}
