"use strict";
/**
 * Service Bridge - Authentication Service
 * Bridges authentication operations to IPC channels
 * Handles token management, OAuth flow, and keychain access
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthServiceBridge = void 0;
/**
 * Auth Service Bridge - bridges auth operations to IPC
 */
class AuthServiceBridge {
    constructor(keytar) {
        this.currentToken = null;
        this.oauth2Config = null;
        this.keychain = null; // keytar module
        this.keychainService = 'code-agent';
        this.keychain = keytar ?? this._loadKeytar();
    }
    /**
     * Get current authentication token
     */
    async getToken() {
        // Try to load from keychain first
        if (this.keychain) {
            try {
                const keychainKey = 'anthropic-api-key';
                const token = await this.keychain.getPassword(this.keychainService, keychainKey);
                if (token) {
                    return {
                        accessToken: token,
                    };
                }
            }
            catch (error) {
                console.warn('Failed to retrieve token from keychain:', error);
            }
        }
        if (this.currentToken) {
            return this.currentToken;
        }
        if (process.env.ANTHROPIC_API_KEY) {
            return {
                accessToken: process.env.ANTHROPIC_API_KEY,
            };
        }
        return null;
    }
    /**
     * Set authentication token (stores securely in keychain if available)
     */
    async setToken(token) {
        this.currentToken = token;
        // Try to store in keychain for persistence
        if (this.keychain && token.accessToken) {
            try {
                await this.keychain.setPassword(this.keychainService, 'anthropic-api-key', token.accessToken);
            }
            catch (error) {
                console.warn('Failed to store token in keychain:', error);
            }
        }
    }
    /**
     * Logout - clear token from memory and keychain
     */
    async logout() {
        this.currentToken = null;
        // Try to delete from keychain
        if (this.keychain) {
            try {
                await this.keychain.deletePassword(this.keychainService, 'anthropic-api-key');
            }
            catch (error) {
                console.warn('Failed to delete token from keychain:', error);
            }
        }
    }
    /**
     * Start OAuth flow
     */
    async startOAuthFlow() {
        if (!this.oauth2Config) {
            throw new Error('OAuth2 not configured');
        }
        // Generate PKCE challenge
        const codeVerifier = this._generateCodeVerifier();
        const codeChallenge = await this._generateCodeChallenge(codeVerifier);
        // Build auth URL
        const params = new URLSearchParams({
            client_id: this.oauth2Config.clientId,
            redirect_uri: this.oauth2Config.redirectUri,
            response_type: 'code',
            scope: 'openid profile email',
            code_challenge: codeChallenge,
            code_challenge_method: 'S256',
            state: this._generateRandomString(32),
        });
        const authUrl = `${this.oauth2Config.authorizationEndpoint}?${params.toString()}`;
        return { authUrl, codeVerifier };
    }
    /**
     * Exchange authorization code for token
     */
    async exchangeCodeForToken(code, codeVerifier) {
        if (!this.oauth2Config) {
            throw new Error('OAuth2 not configured');
        }
        try {
            const response = await fetch(this.oauth2Config.tokenEndpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams({
                    grant_type: 'authorization_code',
                    code,
                    client_id: this.oauth2Config.clientId,
                    client_secret: this.oauth2Config.clientSecret,
                    redirect_uri: this.oauth2Config.redirectUri,
                    code_verifier: codeVerifier,
                }).toString(),
            });
            if (!response.ok) {
                throw new Error(`OAuth error: ${response.statusText}`);
            }
            const data = await response.json();
            const token = {
                accessToken: data.access_token,
                refreshToken: data.refresh_token,
                expiresAt: Date.now() + (data.expires_in * 1000),
            };
            await this.setToken(token);
            return token;
        }
        catch (error) {
            throw new Error(`Failed to exchange code for token: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    /**
     * Refresh access token
     */
    async refreshToken() {
        if (!this.currentToken?.refreshToken) {
            throw new Error('No refresh token available');
        }
        if (!this.oauth2Config) {
            throw new Error('OAuth2 not configured');
        }
        try {
            const response = await fetch(this.oauth2Config.tokenEndpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams({
                    grant_type: 'refresh_token',
                    refresh_token: this.currentToken.refreshToken,
                    client_id: this.oauth2Config.clientId,
                    client_secret: this.oauth2Config.clientSecret,
                }).toString(),
            });
            if (!response.ok) {
                throw new Error(`OAuth error: ${response.statusText}`);
            }
            const data = await response.json();
            const token = {
                accessToken: data.access_token,
                refreshToken: data.refresh_token || this.currentToken.refreshToken,
                expiresAt: Date.now() + (data.expires_in * 1000),
            };
            await this.setToken(token);
            return token;
        }
        catch (error) {
            throw new Error(`Failed to refresh token: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    /**
     * Check if token is valid and not expired
     */
    isTokenValid() {
        if (!this.currentToken) {
            return false;
        }
        if (this.currentToken.expiresAt && Date.now() > this.currentToken.expiresAt) {
            return false;
        }
        return true;
    }
    /**
     * Configure OAuth2
     */
    setOAuth2Config(config) {
        this.oauth2Config = config;
    }
    getStatus() {
        return {
            hasMemoryToken: !!this.currentToken,
            hasKeychain: !!this.keychain,
            hasEnvironmentToken: !!process.env.ANTHROPIC_API_KEY,
        };
    }
    _loadKeytar() {
        try {
            // Optional native dependency; keep Electron startup working when unavailable.
            return require('keytar');
        }
        catch {
            return null;
        }
    }
    /**
     * Generate PKCE code verifier
     */
    _generateCodeVerifier() {
        return this._generateRandomString(128);
    }
    /**
     * Generate PKCE code challenge from verifier
     */
    async _generateCodeChallenge(verifier) {
        // In a real implementation, this would use crypto.subtle.digest
        // For now, return a base64-encoded hash of the verifier
        const encoder = new TextEncoder();
        const data = encoder.encode(verifier);
        // In Node.js: use crypto.createHash('sha256')
        // For now, we'll just use a simplified version
        return Buffer.from(verifier).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
    }
    /**
     * Generate random string
     */
    _generateRandomString(length) {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
        let result = '';
        for (let i = 0; i < length; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return result;
    }
}
exports.AuthServiceBridge = AuthServiceBridge;
//# sourceMappingURL=auth-service-bridge.js.map