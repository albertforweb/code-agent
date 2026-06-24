@echo off
REM Build script for code-agent on Windows
REM Usage: build.bat [target]
REM Targets: build, clean, install, reinstall, watch, dev

setlocal enabledelayedexpansion

set "target=%1"
if "%target%"=="" set "target=build"

echo.
echo ========================================
echo Code-Agent Build Task: %target%
echo ========================================
echo.

goto %target%

:build
  call :clean
  call :install
  call :compile
  goto done

:clean
  echo 🧹 Cleaning build artifacts...
  if exist dist (
    rmdir /s /q dist 2>nul
  )
  exit /b 0

:install
  echo 📦 Installing dependencies...
  call npm install --legacy-peer-deps
  if errorlevel 1 (
    echo ❌ npm install failed
    exit /b 1
  )
  exit /b 0

:compile
  echo 🔨 Compiling TypeScript...
  call node run-build.js
  if errorlevel 1 (
    echo ❌ Build failed
    exit /b 1
  )
  exit /b 0

:reinstall
  echo 🔄 Full reinstall...
  echo   Removing node_modules...
  if exist node_modules (
    rmdir /s /q node_modules 2>nul
  )
  echo   Removing package-lock.json...
  if exist package-lock.json (
    del /q package-lock.json 2>nul
  )
  echo   Running npm install...
  call npm install --legacy-peer-deps
  if errorlevel 1 (
    echo ❌ Reinstall failed
    exit /b 1
  )
  goto done

:watch
  echo 👀 Watch mode enabled (Ctrl+C to stop)
  call npm run build:watch
  exit /b 0

:dev
  echo 🚀 Starting dev mode (Ctrl+C to stop)
  call npm run dev
  exit /b 0

:help
  echo.
  echo Usage: build.bat [target]
  echo.
  echo Available targets:
  echo   build       - Clean install and build (DEFAULT)
  echo   install     - Install dependencies only
  echo   compile     - Compile TypeScript only
  echo   clean       - Remove build artifacts
  echo   reinstall   - Clean reinstall everything
  echo   watch       - Watch mode (auto-rebuild)
  echo   dev         - Run in development mode
  echo   help        - Show this message
  echo.
  exit /b 0

:done
  echo.
  echo ✅ %target% complete!
  echo 📁 Output: .\dist
  echo.
  exit /b 0

:invalid
  echo ❌ Unknown target: %target%
  call :help
  exit /b 1
