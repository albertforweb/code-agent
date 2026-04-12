@echo off
REM Create bun module stubs and test
REM Run this in c:\git\code-agent

echo.
echo ============================================================
echo         Creating BUN MODULE STUBS
echo ============================================================
echo.

REM Create directory
echo Creating directory structure...
if not exist "node_modules\bun" mkdir node_modules\bun

REM Create index.js
echo Creating index.js...
(
echo // Bun runtime shims for Node.js compatibility
echo import crypto from 'crypto';
echo import { execSync, spawn as childSpawn } from 'child_process';
echo import fs from 'fs';
echo.
echo export function hash(input) {
echo   const hashObj = crypto.createHash('sha256');
echo   if (typeof input === 'string') {
echo     hashObj.update(input);
echo   } else {
echo     hashObj.update(input);
echo   }
echo   return hashObj.digest('hex');
echo }
echo.
echo export function gc(fullCollect) {
echo   if (globalThis.gc) {
echo     globalThis.gc(fullCollect);
echo   }
echo }
echo.
echo export function which(command) {
echo   try {
echo     const result = execSync(`which ${command}`, { encoding: 'utf-8' } ).trim();
echo     return result ^|^| null;
echo   } catch {
echo     return null;
echo   }
echo }
echo.
echo export function spawn(command, args, options) {
echo   return childSpawn(command, args ^|^| [], options ^|^| {});
echo }
echo.
echo export const file = {
echo   read: (filePath) =^> fs.readFileSync(filePath),
echo   write: (filePath, data) =^> fs.writeFileSync(filePath, data),
echo   exists: (filePath) =^> fs.existsSync(filePath),
echo };
echo.
echo export function stringWidth(str) {
echo   return str.replace(/\\x1b\\[[0-9;]*m/g, '').length;
echo }
echo.
echo export function wrapAnsi(str, width) {
echo   const lines = str.split('\n');
echo   return lines.map(line =^> {
echo     if (line.length ^<= width) return line;
echo     const chunks = [];
echo     let currentLine = '';
echo     for (const char of line) {
echo       if (currentLine.length ^>= width) {
echo         chunks.push(currentLine);
echo         currentLine = '';
echo       }
echo       currentLine += char;
echo     }
echo     if (currentLine) chunks.push(currentLine);
echo     return chunks.join('\n');
echo   }).join('\n');
echo }
echo.
echo export const semver = {
echo   parse: (version) =^> {
echo     const match = version.match(/^(\\d+)\\.(\\d+)\\.(\\d+)/);
echo     if (!match) return null;
echo     return {
echo       major: parseInt(match[1]),
echo       minor: parseInt(match[2]),
echo       patch: parseInt(match[3]),
echo     };
echo   },
echo   gte: (version, target) =^> {
echo     const v = semver.parse(version);
echo     const t = semver.parse(target);
echo     if (!v ^|^| !t) return false;
echo     return (
echo       v.major ^> t.major ^|^|
echo       (v.major === t.major ^&^& v.minor ^> t.minor) ^|^|
echo       (v.major === t.major ^&^& v.minor === t.minor ^&^& v.patch ^>= t.patch)
echo     );
echo   },
echo };
echo.
echo export default {
echo   hash,
echo   gc,
echo   which,
echo   spawn,
echo   file,
echo   stringWidth,
echo   wrapAnsi,
echo   semver,
echo };
echo.
echo (globalThis).Bun = {
echo   hash,
echo   gc,
echo   which,
echo   spawn,
echo   file,
echo   stringWidth,
echo   wrapAnsi,
echo   semver,
echo };
) > node_modules\bun\index.js

REM Create bundle.js
echo Creating bundle.js...
(
echo // Bun bundle module
echo export function feature(name) {
echo   return {
echo     enabled: false,
echo     value: undefined,
echo   };
echo }
echo.
echo export function bundle(entries, options) {
echo   return {
echo     outputs: [],
echo   };
echo }
echo.
echo export default {
echo   feature,
echo   bundle,
echo };
) > node_modules\bun\bundle.js

REM Create package.json
echo Creating package.json...
(
echo {
echo   "name": "bun",
echo   "version": "1.0.0",
echo   "type": "module",
echo   "main": "./index.js",
echo   "exports": {
echo     ".": "./index.js",
echo     "./bundle": "./bundle.js"
echo   }
echo }
) > node_modules\bun\package.json

echo.
echo ✅ Bun stubs created successfully!
echo.
echo Testing application...
echo.

call node dist\main.js --help

if %ERRORLEVEL% EQU 0 (
  echo.
  echo ============================================================
  echo                  ✅ SUCCESS!
  echo ============================================================
  echo.
  echo Application is working!
  echo.
) else (
  echo.
  echo ❌ Application failed with error code %ERRORLEVEL%
  echo.
)

pause
