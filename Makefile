.PHONY: help build build-desktop clean compile dev dist-mac install package-cli package-desktop package-ios package-phase5 reinstall release-notes verify-desktop verify-phase5 watch ios ios-build ios-boot ios-install ios-launch ios-reset

IOS_DEVICE ?= iPhone 17
IOS_BUNDLE_ID := com.albertforweb.codeagent.companion
IOS_APP_PATH := dist-build/ios/build/Debug-iphonesimulator/CodeAgentCompanion.app

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
	@echo "  make build-desktop - Build Electron desktop assets"
	@echo "  make install     - Install dependencies only"
	@echo "  make compile     - Compile TypeScript only"
	@echo "  make clean       - Remove build artifacts"
	@echo "  make reinstall   - Clean reinstall everything"
	@echo "  make watch       - Watch mode (auto-rebuild)"
	@echo "  make dev         - Run in development mode"
	@echo "  make package-desktop - Rebuild and verify dist-build/mac-arm64/CodeAgent.app"
	@echo "  make verify-desktop  - Verify existing desktop app package"
	@echo "  make dist-mac        - Build macOS DMG/zip installers into dist-build"
	@echo "  make package-cli     - Build and verify CLI npm tarball"
	@echo "  make package-ios     - Build iOS simulator app into dist-build"
	@echo "  make package-phase5  - Build local CLI/desktop/release-notes artifacts and verify Phase 5"
	@echo "  make verify-phase5   - Verify existing Phase 5 artifact set"
	@echo "  make release-notes   - Generate dist-build release notes"
	@echo "  make ios         - Build, install, and launch iOS simulator app"
	@echo "  make ios-build   - Build iOS simulator app"
	@echo "  make ios-install - Install iOS app on booted simulator"
	@echo "  make ios-launch  - Launch iOS app on booted simulator"
	@echo "  make ios-reset   - Uninstall iOS app from booted simulator"
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

# Electron desktop build and packaging.
build-desktop:
	@echo "🖥️  Building Electron desktop assets..."
	@npm run build:electron

package-desktop:
	@echo "📦 Rebuilding and verifying CodeAgent.app..."
	@npm run pack:desktop:check

verify-desktop:
	@echo "🔎 Verifying existing desktop package..."
	@npm run verify:desktop-package

dist-mac:
	@echo "💿 Building macOS DMG/zip installers..."
	@npm run dist:mac

# CLI, release notes, and combined local package set.
package-cli:
	@echo "📦 Building and verifying CLI npm tarball..."
	@npm run pack:cli:check

release-notes:
	@echo "📝 Generating release notes..."
	@npm run release:notes

verify-phase5:
	@echo "🔎 Verifying local Phase 5 artifacts..."
	@npm run verify:phase5

package-phase5:
	@echo "📦 Building and verifying local Phase 5 artifact set..."
	@npm run pack:phase5

package-ios: ios-build

# Build, install, and launch the iOS companion in the simulator.
ios: ios-build ios-install ios-launch

ios-build:
	@echo "📱 Building iOS simulator app..."
	@npm run verify:ios-companion

ios-boot:
	@if ! xcrun simctl list devices booted | grep -q "(Booted)"; then \
		echo "📱 Booting simulator: $(IOS_DEVICE)"; \
		xcrun simctl boot "$(IOS_DEVICE)"; \
	fi
	@open -a Simulator

ios-install: ios-boot
	@echo "📲 Installing iOS simulator app..."
	@xcrun simctl terminate booted "$(IOS_BUNDLE_ID)" >/dev/null 2>&1 || true
	@xcrun simctl uninstall booted "$(IOS_BUNDLE_ID)" >/dev/null 2>&1 || true
	@xcrun simctl install booted "$(IOS_APP_PATH)"

ios-launch: ios-boot
	@echo "🚀 Launching iOS simulator app..."
	@xcrun simctl launch booted "$(IOS_BUNDLE_ID)"

ios-reset: ios-boot
	@echo "🧹 Uninstalling iOS simulator app..."
	@xcrun simctl terminate booted "$(IOS_BUNDLE_ID)" >/dev/null 2>&1 || true
	@xcrun simctl uninstall booted "$(IOS_BUNDLE_ID)" >/dev/null 2>&1 || true

.DEFAULT_GOAL := help
