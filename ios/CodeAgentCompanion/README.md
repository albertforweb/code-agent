# CodeAgent iOS Companion

This is the Phase 5C native iOS companion scaffold. It targets the existing local-network remote-control API exposed by the desktop app.

## Local Simulator Build

```bash
npm run verify:ios-companion
```

For the normal local simulator workflow:

```bash
make ios
```

This builds, installs, and launches the companion app. Use `make ios-reset` to remove the simulator app and clear local simulator state.

The verifier builds the app for the iOS Simulator with signing disabled. Device and TestFlight builds require an Apple development team, bundle identifier ownership, signing certificates, and App Store Connect setup.

The target includes `PrivacyInfo.xcprivacy` in app resources. It declares app-scoped UserDefaults usage for local companion settings, including the unsigned-simulator token fallback used only when Keychain entitlements are unavailable, and no tracking or collected data for the current local-network-only scope.

## Current Scope

- Pair with a local CodeAgent desktop/server session using `/api/pair`.
- Default to `http://127.0.0.1:32888`, matching the desktop remote-control server's default port.
- Store the local bearer token in the iOS Keychain.
- Poll `/api/status`, `/api/approvals`, and `/api/devices`; the main view refreshes every 3 seconds while active.
- Approve or reject pending approval requests.
- Dismiss the matching desktop approval dialog after an iOS approval or rejection.
- View trusted devices and recent remote-control audit events.
- Revoke trusted devices through the narrow local-network device API.

Off-network relay control and push notifications remain disabled until relay identity, encryption, token rotation, audit propagation, and emergency revocation are implemented.
