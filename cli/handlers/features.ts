import {
  FEATURE_PACKAGE_MANIFESTS,
  getFeaturePackageExtensions,
  getFeaturePackageSummary,
  normalizeFeatureProfile,
  resolveFeaturePackages,
  type FeatureEntitlementProfile,
  type FeaturePackageResolution,
} from '../../src/features/feature-packages.js';
import {
  readCliPlatformFeatureCatalog,
  readCliPlatformFeatureProfile,
} from './platform.js';

const CLI_FEATURE_ENV_KEYS = [
  'CODEAGENT_FEATURE_PROFILE_JSON',
  'CODEAGENT_ACCOUNT_STATUS',
  'CODEAGENT_ACCOUNT_TIER',
  'CODEAGENT_SUBSCRIPTION_STATUS',
  'CODEAGENT_FEATURE_PACKAGES',
  'CODEAGENT_TRIAL_FEATURE_PACKAGES',
  'CODEAGENT_EXPIRED_FEATURE_PACKAGES',
  'CODEAGENT_DISABLED_FEATURE_PACKAGES',
  'CODEAGENT_ENTERPRISE_FEATURE_PACKAGES',
  'CODEAGENT_INSTALLED_FEATURE_PACKAGES',
  'CODEAGENT_FEATURE_LOCAL_DEV_OVERRIDE',
];

function hasCliFeatureProfileEnvOverride(): boolean {
  return CLI_FEATURE_ENV_KEYS.some(key => Boolean(process.env[key]?.trim()));
}

export function readCliFeatureProfileFromEnv(): FeatureEntitlementProfile {
  const jsonProfile = process.env.CODEAGENT_FEATURE_PROFILE_JSON?.trim();
  if (jsonProfile) {
    try {
      return normalizeFeatureProfile(JSON.parse(jsonProfile) as FeatureEntitlementProfile);
    } catch (error) {
      throw new Error(`Invalid CODEAGENT_FEATURE_PROFILE_JSON: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return normalizeFeatureProfile({
    accountStatus: readAccountStatusEnv('CODEAGENT_ACCOUNT_STATUS'),
    accountTier: process.env.CODEAGENT_ACCOUNT_TIER,
    subscriptionStatus: readSubscriptionStatusEnv('CODEAGENT_SUBSCRIPTION_STATUS'),
    purchasedPackageIds: readCsvEnv('CODEAGENT_FEATURE_PACKAGES'),
    trialPackageIds: readCsvEnv('CODEAGENT_TRIAL_FEATURE_PACKAGES'),
    expiredPackageIds: readCsvEnv('CODEAGENT_EXPIRED_FEATURE_PACKAGES'),
    disabledPackageIds: readCsvEnv('CODEAGENT_DISABLED_FEATURE_PACKAGES'),
    enterprisePackageIds: readCsvEnv('CODEAGENT_ENTERPRISE_FEATURE_PACKAGES'),
    installedPackageIds: readCsvEnv('CODEAGENT_INSTALLED_FEATURE_PACKAGES'),
    localDeveloperOverride: readBooleanEnv('CODEAGENT_FEATURE_LOCAL_DEV_OVERRIDE'),
  });
}

export function resolveCliFeaturePackages(): FeaturePackageResolution {
  if (hasCliFeatureProfileEnvOverride()) {
    return resolveFeaturePackages('cli', readCliFeatureProfileFromEnv());
  }

  const platformProfile = readCliPlatformFeatureProfile();
  const platformCatalog = readCliPlatformFeatureCatalog();
  if (platformProfile) {
    return resolveFeaturePackages('cli', platformProfile, platformCatalog ?? FEATURE_PACKAGE_MANIFESTS);
  }

  return resolveFeaturePackages('cli', readCliFeatureProfileFromEnv());
}

export function formatFeatureGateMessage(resolution: FeaturePackageResolution, commandName: string): string {
  const lockedDeveloper = resolution.packages.find(entry => entry.manifest.id === 'software-developer');
  const reason = lockedDeveloper
    ? `${lockedDeveloper.manifest.displayName}: entitlement=${lockedDeveloper.state}, install=${lockedDeveloper.installState} (${lockedDeveloper.reason}; ${lockedDeveloper.installReason})`
    : 'No package registered this command.';

  return [
    `The "${commandName}" command is not available for the current feature profile.`,
    reason,
    'Run `code-agent features` to inspect available packages and features.',
  ].join('\n');
}

export async function featuresSummaryHandler(): Promise<void> {
  console.log(getFeaturePackageSummary(resolveCliFeaturePackages()));
}

export async function featuresPackagesHandler(): Promise<void> {
  const resolution = resolveCliFeaturePackages();
  for (const entry of resolution.packages) {
    console.log(`${entry.manifest.id}\t${entry.state}\t${entry.installState}\t${entry.manifest.productSku}\t${entry.reason}\t${entry.installReason}`);
  }
}

export async function featuresListHandler(): Promise<void> {
  const resolution = resolveCliFeaturePackages();
  if (resolution.features.length === 0) {
    console.log('No features are available for the current CLI profile.');
    return;
  }

  for (const entry of resolution.features) {
    const commands = entry.feature.adapters
      .filter(adapter => adapter.shell === 'cli')
      .flatMap(adapter => adapter.commands ?? []);
    console.log(`${entry.feature.id}\t${entry.packageId}\t${commands.join(', ') || '-'}`);
  }
}

export async function featuresExtensionsHandler(): Promise<void> {
  const resolution = resolveCliFeaturePackages();
  const extensions = getFeaturePackageExtensions(resolution);
  if (extensions.length === 0) {
    console.log('No package extensions are active for the current CLI profile.');
    return;
  }

  for (const entry of extensions) {
    const extension = entry.extension;
    const commandParts = [extension.command, ...(extension.commandAliases ?? [])].filter(Boolean);
    console.log([
      extension.point,
      extension.id,
      entry.packageId,
      extension.featureId ?? '-',
      extension.title,
      commandParts.join(', ') || extension.route || extension.childRoute || '-',
    ].join('\t'));
  }
}

export async function featuresManifestHandler(): Promise<void> {
  console.log(JSON.stringify(FEATURE_PACKAGE_MANIFESTS, null, 2));
}

function readAccountStatusEnv(name: string): FeatureEntitlementProfile['accountStatus'] {
  const raw = process.env[name]?.trim();
  return raw === 'guest' || raw === 'signed-in' ? raw : undefined;
}

function readSubscriptionStatusEnv(name: string): FeatureEntitlementProfile['subscriptionStatus'] {
  const raw = process.env[name]?.trim();
  return (
    raw === 'free' ||
    raw === 'active' ||
    raw === 'trialing' ||
    raw === 'past-due' ||
    raw === 'canceled' ||
    raw === 'enterprise'
  ) ? raw : undefined;
}

function readCsvEnv(name: string): string[] | undefined {
  const raw = process.env[name]?.trim();
  if (!raw) {
    return undefined;
  }

  return raw.split(',').map(value => value.trim()).filter(Boolean);
}

function readBooleanEnv(name: string): boolean | undefined {
  const raw = process.env[name]?.trim().toLowerCase();
  if (!raw) {
    return undefined;
  }

  if (['1', 'true', 'yes', 'on'].includes(raw)) {
    return true;
  }
  if (['0', 'false', 'no', 'off'].includes(raw)) {
    return false;
  }

  return undefined;
}
