@echo off
setlocal enabledelayedexpansion

cd /d C:\git\code-agent

echo === Step 1: Setup (create bun stubs) ===
node setup.js
if %errorlevel% neq 0 (
  echo ✗ Setup failed
  exit /b 1
)

echo.
echo === Step 2: Verify bun files exist ===
if exist "node_modules\bun\index.js" (
  echo ✓ index.js exists
) else (
  echo ✗ index.js missing
  exit /b 1
)
if exist "node_modules\bun\bundle.js" (
  echo ✓ bundle.js exists
) else (
  echo ✗ bundle.js missing
  exit /b 1
)
if exist "node_modules\bun\package.json" (
  echo ✓ package.json exists
) else (
  echo ✗ package.json missing
  exit /b 1
)

echo.
echo === Step 3: Build TypeScript ===
call npm run build > build.log 2>&1

echo.
echo === Step 4: Fix imports in dist/ ===
node fix-imports.js

echo.
echo === Step 5: Test execution ===
node dist/main.js --help
if %errorlevel% equ 0 (
  echo.
  echo ✅ SUCCESS! The application works!
) else (
  echo.
  echo ✗ Test failed
  exit /b 1
)
