# Code Agent Storage Ownership

Code Agent is local-first. State is split by ownership so project data can be shared without leaking private credentials, device tokens, or local machine history.

## Shareable Workspace State

Stored under the active workspace in `.code-agent/`:

- `project.json`: workspace automation manifest and storage version.
- `skill-policies.json`: enabled/trusted policy for discovered workspace skills.
- `tasks/*.json`: scheduled task definitions, retry policy, and notification policy.
- `teams/*.json`: virtual team blueprints, members, permissions, workspace path, and governance limits.
- `runs/tasks/*.json`: task run history that may be exported with project bundles.
- `runs/teams/*.json`: virtual team run records and transcripts.
- `team-blueprint.md` and `team-runs/*.md`: generated artifacts in virtual team workspaces.

This state can be committed or exported when it is intentionally part of a project. Project bundle export/import uses this layer and excludes local-only state.

## Local Workspace State

Stored under `.code-agent/local/` and ignored by `.code-agent/.gitignore`:

- `remote-control.json`: remote-control enablement, pairing state, approved device metadata, token hashes, pending approvals, and audit log.

This state is machine-private. It should not be committed, exported, or synced without encryption and explicit user consent.

## User Profile State

Stored in Electron user data:

- App configuration and UI state through `electron-store`.
- Local history records under the user data `history/` directory.

History includes chats, tool events, automation runs, and project events. It is local evidence and can be exported from the History workbench, but it is not part of a workspace bundle by default.

## Secrets

Provider API keys and tokens are owned by the OS keychain when available. They must not be copied into `.code-agent`, history records, project exports, or cloud sync payloads.

## Future Sync Rules

The planned sync backend should treat these layers separately:

- Sync shareable workspace state with normal merge/conflict handling.
- Sync local history only when the user explicitly enables profile sync.
- Sync remote-control/device state only through encrypted, per-device records.
- Never sync provider credentials through the project bundle path.
