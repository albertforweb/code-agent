# Release Packaging

Code Agent uses `electron-builder` for local packaging and GitHub Releases for update metadata.

## Local Commands

- `npm run build:electron`: build main, preload, service, and renderer bundles for development.
- `npm run build:electron:prod`: build production desktop assets without renderer source maps.
- `npm run pack`: build production assets and create an unpacked local app directory with publishing disabled.
- `npm run dist`: build production assets and create platform installers for the current host.
- `npm run release`: build production assets and publish installer artifacts to GitHub Releases.

## GitHub Release Flow

1. Update `package.json` version.
2. Commit and tag the release, for example `v1.0.1`.
3. Push the tag to GitHub.
4. The release workflow builds macOS, Windows, and Linux artifacts.
5. `electron-updater` reads GitHub release metadata from `albertforweb/code-agent`.

## Required Secrets

Publishing uses the repository `GITHUB_TOKEN` by default.

macOS notarization and signing need these secrets before public distribution:

- `APPLE_ID`
- `APPLE_APP_SPECIFIC_PASSWORD`
- `APPLE_TEAM_ID`
- `CSC_LINK`
- `CSC_KEY_PASSWORD`

Windows signing needs a certificate secret before public distribution:

- `WIN_CSC_LINK`
- `WIN_CSC_KEY_PASSWORD`

Unsigned local builds are still useful for testing, but public releases should be signed and notarized.

## Update Channels

`electron-builder` detects update channels from semver prerelease suffixes:

- `1.0.1` publishes to stable.
- `1.0.1-beta.1` publishes to beta.

The app checks for updates only when packaged. Development runs and unpackaged local builds show an informational dialog for manual update checks.
