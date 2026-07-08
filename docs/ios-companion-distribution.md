# iOS Companion Distribution

Phase 5C uses a native SwiftUI app under `ios/CodeAgentCompanion`.

## Local Build

```bash
npm run verify:ios-companion
```

The local verifier builds `CodeAgentCompanion.xcodeproj` for the iOS Simulator with code signing disabled and writes the simulator app to `dist-build/ios/build/Debug-iphonesimulator/CodeAgentCompanion.app`.

This requires an installed iOS Simulator runtime in Xcode. Install one from Xcode > Settings > Components before running the verifier on a new machine.

The verifier removes Xcode intermediates from `dist-build/ios` and keeps only the simulator app artifact.

To build, install, and launch the simulator app in one step:

```bash
make ios
```

The Makefile also exposes `make ios-build`, `make ios-install`, `make ios-launch`, and `make ios-reset`. Set `IOS_DEVICE="iPhone 17 Pro"` or another installed simulator name to override the default boot target.

## Privacy And Export Metadata

The iOS target includes `PrivacyInfo.xcprivacy` in the app resources. The current local-network companion scope declares:

- `NSPrivacyAccessedAPICategoryUserDefaults` with reason `CA92.1` for app-scoped local settings such as the desktop/server URL and device name.
- No tracking domains.
- No data collected by CodeAgent for the current local-only companion scope.

The token received from the paired desktop/server session is stored in Keychain. Unsigned simulator builds may fall back to app-scoped `UserDefaults` when Keychain entitlements are unavailable; device and TestFlight builds should use Keychain. The app also sets `ITSAppUsesNonExemptEncryption` to `false` for the current build because it only uses platform-standard networking and does not ship custom encryption. Revisit both the privacy manifest and export-compliance answer before enabling managed relay, push notifications, telemetry, or custom end-to-end encryption.

## TestFlight Path

- Set the final bundle identifier in the Xcode project.
- Configure an Apple development team and App Store Connect app record.
- Add production app icons.
- Archive with Xcode or `xcodebuild archive` using a distribution certificate and provisioning profile.
- Upload the archive to App Store Connect and distribute through TestFlight.
- Confirm the App Store privacy nutrition labels still match `PrivacyInfo.xcprivacy`.

## Remote-Control Scope

- Local-network pairing uses the existing desktop `/api/pair` endpoint.
- The simulator default server URL is `http://127.0.0.1:32888`, matching the desktop remote-control server's default port.
- Approval polling uses `/api/status` and `/api/approvals`; the iOS companion refreshes every 3 seconds while the main view is active.
- Approval decisions use `POST /api/approvals/:id`.
- Approval decisions made from iOS dismiss the matching desktop approval dialog through the shared approval-resolution event.
- Trusted-device and audit views use `/api/devices`.
- Device revocation uses `DELETE /api/devices/:id`.
- Off-network relay control and push notifications are not part of the first iOS package.
- Managed relay enrollment metadata is displayed read-only when provided by the paired desktop/server session.

## Local Smoke Checklist

1. Start the packaged desktop app and enable Automation > Remote Control.
2. Run `make ios` to build, install, and launch the simulator companion.
3. Pair the simulator with the desktop pairing code.
4. In the desktop command runner, request a safe command such as `pwd`.
5. Confirm the pending approval appears on iOS without manual refresh.
6. Approve from iOS and confirm the desktop approval dialog closes automatically and the command continues.
7. Repeat with Reject and confirm the desktop command is rejected.
8. Revoke the simulator device from the trusted-device list and confirm the iOS app requires pairing again.

The July 2026 local simulator smoke covered pairing, command approval, remote desktop dialog dismissal, automatic approval polling, and simulator reinstall/launch through `make ios`.

The local API revocation path is also covered by `npm run verify:remote-control-smoke`, which pairs a simulated mobile client, resolves a command approval, revokes the device, and verifies the revoked token is rejected.

## Push Notification Requirements

Push notifications are intentionally not part of the first local-network companion package. Before production push delivery is claimed, the project needs:

- A platform notification provider setup for iOS, including APNs environment, device-token registration, token refresh, and token revocation.
- A managed relay or broker that can route push wakeups without exposing the local desktop HTTP server.
- Device-bound identity so notifications cannot be replayed to a different device.
- End-to-end encrypted or opaque approval payloads; push messages should not contain local secrets, provider keys, shell commands, or file contents.
- Audit correlation between local desktop events, relay delivery attempts, and mobile approval decisions.
- Abuse-case testing for notification spam, stale approvals, revoked devices, offline desktops, and expired pairing tokens.

Before off-network control is shipped, the relay track must provide per-device identity, encrypted approval payloads, token rotation, replay protection, audit propagation, and emergency revocation.
