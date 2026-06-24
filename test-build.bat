@echo off
cd /d C:\git\code-agent
echo === CLEAN BUILD TEST ===
npm run build
echo.
echo === CHECKING RESULTS ===
echo.
if exist "dist\main.js" (
  echo ✓ dist/main.js exists
  node dist/main.js --help
) else (
  echo ✗ dist/main.js not found!
  exit /b 1
)
