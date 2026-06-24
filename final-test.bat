@echo off
cd /d C:\git\code-agent
echo === FRESH COMPLETE BUILD TEST ===
echo.
npm run build > test.log 2>&1
echo.
echo === Checking if bun modules exist ===
if exist "node_modules\bun\index.js" (
  echo ✓ node_modules/bun/index.js exists
) else (
  echo ✗ node_modules/bun/index.js MISSING!
  exit /b 1
)
echo.
echo === Testing execution ===
node dist/main.js --help
if %errorlevel% equ 0 (
  echo.
  echo ✅ SUCCESS! Application works!
) else (
  echo.
  echo ✗ Execution failed (check output above)
)
