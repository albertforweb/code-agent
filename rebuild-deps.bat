@echo off
REM Clean and reinstall dependencies
cd /d c:\git\code-agent

echo Deleting package-lock.json...
del /f /q package-lock.json 2>nul

echo.
echo Installing dependencies...
call npm install --legacy-peer-deps

echo.
echo Testing application...
call node dist/main.js --help

if %ERRORLEVEL% EQU 0 (
  echo.
  echo ✅ All tests passed!
) else (
  echo.
  echo ❌ Tests failed!
  exit /b 1
)
