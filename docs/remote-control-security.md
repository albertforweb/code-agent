# Remote Control Security Notes

CodeAgent remote control currently supports a local-network server for paired devices. It is intended for phones or tablets on the same trusted network as the workstation.

## Current Local-Network Controls

- Pairing requires a short-lived code created from the desktop app.
- Paired devices receive a random bearer token; only a hash is stored on disk.
- Pairing/device state is stored in `.code-agent/local/remote-control.json`, which is ignored by `.code-agent/.gitignore`.
- Renderer/API responses sanitize token hashes and pairing token hashes.
- Devices can be revoked from the Automation workbench.
- Paired devices can list and revoke trusted devices through the narrow authenticated local-network device API.
- Remote approvals are recorded in the audit log.
- The HTTP endpoint rate-limits anonymous pairing requests and authenticated API requests.
- Remote APIs are deliberately narrow: status, approvals, task runs, and team runs. There is no arbitrary remote shell endpoint.

## Relay Mode Requirements

Relay mode should not be implemented as a simple public tunnel to the local HTTP server. A safe relay needs:

- Per-user account identity.
- Per-device identity and revocation.
- End-to-end encrypted approval/action payloads or a broker that never sees provider credentials.
- Token rotation and replay protection.
- Separate rate limits for pairing, polling, approval submission, and run triggers.
- Server-side audit metadata that can be reconciled with local audit events.
- A narrow command protocol matching the current local API surface.

The repository now packages relay enrollment metadata for desktop, CLI/server, and iOS clients, but that metadata is inert until a managed broker exists. Configuring relay metadata must not start a public tunnel or expose additional local API routes.

## Push Notification Requirements

True remote push notifications require a platform notification provider or relay service. Until that exists, the local remote page can poll for approvals and status, and desktop notifications can be emitted locally.

The local iOS companion currently polls while active. A production push implementation must add APNs device-token registration, token refresh/revocation, relay-side wakeup routing, stale-approval handling, and audit correlation. Push payloads must not include local secrets, provider keys, shell commands, or file contents.

The project should not claim off-network remote control or phone push delivery until relay identity, encryption, token rotation, and audit behavior are implemented.
