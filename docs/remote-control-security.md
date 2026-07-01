# Remote Control Security Notes

Code Agent remote control currently supports a local-network server for paired devices. It is intended for phones or tablets on the same trusted network as the workstation.

## Current Local-Network Controls

- Pairing requires a short-lived code created from the desktop app.
- Paired devices receive a random bearer token; only a hash is stored on disk.
- Pairing/device state is stored in `.code-agent/local/remote-control.json`, which is ignored by `.code-agent/.gitignore`.
- Renderer/API responses sanitize token hashes and pairing token hashes.
- Devices can be revoked from the Automation workbench.
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

## Push Notification Requirements

True remote push notifications require a platform notification provider or relay service. Until that exists, the local remote page can poll for approvals and status, and desktop notifications can be emitted locally.

The project should not claim off-network remote control or phone push delivery until relay identity, encryption, token rotation, and audit behavior are implemented.
