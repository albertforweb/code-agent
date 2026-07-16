import {
  normalizeFeatureProfile,
  type FeatureEntitlementProfile,
  type FeaturePackageManifest,
} from '../../src/features/feature-packages.js';
import { installSignedPackageArtifact } from '../../electron/feature-package-installer.js';
import { getGlobalConfig, saveGlobalConfig } from '../../utils/config.js';

export interface CliPlatformState {
  baseUrl?: string;
  accessToken?: string;
  orgId?: string;
  email?: string;
  displayName?: string;
  catalogSource?: 'platform';
  featureProfile?: FeatureEntitlementProfile;
  featurePackageCatalog?: FeaturePackageManifest[];
  lastSyncedAt?: string;
}

interface PlatformLoginResponse {
  access_token: string;
  session?: {
    org_id?: string;
    email?: string;
    name?: string;
  };
  workspace?: {
    organization?: {
      org_id?: string;
    };
  };
}

interface PlatformProfileResponse {
  org_id?: string;
  profile: FeatureEntitlementProfile;
}

interface PlatformCatalogResponse {
  org_id?: string;
  catalog_source?: string;
  packages: FeaturePackageManifest[];
}

interface PlatformPackageActionResponse {
  org_id?: string;
  profile: FeatureEntitlementProfile;
  order?: Record<string, unknown>;
  install?: Record<string, unknown>;
}

interface PlatformPaymentMethodResponse {
  method_id?: string;
  id?: string;
  [key: string]: unknown;
}

export function readCliPlatformState(): CliPlatformState | undefined {
  const state = getGlobalConfig().codeAgentPlatform;
  if (!state || typeof state !== 'object') {
    return undefined;
  }

  return {
    baseUrl: typeof state.baseUrl === 'string' ? state.baseUrl : undefined,
    accessToken: typeof state.accessToken === 'string' ? state.accessToken : undefined,
    orgId: typeof state.orgId === 'string' ? state.orgId : undefined,
    email: typeof state.email === 'string' ? state.email : undefined,
    displayName: typeof state.displayName === 'string' ? state.displayName : undefined,
    catalogSource: state.catalogSource === 'platform' ? 'platform' : undefined,
    featureProfile: isPlainObject(state.featureProfile) ? state.featureProfile as FeatureEntitlementProfile : undefined,
    featurePackageCatalog: normalizePlatformFeatureCatalog(state.featurePackageCatalog),
    lastSyncedAt: typeof state.lastSyncedAt === 'string' ? state.lastSyncedAt : undefined,
  };
}

export function readCliPlatformFeatureProfile(): FeatureEntitlementProfile | undefined {
  const profile = readCliPlatformState()?.featureProfile;
  return profile ? normalizeFeatureProfile(profile) : undefined;
}

export function readCliPlatformFeatureCatalog(): FeaturePackageManifest[] | undefined {
  return readCliPlatformState()?.featurePackageCatalog;
}

export async function platformLoginHandler(options: {
  baseUrl?: string;
  email?: string;
  password?: string;
  orgId?: string;
}): Promise<void> {
  const baseUrl = resolvePlatformBaseUrl(options.baseUrl);
  const email = requireValue(options.email ?? process.env.CODEAGENT_PLATFORM_EMAIL, 'platform login requires --email or CODEAGENT_PLATFORM_EMAIL');
  const password = requireValue(options.password ?? process.env.CODEAGENT_PLATFORM_PASSWORD, 'platform login requires --password or CODEAGENT_PLATFORM_PASSWORD');
  const orgId = normalizeOptionalString(options.orgId ?? process.env.CODEAGENT_PLATFORM_ORG_ID);
  const login = await readPlatformJson<PlatformLoginResponse>(baseUrl, '/auth/login', undefined, {
    method: 'POST',
    body: JSON.stringify({
      email,
      password,
      ...(orgId ? { org_id: orgId, realm: 'tenant' } : {}),
    }),
  });
  const sessionOrgId = derivePlatformOrgId(login, orgId);
  saveCliPlatformState({
    baseUrl,
    accessToken: login.access_token,
    orgId: sessionOrgId,
    email: login.session?.email ?? email,
    displayName: login.session?.name ?? email,
  });

  const synced = await syncPlatformState();
  printJson({
    ok: true,
    action: 'login',
    baseUrl: synced.baseUrl,
    orgId: synced.orgId,
    email: synced.email,
    lastSyncedAt: synced.lastSyncedAt,
    profile: synced.featureProfile,
  });
}

export async function platformRegisterHandler(options: {
  baseUrl?: string;
  email?: string;
  password?: string;
  name?: string;
  workspace?: string;
}): Promise<void> {
  const baseUrl = resolvePlatformBaseUrl(options.baseUrl);
  const email = requireValue(options.email ?? process.env.CODEAGENT_PLATFORM_EMAIL, 'platform register requires --email or CODEAGENT_PLATFORM_EMAIL');
  const password = requireValue(options.password ?? process.env.CODEAGENT_PLATFORM_PASSWORD, 'platform register requires --password or CODEAGENT_PLATFORM_PASSWORD');
  const displayName = normalizeOptionalString(options.name) ?? email;
  const login = await readPlatformJson<PlatformLoginResponse>(baseUrl, '/auth/register', undefined, {
    method: 'POST',
    body: JSON.stringify({
      workspace_name: normalizeOptionalString(options.workspace) ?? `${email.split('@')[0]} Workspace`,
      name: displayName,
      email,
      password,
    }),
  });
  saveCliPlatformState({
    baseUrl,
    accessToken: login.access_token,
    orgId: derivePlatformOrgId(login),
    email: login.session?.email ?? email,
    displayName: login.session?.name ?? displayName,
  });

  const synced = await syncPlatformState();
  printJson({
    ok: true,
    action: 'register',
    baseUrl: synced.baseUrl,
    orgId: synced.orgId,
    email: synced.email,
    lastSyncedAt: synced.lastSyncedAt,
    profile: synced.featureProfile,
  });
}

export async function platformSyncHandler(options: {
  baseUrl?: string;
  orgId?: string;
} = {}): Promise<void> {
  const state = await syncPlatformState({
    baseUrl: options.baseUrl ? resolvePlatformBaseUrl(options.baseUrl) : undefined,
    orgId: normalizeOptionalString(options.orgId),
  });
  printJson(platformStateSummary(state));
}

export async function platformStatusHandler(): Promise<void> {
  const state = readCliPlatformState();
  if (!state?.accessToken) {
    printJson({
      configured: false,
      message: 'Run `code-agent platform login` or `code-agent platform register` first.',
    });
    return;
  }
  printJson(platformStateSummary(state));
}

export async function platformProfileHandler(options: { sync?: boolean } = {}): Promise<void> {
  const state = options.sync === false ? getRequiredPlatformState() : await syncPlatformState();
  printJson({
    org_id: state.orgId,
    profile: state.featureProfile ? normalizeFeatureProfile(state.featureProfile) : undefined,
    lastSyncedAt: state.lastSyncedAt,
  });
}

export async function platformCatalogHandler(options: { sync?: boolean } = {}): Promise<void> {
  const state = options.sync === false ? getRequiredPlatformState() : await syncPlatformState();
  printJson({
    org_id: state.orgId,
    catalog_source: state.catalogSource,
    packages: state.featurePackageCatalog ?? [],
    lastSyncedAt: state.lastSyncedAt,
  });
}

export async function platformPurchaseHandler(packageId: string, options: {
  paymentMethodId?: string;
  cardNumber?: string;
  cardLast4?: string;
  cardBrand?: string;
  expMonth?: string;
  expYear?: string;
  holderName?: string;
} = {}): Promise<void> {
  const state = getRequiredPlatformState();
  const paymentMethodId = options.paymentMethodId ?? await maybeCreatePaymentMethod(state, options);
  const result = await readPlatformJson<PlatformPackageActionResponse>(
    state.baseUrl!,
    `/code-agent/packages/${encodeURIComponent(packageId)}/purchase`,
    state.accessToken,
    {
      method: 'POST',
      body: JSON.stringify({
        ...(state.orgId ? { org_id: state.orgId } : {}),
        ...(paymentMethodId ? { payment_method_id: paymentMethodId } : {}),
      }),
    },
  );
  saveCliPlatformState({
    ...state,
    orgId: result.org_id ?? state.orgId,
    featureProfile: normalizeFeatureProfile(result.profile),
    lastSyncedAt: new Date().toISOString(),
  });

  printJson({
    ok: true,
    action: 'purchase',
    packageId,
    order: result.order,
    profile: normalizeFeatureProfile(result.profile),
  });
}

export async function platformInstallHandler(packageId: string, options: {
  installedPath?: string;
  archivePath?: string;
  version?: string;
  sha256?: string;
  signature?: string;
} = {}): Promise<void> {
  const state = await syncPlatformState();
  const manifest = state.featurePackageCatalog?.find(entry => entry.id === packageId);
  if (!manifest) {
    throw new Error(`Package not found in platform catalog: ${packageId}`);
  }
  const artifact = manifest.distribution.artifact;
  const localInstall = manifest.distribution.securityBoundary === 'signed-local-bundle'
    ? await installSignedPackageArtifact(manifest, options.archivePath, {
        download: options.archivePath ? undefined : platformPackageArtifactDownload(state, manifest),
      })
    : undefined;
  const result = await readPlatformJson<PlatformPackageActionResponse>(
    state.baseUrl!,
    `/code-agent/packages/${encodeURIComponent(packageId)}/install`,
    state.accessToken,
    {
      method: 'POST',
      body: JSON.stringify({
        ...(state.orgId ? { org_id: state.orgId } : {}),
        version: options.version ?? localInstall?.version ?? artifact.version,
        installed_path: options.installedPath ?? localInstall?.installedPath ?? artifact.bundlePath,
        sha256: options.sha256 ?? localInstall?.sha256 ?? artifact.sha256,
        signature: options.signature ?? localInstall?.signature ?? artifact.signature,
      }),
    },
  );
  saveCliPlatformState({
    ...state,
    orgId: result.org_id ?? state.orgId,
    featureProfile: normalizeFeatureProfile(result.profile),
    lastSyncedAt: new Date().toISOString(),
  });

  printJson({
    ok: true,
    action: 'install',
    packageId,
    localInstall,
    install: result.install,
    profile: normalizeFeatureProfile(result.profile),
  });
}

export async function platformLogoutHandler(): Promise<void> {
  saveGlobalConfig(current => ({
    ...current,
    codeAgentPlatform: undefined,
  }));
  printJson({ ok: true, action: 'logout' });
}

export async function syncPlatformState(overrides: Partial<CliPlatformState> = {}): Promise<CliPlatformState> {
  const current = readCliPlatformState() ?? {};
  const baseUrl = overrides.baseUrl ?? current.baseUrl;
  const accessToken = overrides.accessToken ?? current.accessToken;
  const orgId = overrides.orgId ?? current.orgId;
  if (!baseUrl || !accessToken) {
    throw new Error('Platform session is not configured. Run `code-agent platform login` first.');
  }

  const [catalog, profile] = await Promise.all([
    fetchPlatformFeatureCatalog(baseUrl, accessToken, orgId),
    fetchPlatformFeatureProfile(baseUrl, accessToken, orgId),
  ]);
  const normalizedProfile = normalizeFeatureProfile(profile.profile);
  const next: CliPlatformState = {
    ...current,
    ...overrides,
    baseUrl,
    accessToken,
    orgId: profile.org_id ?? catalog.org_id ?? orgId,
    email: normalizedProfile.email || current.email,
    displayName: normalizedProfile.displayName || current.displayName,
    catalogSource: 'platform',
    featurePackageCatalog: catalog.packages,
    featureProfile: normalizedProfile,
    lastSyncedAt: new Date().toISOString(),
  };
  saveCliPlatformState(next);
  return next;
}

async function fetchPlatformFeatureProfile(
  baseUrl: string,
  token: string,
  orgId?: string,
): Promise<PlatformProfileResponse> {
  return readPlatformJson<PlatformProfileResponse>(
    baseUrl,
    `/code-agent/profile${platformOrgQuery(orgId)}`,
    token,
  );
}

async function fetchPlatformFeatureCatalog(
  baseUrl: string,
  token: string,
  orgId?: string,
): Promise<PlatformCatalogResponse> {
  return readPlatformJson<PlatformCatalogResponse>(
    baseUrl,
    `/code-agent/catalog${platformOrgQuery(orgId)}`,
    token,
  );
}

function platformPackageArtifactDownload(
  state: CliPlatformState,
  manifest: FeaturePackageManifest,
): { url: string; headers: Record<string, string> } | undefined {
  if (!state.baseUrl || !state.accessToken) {
    return undefined;
  }
  const artifact = manifest.distribution.artifact as FeaturePackageManifest['distribution']['artifact'] & {
    downloadUrl?: string;
  };
  const url = resolvePlatformPackageArtifactUrl(
    state.baseUrl,
    manifest.id,
    normalizeOptionalString(artifact.downloadUrl),
    state.orgId,
  );
  return {
    url,
    headers: {
      Authorization: `Bearer ${state.accessToken}`,
    },
  };
}

function resolvePlatformPackageArtifactUrl(
  baseUrl: string,
  packageId: string,
  catalogDownloadUrl?: string,
  orgId?: string,
): string {
  const normalizedBaseUrl = normalizePlatformBaseUrl(baseUrl);
  const raw = catalogDownloadUrl?.trim();
  const url = raw && /^https?:\/\//i.test(raw)
    ? raw
    : raw && raw.startsWith('/')
      ? `${normalizedBaseUrl}${raw}`
      : `${normalizedBaseUrl}/code-agent/packages/${encodeURIComponent(packageId)}/artifact`;
  const parsed = new URL(url);
  const normalizedOrgId = normalizeOptionalString(orgId);
  if (normalizedOrgId && !parsed.searchParams.has('org_id')) {
    parsed.searchParams.set('org_id', normalizedOrgId);
  }
  return parsed.toString();
}

async function maybeCreatePaymentMethod(state: CliPlatformState, options: {
  cardNumber?: string;
  cardLast4?: string;
  cardBrand?: string;
  expMonth?: string;
  expYear?: string;
  holderName?: string;
}): Promise<string | undefined> {
  const last4 = normalizeOptionalString(options.cardLast4)
    ?? normalizeOptionalString(options.cardNumber)?.replace(/\D/g, '').slice(-4);
  const expMonth = parsePositiveInt(options.expMonth);
  const expYear = parsePositiveInt(options.expYear);
  const shouldCreate = Boolean(last4 || expMonth || expYear || options.cardBrand || options.holderName);
  if (!shouldCreate) {
    return undefined;
  }
  if (!last4 || !/^\d{4}$/.test(last4)) {
    throw new Error('Card purchase requires --card-last4 or --card-number.');
  }
  if (!expMonth || expMonth < 1 || expMonth > 12) {
    throw new Error('Card purchase requires --exp-month between 1 and 12.');
  }
  if (!expYear || expYear < new Date().getFullYear()) {
    throw new Error('Card purchase requires --exp-year in the current year or later.');
  }
  const method = await readPlatformJson<PlatformPaymentMethodResponse>(
    state.baseUrl!,
    '/billing/payment-methods',
    state.accessToken,
    {
      method: 'POST',
      body: JSON.stringify({
        ...(state.orgId ? { org_id: state.orgId } : {}),
        method_type: 'card',
        brand: normalizeOptionalString(options.cardBrand) ?? getCardBrand(options.cardNumber ?? last4),
        last4,
        holder_name: normalizeOptionalString(options.holderName) ?? state.displayName ?? state.email ?? 'CodeAgent User',
        exp_month: expMonth,
        exp_year: expYear,
        make_default: true,
      }),
    },
  );
  const methodId = method.method_id ?? method.id;
  if (typeof methodId !== 'string' || !methodId) {
    throw new Error('Platform did not return a payment method id.');
  }
  return methodId;
}

function saveCliPlatformState(nextState: CliPlatformState): void {
  saveGlobalConfig(current => ({
    ...current,
    codeAgentPlatform: {
      ...(current.codeAgentPlatform ?? {}),
      ...nextState,
      featureProfile: nextState.featureProfile as Record<string, unknown> | undefined,
      featurePackageCatalog: nextState.featurePackageCatalog as Record<string, unknown>[] | undefined,
    },
  }));
}

function getRequiredPlatformState(): CliPlatformState {
  const state = readCliPlatformState();
  if (!state?.baseUrl || !state.accessToken) {
    throw new Error('Platform session is not configured. Run `code-agent platform login` first.');
  }
  return state;
}

function normalizePlatformFeatureCatalog(value: unknown): FeaturePackageManifest[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const manifests = value.flatMap(item => {
    if (!isPlainObject(item)) {
      return [];
    }
    const manifest = item as Partial<FeaturePackageManifest>;
    if (
      typeof manifest.id !== 'string' ||
      typeof manifest.productSku !== 'string' ||
      typeof manifest.displayName !== 'string' ||
      !manifest.distribution ||
      !Array.isArray(manifest.supportedShells) ||
      !Array.isArray(manifest.features)
    ) {
      return [];
    }
    return [manifest as FeaturePackageManifest];
  });
  return manifests.length > 0 ? manifests : undefined;
}

async function readPlatformJson<T>(
  baseUrl: string,
  path: string,
  token?: string,
  init: RequestInit = {},
): Promise<T> {
  const response = await fetch(`${normalizePlatformBaseUrl(baseUrl)}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.headers ?? {}),
    },
  });
  const text = await response.text();
  const payload = parseJsonPayload(text);
  if (!response.ok) {
    const detail = typeof payload?.detail === 'string' ? payload.detail : response.statusText;
    throw new Error(`Platform API ${response.status}: ${detail}`);
  }
  return payload as T;
}

function parseJsonPayload(text: string): Record<string, unknown> {
  if (!text.trim()) {
    return {};
  }
  try {
    const parsed = JSON.parse(text);
    return isPlainObject(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function resolvePlatformBaseUrl(explicit?: string): string {
  return normalizePlatformBaseUrl(
    explicit ??
    process.env.CODEAGENT_PLATFORM_BASE_URL ??
    readCliPlatformState()?.baseUrl ??
    'http://127.0.0.1:8000',
  );
}

function normalizePlatformBaseUrl(value: string): string {
  return value.trim().replace(/\/+$/, '');
}

function platformOrgQuery(orgId?: string): string {
  const trimmed = normalizeOptionalString(orgId);
  return trimmed ? `?org_id=${encodeURIComponent(trimmed)}` : '';
}

function derivePlatformOrgId(login: PlatformLoginResponse, fallback?: string): string | undefined {
  return normalizeOptionalString(fallback)
    ?? normalizeOptionalString(login.session?.org_id)
    ?? normalizeOptionalString(login.workspace?.organization?.org_id);
}

function platformStateSummary(state: CliPlatformState): Record<string, unknown> {
  const profile = state.featureProfile ? normalizeFeatureProfile(state.featureProfile) : undefined;
  return {
    configured: Boolean(state.accessToken),
    baseUrl: state.baseUrl,
    orgId: state.orgId,
    email: state.email ?? profile?.email,
    displayName: state.displayName ?? profile?.displayName,
    lastSyncedAt: state.lastSyncedAt,
    accountStatus: profile?.accountStatus,
    accountTier: profile?.accountTier,
    subscriptionStatus: profile?.subscriptionStatus,
    purchasedPackageIds: profile?.purchasedPackageIds ?? [],
    installedPackageIds: profile?.installedPackageIds ?? [],
    catalogPackages: state.featurePackageCatalog?.map(entry => entry.id) ?? [],
  };
}

function getCardBrand(cardNumber: string): string {
  const digits = cardNumber.replace(/\D/g, '');
  if (/^4/.test(digits)) return 'Visa';
  if (/^(5[1-5]|2[2-7])/.test(digits)) return 'Mastercard';
  if (/^3[47]/.test(digits)) return 'American Express';
  if (/^6(?:011|5)/.test(digits)) return 'Discover';
  return 'Card';
}

function parsePositiveInt(value?: string): number | undefined {
  if (!value) {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function normalizeOptionalString(value?: string): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function requireValue(value: string | undefined, message: string): string {
  const normalized = normalizeOptionalString(value);
  if (!normalized) {
    throw new Error(message);
  }
  return normalized;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function printJson(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}
