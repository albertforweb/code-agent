@echo off
REM Comprehensive setup script for code-agent
REM This script creates the necessary bun shims and configuration files

setlocal enabledelayedexpansion

cd /d c:\git\code-agent

echo.
echo ============================================================
echo              EXECUTING SETUP.JS SCRIPT
echo ============================================================
echo.

REM Create the necessary directory structure first
echo Creating node_modules\bun directory...
if not exist "node_modules\bun" mkdir "node_modules\bun"

echo Creating @growthbook\growthbook directory...
if not exist "node_modules\@growthbook\growthbook" mkdir "node_modules\@growthbook\growthbook"

echo Creating proactive directory...
if not exist "proactive" mkdir "proactive"

echo.
echo All directories created successfully!
echo.

echo Running Node.js setup script...
echo.
node setup.js

if %ERRORLEVEL% EQU 0 (
  echo.
  echo ============================================================
  echo                  ✅ SETUP SUCCESSFUL!
  echo ============================================================
  echo.
  echo Bun shim module and other required files created.
  echo.
  echo Created files:
  echo  - node_modules/bun/index.js
  echo  - node_modules/bun/index.ts
  echo  - node_modules/bun/bundle.js
  echo  - node_modules/bun/bundle.ts
  echo  - node_modules/bun/package.json
  echo  - node_modules/@growthbook/growthbook/index.js
  echo  - node_modules/@growthbook/growthbook/package.json
  echo  - proactive/index.ts
  echo.
  echo The application is now ready to run!
  echo.
) else (
  echo.
  echo ❌ SETUP FAILED!
  echo.
  echo Error code: %ERRORLEVEL%
  echo.
)

pause
