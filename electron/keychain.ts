/**
 * OS keychain wrapper for provider-scoped API tokens.
 */

import type { LlmProviderType } from './types';

interface KeytarLike {
  getPassword(service: string, account: string): Promise<string | null>;
  setPassword(service: string, account: string, password: string): Promise<void>;
  deletePassword(service: string, account: string): Promise<boolean>;
}

const PROVIDERS: LlmProviderType[] = ['openai', 'openai-compatible'];

export class KeychainService {
  private readonly serviceName = 'code-agent';
  private readonly keytar: KeytarLike | null;

  constructor(keytar?: KeytarLike | null) {
    this.keytar = keytar ?? this.loadKeytar();
  }

  hasKeychain(): boolean {
    return Boolean(this.keytar);
  }

  async getToken(provider: LlmProviderType): Promise<string | null> {
    if (!this.keytar) {
      return null;
    }

    const token = await this.keytar.getPassword(this.serviceName, this.getProviderKey(provider));
    if (token) {
      return token;
    }

    return null;
  }

  async setToken(provider: LlmProviderType, token: string): Promise<void> {
    if (!this.keytar) {
      return;
    }

    await this.keytar.setPassword(this.serviceName, this.getProviderKey(provider), token);
  }

  async deleteToken(provider?: LlmProviderType): Promise<void> {
    if (!this.keytar) {
      return;
    }

    const providers = provider ? [provider] : PROVIDERS;
    for (const providerName of providers) {
      await this.keytar.deletePassword(this.serviceName, this.getProviderKey(providerName));
    }
  }

  private getProviderKey(provider: LlmProviderType): string {
    return `llm-api-key-${provider}`;
  }

  private loadKeytar(): KeytarLike | null {
    try {
      // Optional native dependency; keep Electron startup working when unavailable.
      return require('keytar');
    } catch {
      return null;
    }
  }
}
