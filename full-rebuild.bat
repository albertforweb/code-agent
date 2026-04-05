@echo off
cd /d C:\git\code-agent
node setup.js
if %errorlevel% equ 0 (
  echo Setup completed successfully
  node fix-imports.js
  echo Running test...
  node dist/main.js --help
) else (
  echo Setup failed with error code %errorlevel%
)
