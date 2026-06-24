.PHONY: help build clean install reinstall watch dev

# Default target
help:
	@echo "========================================"
	@echo "Code-Agent Build Tasks"
	@echo "========================================"
	@echo ""
	@echo "Usage: make [target]"
	@echo ""
	@echo "Available targets:"
	@echo "  make build       - Clean install and build (RECOMMENDED)"
	@echo "  make install     - Install dependencies only"
	@echo "  make compile     - Compile TypeScript only"
	@echo "  make clean       - Remove build artifacts"
	@echo "  make reinstall   - Clean reinstall everything"
	@echo "  make watch       - Watch mode (auto-rebuild)"
	@echo "  make dev         - Run in development mode"
	@echo "  make help        - Show this help message"
	@echo ""

# Main build target - does everything
build: clean install compile
	@echo ""
	@echo "✅ Build complete!"
	@echo "📁 Output: ./dist"
	@echo ""

# Install dependencies
install:
	@echo "📦 Installing dependencies..."
	@npm install --legacy-peer-deps

# Compile TypeScript
compile:
	@echo "🔨 Compiling TypeScript..."
	@npm run build

# Remove build artifacts
clean:
	@echo "🧹 Cleaning build artifacts..."
	@rm -rf dist

# Full reinstall (nuke everything)
reinstall: 
	@echo "🔄 Full reinstall..."
	@echo "  Removing node_modules..."
	@rm -rf node_modules
	@echo "  Removing package-lock.json..."
	@rm -f package-lock.json
	@echo "  Running npm install..."
	@npm install --legacy-peer-deps
	@echo "✅ Reinstall complete!"

# Watch mode
watch:
	@echo "👀 Watch mode enabled (Ctrl+C to stop)"
	@npm run build:watch

# Development mode
dev:
	@echo "🚀 Starting dev mode (Ctrl+C to stop)"
	@npm run dev

.DEFAULT_GOAL := help
