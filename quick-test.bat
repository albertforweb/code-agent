@echo off
setlocal enabledelayedexpansion

cd /d C:\git\code-agent

echo === STARTING CLEAN BUILD ===
echo.

echo Step 1: Building...
npm run build
echo Build exit code: !errorlevel!
echo.

echo Step 2: Checking files exist...
if exist "dist\main.js" (
  echo ✓ dist/main.js exists
) else (
  echo ✗ dist/main.js MISSING!
  exit /b 1
)

if exist "node_modules\bun\index.js" (
  echo ✓ node_modules/bun/index.js exists
) else (
  echo ✗ node_modules/bun/index.js MISSING!
  exit /b 1
)

echo.
echo Step 3: Checking for unfixed imports...
findstr /C:"from 'src/" dist\main.js >nul
if !errorlevel! equ 0 (
  echo ✗ FAILED: dist/main.js still has unfixed src/ imports!
  findstr /C:"from 'src/" dist\main.js | head -5
  exit /b 1
) else (
  echo ✓ No src/ imports found
)

echo.
echo Step 4: Testing execution...
node dist/main.js --help
if !errorlevel! equ 0 (
  echo.
  echo ✅✅✅ SUCCESS! ✅✅✅
) else (
  echo.
  echo ✗ Execution failed
  exit /b 1
)
