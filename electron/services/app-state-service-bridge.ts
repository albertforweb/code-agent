/**
 * Service Bridge - App State Service
 * Bridges app configuration and state to IPC channels
 * Handles persistent storage via electron-store
 */

import type { AppConfig, AppConfigChangedMessage, AppStateChangedMessage } from '../types';
import Store from 'electron-store';

interface AppStateStoreSchema {
  config: AppConfig;
  state: Record<string, any>;
  metadata: {
    configVersion: number;
    stateVersion: number;
  };
}

/**
 * App State Service Bridge - manages app config and state
 */
export class AppStateServiceBridge {
  private store: Store<AppStateStoreSchema>;
  private currentState: Record<string, any> = {};
  private configVersion: number = 0;
  private stateVersion: number = 0;
  private writeQueue: Promise<void> = Promise.resolve();
  private appConfig: AppConfig = {
    llmProvider: 'anthropic',
    baseUrl: '',
    model: 'claude-3-5-sonnet-20241022',
    temperature: 0.7,
    maxTokens: 4096,
    contextTokens: 200000,
    enableLlmTools: false,
    disabledLlmTools: [],
    toolPermissionPolicies: {},
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
  async getConfig(): Promise<AppConfig> {
    return { ...this.appConfig };
  }

  /**
   * Update app configuration
   */
  async setConfig(config: Partial<AppConfig>): Promise<AppConfigChangedMessage> {
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
  async getState(): Promise<any> {
    return { ...this.currentState };
  }

  /**
   * Set app state
   */
  async setState(state: any): Promise<AppStateChangedMessage> {
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
  getConfigValue(key: keyof AppConfig): any {
    return this.appConfig[key];
  }

  /**
   * Set specific config value
   */
  async setConfigValue(key: keyof AppConfig, value: any): Promise<AppConfigChangedMessage> {
    return this.setConfig({ [key]: value } as Partial<AppConfig>);
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
  async setStateValue(key: string, value: any): Promise<AppStateChangedMessage> {
    return this.setState({ [key]: value });
  }

  /**
   * Reset config to defaults
   */
  async resetConfig(): Promise<AppConfigChangedMessage> {
    return this.setConfig({
      llmProvider: 'anthropic',
      baseUrl: '',
      model: 'claude-3-5-sonnet-20241022',
      temperature: 0.7,
      maxTokens: 4096,
      contextTokens: 200000,
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
  async resetState(): Promise<AppStateChangedMessage> {
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
  async clearAll(): Promise<void> {
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

      const metadata = this.store.get('metadata');
      if (metadata) {
        this.configVersion = Number(metadata.configVersion ?? 0);
        this.stateVersion = Number(metadata.stateVersion ?? 0);
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
  getStore(): Store<AppStateStoreSchema> {
    return this.store;
  }

  getConfigVersion(): number {
    return this.configVersion;
  }

  getStateVersion(): number {
    return this.stateVersion;
  }

  private getMetadata(): AppStateStoreSchema['metadata'] {
    return {
      configVersion: this.configVersion,
      stateVersion: this.stateVersion,
    };
  }

  private async enqueueWrite<T>(operation: () => Promise<T> | T): Promise<T> {
    const run = this.writeQueue.then(operation, operation);
    this.writeQueue = run.then(() => undefined, () => undefined);
    return run;
  }
}
