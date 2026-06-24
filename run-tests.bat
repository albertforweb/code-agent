@echo off
REM Test script for Windows - generates test.log

setlocal enabledelayedexpansion

set "logfile=test.log"

(
  echo.
  echo ========================================================================
  echo TEST 1: Running Build (node run-build.js)
  echo ========================================================================
  echo.
  
  node run-build.js 2>&1
  
  echo.
  echo ========================================================================
  echo TEST 2: Checking if dist/main.js exists
  echo ========================================================================
  echo.
  
  if exist dist\main.js (
    echo [OK] dist/main.js exists
    dir dist\main.js
  ) else (
    echo [ERROR] dist/main.js NOT FOUND
  )
  
  echo.
  echo ========================================================================
  echo TEST 3: First 50 lines of dist/main.js
  echo ========================================================================
  echo.
  
  if exist dist\main.js (
    more dist\main.js
  ) else (
    echo [ERROR] Cannot show - file does not exist
  )
  
  echo.
  echo ========================================================================
  echo TEST 4: Checking for unfixed src/ imports
  echo ========================================================================
  echo.
  
  if exist dist\main.js (
    echo Searching for: from 'src/
    findstr "from 'src/" dist\main.js 2>nul
    if errorlevel 1 (
      echo [OK] No src/ imports found
    ) else (
      echo [ERROR] Found src/ imports above
    )
  )
  
  echo.
  echo ========================================================================
  echo TEST 5: Checking for unfixed bun:bundle imports
  echo ========================================================================
  echo.
  
  if exist dist\main.js (
    echo Searching for: from 'bun:bundle
    findstr "from 'bun:bundle" dist\main.js 2>nul
    if errorlevel 1 (
      echo [OK] No bun:bundle imports found
    ) else (
      echo [ERROR] Found bun:bundle imports above
    )
  )
  
  echo.
  echo ========================================================================
  echo TEST 6: Executing: node dist/main.js --help
  echo ========================================================================
  echo.
  
  if exist dist\main.js (
    echo Running: node dist/main.js --help
    echo (limiting output to 100 lines)
    echo.
    node dist\main.js --help 2>&1 | more
  ) else (
    echo [ERROR] Cannot execute - dist/main.js does not exist
  )
  
  echo.
  echo ========================================================================
  echo TEST COMPLETE
  echo ========================================================================
) > "%logfile%" 2>&1

echo.
echo ========================================================================
echo Test results saved to: %logfile%
echo ========================================================================
echo.
type "%logfile%"

endlocal
