import { EXTERNAL_FEATURE_PACKAGE_CATALOG_MANIFESTS } from './package-catalog/generated.js';
import semver from 'semver';
import type {
  AccountPaymentMethod,
  AccountPurchaseRecord,
  AccountSessionStatus,
  AccountSubscriptionStatus,
  FeatureAvailability,
  FeatureEntitlementProfile,
  FeatureEntitlementState,
  FeaturePackageExtensionAvailability,
  FeaturePackageExtensionPoint,
  FeaturePackageInstallRecord,
  FeaturePackageInstallState,
  FeaturePackageManifest,
  FeaturePackageResolution,
  FeatureShell,
  PurchaseStatus,
} from '@codeagent/feature-package-sdk';

export type {
  AccountPaymentMethod,
  AccountPurchaseRecord,
  AccountSessionStatus,
  AccountSubscriptionStatus,
  EntitlementRule,
  FeatureAvailability,
  FeatureDefinition,
  FeatureEntitlementProfile,
  FeatureEntitlementState,
  FeaturePackageArtifact,
  FeaturePackageDistributionMode,
  FeaturePackageDomain,
  FeaturePackageEntrypoints,
  FeaturePackageExtensionAvailability,
  FeaturePackageExtensionPoint,
  FeaturePackageExtensionRegistration,
  FeaturePackageInstallRecord,
  FeaturePackageInstallState,
  FeaturePackageManifest,
  FeaturePackagePricing,
  FeaturePackageResolution,
  FeaturePackageSdkRequirement,
  FeaturePackageSecurityBoundary,
  FeaturePackageTier,
  FeatureRolloutStatus,
  FeatureShell,
  FeatureShellAdapter,
  PurchaseStatus,
} from '@codeagent/feature-package-sdk';

const DEFAULT_PROFILE: Required<FeatureEntitlementProfile> = {
  accountStatus: 'guest',
  accountId: '',
  email: '',
  displayName: 'Guest',
  accountTier: 'free',
  subscriptionStatus: 'free',
  purchasedPackageIds: [],
  trialPackageIds: [],
  expiredPackageIds: [],
  disabledPackageIds: [],
  localDeveloperOverride: false,
  enterprisePackageIds: [],
  installedPackageIds: [],
  packageInstallRecords: [],
  paymentMethods: [],
  purchases: [],
  updatedAt: '',
};

export const BASE_FEATURE_PACKAGE_ID = 'base';

export const FEATURE_PACKAGE_MANIFESTS: FeaturePackageManifest[] = [
  {
    id: BASE_FEATURE_PACKAGE_ID,
    productSku: 'codeagent.base.free',
    displayName: 'CodeAgent Base',
    domain: 'base',
    tier: 'free',
    version: '1.0.0',
    owner: 'codeagent',
    description: 'General assistant chat and the common operating environment required by every installed package.',
    pricing: {
      amountCents: 0,
      currency: 'USD',
      interval: 'one-time',
      label: 'Free',
    },
    dependencies: [],
    minimumAppVersion: '1.0.0',
    supportedShells: ['desktop', 'cli', 'mobile'],
    rolloutStatus: 'active',
    distribution: {
      mode: 'bundled',
      artifact: {
        artifactId: 'codeagent.base.bundle',
        version: '1.0.0',
        distributionMode: 'bundled',
        bundlePath: 'app://base',
      },
      installRequired: false,
      securityBoundary: 'none-client-bundled',
      notes: 'The base package is part of the application shell and is always present.',
    },
    entitlement: {
      state: 'available',
      reason: 'Included in the free base package.',
      accountTiers: ['free', 'paid', 'enterprise'],
    },
    features: [
      {
        id: 'chat',
        capabilityIds: ['chat.start', 'chat.stream', 'chat.sessions.basic'],
        title: 'Chat',
        description: 'General assistant chat with the configured model provider.',
        adapters: [
          { shell: 'desktop', routes: ['chat'], commands: ['/help', '/status', '/pwd', '/workspace', '/clear', '/sessions'] },
          { shell: 'cli', commands: ['<prompt>', '--print', '--resume', '--continue'] },
          { shell: 'mobile', views: ['chat'] },
        ],
        requiredServices: ['api', 'auth', 'app-state'],
        storageNamespaces: ['desktopSessions'],
        historyEventTypes: ['chat-session'],
      },
      {
        id: 'basic-settings',
        capabilityIds: ['settings.provider', 'settings.account', 'settings.basic', 'settings.permissions', 'history.chats'],
        title: 'Basic Settings',
        description: 'Provider, account, model, and minimal runtime settings required by chat.',
        adapters: [
          { shell: 'desktop', routes: ['settings:general', 'settings:account', 'settings:chat-history', 'settings:model', 'settings:packages'], commands: ['/login', '/login local', '/account', '/settings', '/config'] },
          { shell: 'cli', commands: ['auth', 'login', 'logout', 'config', 'status'] },
          { shell: 'mobile', views: ['settings'] },
        ],
        requiredServices: ['auth', 'app-state'],
        storageNamespaces: ['config'],
      },
      {
        id: 'agent-runtime',
        capabilityIds: [
          'runtime.tools',
          'runtime.permissions',
          'runtime.package-extensions',
        ],
        title: 'Agent Runtime',
        description: 'Built-in execution APIs and safety enforcement used by chat and installed professional packages.',
        adapters: [
          { shell: 'desktop' },
          { shell: 'cli' },
          { shell: 'mobile' },
        ],
        requiredServices: ['tool-service', 'filesystem', 'command', 'web', 'finance', 'mcp'],
        storageNamespaces: ['toolPermissionPolicies', 'disabledLlmTools'],
        toolSchemas: ['time.now', 'web.probe', 'web.search', 'web.research', 'web.fetch', 'finance.quote', 'bash.run', 'fs.read', 'fs.write', 'fs.undoLastWrite', 'fs.list', 'api.chat', 'app.getConfig', 'mcp.listServers', 'mcp.listTools', 'mcp.callTool'],
        permissionPolicies: ['bash.run', 'fs.write', 'fs.undoLastWrite', 'mcp.callTool'],
        historyEventTypes: ['tool-event'],
      },
    ],
    extensions: [
      {
        id: 'base.desktop.primary-nav.chat',
        point: 'desktop.primary-nav',
        shell: 'desktop',
        featureId: 'chat',
        title: 'Chats',
        description: 'Conversation workspace',
        icon: 'chat',
        route: 'chat',
        order: 10,
      },
      {
        id: 'base.desktop.primary-nav.settings',
        point: 'desktop.primary-nav',
        shell: 'desktop',
        featureId: 'basic-settings',
        title: 'Settings',
        description: 'Model, account, packages, and basic runtime settings',
        icon: 'settings',
        route: 'settings',
        order: 900,
      },
      {
        id: 'base.desktop.status.account',
        point: 'desktop.status-bar',
        shell: 'desktop',
        featureId: 'basic-settings',
        title: 'Account',
        statusKind: 'account',
        order: 20,
      },
      {
        id: 'base.electron.menu.settings',
        point: 'electron.menu',
        shell: 'desktop',
        featureId: 'basic-settings',
        title: 'Settings',
        menuPath: ['CodeAgent', 'Settings'],
        route: 'settings',
        order: 20,
      },
    ],
    migration: {
      schemaVersion: 1,
      compatibilityKey: 'feature-package:base:1',
    },
  },
  ...EXTERNAL_FEATURE_PACKAGE_CATALOG_MANIFESTS,
];

export function createDefaultFeatureProfile(): Required<FeatureEntitlementProfile> {
  return {
    ...DEFAULT_PROFILE,
    purchasedPackageIds: [...DEFAULT_PROFILE.purchasedPackageIds],
    trialPackageIds: [...DEFAULT_PROFILE.trialPackageIds],
    expiredPackageIds: [...DEFAULT_PROFILE.expiredPackageIds],
    disabledPackageIds: [...DEFAULT_PROFILE.disabledPackageIds],
    enterprisePackageIds: [...DEFAULT_PROFILE.enterprisePackageIds],
    installedPackageIds: [...DEFAULT_PROFILE.installedPackageIds],
    packageInstallRecords: [...DEFAULT_PROFILE.packageInstallRecords],
    paymentMethods: [...DEFAULT_PROFILE.paymentMethods],
    purchases: [...DEFAULT_PROFILE.purchases],
  };
}

export function createGuestFeatureProfile(): Required<FeatureEntitlementProfile> {
  return createDefaultFeatureProfile();
}

export function normalizeFeatureProfile(profile?: FeatureEntitlementProfile | null): Required<FeatureEntitlementProfile> {
  const fallback = createDefaultFeatureProfile();
  if (!profile || typeof profile !== 'object') {
    return fallback;
  }

  return {
    accountStatus: normalizeAccountStatus(profile.accountStatus, fallback.accountStatus),
    accountId: normalizeString(profile.accountId, fallback.accountId),
    email: normalizeString(profile.email, fallback.email),
    displayName: normalizeString(profile.displayName, fallback.displayName),
    accountTier: profile.accountTier || fallback.accountTier,
    subscriptionStatus: normalizeSubscriptionStatus(profile.subscriptionStatus, fallback.subscriptionStatus),
    purchasedPackageIds: normalizeStringList(profile.purchasedPackageIds, fallback.purchasedPackageIds),
    trialPackageIds: normalizeStringList(profile.trialPackageIds, fallback.trialPackageIds),
    expiredPackageIds: normalizeStringList(profile.expiredPackageIds, fallback.expiredPackageIds),
    disabledPackageIds: normalizeStringList(profile.disabledPackageIds, fallback.disabledPackageIds),
    localDeveloperOverride: typeof profile.localDeveloperOverride === 'boolean'
      ? profile.localDeveloperOverride
      : fallback.localDeveloperOverride,
    enterprisePackageIds: normalizeStringList(profile.enterprisePackageIds, fallback.enterprisePackageIds),
    installedPackageIds: normalizeStringList(profile.installedPackageIds, fallback.installedPackageIds),
    packageInstallRecords: normalizeInstallRecords(profile.packageInstallRecords, fallback.packageInstallRecords),
    paymentMethods: normalizePaymentMethods(profile.paymentMethods, fallback.paymentMethods),
    purchases: normalizePurchaseRecords(profile.purchases, fallback.purchases),
    updatedAt: normalizeString(profile.updatedAt, fallback.updatedAt),
  };
}

export function resolveFeaturePackages(
  shell: FeatureShell,
  profile?: FeatureEntitlementProfile | null,
  manifests = FEATURE_PACKAGE_MANIFESTS,
): FeaturePackageResolution {
  const normalizedProfile = normalizeFeatureProfile(profile);
  // The platform catalog owns commerce and entitlement metadata, but the
  // installed desktop build owns the runtime contract it can actually render.
  // Reuse the matching local contract so an older platform catalog cannot
  // reintroduce routes or capabilities that were moved into the core app.
  const runtimeManifests = manifests.map(manifest => {
    const localManifest = FEATURE_PACKAGE_MANIFESTS.find(candidate => (
      candidate.id === manifest.id && candidate.version === manifest.version
    ));
    if (!localManifest || localManifest === manifest) {
      return manifest;
    }
    return {
      ...manifest,
      supportedShells: localManifest.supportedShells,
      sdk: localManifest.sdk,
      entrypoints: localManifest.entrypoints,
      features: localManifest.features,
      extensions: localManifest.extensions,
    };
  });
  const packages = runtimeManifests.map(manifest => {
    const packageState = resolvePackageState(manifest, shell, normalizedProfile);
    const packageInstall = resolvePackageInstallState(manifest, normalizedProfile, packageState.state);
    return {
      manifest,
      ...packageState,
      ...packageInstall,
    };
  });

  const packageById = new Map(packages.map(entry => [entry.manifest.id, entry]));
  const features: FeatureAvailability[] = [];
  const extensions: FeaturePackageExtensionAvailability[] = [];

  for (const entry of packages) {
    if (entry.state !== 'available' && entry.state !== 'trial') {
      continue;
    }

    if (entry.manifest.dependencies.some(dependency => {
      const dependencyEntry = packageById.get(dependency);
      return !dependencyEntry ||
        (dependencyEntry.state !== 'available' && dependencyEntry.state !== 'trial') ||
        !isPackageRuntimeAvailable(dependencyEntry.installState);
    })) {
      continue;
    }

    if (!isPackageRuntimeAvailable(entry.installState)) {
      continue;
    }

    for (const feature of entry.manifest.features) {
      if (!feature.adapters.some(adapter => adapter.shell === shell)) {
        continue;
      }

      features.push({
        packageId: entry.manifest.id,
        featureId: feature.id,
        state: entry.state,
        reason: entry.reason,
        manifest: entry.manifest,
        feature,
      });
    }

    for (const extension of entry.manifest.extensions ?? []) {
      if (extension.shell !== shell) {
        continue;
      }

      if (extension.featureId && !entry.manifest.features.some(feature => (
        feature.id === extension.featureId &&
        feature.adapters.some(adapter => adapter.shell === shell)
      ))) {
        continue;
      }

      extensions.push({
        packageId: entry.manifest.id,
        featureId: extension.featureId,
        state: entry.state,
        reason: entry.reason,
        manifest: entry.manifest,
        extension,
      });
    }
  }

  return {
    shell,
    profile: normalizedProfile,
    packages,
    features,
    extensions,
  };
}

export function isFeatureAvailable(resolution: FeaturePackageResolution, featureId: string): boolean {
  return resolution.features.some(feature => feature.featureId === featureId);
}

export function getFeatureOwnerPackageId(
  resolution: FeaturePackageResolution,
  featureId: string,
): string | undefined {
  return resolution.features.find(feature => feature.featureId === featureId)?.packageId;
}

export function isCommandAvailable(resolution: FeaturePackageResolution, command: string): boolean {
  const normalizedCommand = normalizeCommandName(command);
  return resolution.features.some(feature => feature.feature.adapters.some(adapter => (
    adapter.shell === resolution.shell &&
    (adapter.commands ?? []).some(adapterCommand => normalizeCommandName(adapterCommand) === normalizedCommand)
  )));
}

export function getFeaturePackageExtensions(
  resolution: FeaturePackageResolution,
  point?: FeaturePackageExtensionPoint,
): FeaturePackageExtensionAvailability[] {
  return resolution.extensions
    .filter(entry => !point || entry.extension.point === point)
    .sort((left, right) => {
      const leftOrder = left.extension.order ?? 0;
      const rightOrder = right.extension.order ?? 0;
      if (leftOrder !== rightOrder) {
        return leftOrder - rightOrder;
      }
      return left.extension.title.localeCompare(right.extension.title);
    });
}

export function getFeaturePackageSummary(resolution: FeaturePackageResolution): string {
  const packageLines = resolution.packages.map(entry => (
    `${entry.manifest.displayName}: ${entry.state}, install=${entry.installState} (${entry.reason}; ${entry.installReason})`
  ));
  const featureLines = resolution.features.map(entry => `- ${entry.feature.title} [${entry.packageId}]`);
  const extensionLines = getFeaturePackageExtensions(resolution).map(entry => (
    `- ${entry.extension.point}: ${entry.extension.title} [${entry.packageId}]`
  ));
  return [
    `Shell: ${resolution.shell}`,
    `Account: ${resolution.profile.accountStatus}`,
    `Account tier: ${resolution.profile.accountTier}`,
    'Packages:',
    ...packageLines.map(line => `- ${line}`),
    'Available features:',
    ...(featureLines.length > 0 ? featureLines : ['- none']),
    'Active extensions:',
    ...(extensionLines.length > 0 ? extensionLines : ['- none']),
  ].join('\n');
}

export function isPackageRuntimeAvailable(installState: FeaturePackageInstallState): boolean {
  return installState === 'bundled' ||
    installState === 'installed' ||
    installState === 'update-available' ||
    installState === 'remote-service';
}

function resolvePackageState(
  manifest: FeaturePackageManifest,
  shell: FeatureShell,
  profile: Required<FeatureEntitlementProfile>,
): { state: FeatureEntitlementState; reason: string } {
  if (!manifest.supportedShells.includes(shell)) {
    return { state: 'unsupported', reason: `Package does not support the ${shell} shell.` };
  }

  if (manifest.rolloutStatus === 'hidden' || manifest.rolloutStatus === 'deprecated') {
    return { state: 'disabled', reason: `Package rollout status is ${manifest.rolloutStatus}.` };
  }

  if (profile.disabledPackageIds.includes(manifest.id)) {
    return { state: 'disabled', reason: 'Package disabled by local profile.' };
  }

  if (profile.expiredPackageIds.includes(manifest.id)) {
    return { state: 'expired', reason: 'Package entitlement has expired.' };
  }

  if (profile.trialPackageIds.includes(manifest.id)) {
    return { state: 'trial', reason: 'Package is available during trial.' };
  }

  if (manifest.tier === 'free') {
    return { state: 'available', reason: manifest.entitlement.reason };
  }

  if (profile.localDeveloperOverride) {
    return { state: 'available', reason: 'Enabled by local developer override.' };
  }

  if (profile.accountTier === 'enterprise' && (
    profile.enterprisePackageIds.includes(manifest.id)
  )) {
    return { state: 'available', reason: 'Included by enterprise entitlement.' };
  }

  if (
    profile.purchasedPackageIds.includes(manifest.id) ||
    manifest.entitlement.purchasedPackageIds?.some(packageId => profile.purchasedPackageIds.includes(packageId))
  ) {
    return { state: 'available', reason: manifest.entitlement.reason };
  }

  if (profile.accountStatus !== 'signed-in') {
    return { state: 'locked', reason: 'Sign in to purchase this package.' };
  }

  if (manifest.entitlement.accountTiers && !manifest.entitlement.accountTiers.includes(profile.accountTier)) {
    if (profile.accountTier === 'free' && manifest.entitlement.accountTiers.includes('paid')) {
      return { state: 'locked', reason: 'Purchase upgrades this account to a paid subscription.' };
    }
    return { state: 'locked', reason: 'Requires an eligible subscription tier.' };
  }

  return { state: 'locked', reason: 'Requires package purchase.' };
}

function resolvePackageInstallState(
  manifest: FeaturePackageManifest,
  profile: Required<FeatureEntitlementProfile>,
  entitlementState: FeatureEntitlementState,
): { installState: FeaturePackageInstallState; installReason: string } {
  if (manifest.distribution.mode === 'remote-service') {
    return {
      installState: 'remote-service',
      installReason: 'Package runs through a server-enforced remote service.',
    };
  }

  if (!manifest.distribution.installRequired || manifest.distribution.mode === 'bundled') {
    return {
      installState: 'bundled',
      installReason: 'Package runtime is bundled with this app build.',
    };
  }

  if (entitlementState !== 'available' && entitlementState !== 'trial') {
    return {
      installState: 'not-owned',
      installReason: 'Purchase the package before installing its runtime.',
    };
  }

  if (profile.localDeveloperOverride) {
    return {
      installState: 'installed',
      installReason: 'Developer override treats the package runtime as installed for local development.',
    };
  }

  const latestRecord = [...profile.packageInstallRecords]
    .reverse()
    .find(record => record.packageId === manifest.id);

  if (latestRecord?.state === 'installed' || latestRecord?.state === 'update-available' || latestRecord?.state === 'install-failed') {
    const catalogVersion = manifest.distribution.artifact.version || manifest.version;
    const updateAvailable = latestRecord.state !== 'install-failed' &&
      semver.valid(catalogVersion) !== null &&
      semver.valid(latestRecord.version) !== null &&
      semver.gt(catalogVersion, latestRecord.version);
    return {
      installState: updateAvailable
        ? 'update-available'
        : latestRecord.state === 'update-available'
          ? 'installed'
          : latestRecord.state,
      installReason: latestRecord.error || (updateAvailable
        ? `Version ${catalogVersion} is available; version ${latestRecord.version} is installed.`
        : `Version ${latestRecord.version} is installed.`),
    };
  }

  if (profile.installedPackageIds.includes(manifest.id)) {
    return {
      installState: 'installed',
      installReason: 'Package runtime is registered as installed locally.',
    };
  }

  return {
    installState: 'owned-not-installed',
    installReason: 'Package entitlement is active. Install the runtime package to enable its features.',
  };
}

function normalizeString(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value.trim() : fallback;
}

function normalizeStringList(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) {
    return [...fallback];
  }

  const normalized = value
    .map(item => typeof item === 'string' ? item.trim() : '')
    .filter(Boolean);
  return normalized.length > 0 ? normalized : [];
}

function normalizeAccountStatus(value: unknown, fallback: AccountSessionStatus): AccountSessionStatus {
  return value === 'signed-in' || value === 'guest' ? value : fallback;
}

function normalizeSubscriptionStatus(value: unknown, fallback: AccountSubscriptionStatus): AccountSubscriptionStatus {
  return (
    value === 'free' ||
    value === 'active' ||
    value === 'trialing' ||
    value === 'past-due' ||
    value === 'canceled' ||
    value === 'enterprise'
  ) ? value : fallback;
}

function normalizePaymentMethods(value: unknown, fallback: AccountPaymentMethod[]): AccountPaymentMethod[] {
  if (!Array.isArray(value)) {
    return [...fallback];
  }

  return value.flatMap(item => {
    if (!item || typeof item !== 'object') {
      return [];
    }
    const method = item as Partial<AccountPaymentMethod>;
    if (method.type !== 'card' || !method.id || !method.last4) {
      return [];
    }
    return [{
      id: String(method.id),
      type: 'card' as const,
      brand: method.brand ? String(method.brand) : 'Card',
      last4: String(method.last4).slice(-4),
      expMonth: Number(method.expMonth || 0),
      expYear: Number(method.expYear || 0),
      createdAt: method.createdAt ? String(method.createdAt) : '',
    }];
  });
}

function normalizePurchaseRecords(value: unknown, fallback: AccountPurchaseRecord[]): AccountPurchaseRecord[] {
  if (!Array.isArray(value)) {
    return [...fallback];
  }

  return value.flatMap(item => {
    if (!item || typeof item !== 'object') {
      return [];
    }
    const record = item as Partial<AccountPurchaseRecord>;
    if (!record.id || !record.packageId || !record.productSku || !record.paymentMethodId) {
      return [];
    }
    return [{
      id: String(record.id),
      packageId: String(record.packageId),
      productSku: String(record.productSku),
      amountCents: Number(record.amountCents || 0),
      currency: record.currency ? String(record.currency) : 'USD',
      paymentMethodId: String(record.paymentMethodId),
      status: normalizePurchaseStatus(record.status),
      purchasedAt: record.purchasedAt ? String(record.purchasedAt) : '',
    }];
  });
}

function normalizeInstallRecords(value: unknown, fallback: FeaturePackageInstallRecord[]): FeaturePackageInstallRecord[] {
  if (!Array.isArray(value)) {
    return [...fallback];
  }

  return value.flatMap(item => {
    if (!item || typeof item !== 'object') {
      return [];
    }
    const record = item as Partial<FeaturePackageInstallRecord>;
    if (!record.packageId || !record.version) {
      return [];
    }
    const packageId = String(record.packageId);
    return [{
      packageId,
      // Runtime discovery predates artifact metadata and persisted records
      // containing only the package id, version, and installed path. Keep
      // those records usable so update detection does not collapse to the
      // less precise installedPackageIds fallback.
      artifactId: record.artifactId
        ? String(record.artifactId)
        : `${packageId}.installed-runtime`,
      version: String(record.version),
      state: normalizeInstallState(record.state),
      installedPath: record.installedPath ? String(record.installedPath) : undefined,
      installedAt: record.installedAt ? String(record.installedAt) : undefined,
      sha256: record.sha256 ? String(record.sha256) : undefined,
      signature: record.signature ? String(record.signature) : undefined,
      error: record.error ? String(record.error) : undefined,
    }];
  });
}

function normalizePurchaseStatus(value: unknown): PurchaseStatus {
  return value === 'trial' || value === 'refunded' || value === 'failed' ? value : 'paid';
}

function normalizeInstallState(value: unknown): FeaturePackageInstallState {
  return (
    value === 'bundled' ||
    value === 'not-owned' ||
    value === 'owned-not-installed' ||
    value === 'installed' ||
    value === 'update-available' ||
    value === 'install-failed' ||
    value === 'remote-service'
  ) ? value : 'owned-not-installed';
}

function normalizeCommandName(command: string): string {
  return command.trim().split(/\s+/)[0].replace(/^\//, '').toLowerCase();
}
