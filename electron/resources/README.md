# Electron Resources

This directory is used by `electron-builder` as `buildResources`.

CodeAgent icon assets are generated from `codeagent-logo.svg`:

- `icon.icns` for macOS
- `icon.ico` for Windows
- `icon.png` for Linux

Run `npm run generate:brand-assets` after changing the SVG. Release and pack scripts run this automatically before building.
