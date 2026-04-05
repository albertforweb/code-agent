@echo off
cd /d C:\git\code-agent
echo === Rebuilding project ===
call npm run build > build.log 2>&1
echo.
echo === Running import fixer ===
node fix-imports.js
echo.
echo === Testing with --help ===
node dist/main.js --help
echo.
echo === Build complete ===
