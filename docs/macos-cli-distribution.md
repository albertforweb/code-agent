# macOS CLI Distribution

Phase 5A packages the terminal `code-agent` command separately from the Electron desktop app.

## Package Shape

- Package name: `code-agent`
- Binary: `code-agent` -> `dist/entrypoints/cli.js`
- Build payload: compiled `dist/**` output only, plus README and this distribution note
- Runtime shims: CodeAgent-owned files under `dist/runtime/**`
- Excluded from the npm CLI package: Electron renderer assets, desktop build output, generated installers, local state, and `node_modules`

The root package still contains Electron metadata for desktop development and electron-builder. The npm CLI package is validated by file-list checks so desktop artifacts do not become part of the CLI tarball.

## Channel Decision

The first CLI distribution channel is npm only. Homebrew formula automation is deferred until npm distribution is proven and there is clear user demand for a tap.

## Local Build And Verification

```bash
npm run pack:cli:check
```

This runs the CLI build, creates an npm tarball in a temporary directory, checks the package file list, runs a fast `code-agent --version` smoke from `dist`, scans the tarball payload for removed legacy provider terms, installs the tarball into an isolated npm prefix, and verifies the installed `code-agent --version` and `code-agent --help` paths. The temporary tarball is deleted after verification.

To create a local tarball for manual install:

```bash
npm run pack:cli
npm install -g ./dist-build/cli/code-agent-1.0.0.tgz
code-agent --version
code-agent --help
```

`npm run pack:cli` writes `dist-build/cli/code-agent-<version>.tgz`. `dist-build/` is the shared local artifact root for CLI, desktop, and iOS outputs.

To verify the whole local Phase 5 package set after the CLI and desktop outputs exist:

```bash
npm run verify:phase5
```

To rebuild the CLI tarball and local macOS desktop app before verification:

```bash
npm run pack:phase5
```

For a project-local install instead of a global install:

```bash
npm install ./dist-build/cli/code-agent-1.0.0.tgz
npm exec code-agent -- --version
npm exec code-agent -- --help
```

When working inside this repository, the dev scripts also expose the built CLI:

```bash
npm run code-agent -- --version
npm run codeagent -- --help
```

## macOS Release Checklist

- Verify `npm run pack:cli:check` passes on Apple Silicon and Intel macOS.
- Install the tarball globally in a clean macOS user profile and run `code-agent --version`, `code-agent --help`, and a local OpenAI-compatible smoke request.
- Publish the first public CLI release through npm.
- Keep the GitHub release workflow's CLI tarball artifact passing while npm publication remains manual.
- Defer Homebrew until npm distribution is validated with real users.
- Keep desktop signing and notarization on the Electron release track; npm CLI distribution does not use the `.app` notarization flow.

## Follow-Up

- Split desktop-only runtime dependencies out of the CLI install path if package install size becomes a blocker.
- Run the isolated global-install smoke in CI after the package versioning and registry target are final.
- Revisit Homebrew formula automation after npm distribution has clear demand.
