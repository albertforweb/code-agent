# Release Packaging

CodeAgent uses `electron-builder` for local packaging and GitHub Releases for update metadata.

Current release scope: local packaging and GitHub Release publication are supported for the CLI npm tarball plus macOS and Windows desktop installers. Public npm registry publication, TestFlight/App Store distribution, and signed-release updater validation are deferred until the required external publishing accounts and credentials are available.

## Local Commands

Preferred Make targets:

- `make build-desktop`: build Electron desktop assets.
- `make package-desktop`: rebuild and verify `dist-build/mac-arm64/CodeAgent.app`.
- `make verify-desktop`: verify the existing local desktop app package.
- `make package-cli`: build and verify the CLI npm tarball.
- `make package-ios`: build the iOS simulator app.
- `make package-phase5`: build local CLI, desktop, and release-notes artifacts, then run the Phase 5 verifier.
- `make verify-phase5`: verify the existing Phase 5 artifact set.
- `make release-notes`: generate release notes under `dist-build/release-notes/`.
- `make dist-mac`: build macOS DMG/zip installers under `dist-build/`.

Underlying npm commands:

- `npm run build:electron`: build main, preload, service, and renderer bundles for development.
- `npm run build:electron:prod`: build production desktop assets without renderer source maps.
- `npm run pack`: build production assets and create an unpacked local app directory with publishing disabled at `dist-build/<platform>/CodeAgent.app`.
- `npm run verify:desktop-package`: verify the local packaged macOS app metadata, payload shape, code signature, update-metadata behavior, and branding scan.
- `npm run pack:desktop:check`: run a fresh local package build and verify it.
- `npm run dist`: build production assets and create platform installers for the current host. On macOS this is the command that produces DMG/zip artifacts under `dist-build/`.
- `npm run release`: build production assets and publish installer artifacts to GitHub Releases.
- `npm run verify:desktop-release`: verify a macOS release package with release-only requirements, including update metadata, Developer ID signing, and Gatekeeper acceptance.
- `npm run release:notes`: generate release notes and a release checklist at `dist-build/release-notes/CodeAgent-v<version>.md`.
- `npm run verify:phase5`: verify the current local Phase 5 artifact set without rebuilding every package.
- `npm run pack:phase5`: rebuild the CLI tarball and local macOS desktop app, generate release notes, then run the local Phase 5 verifier.

## Local Artifact Layout

- CLI npm tarball: `dist-build/cli/code-agent-<version>.tgz`
- macOS desktop app from `npm run pack`: `dist-build/mac-arm64/CodeAgent.app`
- macOS desktop installers from `npm run dist:mac`: DMG/zip files under `dist-build/`
- iOS simulator app from `npm run build:ios-companion` or `npm run verify:ios-companion`: `dist-build/ios/build/Debug-iphonesimulator/CodeAgentCompanion.app`
- Release notes from `npm run release:notes`: `dist-build/release-notes/CodeAgent-v<version>.md`

The CLI tarball is intentionally separate from the Electron desktop output. `dist-build/` is ignored by git and should be regenerated locally or in CI.

The iOS simulator app requires an installed iOS Simulator runtime in Xcode. The verifier removes Xcode intermediate output and keeps only the simulator app artifact.

`npm run verify:phase5` reports a missing iOS Simulator runtime as a local environment blocker by default. Use `npm run verify:phase5 -- --strict-ios` when the simulator app must be present.

## GitHub Release Flow

1. Update `package.json` version.
2. Run `npm run release:notes` and review the generated checklist.
3. Commit and tag the release, for example `v1.0.1`.
4. Push the tag to GitHub.
5. The release workflow checks out `code-agent`, `code-agent-sdk`, and `code-agent-packages` as sibling repositories, matching the local development layout.
6. The release workflow builds macOS and Windows desktop artifacts with `electron-builder --publish never`, then uploads those artifacts to a final release-publishing job.
7. The release workflow builds and verifies the CLI npm tarball, generates release notes, and attaches both to the GitHub Release. Publishing the CLI tarball to npm remains a manual release step until registry ownership is finalized.
8. The final release job creates or updates the GitHub Release, uploads all desktop and CLI artifacts, and adds `SHA256SUMS.txt`.
9. `electron-updater` reads GitHub release metadata from `albertforweb/code-agent`.

Manual workflow runs default to a draft release named `v<package.json version>` unless a `tag` input is provided. Tag pushes such as `v1.0.1` create a non-draft release for that tag.

## Required Secrets

Publishing uses the repository `GITHUB_TOKEN` by default.

If `code-agent-sdk` or `code-agent-packages` are private repositories that the default `GITHUB_TOKEN` cannot read, create a repository secret named:

- `CODEAGENT_RELEASE_TOKEN`

The token must have read access to the sibling SDK/package repositories.

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

## Desktop Package Verification

Local `npm run pack` builds are created with publishing disabled, so `Contents/Resources/app-update.yml` is normally absent. In that local mode the app disables update checks instead of calling `electron-updater`.

Release verification is stricter:

```bash
npm run verify:desktop-release
```

That mode requires `app-update.yml`, a Developer ID Application signature, hardened runtime, and Gatekeeper acceptance. A local Apple Development signature is enough for local package smoke testing, but it is not enough for public distribution.

## Update Channels

`electron-builder` detects update channels from semver prerelease suffixes:

- `1.0.1` publishes to stable.
- `1.0.1-beta.1` publishes to beta.

The app checks for updates only when packaged with update metadata. Development runs and local unpublished packages keep update checks disabled.
