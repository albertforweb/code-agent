@echo off
cd /d C:\git\code-agent
echo === FINAL COMPLETE BUILD TEST ===
echo.
npm run build > test.log 2>&1
echo.
echo === Verifying build files exist ===
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
echo === Testing execution ===
node dist/main.js --help
if %errorlevel% equ 0 (
  echo.
  echo ✅✅✅ SUCCESS! Application works! ✅✅✅
) else (
  echo.
  echo ✗ Execution failed (check test.log)
  type test.log | tail -50
)
