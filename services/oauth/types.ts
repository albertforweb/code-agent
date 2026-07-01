/**
 * OAuth Types - Stub Implementation
 */

export interface OAuthConfig {
  clientId?: string;
  clientSecret?: string;
  redirectUrl?: string;
}

export interface OAuthToken {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
}

export type OAuthProvider = 'github' | 'google' | 'llmProvider';
