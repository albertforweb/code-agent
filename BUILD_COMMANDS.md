# Build Commands Reference

This project has multiple ways to build - choose the one that works best for your system.

## Quick Reference

### ⚡ Quickest Way (All Systems)
```bash
# Using npm (works everywhere)
npm run build
```

### 🎯 Recommended Ways

#### Unix/Linux/macOS
```bash
# Using Make (if installed)
make build

# Or using bash script
./build.sh build
```

#### Windows
```cmd
REM Using batch script
build.bat build

REM Or using npm
npm run build
```

---

## Detailed Commands

### 1️⃣ Using Make (Unix/Linux/macOS)

**Easiest if Make is installed:**

```bash
make build        # Full build (clean + install + compile)
make install      # Install dependencies only
make compile      # Compile only
make clean        # Remove build artifacts
make reinstall    # Full clean reinstall
make watch        # Watch mode (auto-rebuild)
make dev          # Development mode
make help         # Show help
```

**Install Make if needed:**
```bash
# macOS
brew install make

# Ubuntu/Debian
sudo apt-get install make

# Fedora/RHEL
sudo dnf install make
```

### 2️⃣ Using Shell Scripts

#### Unix/Linux/macOS
```bash
chmod +x build.sh              # Make executable (first time only)
./build.sh build               # Full build
./build.sh install             # Install only
./build.sh compile             # Compile only
./build.sh clean               # Clean only
./build.sh reinstall           # Full reinstall
./build.sh watch               # Watch mode
./build.sh dev                 # Dev mode
./build.sh help                # Show help
```

#### Windows
```cmd
build.bat build                REM Full build
build.bat install              REM Install only
build.bat compile              REM Compile only
build.bat clean                REM Clean only
build.bat reinstall            REM Full reinstall
build.bat watch                REM Watch mode
build.bat dev                  REM Dev mode
build.bat help                 REM Show help
```

### 3️⃣ Using NPM (Universal - Works Everywhere)

```bash
npm install                    # Install dependencies
npm run build                  # Compile TypeScript
npm run clean                  # Remove build artifacts
npm run build:watch            # Watch mode
npm run dev                    # Development mode
```

### 4️⃣ Manual Commands

```bash
# Full manual build
rm -rf node_modules package-lock.json    # (Unix/Mac)
rmdir /s /q node_modules                 # (Windows)
del package-lock.json
npm install
npm run build
```

---

## Which Should I Use?

| System | Recommended | Command |
|--------|-------------|---------|
| macOS | Make | `make build` |
| Linux | Make | `make build` |
| Windows (Git Bash) | build.sh | `./build.sh build` |
| Windows (CMD) | build.bat | `build.bat build` |
| Windows (PowerShell) | npm | `npm run build` |
| Anywhere | npm | `npm run build` |

---

## Common Workflows

### First Time Setup
```bash
make build          # Unix/Mac
build.bat build     # Windows
npm run build       # Anywhere
```

### During Development
```bash
make watch          # Unix/Mac (auto-rebuild on save)
build.bat watch     # Windows
npm run build:watch # Anywhere
```

### Full Clean Rebuild
```bash
make reinstall      # Unix/Mac
build.bat reinstall # Windows
npm run clean && npm install && npm run build  # Anywhere
```

### Just Compile (if deps already installed)
```bash
make compile        # Unix/Mac
build.bat compile   # Windows
npm run build       # Anywhere
```

---

## What Each Target Does

### `build` (Default)
1. Cleans previous build artifacts
2. Installs/updates npm dependencies
3. Compiles TypeScript to JavaScript
4. Output: `dist/` directory with `.js` files

### `install`
Only installs/updates npm dependencies
- Downloads packages from npm registry
- Creates/updates `node_modules/`
- Creates/updates `package-lock.json`

### `compile`
Only compiles TypeScript (assumes dependencies already installed)
- Runs `tsc` compiler
- Generates JavaScript in `dist/`
- Fast - good for iterative development

### `clean`
Removes build artifacts
- Deletes `dist/` directory
- Keeps `node_modules/` intact
- Useful before rebuilding

### `reinstall`
Full clean reinstall
- Removes `node_modules/`
- Removes `package-lock.json`
- Runs fresh `npm install`
- Useful to fix dependency issues

### `watch`
Automatically rebuilds on file changes
- Useful during development
- Recompiles when you save files
- Press `Ctrl+C` to stop

### `dev`
Development mode with tsx executor
- Runs TypeScript directly with tsx
- Hot reload capability
- Press `Ctrl+C` to stop

### `help`
Shows available commands
- Use when you forget what's available
- No building happens

---

## Installation Requirements

To use these scripts, you need:

### Required
- **Node.js** 18+ ([Download](https://nodejs.org/))
- **npm** 9+ (comes with Node.js)

### Optional (for specific methods)
- **Make** - Only needed for `make` commands
  - Pre-installed on macOS and Linux
  - Optional on Windows
- **Git Bash** or **WSL** - For `build.sh` on Windows

### Check Installation
```bash
node --version        # Should be v18+
npm --version         # Should be 9+
make --version        # Optional
```

---

## Troubleshooting

### "command not found: make"
You don't have Make installed. Use:
- `./build.sh build` (Unix/Mac)
- `build.bat build` (Windows)
- `npm run build` (Anywhere)

### "Permission denied: ./build.sh"
Make the script executable:
```bash
chmod +x build.sh
./build.sh build
```

### Build fails with module errors
Try a clean reinstall:
```bash
make reinstall       # Unix/Mac
build.bat reinstall  # Windows
npm run clean && npm install && npm run build  # Anywhere
```

### "npm: command not found"
Install Node.js from https://nodejs.org/

---

## Summary

| Method | Pros | Cons | Best For |
|--------|------|------|----------|
| `make build` | Simple, familiar | Requires Make | Unix/Mac developers |
| `./build.sh build` | No dependencies | Need bash | Cross-platform Unix |
| `build.bat build` | No dependencies | Windows only | Windows developers |
| `npm run build` | Works everywhere | More typing | Any system, fallback |

**My Recommendation:** Use whichever is most natural for your system:
- **macOS/Linux**: `make build`
- **Windows (CMD/PowerShell)**: `build.bat build`
- **Windows (Git Bash/WSL)**: `./build.sh build`
- **Anywhere**: `npm run build`
