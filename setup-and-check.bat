@echo off
cd /d C:\git\code-agent
echo === Running setup to create bun stubs ===
node setup.js
echo.
echo === Listing bun directory ===
dir node_modules\bun
echo.
echo === Checking for index.js ===
if exist "node_modules\bun\index.js" (
  echo ✓ index.js exists
) else (
  echo ✗ index.js NOT found
)
echo.
echo === Checking for bundle.js ===
if exist "node_modules\bun\bundle.js" (
  echo ✓ bundle.js exists
) else (
  echo ✗ bundle.js NOT found
)
