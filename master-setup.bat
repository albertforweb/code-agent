@echo off
REM Comprehensive Windows batch setup for code-agent project
REM This creates all necessary directories and files

setlocal enabledelayedexpansion

cd /d c:\git\code-agent

echo.
echo ============================================================
echo              SETUP SCRIPT FOR CODE-AGENT
echo ============================================================
echo.

REM First, try to create directories
echo Creating required directories...
if not exist "node_modules" mkdir "node_modules"
if not exist "node_modules\bun" mkdir "node_modules\bun"
if not exist "node_modules\@growthbook" mkdir "node_modules\@growthbook"
if not exist "node_modules\@growthbook\growthbook" mkdir "node_modules\@growthbook\growthbook"
if not exist "proactive" mkdir "proactive"

echo All directories created!
echo.

REM Now try Python setup if available
echo Attempting to run Python setup script...
python setup.py
if %ERRORLEVEL% EQU 0 (
    echo Python setup succeeded!
    goto success
)

REM If Python fails, try the Node.js setup
echo Attempting to run Node.js setup script...
node setup.js
if %ERRORLEVEL% EQU 0 (
    goto success
)

REM If both fail, try the batch file approach
echo Using batch file approach to create files...
call setup-bun.bat
if %ERRORLEVEL% EQU 0 (
    goto success
)

echo.
echo Error: Could not run setup script
pause
exit /b 1

:success
echo.
echo ============================================================
echo                  ✅ SETUP SUCCESSFUL!
echo ============================================================
echo.
echo The following have been created:
echo  - node_modules/bun/index.js
echo  - node_modules/bun/bundle.js
echo  - node_modules/bun/package.json
echo  - node_modules/@growthbook/growthbook/index.js
echo  - node_modules/@growthbook/growthbook/package.json
echo  - proactive/index.ts
echo.
echo The application is now ready to run!
echo.
pause
exit /b 0
