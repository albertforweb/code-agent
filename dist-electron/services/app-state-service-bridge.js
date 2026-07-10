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
/**
 * App State Service Bridge - manages app config and state
 */
class AppStateServiceBridge {
    constructor() {
        this.currentState = {};
        this.configVersion = 0;
        this.stateVersion = 0;
        this.writeQueue = Promise.resolve();
        this.appConfig = {
            llmProvider: 'openai-compatible',
            baseUrl: 'http://127.0.0.1:1234/v1',
            model: 'local-model',
            temperature: 0.7,
            maxTokens: 2048,
            contextTokens: 8192,
            enableLlmTools: false,
            disabledLlmTools: [],
            toolPermissionPolicies: {},
            theme: 'system',
            accentColor: 'blue',
            language: 'en',
        };
        // Initialize electron-store for persistent storage
        this.store = new electron_store_1.default({
            name: 'code-agent',
            defaults: {
                config: this.appConfig,
                state: {},
                metadata: {
                    configVersion: 0,
                    stateVersion: 0,
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
    /**
     * Update app configuration
     */
    async setConfig(config) {
        return this.enqueueWrite(async () => {
            this.appConfig = {
                ...this.appConfig,
                ...config,
            };
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
            llmProvider: 'openai-compatible',
            baseUrl: 'http://127.0.0.1:1234/v1',
            model: 'local-model',
            temperature: 0.7,
            maxTokens: 2048,
            contextTokens: 8192,
            enableLlmTools: false,
            disabledLlmTools: [],
            toolPermissionPolicies: {},
            theme: 'system',
            language: 'en',
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
            const storedState = this.store.get('state');
            if (storedState) {
                this.currentState = storedState;
            }
            const metadata = this.store.get('metadata');
            if (metadata) {
                this.configVersion = Number(metadata.configVersion ?? 0);
                this.stateVersion = Number(metadata.stateVersion ?? 0);
            }
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