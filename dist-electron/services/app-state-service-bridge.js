"use strict";
/**
 * Service Bridge - App State Service
 * Bridges app configuration and state to IPC channels
 * Handles persistent storage via electron-store
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppStateServiceBridge = void 0;
const electron_store_1 = __importDefault(require("electron-store"));
const LEGACY_OFFLINE_MODEL = 'Qwen/Qwen2.5-Coder-0.5B-Instruct-GGUF';
const DEFAULT_OFFLINE_AGENT_MODEL = 'Qwen/Qwen3-4B-GGUF';
function createGuestFeatureProfile() {
    return {
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
}
function normalizeFeatureAccounts(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return {};
    }
    return { ...value };
}
function createLocalAccountId(email) {
    const normalized = email.trim().toLowerCase();
    let hash = 0;
    for (let index = 0; index < normalized.length; index += 1) {
        hash = ((hash << 5) - hash + normalized.charCodeAt(index)) | 0;
    }
    return `acct_${Math.abs(hash).toString(36)}`;
}
function writeFeatureAccount(accounts, profile) {
    if (profile.accountStatus !== 'signed-in' || typeof profile.email !== 'string' || !profile.email.trim()) {
        return accounts;
    }
    const email = profile.email.trim().toLowerCase();
    const accountId = typeof profile.accountId === 'string' && profile.accountId.trim()
        ? profile.accountId.trim()
        : createLocalAccountId(email);
    const storedProfile = {
        ...createGuestFeatureProfile(),
        ...profile,
        accountStatus: 'signed-in',
        accountId,
        email,
        localDeveloperOverride: profile.localDeveloperOverride === true,
    };
    return {
        ...accounts,
        [accountId]: storedProfile,
        [email]: storedProfile,
    };
}
function migrateFeatureProfile(config) {
    const featureAccounts = normalizeFeatureAccounts(config.featureAccounts);
    const profile = config.featureProfile;
    if (!profile || typeof profile !== 'object') {
        return {
            ...config,
            featureProfile: createGuestFeatureProfile(),
            featureAccounts,
        };
    }
    const hasSignedInAccount = profile.accountStatus === 'signed-in' || Boolean(profile.email);
    const hasPurchaseRecords = Array.isArray(profile.purchases) && profile.purchases.length > 0;
    // Old desktop builds could synthesize a paid local profile without a real
    // account or purchase record. Treat that shape as invalid generically; the
    // core must not know which feature package happened to create it.
    const isLegacyLocalEntitlementOverride = profile.localDeveloperOverride === true &&
        profile.accountTier === 'paid' &&
        Array.isArray(profile.purchasedPackageIds) &&
        profile.purchasedPackageIds.length > 0 &&
        !hasSignedInAccount &&
        !hasPurchaseRecords;
    if (isLegacyLocalEntitlementOverride) {
        return {
            ...config,
            featureProfile: createGuestFeatureProfile(),
            featureAccounts,
        };
    }
    const normalizedProfile = {
        ...createGuestFeatureProfile(),
        ...profile,
        localDeveloperOverride: profile.localDeveloperOverride === true,
    };
    return {
        ...config,
        featureProfile: normalizedProfile,
        featureAccounts: writeFeatureAccount(featureAccounts, normalizedProfile),
    };
}
/**
 * App State Service Bridge - manages app config and state
 */
class AppStateServiceBridge {
    constructor(options = {}) {
        this.currentState = {};
        this.configVersion = 0;
        this.stateVersion = 0;
        this.defaultAgentModelMigrated = false;
        this.writeQueue = Promise.resolve();
        this.appConfig = {
            llmProvider: 'codeagent',
            baseUrl: 'http://127.0.0.1:14321/v1',
            model: DEFAULT_OFFLINE_AGENT_MODEL,
            temperature: 0.7,
            maxTokens: 2048,
            contextTokens: 8192,
            enableLlmTools: false,
            disabledLlmTools: [],
            toolPermissionPolicies: {},
            desktopPermissionProfile: 'workspace-only',
            theme: 'system',
            accentColor: 'blue',
            language: 'en',
            featureProfile: createGuestFeatureProfile(),
            featureAccounts: {},
        };
        // Initialize electron-store for persistent storage
        this.store = new electron_store_1.default({
            name: 'code-agent',
            cwd: options.storeCwd,
            defaults: {
                config: this.appConfig,
                state: {},
                metadata: {
                    configVersion: 0,
                    stateVersion: 0,
                    defaultAgentModelMigrated: false,
                },
            },
        });
        // Load persisted data
        this._loadFromStore();
    }
    /**
     * Get app configuration
     */
    async getConfig() {
        return { ...this.appConfig };
    }
    /** Reconciles account entitlement metadata with device-local package state. */
    async reconcileInstalledFeaturePackages(runtimes) {
        if (runtimes.length === 0)
            return this.getConfig();
        const reconcileProfile = (value) => {
            const profile = value && typeof value === 'object' && !Array.isArray(value)
                ? { ...createGuestFeatureProfile(), ...value }
                : createGuestFeatureProfile();
            const installedPackageIds = Array.isArray(profile.installedPackageIds)
                ? profile.installedPackageIds.filter((item) => typeof item === 'string')
                : [];
            const records = Array.isArray(profile.packageInstallRecords)
                ? profile.packageInstallRecords.filter((item) => item && typeof item === 'object')
                : [];
            for (const runtime of runtimes) {
                if (!installedPackageIds.includes(runtime.packageId))
                    installedPackageIds.push(runtime.packageId);
                const existing = [...records].reverse().find(record => record.packageId === runtime.packageId);
                const record = {
                    ...(existing ?? {}),
                    packageId: runtime.packageId,
                    artifactId: existing?.artifactId || `${runtime.packageId}.installed-runtime`,
                    version: runtime.version,
                    state: 'installed',
                    installedPath: runtime.installedPath,
                    installedAt: existing?.installedAt || new Date().toISOString(),
                };
                // Device state is authoritative and has one current runtime version.
                // Remove stale duplicate records so resolution cannot accidentally
                // compare the catalog against an older or failed install entry.
                const retainedRecords = records.filter(candidate => candidate.packageId !== runtime.packageId);
                records.splice(0, records.length, ...retainedRecords, record);
            }
            return {
                ...profile,
                installedPackageIds,
                packageInstallRecords: records,
            };
        };
        const nextProfile = reconcileProfile(this.appConfig.featureProfile);
        const accounts = normalizeFeatureAccounts(this.appConfig.featureAccounts);
        const nextAccounts = Object.fromEntries(Object.entries(accounts).map(([key, profile]) => [
            key,
            reconcileProfile(profile),
        ]));
        const currentState = JSON.stringify({
            featureProfile: this.appConfig.featureProfile,
            featureAccounts: accounts,
        });
        const nextState = JSON.stringify({
            featureProfile: nextProfile,
            featureAccounts: nextAccounts,
        });
        if (currentState === nextState)
            return this.getConfig();
        const update = await this.setConfig({
            featureProfile: nextProfile,
            featureAccounts: nextAccounts,
        });
        return update.config;
    }
    /**
     * Update app configuration
     */
    async setConfig(config) {
        return this.enqueueWrite(async () => {
            const safeConfig = { ...config };
            // Platform credentials belong in the OS keychain. Preserve the field as
            // an empty compatibility value so legacy plaintext tokens are removed.
            if (Object.prototype.hasOwnProperty.call(safeConfig, 'platformAccessToken')) {
                safeConfig.platformAccessToken = '';
            }
            this.appConfig = {
                ...this.appConfig,
                ...safeConfig,
            };
            this.appConfig = migrateFeatureProfile(this.appConfig);
            this.configVersion += 1;
            this.store.set('config', this.appConfig);
            this.store.set('metadata', this.getMetadata());
            return {
                config: { ...this.appConfig },
                version: this.configVersion,
                updatedAt: Date.now(),
            };
        });
    }
    /**
     * Get app state
     */
    async getState() {
        return { ...this.currentState };
    }
    /**
     * Set app state
     */
    async setState(state) {
        return this.enqueueWrite(async () => {
            this.currentState = {
                ...this.currentState,
                ...state,
            };
            this.stateVersion += 1;
            this.store.set('state', this.currentState);
            this.store.set('metadata', this.getMetadata());
            return {
                state: { ...this.currentState },
                version: this.stateVersion,
                updatedAt: Date.now(),
            };
        });
    }
    /**
     * Get specific config value
     */
    getConfigValue(key) {
        return this.appConfig[key];
    }
    /**
     * Set specific config value
     */
    async setConfigValue(key, value) {
        return this.setConfig({ [key]: value });
    }
    /**
     * Get specific state value
     */
    getStateValue(key) {
        return this.currentState[key];
    }
    /**
     * Set specific state value
     */
    async setStateValue(key, value) {
        return this.setState({ [key]: value });
    }
    /**
     * Reset config to defaults
     */
    async resetConfig() {
        return this.setConfig({
            llmProvider: 'codeagent',
            baseUrl: 'http://127.0.0.1:14321/v1',
            model: DEFAULT_OFFLINE_AGENT_MODEL,
            temperature: 0.7,
            maxTokens: 2048,
            contextTokens: 8192,
            enableLlmTools: false,
            disabledLlmTools: [],
            toolPermissionPolicies: {},
            desktopPermissionProfile: 'workspace-only',
            theme: 'system',
            accentColor: 'blue',
            language: 'en',
            featureProfile: createGuestFeatureProfile(),
            featureAccounts: {},
        });
    }
    /**
     * Reset state
     */
    async resetState() {
        return this.enqueueWrite(async () => {
            this.currentState = {};
            this.stateVersion += 1;
            this.store.set('state', this.currentState);
            this.store.set('metadata', this.getMetadata());
            return {
                state: {},
                version: this.stateVersion,
                updatedAt: Date.now(),
            };
        });
    }
    /**
     * Clear all data
     */
    async clearAll() {
        await this.enqueueWrite(async () => {
            this.store.clear();
            this.configVersion += 1;
            this.stateVersion += 1;
            this._loadFromStore();
            this.store.set('metadata', this.getMetadata());
        });
    }
    /**
     * Load data from store
     */
    _loadFromStore() {
        try {
            const storedConfig = this.store.get('config');
            if (storedConfig) {
                this.appConfig = { ...this.appConfig, ...storedConfig };
            }
            const metadata = this.store.get('metadata');
            this.defaultAgentModelMigrated = metadata?.defaultAgentModelMigrated === true;
            if (!this.defaultAgentModelMigrated) {
                if (this.appConfig.llmProvider === 'codeagent' && this.appConfig.model === LEGACY_OFFLINE_MODEL) {
                    this.appConfig = { ...this.appConfig, model: DEFAULT_OFFLINE_AGENT_MODEL };
                }
                this.defaultAgentModelMigrated = true;
            }
            this.appConfig = migrateFeatureProfile(this.appConfig);
            this.store.set('config', this.appConfig);
            const storedState = this.store.get('state');
            if (storedState) {
                this.currentState = storedState;
            }
            if (metadata) {
                this.configVersion = Number(metadata.configVersion ?? 0);
                this.stateVersion = Number(metadata.stateVersion ?? 0);
            }
            this.store.set('metadata', this.getMetadata());
        }
        catch (error) {
            console.warn('Failed to load from store:', error);
        }
    }
    /**
     * Export all data
     */
    async exportData() {
        return {
            config: { ...this.appConfig },
            state: { ...this.currentState },
        };
    }
    /**
     * Import data
     */
    async importData(data) {
        await this.enqueueWrite(async () => {
            if (data.config) {
                this.appConfig = { ...this.appConfig, ...data.config };
                this.appConfig = migrateFeatureProfile(this.appConfig);
                this.configVersion += 1;
                this.store.set('config', this.appConfig);
            }
            if (data.state) {
                this.currentState = data.state;
                this.stateVersion += 1;
                this.store.set('state', this.currentState);
            }
            this.store.set('metadata', this.getMetadata());
        });
    }
    /**
     * Get store instance (for advanced usage)
     */
    getStore() {
        return this.store;
    }
    getConfigVersion() {
        return this.configVersion;
    }
    getStateVersion() {
        return this.stateVersion;
    }
    getMetadata() {
        return {
            configVersion: this.configVersion,
            stateVersion: this.stateVersion,
            defaultAgentModelMigrated: this.defaultAgentModelMigrated,
        };
    }
    async enqueueWrite(operation) {
        const run = this.writeQueue.then(operation, operation);
        this.writeQueue = run.then(() => undefined, () => undefined);
        return run;
    }
}
exports.AppStateServiceBridge = AppStateServiceBridge;
//# sourceMappingURL=app-state-service-bridge.js.map