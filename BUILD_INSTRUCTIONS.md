# Building CodeAgent

This repository now has two different build realities:

- The active desktop app build uses Electron, TypeScript project references, and a renderer bundle.
- The inherited legacy CLI source tree is still present and is not the primary validation path for desktop work.

Use the Electron commands below when validating the desktop app.

---

## Prerequisites

- Node.js 18 or newer. Node.js 20 is recommended because the release workflow uses it.
- npm.
- Git.
- macOS only: `iconutil` is required for generating `.icns` assets.

Install dependencies:

```bash
npm install
```

---

## Development Build

Build Electron main/preload/services and the renderer:

```bash
npm run build:electron
```

Run the desktop app in development mode:

```bash
npm run dev:electron
```

Useful variants:

```bash
npm run dev:electron:debug
npm run dev:electron:gpu-off
```

---

## Production Build

Build production desktop assets:

```bash
npm run build:electron:prod
```

Generate app icons and brand assets:

```bash
npm run generate:brand-assets
```

Create an unpacked local app directory:

```bash
npm run pack
```

On macOS, the packaged app is written under:

```text
dist-build/mac-arm64/CodeAgent.app
```

Create installer artifacts for the current host:

```bash
npm run dist
```

Publish release artifacts when GitHub credentials and signing credentials are configured:

```bash
npm run release
```

---

## Build Outputs

```text
dist-electron/   Electron main, preload, and service output
dist-renderer/   Renderer HTML, CSS, and JavaScript bundle
dist-build/      electron-builder package output, ignored by git
```

Production renderer builds omit source maps. Development builds may emit renderer source maps.

---

## Release Packaging

Release packaging uses `electron-builder`.

Configured targets:

- macOS: `dmg` and `zip`
- Windows: `nsis`
- Linux: `AppImage` and `deb`

Release metadata is configured for GitHub Releases under `albertforweb/code-agent`. Update channels are inferred from semver prerelease suffixes.

See `docs/release-packaging.md` for release flow and required signing/notarization secrets.

---

## Troubleshooting

### `iconutil` reports `Invalid Iconset`

The generated iconset can be valid while `iconutil` fails inside a restricted execution sandbox. Run the brand asset or packaging command outside that sandbox:

```bash
npm run generate:brand-assets
npm run pack
```

### Packaged macOS build skips notarization

This is expected unless Apple notarization credentials are configured:

- `APPLE_ID`
- `APPLE_APP_SPECIFIC_PASSWORD`
- `APPLE_TEAM_ID`

Unsigned or locally signed builds are useful for smoke testing. Public releases should be signed and notarized.

### Legacy `npm run build` has many TypeScript errors

The inherited CLI source tree still contains Bun-specific and internal-source assumptions. For desktop validation, use `npm run build:electron`.

---

## Last Validated

June 29, 2026:

- `npm run build:electron` passed.
- `npm run generate:brand-assets` passed outside the restricted sandbox.
- `npm run pack` passed and produced `dist-build/mac-arm64/CodeAgent.app`.
