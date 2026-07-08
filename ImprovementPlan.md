# Code-Agent Desktop App Improvement Plan

**Project Goal**: Transform CodeAgent CLI into a standalone desktop application using Electron

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
- [x] Initialize `ApiServiceBridge` with provider HTTP/keychain setup
- [x] Wire MCP/session/state services beyond placeholder adapters

**Services to Bridge**:
- [x] ToolRegistry (execute tools) - executable bridge registry with service-backed tools
- [x] API client - OpenAI-compatible HTTP provider path with provider-scoped auth
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
- [x] Added real API/auth bootstrap path using keychain token lookup or provider environment keys.
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
- [x] Updated Electron dev scripts and package metadata so desktop runs load `dist-electron/main.js` while npm package metadata stays focused on the CLI entrypoint.
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

## Phase 4: Service Refactoring (Days 11-14) ✅ COMPLETE

### 4.1 Decouple Terminal-Specific Code ✅ COMPLETE
**Objective**: Remove terminal dependencies from shared services

**Files to Audit/Modify**:
- `src/utils/` - Terminal-specific utilities
- `src/components/` - Terminal-only components
- Main service files with terminal assumptions

**Issues to Fix**:
- [x] ANSI color parsing → CSS colors
- [x] Terminal width/height assumptions → window size
- [x] Subprocess calls for keychain → keytar-backed keychain service
- [x] Terminal key handlers → DOM event handlers
- [x] stdin/stdout → window events

**Strategy**:
- [x] Create abstraction layer for terminal vs desktop service seams where needed
- [x] Use feature flags or runtime detection
- [x] Keep backward compatibility for CLI

**Success Criteria**:
- [x] Services work in both terminal and desktop contexts
- [x] No terminal code in desktop service paths
- [x] Can run with or without TTY

**Status Update (June 24, 2026)**:
- [x] Refactored the Electron API bridge behind provider adapters for OpenAI and OpenAI-compatible backends.
- [x] Added OpenAI-compatible `/chat/completions` normal and streaming support for local backends such as LM Studio.
- [x] Verified OpenAI-compatible normal and streaming chat with a local mock server.
- [x] Extracted provider-scoped keychain storage from the auth bridge into `electron/keychain.ts`.
- [x] Added desktop runtime feature marker in bootstrap data for runtime-aware service branching.
- [x] Added renderer ANSI escape parsing to DOM/CSS spans and viewport sizing from browser window dimensions.
- [x] Confirmed Electron/renderer service paths do not depend on direct `stdin`, `stdout`, TTY, or terminal dimension APIs.
- [x] Restored compiled Node CLI startup compatibility while preserving desktop entrypoints: CLI now runs through `dist/entrypoints/cli.js`, supports compiled lazy `require(...)` paths, restores React Compiler memo-cache behavior, handles the inherited message namespace, and keeps Ink rendering compatible with the installed reconciler.
- [x] Hardened CLI onboarding for Node runtime use: hosted-provider preflight is opt-in, preflight has a bounded timeout, Ink host refs use `forwardRef`, native structured diff rendering falls back safely, and embedded theme picker no longer swallows onboarding Ctrl+C handling.
- [x] Fixed compiled CLI onboarding theme picker layout so the setup screen renders the title, help text, and all six theme choices under `node dist/entrypoints/cli.js`.
- [x] Fixed compiled CLI OAuth onboarding so login-method selection advances to browser sign-in instead of stalling on the startup spinner: replaced the shared select dependency with local input handling, added bounded OAuth startup retry behavior, and committed OAuth URL state through Ink discrete updates.
- [x] Added a CLI onboarding skip option for users without hosted provider accounts, with guidance to configure LM Studio/OpenAI-compatible backends in the desktop app.
- [x] Verified CLI smoke paths: `--version`, `--help`, `mcp list`, hosted auth URL emission, `-p "hello" --bare --output-format text` expected no-credentials handling, interactive setup screen rendering, OAuth login-method selection, OAuth skip path, third-party platform setup rendering, arrow-key response, and Ctrl+C exit hint without React stack traces.

**Status Update (June 25, 2026)**:
- [x] Fixed the compiled CLI post-trust exit/crash chain after skip-login onboarding.
- [x] Hardened login-method and trust-dialog input handling for PTY/cooked batched input such as `4\r`, arrow sequences, and Enter.
- [x] Replaced remaining React 19 `use(promise)` call sites in CLI render paths with React 18-compatible promise state loading.
- [x] Guarded GrowthBook analytics reset against SDK builds without `destroy()`.
- [x] Made `/ultraplan` prompt loading lazy with a fallback so a missing optional prompt asset does not break normal CLI startup.
- [x] Skipped metrics opt-out API checks when no API key is configured, avoiding no-auth debug errors after login is skipped.
- [x] Added CLI OpenAI-compatible provider support for LM Studio/local backends through `--llm-provider`, `--base-url`, existing `--model`, and matching environment variables.
- [x] Added `/login` CLI setup for LM Studio/OpenAI-compatible backends, persisting non-secret provider, base URL, and model settings for future runs.
- [x] Fixed exact slash-command submission and immediate local JSX dispatch so typing `/login` and pressing Enter opens the provider setup dialog even while the command suggestion row or queue state is active.
- [x] Added React 18 reconciler event-priority compatibility and discrete state wrapping for async local JSX overlays so `/login` dialog updates do not fail after command loading.
- [x] Fixed LM Studio setup text-input cursor handling and fresh-model placeholder behavior so custom model IDs save without appending to fallback text.
- [x] Added LM Studio-safe local context defaults: local OpenAI-compatible requests now cap output tokens to 2048 and omit tool schemas/tool-search metadata by default to fit 8k context windows; `CODE_AGENT_ENABLE_TOOLS=1` and `CODE_AGENT_MAX_OUTPUT_TOKENS` opt back into larger-context tool testing.
- [x] Added a CLI adapter over OpenAI `/chat/completions`, including streaming text, streamed tool-call mapping, tool-result history mapping, local token estimation, and local model listing.
- [x] Ensured OpenAI-compatible CLI sessions bypass hosted-provider auth setup, first-party-only betas, global prompt-cache markers, and bootstrap fetches.
- [x] Updated CLI auth/status UI so local OpenAI-compatible sessions do not show hosted-provider "Not logged in" messaging and `/status` reports the configured local backend.
- [x] Verified fresh-profile onboarding smoke: theme selection → skip login → security notes → workspace trust → main prompt remained alive → clean double-Ctrl+C exit.
- [x] Verified fresh `/login` LM Studio setup persists `CODE_AGENT_LLM_PROVIDER=openai-compatible`, `CODE_AGENT_BASE_URL=http://127.0.0.1:1234/v1`, and `CODE_AGENT_MODEL=qwen/qwen3-coder-30b`.
- [x] Verified compiled CLI against a mock LM Studio `/v1/chat/completions` server: default request sends no `tools`, caps `max_tokens` to 2048, and streams a response; opt-in `CODE_AGENT_ENABLE_TOOLS=1` restores tool schemas.
- [x] Verified debug log is clean for the previous crash signatures: `prepareUpdate`, unsupported `React.use`, GrowthBook `destroy`, missing `/ultraplan` prompt, and no-key metrics auth errors.
- [x] Verified compiled CLI OpenAI-compatible smoke paths with a local mock server: plain streaming `-p` response and streamed `Read` tool-call round trip.

---

### 4.2 Handle Multi-Process State Management ✅ COMPLETE
**Objective**: Manage state across main/renderer processes

**Implementation**:
- [x] Move AppState to main process
- [x] Sync state to renderer via IPC
- [x] Persist state to disk (electron-store)
- [x] Handle concurrent updates

**Files to Modify**:
- [x] `electron/services/app-state-service-bridge.ts` - main-process state/config store with serialized writes
- [x] `electron/services-bridge.ts` - emits config/state change events to renderer
- [x] `electron/preload.ts` and `src/renderer/ipc-client.ts` - typed config/state change subscriptions

**Success Criteria**:
- [x] State persists correctly
- [x] Renderer/main stay in sync
- [x] No state corruption on concurrent updates

**Status Update (June 24, 2026)**:
- [x] Added versioned config/state updates and serialized app-state writes.
- [x] Added `app:configChanged` and `app:stateChanged` events from main to renderer.
- [x] Verified concurrent config/state writes with a service-level smoke test.

---

### 4.3 Implement Secure Keychain Integration ✅ COMPLETE
**Objective**: Use OS keychain for API key storage

**Implementation**:
- [x] Use `keytar` npm package (Node.js bindings to system keychain)
- [x] Store provider-scoped API keys securely in macOS Keychain / Windows Credential Manager / Linux Secrets when available
- [x] Never pass keys in IPC beyond the one-time settings save path

**Files to Create/Modify**:
- [x] `electron/keychain.ts` - Keychain service
- [x] `electron/services-bridge.ts` - Add keychain endpoints

**Success Criteria**:
- [x] API keys stored in OS keychain
- [x] No keys in plain text config
- [x] Can read/write keys securely

---

### 4.4 Desktop CLI Parity Foundation ✅ COMPLETE
**Objective**: Bring the desktop app up to the current CLI foundation for local LM Studio/OpenAI-compatible testing

**Scope Completed (June 25, 2026)**:
- [x] Added desktop-safe local provider defaults matching the CLI LM Studio path: 8192 context tokens, 2048 max output tokens, and model tool schemas disabled by default.
- [x] Exposed context tokens and model tool-call enablement in the desktop Settings UI.
- [x] Added provider-aware Settings defaults so OpenAI and OpenAI-compatible backends switch model/base URL/token settings together.
- [x] Added `/help`, `/status`, `/login`, `/login lmstudio`, `/settings`, `/tools`, `/mcp`, `/config`, `/run`, and `/clear` desktop command equivalents.
- [x] Fixed the desktop menu Settings action by forwarding the menu event through preload to the renderer.
- [x] Added an Electron OpenAI-compatible tool-call loop over desktop bridge tools, including streamed tool-call parsing, tool-name sanitization for OpenAI function names, tool-result feedback, and bounded tool-call rounds.
- [x] Kept local model tool schemas opt-in so basic LM Studio chat stays within small local context windows by default.
- [x] Fixed desktop OpenAI-compatible tool-result formatting so void-returning bridge tools such as `fs.write` send a valid string `content` field back to LM Studio.
- [x] Clarified desktop filesystem tool descriptions so models prefer workspace-relative paths.
- [x] Added an explicit desktop filesystem guard for `~/...` paths so home-directory writes fail clearly instead of creating a literal `~` folder inside the workspace.
- [x] Exposed the real desktop workspace path through `app:info`, the sidebar, `/status`, `/pwd`, and `/workspace`.
- [x] Added the desktop workspace root to the OpenAI-compatible system prompt so local models can report real full paths instead of hallucinating `/workspace`.
- [x] Verified main-process and renderer TypeScript checks after the parity changes.
- [x] Verified the void-returning `fs.write` tool-call path, home-path guard, and workspace-root prompt with mock smoke tests.

**Remaining Parity Notes**:
- [ ] Full CLI session resume/fork and terminal-only registry parity are still broader follow-up work; desktop session persistence, permission workflows, and local bridge-tool testing are complete for the local-first workbench.
- [x] MCP stdio tool execution is available from the desktop app; HTTP/WebSocket MCP transports remain a future transport expansion.

---

### 4.5 Local-First Desktop Agent UX ✅ COMPLETE
**Objective**: Turn the working desktop chat/tool bridge into a usable local agent workbench with a modern assistant-console UX, without chasing proprietary cloud-only parity.

**Direction Decision (June 25, 2026)**:
- [x] Keep OpenAI, OpenAI-compatible, and LM Studio provider flexibility as a core product direction.
- [x] Prioritize local LM Studio/OpenAI-compatible agent reliability before packaging.
- [x] Use modern desktop assistant UX patterns as reference points, but implement only the pieces that fit this codebase and local-first execution model.
- [x] Defer cloud-specific features such as hosted background agents, managed connectors, scheduled cloud tasks, and proprietary PR monitoring until the local desktop foundation is solid.
- [x] Keep the built-in agent core small and generic: filesystem, Bash, web research, time, app config, and MCP discovery/execution.
- [x] Treat specialized services such as finance quotes as built-in connector examples for common structured data, not as the pattern for every possible topic.
- [x] Prefer generic web research and MCP/plugin extensibility over hardcoding a new service for each user question category.

**Reference Capability Gaps to Track**:
- [x] Full permission workflow for file writes, command execution, MCP calls, undo, and other potentially destructive tools through per-tool allow/ask/deny policies plus specific diff/command reviews.
- [x] File edit diff preview before apply, plus an applied-changes review surface after tool execution with Open/Reveal actions for applied filesystem results.
- [x] Checkpoint/undo support for tool-driven file changes.
- [x] Desktop session persistence, recent session restore, and transcript search. Resume/fork remain future enhancements.
- [x] MCP stdio tool execution from the desktop app, not just MCP server/tool metadata discovery.
- [x] Initial rich workspace context: visible workspace path, scoped file browser, and file open/reveal actions. Open-file content context and selected-context prompts remain future enhancements.
- [x] Tool activity timeline with arguments, status, results, and errors. Retry affordances remain future polish.
- [x] Integrated terminal/run-command experience with permission gates.
- [x] Git-aware workflow helpers: changed files, diffs, branch status, commit summary, and PR-ready change review. Initial helpers are exposed as approved workspace commands; deeper PR automation remains future work.
- [x] Desktop app preview or dev-server awareness for web projects through approved workspace helper commands for listening ports/dev-server discovery. Embedded preview remains future work.
- [x] Plugin/skill management UI only after core tools, sessions, and permissions are reliable. Initial plugin/skill/MCP configuration visibility is available in Tools and detailed editing remains in Settings.
- [x] Initial tool registry UI that distinguishes bridge tools, MCP server state, and executable MCP tools.
- [x] Initial tool router controls that let users hide/show bridge tools from model tool calls without code changes.
- [x] Full connector/MCP-specific router controls, policy presets, and per-tool permission modes.
- [x] Connector architecture cleanup: group built-in tools into core, research, connector examples, API bridge, and MCP adapters in the Tools UI.

**Desktop UX Workbench Backlog**:
- [x] Replace the current chat-first shell with a stable workbench layout: session/sidebar area, primary chat, and context/tool inspector.
- [x] Add a clear model/provider/workspace status header with endpoint context, request state, tool-call mode, exposed-tool count, and MCP summary. Active backend ping/health check remains future polish.
- [x] Add a workspace file browser with directory navigation, Open/Reveal actions, and a visible absolute workspace path.
- [x] Add read-only utility tools for current time, generic web research, web lookup/fetch, and finance quotes so the model does not create files/scripts or stop at search-link lists for simple factual questions.
- [x] Add a tool timeline panel that shows each model-requested tool call, parameters, result summary, and failure reason.
- [x] Add a safe file-write flow: model proposes write/edit -> app shows path and diff -> user approves -> bridge applies change.
- [x] Add checkpoint creation before file write tools and restore support for the latest checkpoint.
- [x] Add a guarded command execution tool with desktop approval, workspace cwd scoping, timeout/output limits, and destructive-command blocking.
- [x] Add session list/recent activity so desktop restarts do not lose chat history.
- [x] Add command palette/slash-command UI polish for `/login`, `/settings`, `/status`, `/tools`, `/mcp`, `/workspace`, and future commands.
- [x] Add clear empty/loading/error states for LM Studio unavailable, model context overflow, bad tool-call JSON, and unsupported paths such as `~/...`.
- [x] Polish the desktop shell toward a modern assistant-console workbench: left navigation, recents, warm neutral canvas, centered chat column, rounded composer, and quieter context rail.
- [x] Make the left navigation functional: Chats returns to the conversation, Projects opens workspace context, and Tools opens tool catalog/activity.
- [x] Remove the always-visible right context rail from the chat view and move compact context into clickable footer/status panes.
- [x] Convert Settings from modal/drawer treatment into a first-class main workspace view.
- [x] Rework Settings into a sectioned main view with left-side groups and one selected configuration form at a time.
- [x] Move the Settings entry point out of the top header and into the lower-left sidebar status area.
- [x] Promote Settings, Automation, Projects, and Tools section navigation into the global left sidebar so workbench pages render one focused child page instead of nested tab/sidebar panels.
- [x] Add a collapsible left navigation rail for a SaaS-console style layout.
- [x] Remove duplicate chat-header status in favor of the persistent footer/status bar.
- [x] Add executable stdio MCP support: discover configured stdio servers, list their tools, and call selected MCP tools through the audited bridge tool path.
- [x] Keep HTTP/WebSocket MCP servers visible but explicitly mark them as not executable until those transports are added.

**Progress Update (June 25, 2026)**:
- [x] Added a typed `tool:start` IPC event from main process to renderer so model-driven and manual tool calls can be displayed as activity, not only as chat messages.
- [x] Added a desktop side-panel tool activity timeline with compact arguments, result previews, success/failure state, timing, and clear action.
- [x] Added a typed desktop file-write review flow: `fs.write` now generates a real-path diff preview, sends it to the renderer, and waits for explicit approve/reject before writing.
- [x] Added checkpointed desktop writes plus `fs.undoLastWrite` to restore the latest write checkpoint.
- [x] Verified filesystem preview/checkpoint/undo service behavior for both new-file and existing-file writes.
- [x] Made Electron DevTools opt-in during development after a native Electron 31/macOS crash report showed `SIGSEGV` in Chromium font/GPU code while DevTools was opening; added a GPU-off development script for local crash isolation.
- [x] Reworked the renderer UI into a more polished desktop assistant shell: left sidebar, recent prompts, centered conversation, subtle message styling, refined composer, and less debug-heavy context panels.
- [x] Follow-up UI polish: left-panel Projects/Tools now switch to real views, operational context moved into status panes, and Settings is a main workspace view.
- [x] Added `time.now`, `web.search`, and `web.fetch` as read-only desktop bridge tools, plus prompt policy directing models to use them before filesystem or Bash workarounds.
- [x] Added `web.research` as a generic search+fetch+extract tool so broad external/current questions can produce direct source-grounded answers without hardcoded topic services.
- [x] Added `finance.quote` as a read-only structured quote tool so stock-price questions can return a direct price/currency/change/timestamp instead of only search-result links.
- [x] Added `bash.run` as an approved desktop bridge tool with parsed non-shell commands, workspace cwd enforcement, blocked destructive commands, timeout/output caps, and a command review dialog.
- [x] Reworked Settings into a main-view section navigation layout with a selected detail form, preserving existing config fields and save/auth actions.
- [x] Added stdio MCP runtime support with SDK-backed server connections, executable MCP tool discovery, `mcp.listTools`, and `mcp.callTool`.
- [x] Reworked the Tools view into a clearer registry showing bridge tools, MCP server statuses, and discovered executable stdio MCP tools.
- [x] Added persisted desktop chat sessions with current-session restore, bounded recent sessions, sidebar switching, `/sessions`, and Projects view session summary.
- [x] Added a scoped Projects file browser backed by `fs.list`, with root/up/refresh controls, directory navigation, visible workspace path, and sorted directory/file rows.
- [x] Added persisted tool-router controls in the Tools view: expose all, read-only only, hide mutating tools, and per-tool hide/expose toggles that filter model tool schemas while preserving manual `/run`.
- [x] Added sidebar transcript search across persisted sessions and workspace-scoped Projects Open/Reveal actions through guarded Electron shell IPC.
- [x] Added user-facing error guidance for unreachable local LLM endpoints, context-window overflow, malformed tool/chat payloads, and workspace path policy violations.
- [x] Added a slash-command palette in the composer backed by the same command registry used for `/help`.
- [x] Added a compact chat runtime strip for provider, model, workspace, tool-call exposure, and MCP status with navigation into Settings, Projects, and Tools.
- [x] Added a generic desktop tool permission review channel plus persisted allow/ask/deny policies enforced before bridge tool execution.
- [x] Added Tools view policy presets, per-tool permission selectors, connector/tool grouping, MCP execution-policy visibility, plugin/skill configuration visibility, and an approved workspace command runner.
- [x] Added built-in workspace helper commands for git status/diff/branch, npm script discovery, and dev-server/listening-port awareness.
- [x] Added applied filesystem result actions in the tool activity timeline so completed writes/undo operations can be opened or revealed from the UI.

**Progress Update (June 26, 2026)**:
- [x] Reworked global navigation into parent/child sidebar routes for Settings and Automation.
- [x] Removed nested Settings/Automation section menus from the main content cards.
- [x] Added persisted sidebar collapse/expand behavior for a more console-like layout.
- [x] Extended parent/child sidebar navigation to Projects and Tools, splitting each into focused child pages.
- [x] Removed the duplicate top status pill from the chat header because status already appears in the footer bar.

**Acceptance Criteria Before Packaging**:
- [x] A user can configure LM Studio, start a desktop chat, ask for a file change, review the proposed diff, approve it, and see the file created/edited in the real workspace. Implementation is complete; full manual regression moves to Phase 6 testing.
- [x] The app never claims `/workspace` or another invented path; workspace-relative and absolute paths are shown consistently.
- [x] Tool calls are visible and auditable from the UI, including failed calls.
- [x] At least one checkpoint/undo path works for file writes.
- [x] Read-only current-time, generic web research, finance quote, and web lookup tools are available so simple factual questions no longer require generated scripts or link-only search answers.
- [x] Bash command execution is gated by user approval and scoped to the workspace.
- [x] A restarted desktop app can show recent sessions and recover the last session state.
- [x] MCP execution is implemented for local stdio MCP servers, with UI that distinguishes configured servers from executable tools. HTTP/WebSocket MCP execution remains deferred.

---

### 4.6 Extensibility, Automation, Remote Control, and Virtual Teams 🚧 FUNCTIONAL LOCAL MVP
**Objective**: Add a local-first automation layer that lets the agent grow beyond single chat sessions while preserving user control and workspace safety.

**Product Direction (June 25, 2026)**:
- [x] Treat skills/automations as a first-class extension path for both CLI and desktop, not as hidden prompt files.
- [x] Add scheduled tasks for repeated local workflows such as daily summaries, repo checks, dependency scans, and recurring report generation.
- [x] Add remote control so a human can approve, pause, resume, or inspect long-running agent work from a phone when away from the main workstation.
- [x] Add virtual autonomous team blueprints where a supervisor agent coordinates role-specific agents such as project manager, developer, QA, and reviewer.
- [x] Keep the first implementation local-first and auditable: project state lives in the workspace, every dangerous tool remains permission-gated, and cloud/relay features are opt-in future work.

**Architecture Decision**:
- [x] Use a shared automation service bridge so the CLI and desktop app operate on the same project-local data model.
- [x] Persist automation state under `.code-agent` using shareable project files for skills/tasks/teams/runs and ignored local files for device/private remote-control state, instead of mixing it with provider credentials or global desktop preferences.
- [x] Keep skill discovery read-only in the first pass by scanning workspace skill directories for `SKILL.md`/Markdown manifests.
- [x] Expose automation state to the model as read-only bridge tools first; execution and mutation stay behind explicit UI/CLI commands until scheduler and approval policies are complete.

**Skills / Automations**:
- [x] Add local skill discovery for `.code-agent/skills` and `skills`.
- [x] Surface discovered skills in the desktop Automation view.
- [x] Add CLI listing through `automation skills`.
- [x] Add skill enable/disable state and initial per-skill policy storage.
- [x] Add skill execution hooks that safely contribute enabled skill context to scheduled tasks and virtual-team runs.
- [x] Add skill/project automation packaging import/export UX through shareable `.code-agent` project bundles.

**Scheduled Tasks**:
- [x] Add persisted scheduled task definitions with name, prompt, interval, enabled state, next run, last run, and last status.
- [x] Add desktop create/list/run/delete task controls.
- [x] Add CLI commands for task list/add/run/delete.
- [x] Add read-only model visibility through `automation.listTasks`, `automation.listTaskRuns`, and `automation.schedulerStatus`.
- [x] Implement the background scheduler loop in the main process.
- [x] Route scheduled task execution through the same desktop chat/tool permission pipeline as manual sessions.
- [x] Add task run history and visible status/result tracking.
- [x] Add desktop/CLI controls for enable/disable and one-shot scheduled runs.
- [x] Add Automation workbench permission controls so unattended scheduled runs can be explicitly configured without hunting through Settings.
- [x] Add retry policy and notification-state fields for scheduled tasks, including bounded retry attempts and visible policy state in the desktop UI.
- [x] Add desktop notification delivery for scheduled task success/failure policies.
- [x] Add missed-run handling with explicit run-once/skip policy and visible skipped run history.
- [ ] Add remote/mobile push-style notification delivery.

**Remote Control**:
- [x] Add persisted remote-control state with enablement, mode, pairing code, approved devices, and pending approvals.
- [x] Add desktop status, enable/disable, and pairing-code controls.
- [x] Add CLI status/pairing commands.
- [x] Add read-only model visibility through `automation.remoteStatus`.
- [x] Implement a secure local-network control endpoint for paired devices.
- [x] Add mobile-friendly approval UI for pending tool calls, scheduled tasks, and virtual-team runs.
- [x] Add relay mode design notes for access outside the home/office network.
- [ ] Implement relay mode for access outside the home/office network.
- [x] Add device revocation UI and durable remote-control audit log.
- [x] Add local-network remote-control request rate limits.
- [x] Document relay-mode security requirements and token-hardening boundaries.
- [ ] Add relay-grade token hardening.

**Virtual Autonomous Team**:
- [x] Add virtual team blueprint model with objective, supervisor, members, roles, goals, tools, and status.
- [x] Add a default software-delivery team template: Supervisor, Project Manager, Developer, and QA.
- [x] Add desktop create/list/delete team controls.
- [x] Add desktop edit controls for team name, objective, workspace path, supervisor, members, roles, goals, model override, and allowed tools.
- [x] Add CLI commands for team list/create-default/delete.
- [x] Add read-only model visibility through `automation.listTeams` and `automation.listTeamRuns`.
- [x] Add a local supervisor-style orchestration loop that runs team members in role order with previous-step context.
- [x] Add per-run artifacts, progress summaries, and handoff messages.
- [x] Add desktop team communication transcript display showing each member handoff/output in recent team runs.
- [x] Add human approval policy for risky tool actions through the existing desktop/remote permission flow.
- [x] Add per-run tool workspace scoping so filesystem and Bash tools execute against the team workspace instead of only the app launch workspace.
- [x] Add bounded team iteration controls and QA/reviewer sign-off gating.
- [x] Add structured per-run milestones for every team member and iteration, including pending/running/succeeded/failed transitions.
- [ ] Add project completion policy beyond linear member iteration.

**Progress Update (June 25, 2026)**:
- [x] Added `AutomationServiceBridge` as the shared local automation store and service API.
- [x] Added typed Electron IPC, preload, renderer client, and bridge-tool wiring for automation.
- [x] Added the desktop Automation main view with Skills, Scheduled Tasks, Remote Control, and Virtual Team panels.
- [x] Added `/automation`, `/skills`, `/tasks`, `/remote`, and `/team` desktop slash-command entry points.
- [x] Added CLI `automation`/`auto` commands for skills, tasks, remote pairing/status, and team blueprints.
- [x] Added read-only automation bridge tools so models can inspect skills, tasks, remote status, and virtual teams without mutating state.
- [x] Added scheduler execution, task run history, local mobile remote-control server, shared approval queue, CLI OpenAI-compatible automation execution, and virtual-team run artifacts.

**Progress Update (June 26, 2026)**:
- [x] Reworked the desktop Automation workbench from a crowded multi-panel grid into a Settings-style section layout.
- [x] Added an Automation Permissions section for unattended scheduled tasks and virtual-team runs.
- [x] Added a full virtual-team editor for member add/edit/delete, role editing, supervisor selection, model override, allowed tools, and team workspace path.
- [x] Added visible team-run communication transcripts so member handoffs are inspectable in the desktop UI.
- [x] Added virtual-team execution permission modes so trusted teams can run with full access without desktop approval popups, while supervised teams still use approval gates.
- [x] Added duplicate-run guards so Run Team is disabled while a team run is already active.
- [x] Persist team workspace path on blueprints and run records, including team-run artifacts.
- [x] Finished per-run workspace scoping for virtual-team filesystem writes, Bash execution, and team-run artifacts.
- [x] Seed virtual-team workspaces with visible README and persisted blueprint metadata before running members, so a configured workspace is created even if the local model only returns planning text.
- [x] Treat desktop tool-call round-limit exhaustion as failed automation output instead of successful team/task completion, and raise virtual-team tool-call budget for multi-step local-model runs.
- [x] Added project bundle export/import for shareable automation state, excluding provider keys and remote-control pairing secrets.
- [x] Added scheduled-task retry and notification policy controls with bounded retry attempts.
- [x] Added remote device revocation and a durable remote-control audit log.
- [x] Added native desktop notification delivery for scheduled task success/failure policies, with notification events recorded to local history.
- [x] Added local-network request rate limits to the remote-control HTTP endpoint.
- [x] Added virtual-team max-iteration and QA/reviewer sign-off controls, persisted on team blueprints and displayed in the Team Editor.
- [x] Added missed-run policy controls for scheduled tasks, including skipped run records when overdue runs are intentionally skipped.
- [x] Added structured virtual-team milestones to run records, team artifacts, and the Team Communication UI.
- [x] Added `docs/remote-control-security.md` to document relay-mode identity, encryption, rate-limit, token-rotation, and push-notification requirements.

**Acceptance Criteria Before Calling Phase 4.6 Complete**:
- [x] A user can add a scheduled task, quit/restart the app, and the app executes it at the configured interval with visible history.
- [x] A remote phone can pair with the workstation and approve or reject pending tool calls without exposing arbitrary filesystem or command access.
- [x] A virtual team can take a project blueprint, produce a task plan, execute bounded development/QA work, and either run with full access or stop at human approval gates in supervised mode.
- [x] Skills can be installed or discovered, enabled/disabled, and used to add safe workflows without changing core code.
- [x] CLI and desktop remain consistent over the shared automation store and permission model.

---

### 4.7 Shareable Storage and Sync Foundation 🚧 IN PROGRESS
**Objective**: Make chats, projects, automation, team blueprints, and run history portable and sync-ready without putting credentials or device secrets into shareable project files.

**Direction Decision (June 26, 2026)**:
- [x] Use project-shareable `.code-agent` files for configuration and blueprints that should travel with a repo or workspace.
- [x] Keep API keys in OS keychain and machine-private state under ignored local storage.
- [x] Keep high-volume history behind a service API so the JSON-file local MVP can be replaced with SQLite or cloud sync without changing the renderer.
- [x] Treat cloud sync as a later optional provider, not a dependency for local automation and LM Studio testing.

**Project-Shareable Files**:
- [x] Add `.code-agent/project.json` as the project automation manifest.
- [x] Split skill policy state into `.code-agent/skill-policies.json`.
- [x] Split scheduled tasks into `.code-agent/tasks/*.json`.
- [x] Split scheduled task run records into `.code-agent/runs/tasks/*.json`.
- [x] Split virtual team blueprints into `.code-agent/teams/*.json`.
- [x] Split virtual team run records into `.code-agent/runs/teams/*.json`.
- [x] Migrate legacy `.code-agent/automation.json` on first read into the split layout.

**Machine-Private Files**:
- [x] Add `.code-agent/.gitignore` entries for `local/` and `history/`.
- [x] Move remote-control pairing/device state to `.code-agent/local/remote-control.json`.
- [x] Preserve local remote-control token hashes on disk while continuing to sanitize them from renderer/API responses.

**Local History Store**:
- [x] Add a `LocalHistoryServiceBridge` with typed records for `chat-session`, `tool-event`, `automation-run`, and `project-event`.
- [x] Store local history under Electron user data as per-record JSON files for the MVP.
- [x] Add typed IPC/preload/renderer client APIs for saving, listing, reading, deleting, exporting, and inspecting local history.
- [x] Mirror active desktop chat sessions into local history while keeping existing app-state restore compatibility.
- [x] Record tool activity and manual automation/team runs into local history for audit and future sync/export.
- [x] Add a full History/Activity UI for browsing, exporting, deleting, and restoring records.
- [ ] Replace or augment JSON history storage with SQLite when query volume and sync conflict handling require it.
- [x] Add import/export UX for project-shareable `.code-agent` bundles.
- [ ] Add optional cloud sync provider abstraction for chats, projects, teams, tasks, and history records.
- [ ] Add account/device identity, conflict resolution, encryption-at-rest, and sync audit metadata before enabling cloud sync.

**Progress Update (June 26, 2026)**:
- [x] Added a first-class History workbench with Overview, Chats, Tool Events, Automation Runs, Project Events, and Export pages.
- [x] Added history browse/delete/export and chat restore actions in the desktop UI.
- [x] Added automation project export/import IPC and desktop UX for shareable tasks, teams, runs, and skill policies.
- [x] Added remote device revocation and durable audit events for pairing, approvals, server lifecycle, settings, and revocation.
- [x] Added scheduled-task retry and notification policy fields, desktop controls, and bounded retry scheduling after failures.
- [x] Added storage ownership documentation in `docs/storage-ownership.md`, covering workspace-shareable state, local-private state, user profile history, and secrets.

**Acceptance Criteria Before Calling Phase 4.7 Complete**:
- [x] A team/task configuration can be copied with a workspace and loaded on another machine without copying credentials or device pairing state.
- [x] A user can browse and export local chat/tool/automation history from the desktop app.
- [x] App state, automation state, and history state have clear ownership boundaries documented in the plan and code.
- [x] The storage API supports a future SQLite/cloud backend without renderer-side data-model churn.

---

## Phase 5: Packaging & Distribution (Days 15-18, expanded platform tracks)

**Scope Update (July 1, 2026)**: Phase 5 covers distribution surfaces, not only Electron packaging.

**Scope Closure (July 2, 2026)**: Phase 5 is complete for the current local packaging scope. Public npm publication, Apple Developer ID signing/notarization, TestFlight/App Store distribution, and signed-release updater validation are deferred because the required external publishing accounts and credentials are not available.

- **5A macOS CLI**: npm tarball is the first distribution channel; Homebrew is deferred until there is clear demand for it.
- **5B macOS Desktop**: signed/notarized Electron `.app`, DMG/zip, GitHub Releases, and auto-update validation.
- **5C iOS Mobile Companion**: native mobile app for local-network pairing, approvals, session status, and future push notifications.
- **5D Relay/Remote Control**: relay service/package plan for off-network control of sessions running on a laptop or server.

### 5A Package macOS CLI ✅ LOCAL PACKAGE COMPLETE, PUBLIC PUBLISH DEFERRED
**Objective**: Make the terminal `code-agent` command installable and verifiable on macOS independently from the desktop app.

**Implementation**:
- [x] Keep the CLI binary exposed as `code-agent` through `package.json` `bin`.
- [x] Add a top-level npm `files` allowlist so the CLI package ships compiled `dist/**`, README, and CLI distribution docs instead of the full source tree.
- [x] Move generated runtime compatibility imports to CodeAgent-owned compiled runtime shims under `dist/runtime/**`.
- [x] Rewrite optional browser/computer-control package imports to CodeAgent-owned compatibility namespaces and package-local runtime shims during the build.
- [x] Add `scripts/verify-cli-package.mjs` and package scripts for CLI package validation.
- [x] Add `docs/macos-cli-distribution.md` with local build, manual install, and release checklist notes.
- [x] Add `verify:phase5` and `pack:phase5` as local package-set gates for CLI, desktop, release notes, iOS readiness, remote-control scope, and artifact hygiene.
- [x] Validate `npm run pack:cli:check` on the current macOS workspace.
- [x] Validate global install from the generated tarball in an isolated macOS npm prefix.
- [x] Use npm-only as the first public CLI distribution channel.
- [x] Defer Homebrew formula automation until npm distribution is validated with real users.
- Deferred: publish the npm package when a public npm publishing path, release version, and registry ownership are available.

**Success Criteria**:
- [x] `npm run pack:cli:check` passes.
- [x] The tarball includes the compiled CLI entrypoint and runtime shims.
- [x] The tarball excludes Electron renderer/build artifacts, local state, generated installers, and `node_modules`.
- [x] `npm install -g ./code-agent-<version>.tgz` exposes `code-agent --version` and `code-agent --help` on macOS.
- [x] The packaged CLI payload scans clean for removed legacy provider terms and package namespaces.

**Progress Update (July 1, 2026)**:
- [x] Revalidated `npm run pack:cli:check`; the generated `code-agent-1.0.0.tgz` has 1,962 entries, is about 5.09 MB, and passes isolated `code-agent --version` and `code-agent --help` smoke checks.
- [x] Added a release-workflow CLI package job that builds, verifies, and uploads the tarball as a workflow artifact while npm publication remains manual.
- [x] Repaired stale provider-neutral rename mismatches found by the isolated CLI smoke.
- [x] Re-ran source and generated-output footprint scans for removed provider SDK/package names, explicit legacy-provider terms, and old internal-build shorthand.

### 5.1 Configure Electron Builder ✅ LOCAL PACKAGING COMPLETE, PUBLIC SIGNING DEFERRED
**Objective**: Set up cross-platform packaging

**Files to Create/Modify**:
- `package.json` - Build configuration and scripts
- `scripts/verify-phase5.mjs` - Local Phase 5 package-set verification

**Configuration**:
- [x] Windows: .exe installer + portable targets configured
- [x] macOS: .dmg + zip targets configured
- [x] Linux: .AppImage + .deb targets configured
- [x] macOS hardened-runtime entitlements file is valid for local signing
- [x] macOS notarization hook configured; skips safely unless Apple credentials are present
- [x] Auto-update channels configured through electron-builder GitHub publish metadata and semver prerelease channel detection
- [x] Production renderer builds disable source maps before packaging
- [x] Desktop package verifier added for local macOS app metadata, signature, update metadata behavior, and release-mode checks
- [x] Phase 5 package-set verifier added for local CLI tarball, macOS desktop app, release notes, remote-control scope, iOS readiness, and generated-artifact hygiene

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
- [x] `npm run pack` creates a signed macOS directory app locally
- [x] `npm run verify:desktop-package` validates the local packaged macOS app and reports release-only gaps
- [x] `npm run verify:phase5` validates the local package artifact set and reports environment-bound iOS readiness separately
- Deferred: validate cross-platform installer artifacts from release CI when a public candidate is produced.
- Deferred: sign and notarize release artifacts after Apple Developer ID and notarization credentials are available.
- Deferred: validate auto-update against a signed, published GitHub release.

**Progress Update (June 25, 2026)**:
- [x] Existing `package.json` electron-builder config includes app id, product name, output directories, mac/win/linux targets, and build scripts.
- [x] Replaced malformed macOS entitlements file with a valid LF-normalized hardened-runtime plist.
- [x] Verified `npm run pack` on macOS arm64. Packaging and signing succeeded; notarization was skipped because notarization options were not configured.

**Progress Update (June 26, 2026)**:
- [x] Added `electron/updater.ts` and wired startup/manual update checks through the Help menu.
- [x] Configured GitHub Releases publishing for `albertforweb/code-agent`, update channel detection, and update metadata generation.
- [x] Added `electron/notarize.cjs` after-sign hook for macOS notarization when Apple credentials are available.
- [x] Changed production renderer builds to omit source maps and changed `pack` to build fresh production assets before packaging.
- [x] Added release workflow and release packaging documentation.
- [x] Revalidated `npm run pack` after updater/release changes; local macOS arm64 app directory packaging and signing succeeded, notarization skipped without Apple credentials.
- [x] Added generated CodeAgent brand assets under `electron/resources` (`codeagent-logo.svg`, `icon.icns`, `icon.ico`, `icon.png`) and wired them into runtime/packaged app metadata.
- [x] Fixed packaged app startup by moving Electron runtime modules (`electron-store`, `electron-updater`, `keytar`) from dev-only dependencies into production dependencies.
- [x] Revalidated packaged macOS arm64 app startup smoke test and confirmed `electron-store`, `electron-updater`, and unpacked native `keytar.node` are present in the packaged app.
- [x] Rebranded primary desktop and CLI surfaces from inherited labels to CodeAgent, including app metadata, menus, updater dialogs, renderer startup, CLI welcome/logo/help/version, and automation prompts.
- [x] Revalidated `npm run pack`; the generated macOS app reports `CFBundleDisplayName=CodeAgent`, `CFBundleIdentifier=com.albertforweb.codeagent`, and `CFBundleIconFile=icon.icns`.

**Progress Update (July 1, 2026)**:
- [x] Added `scripts/verify-desktop-package.mjs` plus `verify:desktop-package`, `verify:desktop-release`, and `pack:desktop:check` npm scripts.
- [x] The verifier checks the local macOS `.app` bundle metadata, executable bit, app payload, update metadata behavior, hardened runtime signature, Gatekeeper status, and targeted legacy provider branding in release metadata.
- [x] Release mode now fails unless `app-update.yml`, Developer ID signing, and Gatekeeper acceptance are present.
- [x] The GitHub release workflow runs the macOS release verifier before the workflow is considered successful.
- [x] Revalidated `npm run build:electron:prod`, `npm run pack`, and `npm run verify:desktop-package` after the cleanup pass; local packaging succeeds, while public-release signing/notarization/update metadata remain correctly reported as release-only gaps.
- [x] Extracted `app.asar` and scanned the packaged app code for removed provider SDK/package names, explicit legacy-provider terms, and old internal-build shorthand. Only unrelated third-party dependency namespaces remain inside bundled `node_modules`.

---

### 5.2 Set Up Auto-Update ✅ LOCAL READY, PUBLISHED-RELEASE TEST DEFERRED
**Objective**: Implement automatic app updates

**Implementation**:
- [x] Use `electron-updater`
- [x] Create GitHub Releases publishing configuration for distribution
- [x] Configure update channels (stable, beta) through semver prerelease detection
- [x] Add manual check-for-updates menu item
- Deferred: verify update download/install against a real signed, published release.

**Files to Create/Modify**:
- [x] `electron/updater.ts` - Auto-update logic
- [x] `electron/main.ts` - Initialize updater and expose Help menu action

**Success Criteria**:
- [x] App checks for updates on startup in packaged builds
- [x] User can manually check for updates
- [x] Updates download and install after user confirmation
- Deferred: document and test rollback policy after the first real signed release exists.

---

### 5.3 Create Distribution & Release Pipeline ✅ LOCAL PIPELINE READY, PUBLIC CREDENTIALS DEFERRED
**Objective**: Automate releases and distribution

**Implementation**:
- [x] GitHub Actions workflow for building releases
- [x] GitHub Actions workflow for building and preserving the verified CLI tarball artifact
- [x] macOS package verification gate in the release workflow
- Deferred: automated code signing after signing secrets are configured.
- [x] Automated notarization hook for macOS when secrets are configured
- [x] Release notes generation and checklist artifact
- [x] Upload to GitHub Releases through electron-builder

**Files to Create**:
- [x] `.github/workflows/release.yml` - CI/CD pipeline
- [x] `scripts/generate-release-notes.mjs` - Release notes and checklist artifact generator
- Deferred: `scripts/release.js` release orchestration script if manual release commands become too error-prone.
- [x] `docs/release-packaging.md` - Release packaging notes and required secrets

**Success Criteria**:
- [x] `npm run release` creates and publishes release when run with GitHub credentials
- [x] All platforms are configured for automated builds in GitHub Actions
- [x] CLI tarball is configured as a verified GitHub Actions artifact
- Deferred: all signatures and notarizations applied after signing/notarization credentials are configured.
- [x] Release notes generated automatically

**Progress Update (July 2, 2026)**:
- [x] Added `npm run release:notes`, which writes `dist-build/release-notes/CodeAgent-v<version>.md` with source range, artifact checklist, verification checklist, manual release gates, and grouped commits.
- [x] The release workflow now fetches full git history, generates release notes in the CLI package job, and uploads the notes alongside the verified npm tarball artifact.
- [x] Updated release packaging docs so the release flow includes generating and reviewing release notes before tagging.

---

### 5.4 Brand & Vendor Decoupling 🚧 TARGETED BRANDING CLEAN, COMPATIBILITY MIGRATION REMAINS
**Objective**: Make CodeAgent stand on its own as a product while keeping provider integrations explicit and maintainable.

**Completed**:
- [x] Replaced the root README with CodeAgent-focused product, setup, provider, desktop, CLI, automation, and status documentation.
- [x] Removed exact inherited upstream product text from non-build source/docs and regenerated build outputs.
- [x] Reworked primary CLI and desktop identity text to say CodeAgent.
- [x] Removed third-party provider SDK imports from the packageable Electron desktop path and use OpenAI-compatible HTTP calls instead.
- [x] Removed all legacy provider-package imports and installed packages from the source tree and dependency graph.
- [x] Replaced actual legacy SDK usage with CodeAgent-owned LLM message/tool/result types, API error classes, stream helper, MCPB manifest helper, and sandbox runtime compatibility.
- [x] Revalidated `npm run build:electron`, `npm run pack`, source scans, packaged app scans, node_modules namespace scan, and npm dependency-tree scan.
- [x] Made CodeAgent config/install surfaces primary: `CODEAGENT_CONFIG_DIR`, `~/.code-agent`, `code-agent://`, local `code-agent` wrapper, CodeAgent user-agent tokens, and `com.codeagent.*` app/telemetry identifiers.
- [x] Replaced targeted inherited user-facing strings for updater guidance, login/logout copy, subscription labels, diagnostics, deep-link protocol text, GitHub action templates, marketplace names, feedback/release URLs, and packaged app scans.
- [x] Reworded key runtime prompts and built-in agent prompts so CodeAgent is described as a local-first coding agent, not a third-party-provider-owned product.
- [x] Removed old internal feedback-channel instructions from the bundled stuck diagnostic skill.
- [x] Repointed the CodeAgent product URL to the CodeAgent repository and relabeled inherited hosted GitHub Action text as a third-party hosted integration.
- [x] Repointed inherited product documentation links to the CodeAgent repository in user-facing surfaces.
- [x] Replaced the legacy CLI desktop handoff surface with CodeAgent Desktop startup guidance instead of launching the upstream desktop product.
- [x] Confirmed Electron app metadata, renderer title, build product name, and generated icon assets use CodeAgent branding.
- [x] Neutralized old provider-specific internal-build shorthand in active source, generated CLI output, and packaged desktop app code scans.

**Remaining Compatibility Migration**:
- [ ] Introduce CodeAgent-owned environment variable aliases and migrate away from direct `CODE_AGENT_*` names without breaking existing user configs. Primary config/install aliases are in place; broader runtime env aliases remain.
- [ ] Add first-class `CODEAGENT.md` or `AGENTS.md` instruction-file support before de-emphasizing inherited instruction-file loading.
- [x] Replace legacy CLI runtime imports from provider SDK packages with CodeAgent-owned message/tool/result types where practical.
- [ ] Complete controlled legacy compatibility migration across the inherited CLI source tree; do not use a blind global rename because it crosses env vars, model-family aliases, OAuth helper names, generated telemetry types, hosted remote flows, and filename/import boundaries.
- [x] Rename or wrap CodeAgent-owned telemetry/user-agent identifiers that still used inherited upstream names.
- [ ] Disable or rehome legacy hosted remote-session flows; keep the local Automation Remote Control path as the CodeAgent-supported remote feature.
- [ ] If public launch requires no inherited model-family branding, replace Opus/Sonnet/Haiku aliases, user-facing labels, migration names, and old mascot component names with CodeAgent-owned families through a dedicated model migration that preserves existing user settings.

**Policy**:
- Provider names such as OpenAI and OpenAI-compatible remain acceptable only when describing actual supported model providers.
- Do not rename third-party packages or APIs in a way that misrepresents ownership; wrap them behind CodeAgent interfaces instead.

---

### 5C iOS Companion App Distribution ✅ SIMULATOR READY, TESTFLIGHT DEFERRED
**Objective**: Package a mobile companion that can approve and monitor CodeAgent sessions running on a Mac, laptop, or server.

**Initial Scope**:
- [x] Choose native SwiftUI iOS implementation path and repo layout under `ios/CodeAgentCompanion`.
- [x] Scaffold the iOS companion app with local-network server URL, pairing code, status polling, and approval list/actions.
- [x] Reuse the existing local-network pairing and approval API model for approvals and session status.
- [x] Add local simulator build verification through `npm run verify:ios-companion`, with a preflight that reports missing simulator runtimes clearly.
- [x] Add TestFlight packaging and signing notes in `docs/ios-companion-distribution.md`.
- [x] Move companion token storage from app preferences to Keychain before TestFlight.
- [x] Add device revocation, audit visibility, and least-privilege remote actions to the mobile UI.
- [x] Add iOS privacy manifest and export-compliance metadata for the current local-network-only companion scope.
- [x] Add Makefile simulator install/launch tasks for the iOS companion.
- [x] Add active-view polling for iOS pending approvals and remote desktop approval-dialog dismissal.
- [x] Add repeatable local remote-control smoke verification for pairing, approval resolution, trusted-device revocation, and revoked-token rejection.
- Deferred: keep off-network access disabled until relay identity, encryption, and token rotation are implemented.

**Success Criteria**:
- [x] iOS app can pair with a local desktop/server session over the local network in a manual device/simulator smoke test.
- [x] iOS app has native approval/rejection UI backed by the existing narrow approval API surface.
- [x] iOS app can list trusted devices, show recent audit events, and revoke devices through a narrow authenticated device API.
- [x] Local remote-control pairing, approval resolution, and device revocation are covered by a repeatable smoke verifier.
- [x] iOS packaging path is documented for local debug builds and TestFlight.
- [x] iOS simulator build path is covered by `npm run verify:ios-companion`; local success requires an installed iOS Simulator runtime.
- [x] iOS privacy manifest is packaged with app-scoped UserDefaults reason metadata and no tracking declaration for the current local-only scope.
- [x] Push notification requirements are documented before any production relay claim.

**Progress Update (July 1, 2026)**:
- [x] Added `ios/CodeAgentCompanion` SwiftUI app scaffold and shared Xcode scheme.
- [x] Added `scripts/verify-ios-companion.mjs` and `verify:ios-companion` npm script.
- [x] Verified the iOS companion builds against the iOS Simulator SDK with code signing disabled.
- [x] Updated the verifier to keep iOS build outputs under `dist-build/ios`, remove intermediate Xcode output, and fail with a clear runtime-install message when no simulator runtime exists.
- [x] Added `docs/ios-companion-distribution.md` with local build, TestFlight, and remote-control scope notes.
- [x] Added Keychain-backed token storage plus native trusted-device revocation and audit views.
- [x] Added `PrivacyInfo.xcprivacy`, wired it into the app resources build phase, declared app-scoped UserDefaults usage, and added a verifier guard so TestFlight metadata stays packageable.
- [x] Verified local simulator pairing and command approval/rejection flow manually, including iOS approval polling and automatic desktop approval-dialog dismissal.
- [x] Added `make ios`, `make ios-build`, `make ios-install`, `make ios-launch`, and `make ios-reset` for the simulator companion workflow.
- [x] Added `npm run verify:remote-control-smoke` for the local mobile API path and wired it into `npm run verify:phase5`.

---

### 5D Relay And Remote-Control Distribution ✅ LOCAL SCOPE PACKAGED, OFF-NETWORK RELAY DEFERRED
**Objective**: Define and package the secure relay path for controlling sessions that run away from the phone's local network.

**Initial Scope**:
- [x] Select managed relay broker as the only acceptable off-network ownership model; public tunnels to the local HTTP server are out of scope.
- [x] Document package boundaries for desktop, CLI/server, iOS companion, and future managed relay.
- [x] Add `verify:remote-control-scope` release-scope verifier for narrow local route families and relay security documentation.
- Deferred: implement authenticated relay identity, device binding, token rotation, and audit event propagation.
- Deferred: add end-to-end encryption requirements for relayed approval/status traffic.
- Deferred: add rate limits, replay protection, and emergency device/session revocation.
- [x] Package relay configuration for desktop, CLI/server, and iOS companion clients.

**Success Criteria**:
- [ ] Remote control works off-network without exposing the local HTTP server directly.
- [ ] Relay traffic is scoped to approval/status/control operations, not arbitrary shell access.
- [ ] Relay setup and teardown are visible in desktop, CLI/server logs, and mobile audit views.
- [ ] Security validation is complete before public release notes mention off-network remote control.

**Progress Update (July 1, 2026)**:
- [x] Added `docs/relay-control-distribution.md` with local-only first release scope, managed relay package boundaries, and off-network release gates.
- [x] Added `scripts/verify-remote-control-scope.mjs` and `verify:remote-control-scope` to guard against broad remote-control route families and missing relay security constraints.
- [x] Added inert managed-relay enrollment metadata across the shared automation store, CLI/server commands, desktop Automation view, and iOS companion status model. Relay configuration now packages broker/account/device/key/audit metadata without starting a public tunnel or exposing new local API routes.

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
- **Phase 4** (Service Refactoring): 100% ✅ COMPLETE - LLM provider abstraction, provider-scoped keychain storage, main/renderer state sync, terminal-decoupled service paths, CLI local-provider support, and desktop CLI-parity foundation complete
- **Phase 4.5** (Local-First Desktop Agent UX): 100% ✅ COMPLETE - roadmap documented, utility tools, guarded Bash, permission policies, command runner, git/dev helpers, tool activity timeline, safe file-write review, applied-change actions, checkpoint undo, assistant-console shell polish, global parent/child sidebar navigation, collapsible nav rail, sectioned Settings, slash-command palette, footer status panes, stdio MCP execution, registry clarity, persisted sessions, transcript search, workspace file browser, Open/Reveal actions, tool-router controls, and common error-state guidance complete
- **Phase 4.6** (Extensibility, Automation, Remote Control, Virtual Teams): 99% 🚧 HARDENED LOCAL MVP - shared automation store, skill discovery/toggles, scheduled-task execution/history/retry/missed-run policies, desktop notification delivery, local mobile remote control, shared approval queue, device revocation/audit, remote endpoint rate limits, virtual-team runs/artifacts/transcripts, editable team blueprints, seeded/scoped team workspaces, full-access/supervised team permissions, bounded iterations, QA/reviewer sign-off gates, structured run milestones, duplicate-run guards, Automation permission controls, CLI automation commands, and read-only model visibility are in place; relay mode, remote push notifications, relay-grade token hardening, and richer project completion policy remain
- **Phase 4.7** (Shareable Storage and Sync Foundation): 85% 🚧 LOCAL MVP COMPLETE - automation state is split into project-shareable `.code-agent` files plus ignored local remote-control state, legacy automation storage migrates forward, local history IPC/service APIs are in place, desktop chats/tool/automation events mirror into local history, History UI supports browse/export/delete/chat restore, project-shareable automation bundles can be exported/imported, and storage ownership boundaries are documented; SQLite/cloud backend, conflict handling, and encryption/sync security remain
- **Phase 5** (Packaging): 100% ✅ LOCAL SCOPE COMPLETE - CLI tarball, macOS desktop app packaging, iOS simulator companion, release notes/checklist artifacts, release workflow wiring, desktop package verification, Phase 5 package-set verification, remote-control smoke verification, and relay-scope documentation are complete for local distribution readiness. Public npm publication, Developer ID signing/notarization, signed-release updater validation, TestFlight/App Store distribution, and off-network relay are deferred until the required external accounts, credentials, and relay security implementation exist.
- **Phase 6** (Testing): 0% - Not Started
- **Phase 7** (Documentation): 0% - Not Started

### Timeline
- **Target Completion**: 3-4 weeks from start
- **Current Date**: July 1, 2026
- **Target Launch**: ~July 21, 2026 for packaged desktop baseline; automation/team features may extend beyond the initial package if not complete
- **Phase 1 Completed**: June 23, 2026 (Day 1) ✅
- **Latest Update**: July 2, 2026 - closed Phase 5 for the current local packaging scope: CLI, desktop, iOS simulator companion, release notes/checklist artifacts, local remote-control verification, and relay-scope packaging are in place. Public npm publication, Developer ID signing/notarization, TestFlight/App Store distribution, signed-release updater validation, and off-network relay are deferred until the required external accounts, credentials, and relay security work are available.
- **Next Focus**: start Phase 6 local testing and polish while continuing non-blocking compatibility cleanup behind CodeAgent-owned aliases.

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
| Remote-control security mistakes | Medium | Unauthorized access | Pairing, device revocation, audit logs, least-privilege APIs, and no arbitrary remote shell |
| Autonomous team runaway work | Medium | Unwanted file/command changes | Supervisor checkpoints, permission gates, bounded iterations, and human approval policies |
| Scheduled tasks surprise users | Medium | Unwanted background actions | Disabled-by-default risky tools, visible run history, pause/resume, and notification controls |

---

## Success Criteria (Overall)

- ✅ Standalone desktop app shell (no terminal required for core UI)
- 🚧 CLI feature parity: local provider setup, chat, status/help commands, settings, bridge tools, local permission workflow, and MCP stdio execution are in place; full CLI resume/fork semantics and terminal-only registry parity remain follow-up work
- ✅ Local-first desktop agent UX: LM Studio chat, bridge tool calls, safe file write review, guarded Bash, web/finance/time tools, stdio MCP execution, session persistence, workspace browser, command runner, and applied-change review are in place
- 🚧 Automation foundation: shared skill/task/remote/team store, scheduler runtime, retry/missed-run policy state, desktop notifications, local mobile remote control, rate limits, device revocation/audit, sectioned desktop Automation workbench, unattended permission controls, CLI automation commands, virtual-team run artifacts/transcripts/milestones, scoped team workspaces, bounded team iterations, QA/reviewer gates, and read-only automation tools are in place; relay, remote push notifications, packaging, and advanced project-completion governance remain follow-up work
- 🚧 Shareable storage foundation: project-shareable `.code-agent` files, local-only remote-control state, local history records, History UI, automation import/export, and storage ownership docs are in place; SQLite/cloud sync, encryption, and conflict resolution remain follow-up work
- ⏳ Cross-platform packages (Windows, macOS, Linux)
- ⏳ Auto-update working
- ⏳ < 3 second startup time
- ⏳ Installer size measured and reasonable
- ⏳ Code-signed and notarized
- ⏳ Good user documentation
- ⏳ Developer documentation for extensions

---

## Notes

- This plan assumes incremental development with regular testing
- Each phase builds on previous one
- Parallel work possible (e.g., UI design while IPC is being built)
- Rollback strategy: git tags at end of each phase
- CI/CD essential for catching breakage early
