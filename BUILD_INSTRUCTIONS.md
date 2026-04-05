# Building Code-Agent

This project has been set up with a complete TypeScript build configuration.

## Prerequisites

- **Node.js** 18+ ([Download](https://nodejs.org/))
- **npm** 9+ (included with Node.js)
- **Git** (for version control)

## Quick Start

### Option 1: Using npm (Recommended)

```bash
# Install dependencies
npm install

# Build the project
npm run build

# Watch mode (auto-rebuild on changes)
npm run build:watch

# Clean build artifacts
npm run clean
```

### Option 2: Using build scripts

**On Windows:**
```cmd
build.bat
```

**On macOS/Linux:**
```bash
chmod +x build.sh
./build.sh
```

## Project Structure

```
c:\git\code-agent/
├── main.tsx                 # Main entry point
├── package.json             # Dependencies & scripts
├── tsconfig.json            # TypeScript configuration
├── build.bat                # Windows build script
├── build.sh                 # Unix build script
├── dist/                    # Compiled output (created after build)
│   ├── main.js
│   ├── *.d.ts               # Type definitions
│   └── ...
└── [source files]           # TypeScript/TSX files throughout repo
```

## Build Configuration

### `tsconfig.json`
- **Target**: ES2020
- **Module**: ES2020 (ESM)
- **JSX**: React JSX Automatic
- **Declaration**: Enabled (`.d.ts` files)
- **Source Maps**: Disabled for production
- **Strict Mode**: Enabled

### Key Build Scripts

| Command | Purpose |
|---------|---------|
| `npm run build` | Compile TypeScript to JavaScript |
| `npm run build:watch` | Auto-rebuild on file changes |
| `npm run clean` | Remove dist/ directory |
| `npm run dev` | Run with tsx (dev mode) |

## Dependencies

The project includes essential dependencies for running Claude Code:

- **@commander-js/extra-typings**: CLI argument parsing
- **chalk**: Terminal colors
- **react** & **ink**: Terminal UI rendering
- **lodash-es**: Utility functions
- **typescript**: Language & compiler

## Output

After building, compiled files are available in the `dist/` directory:
- **Main bundle**: `dist/main.js`
- **Type definitions**: `dist/**/*.d.ts`
- **Source maps** are disabled (not included in output)

## Troubleshooting

### "npm: command not found"
- Install Node.js from https://nodejs.org/
- Restart your terminal after installation

### "Module not found" errors during build
- Run `npm install` to reinstall dependencies
- Delete `node_modules/` and `package-lock.json`, then reinstall

### Build output looks wrong
- Run `npm run clean` then `npm run build` for a fresh build
- Check that `tsconfig.json` exists and is valid

## Next Steps

1. ✅ **Setup complete** - Build configuration is ready
2. 📦 **Install dependencies** - Run `npm install`
3. 🔨 **Build the project** - Run `npm run build`
4. 🧪 **Test the build** - Check output in `dist/` directory

## Notes

- This project originally used Bun as the runtime. The build configuration uses Node.js/npm with standard TypeScript compilation.
- Source maps are disabled to protect sensitive information.
- The project structure contains 1,900+ TypeScript files from the leaked Claude Code source.
