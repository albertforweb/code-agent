@echo off
cd c:\git\code-agent
echo Installing dependencies...
call npm install
echo.
echo Testing the build...
call node dist/main.js --help
pause
