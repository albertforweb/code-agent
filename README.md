# CodeAgent

CodeAgent is a local-first software engineering agent. It provides a terminal CLI and an Electron desktop app for working inside project workspaces with an OpenAI-compatible LLM backend.

The project is no longer a provider-branded SDK wrapper. Model calls go through CodeAgent's own LLM adapter layer, with OpenAI and OpenAI-compatible HTTP APIs as the supported runtime path.

## What CodeAgent Does

- Runs as a CLI through `code-agent` or directly through `dist/entrypoints/cli.js`
- Runs as a desktop workbench through Electron and React
- Connects to OpenAI or any OpenAI-compatible `/chat/completions` API
- Reads, writes, edits, searches, and reasons over workspace files
- Executes shell commands behind permission and sandbox policy
- Supports MCP servers, MCP tools, and MCP resource access
- Maintains local session history, project context, settings, and resumable work
- Supports skills, hooks, scheduled tasks, background work, remote control, and team-style workflows
- Stores project-shareable automation state under `.code-agent`
- Resolves shell features through shared feature-package manifests so desktop, CLI, and mobile can present the same purchased capabilities differently

## Model Provider Setup

For a local or hosted OpenAI-compatible server:

```bash
export CODE_AGENT_LLM_PROVIDER=openai-compatible
export CODE_AGENT_BASE_URL=http://127.0.0.1:1234/v1
export CODE_AGENT_MODEL=<loaded-model-id>
export CODE_AGENT_API_KEY=local
```

For OpenAI:

```bash
export CODE_AGENT_LLM_PROVIDER=openai
export OPENAI_API_KEY=<key>
export CODE_AGENT_MODEL=gpt-4o-mini
```

Useful optional controls:

```bash
export CODE_AGENT_CONTEXT_TOKENS=8192
export CODE_AGENT_MAX_OUTPUT_TOKENS=2048
export CODE_AGENT_ENABLE_TOOLS=1
export CODE_AGENT_DISABLE_TOOLS=1
```

You can also pass provider settings at runtime:

```bash
code-agent --llm-provider openai-compatible --base-url http://127.0.0.1:1234/v1 --model <loaded-model-id>
```

## Local Configuration

User-level CLI settings live in `~/.code-agent/config.json`. CodeAgent automatically copies legacy `~/.code-agent.json` or `~/.codeAgent.json` into that location on first read, then writes future changes to the new folder.

## Quick Start

Install dependencies:

```bash
npm install
```

Build the CLI:

```bash
npm run build
```

Run the CLI from the build output:

```bash
node dist/entrypoints/cli.js
```

Run the desktop app in development:

```bash
npm run dev:electron
```

Create a packaged app directory:

```bash
npm run pack
```

## Desktop App

The desktop app is a local workbench for:

- Chat sessions
- Project navigation
- Tool execution
- Automation setup
- Session history
- Settings and model configuration
- MCP server management
- Account, subscription, package catalog, local credit-card package checkout, and package install state

The desktop app starts in guest/free mode. Settings -> Account handles local sign-in/sign-out state, and Settings -> Packages shows entitlement state, runtime install state, distribution mode, package availability, and purchase/install actions. Local history, credentials, card summaries, purchase receipts, install records, and pairing state stay on the machine unless a feature explicitly sends data to a configured service.

Paid feature packages live outside this core repo and are projected into the app catalog from package-owned manifests:

```bash
npm run build:feature-packages
npm run generate:feature-package-catalog
npm run verify:feature-package-boundaries
```

The default local repo layout is:

- `../code-agent-sdk`
- `../code-agent-packages`
- `../code-agent`

The current software-developer package artifact is written to `../code-agent-packages/dist-feature-packages/codeagent.package.software-developer-1.0.0.tgz` and contains the package manifest plus SDK runtime stub. The strict package-boundary verifier is still expected to fail until Project Studio, Automation, developer tools, MCP paid surfaces, developer history, and developer settings are extracted from the core renderer and CLI implementation.

## CLI

The CLI is designed for both interactive and scripted workflows:

```bash
code-agent
code-agent -p "summarize this repository"
code-agent --bare -p "inspect the changed files"
```

`--bare` is the minimal execution mode. It skips hooks, LSP, plugin sync, background prefetches, automatic memory discovery, and keychain reads. Use it for controlled automation where all context is passed explicitly.

Project Studio records are also available from the CLI and use the same local desktop state store:

```bash
code-agent project list
code-agent project create --name "New app" --mode guided --idea "..."
code-agent project start <project-id>
code-agent project deliverables <project-id>
code-agent project role list
code-agent project employee list
code-agent project team list
```

Automation and remote-control management are available under `code-agent automation`, including scheduled tasks, skill policies, remote pairing state, relay metadata, virtual teams, and automation import/export.

Feature package availability can be inspected from the CLI:

```bash
code-agent features
code-agent features list
code-agent features packages
```

By default the CLI also resolves as guest/free. Paid package commands require entitlement plus runtime availability, such as `CODEAGENT_FEATURE_PACKAGES=software-developer` and `CODEAGENT_INSTALLED_FEATURE_PACKAGES=software-developer`, a full `CODEAGENT_FEATURE_PROFILE_JSON`, an enterprise package override, a trial package, or the explicit local developer override environment variable.

## Workspace State

CodeAgent uses these project-level conventions:

- `.code-agent/` for project-shareable automation data
- `AGENTS.md` for workspace instructions
- `SKILL.md` for project-specific agent guidance
- Settings JSON files for user, project, local, and managed configuration scopes

Private local state, credentials, and session records are stored under the user's CodeAgent config home.

## Architecture

The runtime is split into these main layers:

- `services/api/` - LLM adapter, streaming, retry, usage, and API error handling
- `services/mcp/` - MCP client, auth, transport, discovery, and connection lifecycle
- `tools/` - file, shell, web, MCP, task, and workflow tools
- `components/` - Ink CLI UI and React desktop UI pieces
- `electron/` - desktop shell, bridges, and app packaging support
- `src/features/` - generated feature-package catalog metadata, extension resolution, and entitlement resolution
- `utils/` - workspace context, permissions, settings, memory files, telemetry, and model utilities

Provider-specific behavior is isolated behind adapters and configuration. The model API path does not require provider-specific SDK packages.

See `docs/feature-packages.md` for the shell-independent feature package model and the sibling SDK/package repos.

## Development Commands

```bash
npm run build
npm run build:electron
npm run build:electron:prod
npm run generate:brand-assets
npm run pack
```

`npm run build` emits the CLI into `dist/`. `npm run pack` builds the Electron app into `dist-build/`.

The build currently tolerates the repo's existing TypeScript diagnostics in the CLI path and still emits runnable JavaScript. Electron packaging runs its own TypeScript projects before building the renderer.

## Current Status

CodeAgent is usable with local and hosted OpenAI-compatible backends. The active cleanup state has removed provider-branded model SDK dependencies and visible provider-brand footprints from the current working tree and packaged app output.

Remaining engineering work is normal product hardening: provider compatibility testing, installer validation, cross-platform packaging, and continued cleanup of legacy internal assumptions.
