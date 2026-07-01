# CodeAgent

CodeAgent is a local-first software engineering agent. It provides a terminal CLI and an Electron desktop app for working inside project workspaces with an OpenAI-compatible LLM backend.

The project is no longer a provider-branded SDK wrapper. Model calls go through CodeAgent's own LLM adapter layer, with OpenAI and OpenAI-compatible HTTP APIs as the supported runtime path.

## What CodeAgent Does

- Runs as a CLI through `code-agent` or directly through `dist/entrypoints/cli.js`
- Runs as a desktop workbench through Electron and React
- Connects to OpenAI, LM Studio, or any compatible `/chat/completions` API
- Reads, writes, edits, searches, and reasons over workspace files
- Executes shell commands behind permission and sandbox policy
- Supports MCP servers, MCP tools, and MCP resource access
- Maintains local session history, project context, settings, and resumable work
- Supports skills, hooks, scheduled tasks, background work, remote control, and team-style workflows
- Stores project-shareable automation state under `.code-agent`

## Model Provider Setup

For LM Studio or another local compatible server:

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

Local history, credentials, and pairing state stay on the machine unless a feature explicitly sends data to a configured service.

## CLI

The CLI is designed for both interactive and scripted workflows:

```bash
code-agent
code-agent -p "summarize this repository"
code-agent --bare -p "inspect the changed files"
```

`--bare` is the minimal execution mode. It skips hooks, LSP, plugin sync, background prefetches, automatic memory discovery, and keychain reads. Use it for controlled automation where all context is passed explicitly.

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
- `utils/` - workspace context, permissions, settings, memory files, telemetry, and model utilities

Provider-specific behavior is isolated behind adapters and configuration. The model API path does not require provider-specific SDK packages.

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
