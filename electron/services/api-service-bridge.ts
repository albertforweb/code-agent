/**
 * Service Bridge - API Service
 * Bridges Anthropic SDK and API operations to IPC channels
 * Handles chat, bootstrap data, and API calls
 */

import type { ChatRequest, ChatResponse, BootstrapData } from '../types';
import Anthropic from '@anthropic-ai/sdk';
import type { AuthToken } from '../types';

type AuthTokenProvider = () => Promise<AuthToken | null>;
type BootstrapProvider = () => Promise<BootstrapData>;
type ChatStreamHandlers = {
  onDelta?: (delta: string) => void;
};

/**
 * API Service Bridge - bridges API operations to IPC
 */
export class ApiServiceBridge {
  private apiClient: any;
  private authTokenProvider: AuthTokenProvider | null = null;
  private bootstrapProvider: BootstrapProvider | null = null;
  private bootstrapData: BootstrapData | null = null;
  private bootstrapFetchTime: number = 0;
  private bootstrapCacheTTL: number = 1000 * 60 * 60; // 1 hour

  constructor(apiClient?: any) {
    this.apiClient = apiClient ?? null;
  }

  /**
   * Send a chat message and get response
   */
  async chat(request: ChatRequest): Promise<ChatResponse> {
    const client = await this.getApiClient();

    const startTime = Date.now();

    try {
      // Build the request
      const response = await client.messages.create({
        model: request.model || 'claude-3-5-sonnet-20241022',
        max_tokens: request.maxTokens || 4096,
        system: this._buildSystemPrompt(),
        messages: request.messages,
        temperature: request.temperature,
      });

      const content = this.extractTextContent(response);

      return {
        content,
        model: response.model,
        usage: {
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens,
        },
      };
    } catch (error) {
      throw new Error(`API Error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Send a chat message and stream text deltas while collecting the final response.
   */
  async streamChat(request: ChatRequest, handlers: ChatStreamHandlers = {}): Promise<ChatResponse> {
    const client = await this.getApiClient();

    try {
      const stream = client.messages.stream({
        model: request.model || 'claude-3-5-sonnet-20241022',
        max_tokens: request.maxTokens || 4096,
        system: this._buildSystemPrompt(),
        messages: request.messages,
        temperature: request.temperature,
      });

      stream.on('text', (textDelta: string) => {
        handlers.onDelta?.(textDelta);
      });

      const response = await stream.finalMessage();

      return {
        content: this.extractTextContent(response),
        model: response.model,
        usage: {
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens,
        },
      };
    } catch (error) {
      throw new Error(`API Stream Error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Fetch bootstrap data (user info, features, config)
   */
  async fetchBootstrap(): Promise<BootstrapData> {
    // Check cache
    const now = Date.now();
    if (this.bootstrapData && now - this.bootstrapFetchTime < this.bootstrapCacheTTL) {
      return this.bootstrapData;
    }

    try {
      const data = this.bootstrapProvider
        ? await this.bootstrapProvider()
        : await this.buildLocalBootstrapData();

      this.bootstrapData = data;
      this.bootstrapFetchTime = now;

      return data;
    } catch (error) {
      throw new Error(`Bootstrap Error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Build system prompt for Claude
   */
  private _buildSystemPrompt(): string {
    return `You are Code Agent, a powerful AI assistant for software development.
    
You have access to multiple tools and can execute code, analyze files, and help with various programming tasks.

Always be helpful, thorough, and provide clear explanations.`;
  }

  /**
   * Set API client (for dependency injection)
   */
  setApiClient(client: any): void {
    this.apiClient = client;
  }

  setAuthTokenProvider(provider: AuthTokenProvider): void {
    this.authTokenProvider = provider;
    this.apiClient = null;
  }

  setBootstrapProvider(provider: BootstrapProvider): void {
    this.bootstrapProvider = provider;
    this.clearBootstrapCache();
  }

  /**
   * Clear bootstrap cache
   */
  clearBootstrapCache(): void {
    this.bootstrapData = null;
    this.bootstrapFetchTime = 0;
  }

  /**
   * Check if API is configured
   */
  isConfigured(): boolean {
    return !!this.apiClient || !!this.authTokenProvider || !!process.env.ANTHROPIC_API_KEY;
  }

  /**
   * Get API configuration status
   */
  getStatus() {
    return {
      configured: this.isConfigured(),
      bootstrapCached: !!this.bootstrapData,
      cacheAge: this.bootstrapData ? Date.now() - this.bootstrapFetchTime : null,
    };
  }

  private async getApiClient(): Promise<any> {
    if (this.apiClient) {
      return this.apiClient;
    }

    const token = await this.authTokenProvider?.();
    const apiKey = token?.accessToken || process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error('API client not initialized: configure an Anthropic API key first');
    }

    this.apiClient = new Anthropic({ apiKey });
    return this.apiClient;
  }

  private extractTextContent(response: any): string {
    return Array.isArray(response.content)
      ? response.content
        .filter((block: any) => block?.type === 'text')
        .map((block: any) => block.text)
        .join('')
      : '';
  }

  private async buildLocalBootstrapData(): Promise<BootstrapData> {
    const token = await this.authTokenProvider?.();
    return {
      user: {
        authenticated: Boolean(token?.accessToken || process.env.ANTHROPIC_API_KEY),
      },
      config: {
        model: 'claude-3-5-sonnet-20241022',
        temperature: 0.7,
        maxTokens: 4096,
      },
      features: {
        tools: true,
        mcp: true,
        proactive: false,
        buddy: false,
      },
    };
  }
}
