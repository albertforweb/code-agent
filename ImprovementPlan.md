# Code-Agent Desktop App Improvement Plan

**Project Goal**: Transform Claude Code CLI into a standalone desktop application using Electron

**Current State**: Terminal UI + CLI (Ink React + Commander.js)  
**Target State**: Cross-platform desktop app with native window, auto-update, packaging  
**Total Effort**: ~2-4 weeks  
**Priority**: Convert to Electron → Replace UI → Decouple from terminal  

---

## Executive Summary

| Item | Current | Issue | Impact |
|------|---------|-------|--------|
| **Build System** | ✅ Works | Terminal-only | Can't build desktop executable |
| **UI Framework** | Ink (terminal) | Terminal-specific | Won't render in desktop window |
| **Process Model** | Single-process CLI | No IPC | Services unreachable from UI |
| **Window Management** | None | N/A | No app lifecycle, menus, dialogs |
| **Distribution** | None | N/A | Can't package for Mac/Windows/Linux |
| **Auto-update** | Partial (browser-based) | N/A | Need electron-updater |

---

## Phase 1: Electron Foundation (Days 1-3) ✅ COMPLETE

### 1.1 Add Dependencies ✅ COMPLETE
**Objective**: Add all required packages for Electron development

**Tasks**:
- [x] Add `electron` (^31.0.0)
- [x] Add `electron-builder` (^25.0.0) - packaging/signing
- [x] Add `electron-store` (^8.5.0) - persistent config storage
- [x] Add `@electron/notarize` (^2.3.0) - macOS notarization
- [x] Add `electron-updater` (^6.1.0) - auto-update support
- [x] Add `cross-env` (^7.0.0) - cross-platform env vars
- [x] Add `@types/node` already exists, verify version
- [x] Remove unused terminal-specific packages if applicable

**Files Modified**:
- [package.json](package.json) - devDependencies added

**Success Criteria**:
- [x] `npm install` completes without errors
- [x] `npx electron --version` works
- [x] `npx electron-builder --version` works

---

### 1.2 Create Electron Directory Structure ✅ COMPLETE
**Objective**: Set up main process, preload, and background service files

**New Files to Create**:
- `electron/main.ts` - Main process (window creation, IPC setup)
- `electron/preload.ts` - Preload script (secure IPC bridge)
- `electron/bridge.ts` - IPC channel definitions
- `electron/types.ts` - TypeScript types for IPC communication

**Structure**:
```
electron/
├── main.ts          (main process - window, app lifecycle)
├── preload.ts       (preload - IPC security bridge)
├── bridge.ts        (IPC channel definitions)
├── types.ts         (TypeScript types for IPC)
└── resources/       (icons, assets)
    ├── icon.icns    (macOS)
    ├── icon.ico     (Windows)
    └── icon.png     (Linux)
```

**Success Criteria**:
- Files compile with TypeScript
- Window creation logic is present
- IPC channel definitions are complete

---

### 1.2 Create Electron Directory Structure ✅ COMPLETE
**Objective**: Set up main process, preload, and background service files

**New Files Created**:
- [x] `electron/main.ts` - Main process (window creation, IPC setup)
- [x] `electron/preload.ts` - Preload script (secure IPC bridge)
- [x] `electron/bridge.ts` - IPC channel definitions
- [x] `electron/types.ts` - TypeScript types for IPC communication
- [x] `electron/entitlements.mac.plist` - macOS code signing

**Structure Created**:
```
electron/
├── main.ts          ✅ (main process - window, app lifecycle)
├── preload.ts       ✅ (preload - IPC security bridge)
├── bridge.ts        ✅ (IPC channel definitions)
├── types.ts         ✅ (TypeScript types for IPC)
└── resources/       ✅ (icons, assets)
    ├── icon.icns    (macOS)
    ├── icon.ico     (Windows)
    └── icon.png     (Linux)

src/renderer/
├── index.html       ✅ (HTML entry)
├── index.tsx        ✅ (React DOM entry)
├── App.tsx          ✅ (main component)
├── App.module.css   ✅ (component styles)
└── styles/
    └── global.css   ✅ (global theme)
```

**Success Criteria**:
- [x] Files compile with TypeScript
- [x] Window creation logic is present
- [x] IPC channel definitions are complete

---

### 1.3 Update Build Configuration ✅ COMPLETE
**Objective**: Set up multi-process TypeScript compilation

**Files Modified/Created**:
- [x] `tsconfig.json` - Base config (unchanged)
- [x] `tsconfig.electron.json` - NEW: main process config
- [x] `tsconfig.renderer.json` - NEW: renderer (React DOM) config

**Configuration Implemented**:
- [x] Main process: Node.js target, CommonJS module
- [x] Renderer: Browser target, ES2020 module
- [x] Preload: Node.js target, CommonJS module
- [x] All: Separate entry points, separate outputs
- [x] Build outputs: `dist-electron/` and `dist-renderer/`

**Success Criteria**:
- [x] `npx tsc -p tsconfig.electron.json` compiles successfully
- [x] `npx tsc -p tsconfig.renderer.json` compiles successfully
- [x] Output goes to correct directories

---

### 1.4 Create Minimal Main Process ✅ COMPLETE
**Objective**: Get basic Electron window working

**Implementation**:
```typescript
// electron/main.ts
- App lifecycle (ready, activate, quit)
- BrowserWindow creation
- Window restoration from saved state
- Graceful shutdown
- IPC listener setup (will expand in Phase 2)
```

**Features**:
- [ ] Window creation on app ready
- [ ] Window state persistence (position, size)
- [ ] Proper quit/close handling
- [ ] Support for multiple windows (optional)
- [ ] Basic menu (File, Edit, View, Help)

**Success Criteria**:
- `npm run dev:electron` launches a window
- Window opens with white/placeholder content
- Window state persists across restarts
- App closes properly

---

## Phase 2: IPC Bridge & Service Layer (Days 4-6) ✅ COMPLETE

### 2.1 Design IPC Communication Layer ✅ COMPLETE
**Objective**: Define how renderer communicates with main process and services

**Files to Create/Modify**:
- [x] `electron/bridge.ts` - IPC channel definitions and dispatch
- [x] `electron/types.ts` - TypeScript types for all channels
- [x] `electron/preload.ts` - secure renderer API exposure
- [x] `src/renderer/ipc-client.ts` - typed renderer-side IPC client

**IPC Channels to Implement**:
```typescript
// Tool execution
invoke: 'tool:execute' → { toolName, args } → result
invoke: 'tool:list' → {} → Tool[]

// API operations
invoke: 'api:chat' → { messages } → response
invoke: 'api:fetchBootstrap' → {} → bootstrapData

// File operations
invoke: 'fs:read' → { path } → content
invoke: 'fs:write' → { path, content } → success
invoke: 'fs:list' → { path } → entries[]

// Authentication
invoke: 'auth:getToken' → {} → token
invoke: 'auth:logout' → {} → success

// App state
invoke: 'app:getConfig' → {} → config
invoke: 'app:setConfig' → { key, value } → success

// Tool results (streaming from main to renderer)
on: 'tool:result' → { toolId, data }
on: 'tool:complete' → { toolId, success }
on: 'tool:error' → { toolId, error }
```

**Success Criteria**:
- [x] All channels are typed
- [x] Preload script exposes safe API
- [x] No direct Node.js access from renderer
- [x] Error handling is consistent at IPC dispatch boundaries

**Status Update (June 24, 2026)**:
- [x] Fixed tool execution dispatch so `tool:execute` routes to the service executor instead of treating each requested tool name as a bridge handler.
- [x] Added `app:info` IPC channel for renderer startup/status display.
- [x] Added renderer IPC client wrapper to remove direct `window.api` usage from React components.
- [x] Verified with `tsc -p tsconfig.electron.json --noEmit` and `tsc -p tsconfig.renderer.json --noEmit`.

---

### 2.2 Create Service Bridge Layer ✅ COMPLETE
**Objective**: Expose existing services (API, MCP, tools) to renderer via IPC

**Files Created/Modified**:
- [x] `electron/services-bridge.ts` - central registration for main-process services and IPC handlers
- [x] `electron/services/*.ts` - service adapters for tools, API, filesystem, auth, and app state
- [x] `src/renderer/ipc-client.ts` - renderer-side IPC client
- [x] `electron/main.ts` - delegates IPC service setup to `registerServiceBridges`

**Implementation**:
- [x] Move Electron service initialization into main process startup
- [x] Create IPC listeners that delegate to service bridge adapters
- [x] Handle async operations and streaming tool result events
- [x] Wire `ToolServiceBridge` to an executable Electron bridge tool registry
- [x] Initialize `ApiServiceBridge` with lazy real Anthropic SDK/auth client setup
- [x] Wire MCP/session/state services beyond placeholder adapters

**Services to Bridge**:
- [x] ToolRegistry (execute tools) - executable bridge registry with service-backed tools
- [x] ApiClient (Anthropic SDK) - lazy SDK initialization from auth service or `ANTHROPIC_API_KEY`
- [x] MCP service - project/user config discovery plus server/tool metadata IPC
- [x] Auth service - keychain-aware bridge with environment-token fallback
- [x] Session/state management - app config/state persistence bridge exists

**Success Criteria**:
- [x] Existing service code runs in main process
- [x] Renderer can call bridge services via IPC
- [x] Results return correctly for implemented bridge adapters
- [x] Error handling works for IPC handler failures

**Status Update (June 24, 2026)**:
- [x] Added `electron/services-bridge.ts` to keep service registration out of `electron/main.ts`.
- [x] Added typed event payloads for `tool:result`, `tool:complete`, and `tool:error`.
- [x] Fixed stale service TypeScript issues (`electron-store` typing, `fetch().json()` casting, filesystem encodings).
- [x] Replaced placeholder tool execution with concrete bridge tools for filesystem, API, config, and MCP discovery operations.
- [x] Added MCP IPC channels for server listing, tool listing, and refresh.
- [x] Added real API/auth bootstrap path using keychain token lookup or `ANTHROPIC_API_KEY`.
- [x] Terminal-specific CLI ToolRegistry parity remains in Phase 4 refactoring because those tools still depend on CLI-only execution context.

---

### 2.3 Update Preload Script ✅ COMPLETE
**Objective**: Create secure IPC bridge for renderer

**Implementation**:
```typescript
// electron/preload.ts exposes:
window.api = {
  tools: { execute, list },
  api: { chat, fetchBootstrap },
  fs: { read, write, list },
  auth: { getToken, logout },
  app: { getConfig, setConfig },
  onToolResult: (callback) => {},
  onToolComplete: (callback) => {},
  onToolError: (callback) => {},
}
```

**Security**:
- No direct require/import access
- All IPC calls validated
- Context isolation enabled
- Sandbox enabled

**Success Criteria**:
- [x] TypeScript types available for `window.api`
- [x] All defined bridge methods callable from renderer
- [x] Context isolation enabled and renderer has no direct Node access
- [ ] Full security warning pass in a launched Electron window

**Status Update (June 24, 2026)**:
- [x] Added `app.info()` to preload API.
- [x] Corrected filesystem request typing for `fs.write` and `fs.list`.
- [x] Added unsubscribe-returning listeners for tool streaming events.

---

## Phase 3: UI Replacement (Days 7-10)

### 3.1 Create React DOM Renderer ✅ COMPLETE
**Objective**: Replace Ink terminal UI with browser-based React DOM

**Files to Create**:
- [x] `src/renderer/` - New directory for UI
- [x] `src/renderer/index.tsx` - React DOM entry point
- [x] `src/renderer/App.tsx` - Main app component
- [x] `src/renderer/styles/` - global CSS
- [x] `build-renderer.mjs` - bundles renderer assets with esbuild
- [x] `write-electron-package.mjs` - writes CommonJS marker for Electron main output

**Implementation Strategy**:
- [x] Establish React DOM shell and build pipeline
- [x] Keep Electron renderer components isolated under `src/renderer`
- [x] Replace Ink-specific components (Box, Text, Input) with browser DOM/CSS equivalents
- [x] Keep command/tool logic behind IPC bridge APIs
- [x] Use HTML elements + CSS for the desktop shell
- [x] Maintain core keyboard behavior (`Enter` send, `Shift+Enter` newline)

**Components to Replace**:
- Terminal-specific input → HTML input
- Box/Text layouts → div/flexbox
- Color/ANSI rendering → CSS classes
- Progress bars → HTML progress element

**UI Structure** (proposed):
```
┌─────────────────────────────────────┐
│ Menu Bar (File, Edit, View, Help)   │ (macOS) / top menu
├─────────────────────────────────────┤
│                                     │
│  Chat Input / Main Content Area     │
│  (Tabs for tools, settings, etc)    │
│                                     │
├─────────────────────────────────────┤
│ Status Bar (token usage, time)      │
└─────────────────────────────────────┘
```

**Success Criteria**:
- [x] Renderer bundle builds without Ink dependencies
- [x] Chat interface visible and functional
- [x] Can input commands/prompts
- [x] Results display correctly
- [x] No renderer app console errors in launched Electron window

**Status Update (June 24, 2026)**:
- [x] Added esbuild renderer bundling so `dist-renderer/index.html`, `index.js`, and `index.css` are generated together.
- [x] Updated `package.json` so `electron .` loads `dist-electron/main.js` instead of the CLI entrypoint.
- [x] Updated `electron/main.ts` to load the built renderer file by default, with `ELECTRON_RENDERER_URL` override support for future dev-server usage.
- [x] Replaced placeholder welcome screen with the chat workspace, message list, composer, status rail, and settings dialog.
- [x] Smoke-launched Electron successfully; observed only Chromium DevTools Autofill warnings, not renderer app errors.
- [x] Fixed sandboxed preload startup by inlining IPC channel constants and mounting React without a blocking pre-flight IPC probe.

---

### 3.2 Implement Message Display & Chat ✅ COMPLETE
**Objective**: Show chat messages, user input, tool results

**Components to Create/Adapt**:
- [x] Message list with scrolling
- [x] Message input box
- [x] Tool result visualization
- [x] Loading indicators
- [x] Error messages

**Features**:
- [x] Display chat history
- [x] Real-time message streaming
- [x] Tool execution feedback
- [x] Code syntax highlighting
- [x] Message copying
- [x] Clear/new session buttons

**Success Criteria**:
- [x] Chat interface matches original CLI aesthetics
- [x] Messages render correctly
- [x] Input accepts commands
- [x] Smooth scrolling/performance

**Status Update (June 24, 2026)**:
- [x] Added streaming API IPC channels (`api:chatStream`, `api:chatDelta`, `api:chatComplete`, `api:chatError`).
- [x] Added live assistant message updates, tool event messages, copy actions, clear session, and slash commands (`/tools`, `/mcp`, `/config`, `/run`, `/clear`).
- [x] Added fenced-code rendering with syntax highlighting via `highlight.js`.

---

### 3.3 Implement Settings & Configuration UI ✅ COMPLETE
**Objective**: Create settings panel to replace CLI flags

**Components to Create**:
- [x] Settings panel/modal
- [x] API key input
- [x] Model selection
- [x] Theme picker
- [x] Plugin management
- [x] Advanced options

**Settings to Expose**:
- [x] API key (with secure input masking)
- [x] Model selection
- [x] Temperature, max tokens
- [x] Memory settings
- [x] Plugin enable/disable
- [x] Auto-update settings
- [x] Appearance (light/dark theme)

**Success Criteria**:
- [x] All CLI flags have UI equivalent
- [x] Settings persist across restarts
- [x] No CLI required for configuration

**Status Update (June 24, 2026)**:
- [x] Added settings dialog backed by `app:setConfig` and secure `auth:setToken`.
- [x] Added model, temperature, token limit, theme, memory, plugin, and auto-update controls.
- [x] Audited the large CLI root option surface from `main.tsx` and mapped user-facing, hidden, and feature-gated root flags into grouped persisted desktop settings.
- [x] Added grouped settings for output/debug, tools/permissions, workspace context, session/resume, integrations, and advanced compatibility flags.

---

## Phase 4: Service Refactoring (Days 11-14) 🔄 IN PROGRESS

### 4.1 Decouple Terminal-Specific Code 🔄 IN PROGRESS
**Objective**: Remove terminal dependencies from shared services

**Files to Audit/Modify**:
- `src/utils/` - Terminal-specific utilities
- `src/components/` - Terminal-only components
- Main service files with terminal assumptions

**Issues to Fix**:
- [ ] ANSI color parsing → CSS colors
- [ ] Terminal width/height assumptions → window size
- [ ] Subprocess calls for keychain → Node crypto
- [ ] Terminal key handlers → DOM event handlers
- [ ] stdin/stdout → window events

**Strategy**:
- [x] Create abstraction layer for terminal vs desktop service seams where needed
- [ ] Use feature flags or runtime detection
- [ ] Keep backward compatibility for CLI

**Success Criteria**:
- [ ] Services work in both terminal and desktop contexts
- [ ] No terminal code in shared services
- [ ] Can run with or without TTY

**Status Update (June 24, 2026)**:
- [x] Refactored the Electron API bridge behind provider adapters for Anthropic, OpenAI, and OpenAI-compatible backends.
- [x] Added OpenAI-compatible `/chat/completions` normal and streaming support for local backends such as LM Studio.
- [x] Verified OpenAI-compatible normal and streaming chat with a local mock server.
- [ ] Remaining: continue the broader terminal-specific shared-service audit.

---

### 4.2 Handle Multi-Process State Management ✅ PENDING
**Objective**: Manage state across main/renderer processes

**Implementation**:
- [ ] Move AppState to main process
- [ ] Sync state to renderer via IPC
- [ ] Persist state to disk (electron-store)
- [ ] Handle concurrent updates

**Files to Modify**:
- `src/state/AppState.ts` - Move to electron/state.ts
- `src/context/` - Create context bridges for IPC

**Success Criteria**:
- State persists correctly
- Renderer/main stay in sync
- No state corruption on concurrent updates

---

### 4.3 Implement Secure Keychain Integration 🔄 IN PROGRESS
**Objective**: Use OS keychain for API key storage

**Implementation**:
- [x] Use `keytar` npm package (Node.js bindings to system keychain)
- [x] Store provider-scoped API keys securely in macOS Keychain / Windows Credential Manager / Linux Secrets when available
- [ ] Never pass keys in IPC beyond the one-time settings save path

**Files to Create/Modify**:
- [ ] `electron/keychain.ts` - Keychain service
- [x] `electron/services-bridge.ts` - Add keychain endpoints

**Success Criteria**:
- [x] API keys stored in OS keychain
- [x] No keys in plain text config
- [x] Can read/write keys securely

---

## Phase 5: Packaging & Distribution (Days 15-18)

### 5.1 Configure Electron Builder ✅ PENDING
**Objective**: Set up cross-platform packaging

**Files to Create/Modify**:
- `electron-builder.json` - Build configuration
- `package.json` - Add build scripts

**Configuration**:
- [ ] Windows: .exe installer + portable
- [ ] macOS: .dmg installer + code signing + notarization
- [ ] Linux: .AppImage + .deb packages
- [ ] Auto-update channels (stable, beta)

**Scripts to Add**:
```json
{
  "scripts": {
    "build:electron": "electron-builder",
    "build:electron:dev": "electron-builder --dir",
    "pack": "electron-builder --dir",
    "dist": "electron-builder"
  }
}
```

**Success Criteria**:
- `npm run dist` creates installers for all platforms
- Apps are signed and notarized
- Auto-update works correctly

---

### 5.2 Set Up Auto-Update ✅ PENDING
**Objective**: Implement automatic app updates

**Implementation**:
- Use `electron-updater`
- Create GitHub Releases for distribution
- Configure update channels (stable, beta)
- Add manual check-for-updates menu item

**Files to Create/Modify**:
- `electron/updater.ts` - Auto-update logic
- `electron/main.ts` - Initialize updater

**Success Criteria**:
- App checks for updates on startup
- User can manually check for updates
- Updates download and install automatically
- Can roll back if needed

---

### 5.3 Create Distribution & Release Pipeline ✅ PENDING
**Objective**: Automate releases and distribution

**Implementation**:
- [ ] GitHub Actions workflow for building releases
- [ ] Automated code signing
- [ ] Automated notarization (macOS)
- [ ] Release notes generation
- [ ] Upload to release servers

**Files to Create**:
- `.github/workflows/release.yml` - CI/CD pipeline
- `scripts/release.js` - Release script

**Success Criteria**:
- `npm run release` creates and publishes release
- All platforms built automatically
- All signatures and notarizations applied
- Release notes generated automatically

---

## Phase 6: Testing & Polish (Days 19-21)

### 6.1 Cross-Platform Testing ✅ PENDING
**Objective**: Verify app works on all platforms

**Platforms to Test**:
- [ ] Windows 10/11 (Intel + ARM)
- [ ] macOS 12+ (Intel + Apple Silicon)
- [ ] Linux (Ubuntu 20.04+)

**Test Cases**:
- [ ] App launches and renders
- [ ] Chat interface works
- [ ] Tools execute correctly
- [ ] Auth flow works
- [ ] Settings persist
- [ ] Auto-update triggers
- [ ] Multiple windows work (if supported)
- [ ] Keyboard shortcuts work
- [ ] Drag & drop works (if applicable)

**Success Criteria**:
- No crashes on any platform
- All features work consistently
- Performance is acceptable

---

### 6.2 UI Polish & Accessibility ✅ PENDING
**Objective**: Improve UX and accessibility

**Tasks**:
- [ ] Add keyboard shortcuts cheat sheet
- [ ] Add tooltips for buttons
- [ ] Implement dark/light mode toggle
- [ ] Add accessibility features (screen reader support)
- [ ] Improve error messages
- [ ] Add loading states
- [ ] Add animations/transitions
- [ ] Test with assistive technologies

**Success Criteria**:
- WCAG 2.1 AA compliant
- All shortcuts documented
- Smooth user experience
- No accessibility issues

---

### 6.3 Performance Optimization ✅ PENDING
**Objective**: Optimize startup time and runtime performance

**Areas to Profile**:
- [ ] Startup time (target: < 3 seconds)
- [ ] Message rendering speed
- [ ] Tool execution performance
- [ ] Memory usage
- [ ] CPU usage during idle

**Optimization Targets**:
- [ ] Code splitting for renderer
- [ ] Lazy load heavy components
- [ ] Optimize imports
- [ ] Cache bootstrap data
- [ ] Reduce main process startup time

**Success Criteria**:
- Startup time < 3 seconds
- No memory leaks
- Smooth scrolling (60 FPS)
- CPU idle when not in use

---

## Phase 7: Documentation & Handoff (Days 22-21)

### 7.1 Developer Documentation ✅ PENDING
**Objective**: Document development setup and architecture

**Files to Create**:
- `docs/DEVELOPMENT.md` - Setup guide for developers
- `docs/ARCHITECTURE.md` - System architecture
- `docs/IPC_API.md` - IPC channels documentation
- `docs/CONTRIBUTING.md` - Contribution guidelines

**Content**:
- [ ] How to set up development environment
- [ ] How to build from source
- [ ] How to run in dev/prod mode
- [ ] How to extend with new tools
- [ ] How to add new services
- [ ] Release process

---

### 7.2 User Documentation ✅ PENDING
**Objective**: Create user-facing documentation

**Files/Content**:
- [ ] User guide
- [ ] Keyboard shortcuts
- [ ] Troubleshooting guide
- [ ] FAQ
- [ ] Settings reference
- [ ] Plugin development guide

---

### 7.3 Release & Launch ✅ PENDING
**Objective**: Prepare for public release

**Checklist**:
- [ ] All tests passing
- [ ] Documentation complete
- [ ] Release notes written
- [ ] Marketing copy created
- [ ] Download page ready
- [ ] Launch announcement prepared

**Success Criteria**:
- App ready for production
- Users can download and install
- Support processes in place

---

### 1.4 Create Minimal Main Process ✅ COMPLETE
**Objective**: Get basic Electron window working

**Implementation Created**:
- [x] `electron/main.ts` - App lifecycle (ready, activate, quit)
- [x] `electron/preload.ts` - BrowserWindow creation
- [x] `electron/bridge.ts` - Window restoration from saved state
- [x] `electron/types.ts` - Graceful shutdown handling

**Features Implemented**:
- [x] Window creation on app ready
- [x] Window state persistence (position, size)
- [x] Proper quit/close handling
- [x] Basic menu (File, Edit, View, Help)
- [x] Single instance enforcement
- [x] Theme detection
- [x] Development mode with DevTools

**Success Criteria**:
- [x] Window opens with placeholder content
- [x] Window state persists across restarts
- [x] App closes properly
- [x] Menu works
- [x] Ready for Phase 2 service integration

---

## Status Tracking

### Overall Progress
- **Phase 1** (Foundation): 100% ✅ COMPLETE
- **Phase 2** (IPC Bridge): 100% ✅ COMPLETE - IPC/preload/client, service registration, executable bridge tools, API/auth bootstrap, and MCP metadata bridge complete
- **Phase 3** (UI Replacement): 100% ✅ COMPLETE - React DOM shell, streaming chat, message rendering, tool feedback, and full settings/configuration UI complete
- **Phase 4** (Service Refactoring): 20% 🔄 IN PROGRESS - LLM provider abstraction and provider-scoped key storage started
- **Phase 5** (Packaging): 0% - Not Started
- **Phase 6** (Testing): 0% - Not Started
- **Phase 7** (Documentation): 0% - Not Started

### Timeline
- **Target Completion**: 3-4 weeks from start
- **Current Date**: June 24, 2026
- **Target Launch**: ~July 21, 2026
- **Phase 1 Completed**: June 23, 2026 (Day 1) ✅
- **Latest Update**: June 24, 2026 - added Anthropic/OpenAI/OpenAI-compatible LLM provider support with LM Studio-compatible streaming and provider-scoped key storage.
- **Next Focus**: test against a real LM Studio instance, then continue Phase 4.1 terminal-specific shared-service audit.

---

## Risks & Mitigation

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|-----------|
| TypeScript compilation errors | High | Schedule slips | Regular builds, type checking |
| Circular dependencies | High | Build breaks | Refactor state early, test often |
| IPC communication latency | Medium | Poor UX | Profile early, optimize channels |
| Cross-platform issues | Medium | Delay release | Test on all platforms continuously |
| Large codebase complexity | High | Onboarding issues | Document well, refactor incrementally |
| Service integration issues | Medium | Feature gaps | Create adapters, maintain compatibility |

---

## Success Criteria (Overall)

- ✅ Standalone desktop app (no terminal required)
- ✅ All features from CLI work in desktop
- ✅ Cross-platform (Windows, macOS, Linux)
- ✅ Auto-update working
- ✅ < 3 second startup time
- ✅ 512KB installer size (or reasonable)
- ✅ Code-signed and notarized
- ✅ Feature parity with CLI version
- ✅ Good user documentation
- ✅ Developer documentation for extensions

---

## Notes

- This plan assumes incremental development with regular testing
- Each phase builds on previous one
- Parallel work possible (e.g., UI design while IPC is being built)
- Rollback strategy: git tags at end of each phase
- CI/CD essential for catching breakage early
