#!/bin/bash
# Build script for code-agent on Unix/Linux/macOS
# Usage: ./build.sh [target]
# Targets: build, clean, install, reinstall, watch, dev

set -e

TARGET="${1:-build}"

echo ""
echo "========================================"
echo "Code-Agent Build Task: $TARGET"
echo "========================================"
echo ""

case "$TARGET" in
  build)
    echo "🧹 Cleaning build artifacts..."
    rm -rf dist
    echo "📦 Installing dependencies..."
    npm install --legacy-peer-deps
    echo "🔨 Compiling TypeScript..."
    npm run build
    echo ""
    echo "✅ Build complete!"
    echo "📁 Output: ./dist"
    echo ""
    ;;

  clean)
    echo "🧹 Cleaning build artifacts..."
    rm -rf dist
    ;;

  install)
    echo "📦 Installing dependencies..."
    npm install --legacy-peer-deps
    ;;

  compile)
    echo "🔨 Compiling TypeScript..."
    npm run build
    ;;

  reinstall)
    echo "🔄 Full reinstall..."
    echo "  Removing node_modules..."
    rm -rf node_modules
    echo "  Removing package-lock.json..."
    rm -f package-lock.json
    echo "  Running npm install..."
    npm install --legacy-peer-deps
    echo "✅ Reinstall complete!"
    ;;

  watch)
    echo "👀 Watch mode enabled (Ctrl+C to stop)"
    npm run build:watch
    ;;

  dev)
    echo "🚀 Starting dev mode (Ctrl+C to stop)"
    npm run dev
    ;;

  help)
    echo ""
    echo "Usage: ./build.sh [target]"
    echo ""
    echo "Available targets:"
    echo "  build       - Clean install and build (DEFAULT)"
    echo "  install     - Install dependencies only"
    echo "  compile     - Compile TypeScript only"
    echo "  clean       - Remove build artifacts"
    echo "  reinstall   - Clean reinstall everything"
    echo "  watch       - Watch mode (auto-rebuild)"
    echo "  dev         - Run in development mode"
    echo "  help        - Show this message"
    echo ""
    ;;

  *)
    echo "❌ Unknown target: $TARGET"
    echo ""
    echo "Usage: ./build.sh [target]"
    echo "Run './build.sh help' for available targets"
    exit 1
    ;;
esac
