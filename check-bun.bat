@echo off
echo === Checking node_modules/bun directory ===
if exist "C:\git\code-agent\node_modules\bun" (
  dir "C:\git\code-agent\node_modules\bun"
) else (
  echo Directory does not exist
)
echo.
echo === Checking for .ts files ===
dir "C:\git\code-agent\node_modules\bun\*.ts" 2>nul || echo No .ts files found
echo.
echo === Checking for .js files ===
dir "C:\git\code-agent\node_modules\bun\*.js" 2>nul || echo No .js files found
