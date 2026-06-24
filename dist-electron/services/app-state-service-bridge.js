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
        this.appConfig = {
            model: 'claude-3-5-sonnet-20241022',
            temperature: 0.7,
            maxTokens: 4096,
            theme: 'system',
            language: 'en',
        };
        // Initialize electron-store for persistent storage
        this.store = new electron_store_1.default({
            name: 'code-agent',
            defaults: {
                config: this.appConfig,
                state: {},
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
        // Merge with existing config
        this.appConfig = {
            ...this.appConfig,
            ...config,
        };
        // Persist to store
        this.store.set('config', this.appConfig);
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
        // Merge with existing state
        this.currentState = {
            ...this.currentState,
            ...state,
        };
        // Persist to store
        this.store.set('state', this.currentState);
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
        this.appConfig[key] = value;
        this.store.set('config', this.appConfig);
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
        this.currentState[key] = value;
        this.store.set('state', this.currentState);
    }
    /**
     * Reset config to defaults
     */
    async resetConfig() {
        this.appConfig = {
            model: 'claude-3-5-sonnet-20241022',
            temperature: 0.7,
            maxTokens: 4096,
            theme: 'system',
            language: 'en',
        };
        this.store.set('config', this.appConfig);
    }
    /**
     * Reset state
     */
    async resetState() {
        this.currentState = {};
        this.store.set('state', this.currentState);
    }
    /**
     * Clear all data
     */
    async clearAll() {
        this.store.clear();
        this._loadFromStore();
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
        if (data.config) {
            this.appConfig = { ...this.appConfig, ...data.config };
            this.store.set('config', this.appConfig);
        }
        if (data.state) {
            this.currentState = data.state;
            this.store.set('state', this.currentState);
        }
    }
    /**
     * Get store instance (for advanced usage)
     */
    getStore() {
        return this.store;
    }
}
exports.AppStateServiceBridge = AppStateServiceBridge;
//# sourceMappingURL=app-state-service-bridge.js.map