@echo off
cd /d C:\git\code-agent
echo === Checking index.js content (first 20 lines) ===
type node_modules\bun\index.js | head -20
echo.
echo === Checking bundle.js content (first 10 lines) ===
type node_modules\bun\bundle.js | head -10
echo.
echo === Running simple test ===
node -e "import('./node_modules/bun/index.js').then(m => console.log('✓ Loaded:', Object.keys(m))).catch(e => console.error('✗ Failed:', e.message))"
