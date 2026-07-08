# Relay And Remote-Control Distribution

Phase 5D packages the remote-control story without exposing the local HTTP server as a public service.

## Distribution Decision

The first public release supports local-network remote control only. Off-network control must use a managed relay broker with per-device identity, encrypted approval payloads, token rotation, replay protection, audit propagation, rate limits, and emergency revocation.

The relay must broker a narrow command protocol:

- Session status
- Pending approval list
- Approval or rejection decision
- Scheduled task trigger
- Virtual team trigger
- Device revocation and audit synchronization

The relay must not expose arbitrary shell, filesystem, terminal, or generic command execution endpoints.

## Package Boundaries

- Desktop: owns local pairing, local audit state, device revocation, and the local-network HTTP server.
- CLI/server: may host a session that the desktop or mobile app can monitor through the same narrow approval/status surface.
- iOS companion: consumes local-network endpoints first; relay mode stays unavailable until the managed broker exists.
- Managed relay: future service/package that brokers authenticated approval/status traffic without tunneling the local server.

## Packaged Relay Configuration

Relay enrollment metadata is packageable but inert in this release:

- Shared state includes a `relay` object with broker URL, account ID, device ID, key identifiers, audit cursor, enrollment timestamps, and token-rotation timestamp.
- `code-agent automation remote relay status` prints the current relay enrollment metadata.
- `code-agent automation remote relay configure --broker-url https://...` stores HTTPS managed-relay metadata without starting any relay connection.
- `code-agent automation remote relay disable` marks relay enrollment disabled and records an audit event.
- The desktop Automation > Remote Control view and the iOS companion display relay status as read-only configuration.

No relay HTTP route is exposed by the local server, and configuring relay metadata does not publish local shell, filesystem, terminal, or generic command execution.

## Release Gate

```bash
npm run verify:remote-control-scope
npm run verify:remote-control-smoke
```

The scope verifier checks that the local remote-control API still exposes only the expected narrow route families and that relay distribution docs keep the required security constraints visible. The smoke verifier starts the local remote-control server in a temporary workspace, pairs a simulated mobile client, approves a pending command action, revokes the trusted device, and confirms the revoked token can no longer use authenticated endpoints.

## Remaining Work Before Off-Network Release

- Select the managed relay deployment target.
- Implement device-bound relay identity and token rotation.
- Encrypt approval payloads end to end or prove the broker cannot read provider credentials or local secrets.
- Add replay protection, rate limits, audit propagation, and emergency revocation.
- Implement actual desktop, CLI/server, and iOS relay enrollment/teardown against the managed broker.
- Run abuse-case testing before public release notes mention off-network remote control.
