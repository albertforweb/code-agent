# CodeAgent Desktop App - Project Status Report

**Report Date**: July 2, 2026
**Project Stage**: Phase 5 local packaging complete; public distribution deferred
**Current Baseline**: Phase 4.5 local-first desktop workbench is complete in git history

---

## Project Goal

Transform the legacy CodeAgent CLI source tree into a local-first, cross-platform Electron desktop app with typed IPC, desktop-native services, local LLM support, automation workflows, and packageable release artifacts.

---

## Phase Progress

```
Phase 1: Electron Foundation             100% COMPLETE
Phase 2: IPC Bridge & Services           100% COMPLETE
Phase 3: Desktop UI Replacement          100% COMPLETE
Phase 4: Service Refactor & Local LLM    100% COMPLETE
Phase 4.5: Local-First Workbench         100% COMPLETE
Phase 5: Packaging & Distribution        100% LOCAL SCOPE COMPLETE
Phase 6: Testing & Polish                  0% PLANNED
Phase 7: Documentation & Launch           35% IN PROGRESS
```

---

## Current Verification

Validated on July 2, 2026:

```bash
npm run build:electron
npm run build:electron:prod
npm run generate:brand-assets
npm run pack
npm run pack:cli:check
npm run verify:phase5
npm run verify:desktop-package
npm run verify:ios-companion  # requires an installed iOS Simulator runtime
npm run verify:remote-control-scope
npm run verify:remote-control-smoke
npm run release:notes
```

Results:

- `npm run build:electron` passed: Electron main/preload/services compile, renderer typecheck passes, and renderer assets bundle successfully.
- `npm run generate:brand-assets` passed outside the restricted sandbox. In the sandbox, macOS `iconutil` incorrectly reported valid iconsets as invalid.
- `npm run pack` passed outside the restricted sandbox and produced `dist-build/mac-arm64/CodeAgent.app`.
- `npm run pack:cli:check` passed and verified `code-agent-1.0.0.tgz` with 1,962 entries and a 5.09 MB tarball.
- `npm run verify:phase5` is now the local package-set gate for the generated CLI tarball, macOS desktop app, release notes, remote-control scope, iOS readiness, and generated-artifact hygiene.
- `npm run verify:desktop-package` passed against the local packaged macOS app and reported expected release-only gaps: no unpublished-build update metadata, Apple Development signing instead of Developer ID signing, and missing notarization/Gatekeeper acceptance.
- `npm run verify:desktop-release` correctly fails on the local package until release metadata, Developer ID signing, and notarization are available.
- `npm run verify:ios-companion` now preflights for an installed iOS Simulator runtime before building, then writes the simulator app to `dist-build/ios/build/...` and removes Xcode intermediates. This local machine currently needs an iOS Simulator runtime installed before the verifier can produce the simulator app again.
- `npm run verify:remote-control-scope` passed and confirmed the local remote-control API remains scoped to status, pairing, approvals, tasks, and teams while relay docs and client contracts retain the required off-network security constraints.
- `npm run verify:remote-control-smoke` covers local remote-control pairing, authenticated device listing, command approval resolution, trusted-device revocation, and post-revocation token rejection in a temporary workspace.
- `npm run release:notes` writes a repeatable release notes and release checklist artifact to `dist-build/release-notes/CodeAgent-v<version>.md`.
- Isolated macOS npm-prefix install from the generated tarball passed: `code-agent --version` returned `1.0.0 (CodeAgent)` and `code-agent --help` rendered usage.
- Local packaging rebuilt native dependencies, packaged the macOS arm64 app, signed it with the available local identity, and skipped notarization because Apple notarization credentials are not configured.
- The npm CLI package includes the compiled CLI entrypoint and runtime shims while excluding Electron renderer/build output, generated installers, local state, and `node_modules`.
- The packageable desktop surface, generated CLI output, and extracted `app.asar` app code scan clean for inherited provider SDK package names, provider branding terms, old internal-build shorthand, and removed provider package namespaces.
- Targeted source, generated output, and packaged app scans are clean for removed provider package namespaces, old SDK/runtime identifiers, old account/update command copy, old deep-link protocol text, old bundle IDs, and old GitHub action/marketplace identifiers.
- The legacy provider package namespace reports an empty npm dependency tree.
- All legacy provider-package imports and installed packages have been removed from the source tree and `node_modules`.
- Local CodeAgent-owned LLM message/tool types, API error classes, stream helper, MCPB manifest helper, and sandbox runtime compatibility layer replace the actual SDK references that were still used.
- A stale provider-specific model override module and its active call sites have been removed from source and generated CLI output.
- CodeAgent-owned config and install surfaces are now primary: `CODEAGENT_CONFIG_DIR`, `~/.code-agent`, `code-agent://`, `code-agent` local wrapper, `code-agent` user-agent tokens, and `com.codeagent.*` app/telemetry identifiers. Legacy names are retained only where needed as compatibility fallbacks.

---

## Implemented Capabilities

### Desktop Shell

- Electron main process, preload script, renderer bundle, app menu, window state persistence, app identity, and CodeAgent branding.
- Secure context bridge with typed IPC between renderer and main process.
- Production renderer builds omit source maps.

### Service Bridge

- Tool, API, filesystem, auth, app-state, MCP, command, web, finance, automation, and local-history service bridges are registered from the Electron main process.
- Renderer-side IPC client exposes typed desktop APIs.
- Tool activity, permissions, safe file write review, checkpoint undo, and command execution workflows are wired into the desktop UI.

### Local-First Workbench

- Desktop navigation covers chat, projects, tools, automation, history, and settings.
- Local sessions, transcript search, workspace file browsing, MCP registry views, tool routing controls, and status panes are available in the renderer.
- Local history stores chat sessions, tool events, automation runs, and project events.

### Automation

- Workspace skill discovery and skill policy state.
- Scheduled task definitions, run history, retry/missed-run/notification policy state.
- Local-network remote control with pairing, device revocation, rate limits, audit events, and narrowed remote APIs.
- Virtual team blueprints, bounded team iterations, milestones, run artifacts, and transcripts.
- Project automation export/import separates shareable workspace state from local-only state.

### Packaging And Release

- Phase 5A macOS CLI packaging has a dedicated npm package boundary, package validation script, package-local runtime shims, CLI distribution notes, passing local tarball validation, passing isolated global-install smoke validation, and npm-only as the first distribution channel.
- `electron-builder` configuration for macOS, Windows, and Linux targets.
- CodeAgent app id, product name, icons, resources, and runtime metadata.
- GitHub Releases publish metadata and semver prerelease channel detection.
- Guarded `electron-updater` startup and manual update checks for packaged builds.
- macOS notarization hook that skips cleanly when credentials are absent.
- GitHub Actions release workflow and release packaging documentation.
- GitHub Actions CLI package job that builds, verifies, generates release notes, and uploads the npm tarball plus release notes as workflow artifacts while npm publishing remains manual.
- Desktop package verifier and macOS release-workflow gate for update metadata, Developer ID signing, hardened runtime, Gatekeeper acceptance, and targeted legacy branding checks.
- Phase 5C iOS companion has a native SwiftUI scaffold, Xcode project/scheme, local-network pairing and approval client, simulator build verifier, and TestFlight distribution notes.
- iOS companion pairing tokens are stored in Keychain with an unsigned-simulator fallback, and the app can list/revoke trusted devices and show remote-control audit events through the narrow local-network API.
- iOS companion local simulator pairing, command approval/rejection, active approval polling, and remote desktop approval-dialog dismissal have been manually smoke tested.
- `make ios`, `make ios-build`, `make ios-install`, `make ios-launch`, and `make ios-reset` cover the local simulator companion workflow.
- iOS companion privacy metadata is packaged through `PrivacyInfo.xcprivacy`, declaring app-scoped UserDefaults usage and no tracking for the current local-network-only scope.
- Phase 5D relay/control has a documented managed-relay-only distribution boundary, inert relay enrollment metadata packaged across desktop/CLI/iOS, and a release-scope verifier; off-network relay implementation remains blocked on identity, encryption, rotation, audit propagation, and emergency revocation.
- Packageable desktop provider support is OpenAI/OpenAI-compatible only; the local OpenAI-compatible path remains the default.

---

## Deferred Public Distribution Gates

Phase 5:

- 5A npm publication is deferred until a public npm publishing path and package ownership are available.
- 5B macOS public distribution is deferred until an Apple Developer Program account, Developer ID certificate, and notarization credentials are available.
- 5B desktop updater validation is deferred until a signed GitHub release exists.
- 5B Windows and Linux installer review is deferred until release CI artifacts are produced for a public candidate.
- 5C TestFlight/App Store distribution is deferred until an Apple Developer Program account and App Store Connect app record are available.
- 5D off-network relay remains intentionally disabled until relay identity, encryption, token rotation, rate limits, audit propagation, and emergency revocation are implemented.

Non-blocking cleanup:

- 5E model-family neutralization remains optional before public release. If required, replace inherited model-family names and old mascot component names through a controlled model migration, not a blind rename.
- Finish the controlled inherited terminal CLI compatibility migration tracked in `ImprovementPlan.md`; the remaining surface includes compatibility env vars, model-family aliases, OAuth/provider helper names, hosted remote flows, generated telemetry types, and legacy filenames/import paths.

Phase 6:

- Add broader integration tests for automation, local history, remote control, and packaged app startup.
- Run cross-platform manual smoke tests.
- Tighten renderer polish and error-state coverage.

Phase 7:

- Keep README, release docs, storage ownership docs, and security notes aligned with the packaged desktop baseline.
- Prepare launch documentation after the first signed release is validated.

---

## Important Notes

- `dist-build/` is ignored and is expected to be regenerated locally or in CI.
- `dist-electron/` and `dist-renderer/` are generated build outputs currently present in the working tree.
- `.code-agent/local/` is local-only state and must not be committed.
- `BUILD_INSTRUCTIONS.md` describes the current desktop build path. Phase 5A validates the terminal CLI package with `npm run pack:cli:check`; the Electron app remains validated through `npm run build:electron` and `npm run pack`.
- Active source, generated `dist`, the CLI tarball, and extracted desktop app code are clean for legacy provider package names, SDK imports, old internal-build shorthand, and old provider namespace strings. A remaining third-party readable-stream namespace in `package-lock.json` and bundled `node_modules` is unrelated to provider branding.
- Inherited model-family names such as Opus/Sonnet/Haiku are still active model aliases and display labels. Treat their removal as a dedicated model-family migration, not a blind branding cleanup.
