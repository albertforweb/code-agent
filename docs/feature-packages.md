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

Desktop package purchase currently supports a local credit-card checkout flow. The renderer validates card number, expiration, CVC, and billing postal code, then stores only a card summary, purchase receipt, and package entitlement. It does not store full card numbers or CVC values. Paid packages with `installRequired` must then be installed before their shell adapters become active. The platform-backed development flow now owns account, order, entitlement, profile, artifact download, and install records; production still needs payment processor tokenization/charge handling and receipt/subscription validation.

When a platform session is configured, desktop and CLI purchase/install actions use `agent-platform` as the account and entitlement authority. The local card fields are still a mock/local checkout input for development, but the resulting payment-method summary, order, profile, and install records are stored by the platform and re-synced to the client.

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

The package build signs the artifact descriptor with an Ed25519 development key and records:

- archive SHA-256
- signing key id
- signed payload SHA-256
- artifact descriptor signature
- per-file SHA-256 hashes

For local development, `agent-platform` publishes the same signed metadata in the Software Developer package catalog entry and serves the signed tarball from `/code-agent/packages/{package_id}/artifact` after entitlement validation. Production still needs managed signing keys, key rotation, revocation, and durable vendor/package artifact storage.

Verify it with:

```sh
npm run verify:feature-package-boundaries
```

The default verifier checks that the SDK exists, the paid package builds as a separate artifact with a runtime entrypoint, extension metadata exists, the generated catalog is present, and the core resolver no longer embeds the software-developer manifest body. The strict verifier is intentionally not passing yet:

```sh
node scripts/verify-feature-package-boundaries.mjs --strict
```

Strict mode fails while Project Studio, Automation, developer history, and other paid implementation modules still live in core source or core bundles.

## CLI Platform Flow

The CLI now has a platform command group:

```sh
code-agent platform register --base-url http://127.0.0.1:18080 --email user@example.com --password changeme123
code-agent platform login --base-url http://127.0.0.1:18080 --email user@example.com --password changeme123
code-agent platform sync
code-agent platform catalog
code-agent platform profile
code-agent platform purchase software-developer --card-last4 4444 --card-brand Mastercard --exp-month 12 --exp-year 2030
code-agent platform install software-developer
code-agent features packages
```

After sync, CLI feature resolution uses the platform profile/catalog cache before the generated local fallback. `code-agent platform install` downloads the signed artifact from `agent-platform` when the catalog provides an artifact URL. `--archive-path` and `CODEAGENT_FEATURE_PACKAGE_DIST_ROOT` still take precedence for explicit debug and test scenarios.

For packages marked `signed-local-bundle`, desktop and CLI install download or resolve the archive, verify its SHA-256 against the platform catalog, extract it to a temporary directory, verify the signed `artifact.json` descriptor against a trusted Ed25519 key, verify every file hash, install the package under the CodeAgent config home, persist the verified archive under `feature-package-archives`, and record the install with `agent-platform` when a platform session is active.

## Distribution And Security Model

The current implementation now models app-store-style package states and builds `software-developer` as a separate signed package artifact, but it is not yet a production security boundary. `software-developer` is marked as an installable paid package. Desktop and CLI both have platform purchase -> entitlement-gated artifact download -> signed artifact verify -> install -> enable flows. However, the current desktop and CLI builds still contain software developer implementation modules, so a determined local user could modify client state or code to bypass the local gate.

## Platform Integration Direction

The local generated package catalog is now only a development fallback. The production architecture is:

- `agent-platform` owns accounts, login, sessions, customer/org context, billing, package catalog, purchase records, entitlement profile projection, install records, and hosted LLM/model APIs.
- `code-agent` is one client shell, alongside CLI, desktop, mobile, `agent-frontend`, and future third-party clients.
- `code-agent` should sync its active `featureProfile` from `agent-platform` instead of treating local settings as authoritative.
- `code-agent-packages` remains the source repo for package artifacts during local package development, but published package metadata and artifact availability should come from the platform catalog.
- Local package installation should remain available only for debug/developer mode when the package is built against `code-agent-sdk`.
- LLM provider settings should support both local OpenAI-compatible providers such as LM Studio and platform-hosted OpenAI-compatible APIs, with the user choosing the active provider.
- Any paid or online service must be enforced server-side by `agent-platform` or a vendor-hosted service, not by local UI state.

Platform web clients and CodeAgent local clients should be aligned at the feature level. The platform Marketplace page, CodeAgent desktop Packages page, CLI package commands, and future mobile package screens can have different layouts, but they should all reflect the same catalog item, entitlement status, install state, billing state, package manifest, and package management actions. Likewise, project workflows, chat/history, provider selection, account/profile, and package settings should be backed by the same platform service contracts and package extension metadata instead of shell-specific feature definitions.

Current status: the extensibility model, separate SDK/package repos, platform catalog/profile/purchase/install API contract, local Docker platform seed, desktop platform login/register/startup sync, desktop platform catalog resolution, CLI platform sync, desktop platform-backed purchase/install scaffold, shared desktop/CLI signed artifact verification, and entitlement-gated platform artifact download are implemented. This is not yet a production app-store security boundary because paid implementation code is still present in the base app and production signing-key rotation, revocation, update/uninstall lifecycle, and durable vendor artifact storage are still pending.

The first platform-side contract now exists in `agent-platform`:

- `GET /code-agent/catalog`: platform-owned package manifests.
- `GET /code-agent/profile`: CodeAgent-compatible entitlement profile derived from platform account, billing, orders, and installs.
- `GET /code-agent/packages/{package_id}/artifact`: entitlement-gated signed package artifact download.
- `POST /code-agent/packages/{package_id}/purchase`: package purchase through platform billing/checkout.
- `POST /code-agent/packages/{package_id}/install`: platform install registry for entitled packages.

Initial CodeAgent client integration now includes:

- Platform connection settings: platform base URL, workspace/org id, access token/session state, catalog source, and platform password field.
- Desktop sign-in calls `/auth/login` when a platform password is supplied.
- Desktop account creation calls `/auth/register`, stores the returned platform session, and immediately syncs package catalog/profile state.
- Desktop sign-in fetches `/code-agent/catalog`, stores the returned platform manifests as `platformFeaturePackageCatalog`, and resolves Settings -> Packages from that catalog while falling back to the generated local catalog when the platform catalog is absent.
- Desktop sign-in stores the returned `/code-agent/profile`.
- Desktop app startup refreshes `/code-agent/profile` and `/code-agent/catalog` when a platform session is already stored, and Account/Packages expose an explicit Sync action.
- Desktop purchase creates a platform card summary and calls `/code-agent/packages/{package_id}/purchase` when a platform session exists.
- Desktop install downloads entitled signed artifacts through main-process IPC, verifies them locally, then records installation through `/code-agent/packages/{package_id}/install`.
- CLI register/login calls `/auth/register` and `/auth/login`, then syncs `/code-agent/catalog` and `/code-agent/profile` into CLI config.
- CLI purchase creates a platform card summary when needed and calls `/code-agent/packages/{package_id}/purchase`.
- CLI install downloads entitled signed artifacts, verifies them locally, and calls `/code-agent/packages/{package_id}/install` with the installed path, artifact SHA-256, and signature.

Catalog unification status:

- The platform Marketplace projection and `/code-agent/catalog` now share CodeAgent package data, so the Software Developer package appears in both places and purchase/install writes the same records.
- `/catalog/items` now exposes a unified platform catalog item with both `marketplace_listing` and `runtime_manifest` projections.
- `/marketplace/apps` and `/code-agent/catalog` remain separate API projections because Marketplace listings need product metadata, reviews, pricing, and tenant install state, while CodeAgent runtime needs package manifests, feature ids, extension points, artifact compatibility, and install requirements.
- The intended endpoint model is one platform catalog domain with typed projections, not manually maintained duplicate catalogs. The current `PlatformCatalogService` is the first implementation slice; durable repository-backed publishing for all package/software types remains open.

The next CodeAgent client changes are:

- Add update, uninstall, retry, revoked-signature, and key-rotation states on top of the platform artifact download flow.
- Add cross-client parity tests that compare the platform Marketplace/catalog projection, CodeAgent desktop package view, and CLI package commands against the same catalog/profile fixtures.

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
