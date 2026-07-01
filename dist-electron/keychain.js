"use strict";
/**
 * OS keychain wrapper for provider-scoped API tokens.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.KeychainService = void 0;
const PROVIDERS = ['openai', 'openai-compatible'];
class KeychainService {
    constructor(keytar) {
        this.serviceName = 'code-agent';
        this.keytar = keytar ?? this.loadKeytar();
    }
    hasKeychain() {
        return Boolean(this.keytar);
    }
    async getToken(provider) {
        if (!this.keytar) {
            return null;
        }
        const token = await this.keytar.getPassword(this.serviceName, this.getProviderKey(provider));
        if (token) {
            return token;
        }
        return null;
    }
    async setToken(provider, token) {
        if (!this.keytar) {
            return;
        }
        await this.keytar.setPassword(this.serviceName, this.getProviderKey(provider), token);
    }
    async deleteToken(provider) {
        if (!this.keytar) {
            return;
        }
        const providers = provider ? [provider] : PROVIDERS;
        for (const providerName of providers) {
            await this.keytar.deletePassword(this.serviceName, this.getProviderKey(providerName));
        }
    }
    getProviderKey(provider) {
        return `llm-api-key-${provider}`;
    }
    loadKeytar() {
        try {
            // Optional native dependency; keep Electron startup working when unavailable.
            return require('keytar');
        }
        catch {
            return null;
        }
    }
}
exports.KeychainService = KeychainService;
//# sourceMappingURL=keychain.js.map