# CodeAgent Desktop App - Project Status Report

**Report Date**: July 1, 2026
**Project Stage**: Phase 5 packaging and distribution in progress
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
Phase 5: Packaging & Distribution         94% IN PROGRESS
Phase 6: Testing & Polish                  0% PLANNED
Phase 7: Documentation & Launch           35% IN PROGRESS
```

---

## Current Verification

Validated on July 1, 2026:

```bash
npm run build:electron
npm run generate:brand-assets
npm run pack
```

Results:

- `npm run build:electron` passed: Electron main/preload/services compile, renderer typecheck passes, and renderer assets bundle successfully.
- `npm run generate:brand-assets` passed outside the restricted sandbox. In the sandbox, macOS `iconutil` incorrectly reported valid iconsets as invalid.
- `npm run pack` passed outside the restricted sandbox and produced `dist-build/mac-arm64/CodeAgent.app`.
- Local packaging rebuilt native dependencies, packaged the macOS arm64 app, signed it with the available local identity, and skipped notarization because Apple notarization credentials are not configured.
- The packageable desktop surface and generated packaged app scan clean for inherited provider SDK package names and provider branding terms.
- Targeted source, generated output, and packaged app scans are clean for removed provider package namespaces, old SDK/runtime identifiers, old account/update command copy, old deep-link protocol text, old bundle IDs, and old GitHub action/marketplace identifiers.
- The legacy provider package namespace reports an empty npm dependency tree.
- All legacy provider-package imports and installed packages have been removed from the source tree and `node_modules`.
- Local CodeAgent-owned LLM message/tool types, API error classes, stream helper, MCPB manifest helper, and sandbox runtime compatibility layer replace the actual SDK references that were still used.
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

- `electron-builder` configuration for macOS, Windows, and Linux targets.
- CodeAgent app id, product name, icons, resources, and runtime metadata.
- GitHub Releases publish metadata and semver prerelease channel detection.
- Guarded `electron-updater` startup and manual update checks for packaged builds.
- macOS notarization hook that skips cleanly when credentials are absent.
- GitHub Actions release workflow and release packaging documentation.
- Packageable desktop provider support is OpenAI/OpenAI-compatible only; local LM Studio remains the default path.

---

## Remaining Work

Phase 5:

- Validate signed and notarized release artifacts with real Apple and Windows signing secrets.
- Verify auto-update download and install against a published GitHub release.
- Verify Windows and Linux installers from CI artifacts.
- Add release notes automation or a repeatable release checklist if needed.
- Finish the controlled inherited terminal CLI compatibility migration tracked in `ImprovementPlan.md`; the remaining surface includes compatibility env vars, provider/model identifiers, OAuth/provider helper names, hosted remote flows, generated telemetry types, and legacy filenames/import paths.

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
- `BUILD_INSTRUCTIONS.md` describes the current desktop build path. The old CLI-wide TypeScript build remains a legacy path and is not the validation target for the Electron app.
- The inherited terminal CLI source tree still contains legacy provider/model identifiers and compatibility helper names. Those are now isolated from the targeted package/branding cleanup scans and remain a separate compatibility migration.
