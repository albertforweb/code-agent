@echo off
cd /d c:\git\code-agent
node stub-all.js
echo Exit Code: %ERRORLEVEL%
exit /b %ERRORLEVEL%
