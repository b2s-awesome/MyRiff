@echo off
setlocal
cd /d "%~dp0"
echo Starting MyRiff one-click setup...
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0Install-MyRiff-Windows.ps1"
set "SETUP_EXIT=%ERRORLEVEL%"
echo.
if not "%SETUP_EXIT%"=="0" (
  echo Setup did not complete successfully. Check myriff-setup.log in this folder.
) else (
  echo MyRiff setup finished.
)
echo.
pause
exit /b %SETUP_EXIT%
