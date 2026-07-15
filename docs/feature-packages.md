# Feature Package Framework

CodeAgent treats desktop, CLI, and mobile as shells over shared feature packages. A shell decides how to present a feature, but the feature id, capability ids, entitlement state, install state, service requirements, storage namespaces, tools, permissions, and history event types live in a common manifest.

## Packages

- `base`: free package for general chat plus the account, provider, and settings flows needed to use chat.
- `software-developer`: paid package for coding and software-project workflows, including Project Studio, developer tools, MCP, automation, local history, and developer settings.

Future domain packages should add package manifests and SDK runtime entrypoints instead of forking shell-specific code. A package can register desktop routes, CLI commands, mobile views, tools, automation templates, settings sections, status panes, Electron menu entries, and storage namespaces.

Packages have two separate gates:

- Entitlement: whether the account owns, trials, or is otherwise allowed to use the product.
- Installation: whether the runtime package is bundled, installed, updateable, or still missing.

The resolver exposes features only when both the entitlement and runtime installation are usable. This prevents the UI from treating "paid" and "installed" as the same state.

## SDK And Runtime

The code is split into three local repos under `/Users/hongwel2/mygit`:

- `code-agent`: base app shell, entitlement resolver, installer, generated catalog projection, and shell hosts.
- `code-agent-sdk`: SDK contracts package developers compile against.
- `code-agent-packages`: package-owned manifests, runtime entrypoints, package source, and artifact builds.

Core package resolution lives in `code-agent/src/features/feature-packages.ts`. The core app's local development package catalog projection is generated into `code-agent/src/features/package-catalog/generated.ts` from manifests under `code-agent-packages/<package-id>/`.

It exposes:

- `FEATURE_PACKAGE_MANIFESTS`: local fallback package manifests.
- `resolveFeaturePackages(shell, profile, manifests?)`: resolves package and feature availability for `desktop`, `cli`, or `mobile`; desktop can pass the platform catalog fetched from `/code-agent/catalog`.
- `isFeatureAvailable(resolution, featureId)`: checks a shell-visible feature.
- `getFeaturePackageExtensions(resolution, point?)`: returns active extension registrations contributed by entitled and installed packages.
- `isPackageRuntimeAvailable(installState)`: checks whether a package runtime is usable after entitlement resolution.
- `getFeaturePackageSummary(resolution)`: formats a human-readable package summary.

The SDK defines the package manifest contract, runtime activation contract, and extension points such as:

- `desktop.primary-nav`
- `desktop.child-route`
- `desktop.main-view`
- `desktop.right-panel`
- `desktop.status-bar`
- `desktop.slash-command`
- `electron.menu`
- `cli.command`
- `mobile.view`
- `settings.section`

## Entitlement Profile

The initial local profile shape is a guest/free account:

```json
{
  "accountStatus": "guest",
  "displayName": "Guest",
  "accountTier": "free",
  "subscriptionStatus": "free",
  "purchasedPackageIds": [],
  "installedPackageIds": [],
  "localDeveloperOverride": false
}
```

Desktop stores the active profile as `featureProfile` in app config and saved local account entitlements in `featureAccounts`. Settings -> Account shows guest versus signed-in state, subscription tier, purchased packages, saved card summaries, and local sign-in/sign-out controls. Settings -> Packages shows the package catalog, current entitlement state, runtime install state, product SKUs, pricing, shell support, distribution mode, protection boundary, and available package features.

Logging out switches the active profile back to guest/free but does not delete saved account entitlements. Re-login with the same account restores locally purchased packages unless the package is later marked expired, refunded, canceled, or disabled.

Desktop package purchase currently supports a local credit-card checkout flow. The renderer validates card number, expiration, CVC, and billing postal code, then stores only a card summary, purchase receipt, and package entitlement. It does not store full card numbers or CVC values. Paid packages with `installRequired` must then be installed before their shell adapters become active. A production purchase flow still needs a real account service, payment processor tokenization/charge endpoint, entitlement sync, receipt/subscription validation, and signed artifact download.

## Package Artifacts

The first separated paid package source tree is:

```text
../code-agent-packages/software-developer/
  package.json
  manifest.json
  src/runtime.ts
  README.md
```

Build package artifacts from the core repo with:

```sh
npm run build:feature-packages
```

Or build directly from the package repo with:

```sh
cd ../code-agent-packages
npm run build
```

The build writes:

```text
../code-agent-packages/dist-feature-packages/software-developer/manifest.json
../code-agent-packages/dist-feature-packages/software-developer/artifact.json
../code-agent-packages/dist-feature-packages/software-developer/build-summary.json
../code-agent-packages/dist-feature-packages/software-developer/dist/index.js
../code-agent-packages/dist-feature-packages/codeagent.package.software-developer-1.0.0.tgz
../code-agent-packages/dist-feature-packages/index.json
```

`npm run generate:feature-package-catalog` regenerates `src/features/package-catalog/generated.ts` from the external package repo. Core code should not add a package-specific TypeScript catalog file for paid packages. The default sibling repo locations can be overridden with `CODEAGENT_FEATURE_SDK_ROOT`, `CODEAGENT_FEATURE_PACKAGES_ROOT`, and `CODEAGENT_FEATURE_PACKAGE_DIST_ROOT`.

Verify it with:

```sh
npm run verify:feature-package-boundaries
```

The default verifier checks that the SDK exists, the paid package builds as a separate artifact with a runtime entrypoint, extension metadata exists, the generated catalog is present, and the core resolver no longer embeds the software-developer manifest body. The strict verifier is intentionally not passing yet:

```sh
node scripts/verify-feature-package-boundaries.mjs --strict
```

Strict mode fails while Project Studio, Automation, developer history, and other paid implementation modules still live in core source or core bundles.

## Distribution And Security Model

The current implementation now models app-store-style package states and builds `software-developer` as a separate package artifact, but it is not yet a production security boundary. `software-developer` is marked as an installable paid package, and the desktop app has a purchase -> install -> enable flow. However, the current desktop and CLI builds still contain software developer implementation modules, so a determined local user could modify client state or code to bypass the local gate.

## Platform Integration Direction

The local generated package catalog is now only a development fallback. The production architecture is:

- `agent-platform` owns accounts, login, sessions, customer/org context, billing, package catalog, purchase records, entitlement profile projection, install records, and hosted LLM/model APIs.
- `code-agent` is one client shell, alongside CLI, desktop, mobile, `agent-frontend`, and future third-party clients.
- `code-agent` should sync its active `featureProfile` from `agent-platform` instead of treating local settings as authoritative.
- `code-agent-packages` remains the source repo for package artifacts during local package development, but published package metadata and artifact availability should come from the platform catalog.
- Local package installation should remain available only for debug/developer mode when the package is built against `code-agent-sdk`.
- LLM provider settings should support both local OpenAI-compatible providers such as LM Studio and platform-hosted OpenAI-compatible APIs, with the user choosing the active provider.
- Any paid or online service must be enforced server-side by `agent-platform` or a vendor-hosted service, not by local UI state.

Current status: the extensibility model, separate SDK/package repos, platform catalog/profile/purchase/install API contract, local Docker platform seed, desktop platform login, desktop platform catalog resolution, and desktop platform-backed purchase/install scaffold are implemented. This is not yet a production app-store security boundary because paid implementation code is still present in the base app and package artifacts are not yet downloaded, hashed, signature-verified, or loaded from an installed package directory.

The first platform-side contract now exists in `agent-platform`:

- `GET /code-agent/catalog`: platform-owned package manifests.
- `GET /code-agent/profile`: CodeAgent-compatible entitlement profile derived from platform account, billing, orders, and installs.
- `POST /code-agent/packages/{package_id}/purchase`: package purchase through platform billing/checkout.
- `POST /code-agent/packages/{package_id}/install`: platform install registry for entitled packages.

Initial CodeAgent client integration now includes:

- Platform connection settings: platform base URL, workspace/org id, access token/session state, catalog source, and platform password field.
- Desktop sign-in calls `/auth/login` when a platform password is supplied.
- Desktop sign-in fetches `/code-agent/catalog`, stores the returned platform manifests as `platformFeaturePackageCatalog`, and resolves Settings -> Packages from that catalog while falling back to the generated local catalog when the platform catalog is absent.
- Desktop sign-in stores the returned `/code-agent/profile`.
- Desktop purchase creates a platform card summary and calls `/code-agent/packages/{package_id}/purchase` when a platform session exists.
- Desktop install records installation through `/code-agent/packages/{package_id}/install`.

The next CodeAgent client changes are:

- Fetch `/code-agent/profile` on app start and on explicit sync; current desktop hooks sync after login, purchase, and install.
- Add `/auth/register` and account creation UX instead of requiring pre-created platform accounts.
- Switch package install to platform entitlement check plus signed artifact download and verification. Signed artifact download and verification remain open.
- Add CLI equivalents for login, sync, catalog, purchase, install, and profile inspection.

The production app-store model requires these remaining changes:

- Ship the base app without paid package implementation code.
- Move paid desktop views, CLI command handlers, bridge-tool registrations, automation/project services, and history surfaces out of core source into `../code-agent-packages/software-developer` runtime entrypoints built on the SDK.
- Serve package manifests from a signed catalog with product SKU, version, artifact hash, signature, and compatibility metadata.
- Process purchases through a backend account and billing service that returns signed receipts and entitlements.
- Download paid package artifacts only after entitlement validation.
- Verify artifact hash and signature before installing into a package directory outside the base bundle.
- Keep a local install registry for installed version, path, receipt id, signature, and update state.
- Enforce paid remote services on the server, not in the client.
- Support revoke, refund, cancel, past-due, uninstall, and update paths.

Until paid code is extracted from the base bundle and artifacts are signature-verified, package gating should be treated as UX and workflow scaffolding only.

The CLI can override the profile with environment variables:

- `CODEAGENT_FEATURE_PROFILE_JSON`
- `CODEAGENT_ACCOUNT_STATUS`
- `CODEAGENT_ACCOUNT_TIER`
- `CODEAGENT_SUBSCRIPTION_STATUS`
- `CODEAGENT_FEATURE_PACKAGES`
- `CODEAGENT_TRIAL_FEATURE_PACKAGES`
- `CODEAGENT_EXPIRED_FEATURE_PACKAGES`
- `CODEAGENT_DISABLED_FEATURE_PACKAGES`
- `CODEAGENT_ENTERPRISE_FEATURE_PACKAGES`
- `CODEAGENT_INSTALLED_FEATURE_PACKAGES`
- `CODEAGENT_FEATURE_LOCAL_DEV_OVERRIDE`

For example, this simulates a free/base profile:

```sh
CODEAGENT_FEATURE_PROFILE_JSON='{"accountStatus":"guest","accountTier":"free","purchasedPackageIds":[],"localDeveloperOverride":false}' code-agent features
```

This simulates a signed-in paid account that purchased and installed the software developer package:

```sh
CODEAGENT_ACCOUNT_STATUS=signed-in CODEAGENT_ACCOUNT_TIER=paid CODEAGENT_FEATURE_PACKAGES=software-developer CODEAGENT_INSTALLED_FEATURE_PACKAGES=software-developer code-agent features
```

## Shell Integration

- Desktop filters primary navigation, section menus, slash-command help, and slash-command execution through the resolved feature profile. Settings -> Packages remains visible for discovery and upgrade management.
- CLI exposes `code-agent features`, `features list`, `features packages`, `features extensions`, and `features manifest`.
- CLI Project Studio and Automation command trees are now registered only when their package features are available; otherwise they return a package-lock message.
- Desktop slash-command suggestions can be contributed through active `desktop.slash-command` package extensions. Existing paid views are still hard-coded until the strict extraction step moves them into package entrypoints.

The next layer is service-level enforcement: bridge tools, project chat, local history, settings, and automation should call the same resolver before running mutating work.
