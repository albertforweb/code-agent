/**
 * Service Bridge - App State Service
 * Bridges app configuration and state to IPC channels
 * Handles persistent storage via electron-store
 */

import type { AppConfig } from '../types';
import Store from 'electron-store';

/**
 * App State Service Bridge - manages app config and state
 */
export class AppStateServiceBridge {
  private store: Store;
  private currentState: any = {};
  private appConfig: AppConfig = {
    model: 'claude-3-5-sonnet-20241022',
    temperature: 0.7,
    maxTokens: 4096,
    theme: 'system',
    language: 'en',
  };

  constructor() {
    // Initialize electron-store for persistent storage
    this.store = new Store({
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
  async getConfig(): Promise<AppConfig> {
    return { ...this.appConfig };
  }

  /**
   * Update app configuration
   */
  async setConfig(config: Partial<AppConfig>): Promise<void> {
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
  async getState(): Promise<any> {
    return { ...this.currentState };
  }

  /**
   * Set app state
   */
  async setState(state: any): Promise<void> {
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
  getConfigValue(key: keyof AppConfig): any {
    return this.appConfig[key];
  }

  /**
   * Set specific config value
   */
  async setConfigValue(key: keyof AppConfig, value: any): Promise<void> {
    this.appConfig[key] = value;
    this.store.set('config', this.appConfig);
  }

  /**
   * Get specific state value
   */
  getStateValue(key: string): any {
    return this.currentState[key];
  }

  /**
   * Set specific state value
   */
  async setStateValue(key: string, value: any): Promise<void> {
    this.currentState[key] = value;
    this.store.set('state', this.currentState);
  }

  /**
   * Reset config to defaults
   */
  async resetConfig(): Promise<void> {
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
  async resetState(): Promise<void> {
    this.currentState = {};
    this.store.set('state', this.currentState);
  }

  /**
   * Clear all data
   */
  async clearAll(): Promise<void> {
    this.store.clear();
    this._loadFromStore();
  }

  /**
   * Load data from store
   */
  private _loadFromStore(): void {
    try {
      const storedConfig = this.store.get('config');
      if (storedConfig) {
        this.appConfig = { ...this.appConfig, ...storedConfig };
      }

      const storedState = this.store.get('state');
      if (storedState) {
        this.currentState = storedState;
      }
    } catch (error) {
      console.warn('Failed to load from store:', error);
    }
  }

  /**
   * Export all data
   */
  async exportData(): Promise<{ config: AppConfig; state: any }> {
    return {
      config: { ...this.appConfig },
      state: { ...this.currentState },
    };
  }

  /**
   * Import data
   */
  async importData(data: { config?: AppConfig; state?: any }): Promise<void> {
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
  getStore(): Store {
    return this.store;
  }
}
