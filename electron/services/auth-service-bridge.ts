/**
 * Service Bridge - Authentication Service
 * Bridges authentication operations to IPC channels
 * Handles token management, OAuth flow, and keychain access
 */

import type { AuthToken, LlmProviderType } from '../types';
import { KeychainService } from '../keychain';

/**
 * Auth Service Bridge - bridges auth operations to IPC
 */
export class AuthServiceBridge {
  private currentTokens: Map<LlmProviderType, AuthToken> = new Map();
  private oauth2Config: any = null;
  private keychain: KeychainService;

  constructor(keytar?: any) {
    this.keychain = new KeychainService(keytar);
  }

  /**
   * Get current authentication token
   */
  async getToken(provider: LlmProviderType = 'openai-compatible'): Promise<AuthToken | null> {
    const memoryToken = this.currentTokens.get(provider);
    if (memoryToken) {
      return memoryToken;
    }

    try {
      const keychainToken = await this.keychain.getToken(provider);
      if (keychainToken) {
        return {
          accessToken: keychainToken,
          provider,
        };
      }
    } catch (error) {
      console.warn('Failed to retrieve token from keychain:', error);
    }

    const environmentToken = this.getEnvironmentToken(provider);
    if (environmentToken) {
      return {
        accessToken: environmentToken,
        provider,
      };
    }

    return null;
  }

  /**
   * Set authentication token (stores securely in keychain if available)
   */
  async setToken(token: AuthToken): Promise<void> {
    const provider = token.provider ?? 'openai-compatible';
    this.currentTokens.set(provider, { ...token, provider });

    try {
      if (token.accessToken) {
        await this.keychain.setToken(provider, token.accessToken);
      }
    } catch (error) {
      console.warn('Failed to store token in keychain:', error);
    }
  }

  /**
   * Logout - clear token from memory and keychain
   */
  async logout(provider?: LlmProviderType): Promise<void> {
    const providers: LlmProviderType[] = provider
      ? [provider]
      : ['openai', 'openai-compatible'];

    for (const providerName of providers) {
      this.currentTokens.delete(providerName);
    }

    try {
      await this.keychain.deleteToken(provider);
    } catch (error) {
      console.warn('Failed to delete token from keychain:', error);
    }
  }

  /**
   * Start OAuth flow
   */
  async startOAuthFlow(): Promise<{ authUrl: string; codeVerifier: string }> {
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
  async exchangeCodeForToken(code: string, codeVerifier: string): Promise<AuthToken> {
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

      const data = await response.json() as any;

      const token: AuthToken = {
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        expiresAt: Date.now() + (data.expires_in * 1000),
      };

      await this.setToken(token);
      return token;
    } catch (error) {
      throw new Error(`Failed to exchange code for token: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Refresh access token
   */
  async refreshToken(): Promise<AuthToken> {
    const currentToken = this.currentTokens.get('openai') ?? this.currentTokens.get('openai-compatible');
    if (!currentToken?.refreshToken) {
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
          refresh_token: currentToken.refreshToken,
          client_id: this.oauth2Config.clientId,
          client_secret: this.oauth2Config.clientSecret,
        }).toString(),
      });

      if (!response.ok) {
        throw new Error(`OAuth error: ${response.statusText}`);
      }

      const data = await response.json() as any;

      const token: AuthToken = {
        accessToken: data.access_token,
        refreshToken: data.refresh_token || currentToken.refreshToken,
        expiresAt: Date.now() + (data.expires_in * 1000),
        provider: currentToken.provider ?? 'openai-compatible',
      };

      await this.setToken(token);
      return token;
    } catch (error) {
      throw new Error(`Failed to refresh token: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Check if token is valid and not expired
   */
  isTokenValid(): boolean {
    const currentToken = this.currentTokens.get('openai') ?? this.currentTokens.get('openai-compatible');
    if (!currentToken) {
      return false;
    }

    if (currentToken.expiresAt && Date.now() > currentToken.expiresAt) {
      return false;
    }

    return true;
  }

  /**
   * Configure OAuth2
   */
  setOAuth2Config(config: any): void {
    this.oauth2Config = config;
  }

  getStatus() {
    return {
      hasMemoryToken: this.currentTokens.size > 0,
      hasKeychain: this.keychain.hasKeychain(),
      hasEnvironmentToken: Boolean(
        process.env.OPENAI_API_KEY ||
        process.env.OPENAI_COMPATIBLE_API_KEY ||
        process.env.LM_STUDIO_API_KEY,
      ),
    };
  }

  private getEnvironmentToken(provider: LlmProviderType): string | undefined {
    if (provider === 'openai') {
      return process.env.OPENAI_API_KEY;
    }

    return process.env.OPENAI_COMPATIBLE_API_KEY || process.env.LM_STUDIO_API_KEY;
  }

  /**
   * Generate PKCE code verifier
   */
  private _generateCodeVerifier(): string {
    return this._generateRandomString(128);
  }

  /**
   * Generate PKCE code challenge from verifier
   */
  private async _generateCodeChallenge(verifier: string): Promise<string> {
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
  private _generateRandomString(length: number): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }
}
