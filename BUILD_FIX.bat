@echo off
REM Complete build fix script
REM Run this in c:\git\code-agent directory

echo.
echo ============================================================
echo         CODE-AGENT BUILD FIX - INSTALLATION SCRIPT
echo ============================================================
echo.

echo Step 1: Installing missing npm packages...
echo.
call npm install --legacy-peer-deps

if %ERRORLEVEL% NEQ 0 (
  echo.
  echo ❌ npm install failed with error code %ERRORLEVEL%
  pause
  exit /b %ERRORLEVEL%
)

echo.
echo Step 2: Checking installed packages...
echo.
call node check-packages.js

if %ERRORLEVEL% NEQ 0 (
  echo.
  echo ⚠️  Some packages are still missing
  pause
  exit /b %ERRORLEVEL%
)

echo.
echo Step 3: Testing application...
echo.
call node dist/main.js --help

if %ERRORLEVEL% EQU 0 (
  echo.
  echo ============================================================
  echo            ✅ BUILD FIX COMPLETE!
  echo ============================================================
  echo.
  echo The application is now working properly.
  echo You can run: node dist/main.js --help
  echo.
  pause
  exit /b 0
) else (
  echo.
  echo ❌ Application test failed
  pause
  exit /b %ERRORLEVEL%
)
