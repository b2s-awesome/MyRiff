@echo off
setlocal
cd /d "%~dp0"
where powershell.exe >nul 2>nul
if errorlevel 1 (
  echo Windows PowerShell was not found.
  pause
  exit /b 1
)
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Build-MyRiff-Windows.ps1"
set "RESULT=%ERRORLEVEL%"
if not "%RESULT%"=="0" (
  echo.
  echo MyRiff build failed. See myriff-build.log in this folder.
  pause
  exit /b %RESULT%
)
echo.
echo Build succeeded. Check the release folder.
pause
exit /b 0
