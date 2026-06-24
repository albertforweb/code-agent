/**
 * Service Bridge - API Service
 * Bridges LLM provider operations to IPC channels.
 */

import Anthropic from '@anthropic-ai/sdk';
import type {
  AppConfig,
  AuthToken,
  BootstrapData,
  ChatRequest,
  ChatResponse,
  LlmProviderType,
} from '../types';

type AuthTokenProvider = (provider?: LlmProviderType) => Promise<AuthToken | null>;
type BootstrapProvider = () => Promise<BootstrapData>;
type AppConfigProvider = () => Promise<AppConfig>;
type ChatStreamHandlers = {
  onDelta?: (delta: string) => void;
};

interface LlmRuntimeConfig {
  provider: LlmProviderType;
  baseUrl: string;
  model: string;
  maxTokens: number;
  temperature?: number;
  apiKey?: string;
}

const DEFAULT_MODELS: Record<LlmProviderType, string> = {
  anthropic: 'claude-3-5-sonnet-20241022',
  openai: 'gpt-4o-mini',
  'openai-compatible': 'local-model',
};

const DEFAULT_BASE_URLS: Record<LlmProviderType, string> = {
  anthropic: '',
  openai: 'https://api.openai.com/v1',
  'openai-compatible': 'http://127.0.0.1:1234/v1',
};

/**
 * API Service Bridge - bridges API operations to IPC.
 */
export class ApiServiceBridge {
  private apiClient: any;
  private authTokenProvider: AuthTokenProvider | null = null;
  private appConfigProvider: AppConfigProvider | null = null;
  private bootstrapProvider: BootstrapProvider | null = null;
  private bootstrapData: BootstrapData | null = null;
  private bootstrapFetchTime: number = 0;
  private bootstrapCacheTTL: number = 1000 * 60 * 60; // 1 hour

  constructor(apiClient?: any) {
    this.apiClient = apiClient ?? null;
  }

  /**
   * Send a chat message and get response.
   */
  async chat(request: ChatRequest): Promise<ChatResponse> {
    const config = await this.resolveRuntimeConfig(request);

    try {
      if (config.provider === 'anthropic') {
        return this.chatAnthropic(request, config);
      }

      return this.chatOpenAiCompatible(request, config);
    } catch (error) {
      throw new Error(`API Error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Send a chat message and stream text deltas while collecting the final response.
   */
  async streamChat(request: ChatRequest, handlers: ChatStreamHandlers = {}): Promise<ChatResponse> {
    const config = await this.resolveRuntimeConfig(request);

    try {
      if (config.provider === 'anthropic') {
        return this.streamAnthropic(request, config, handlers);
      }

      return this.streamOpenAiCompatible(request, config, handlers);
    } catch (error) {
      throw new Error(`API Stream Error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Fetch bootstrap data (user info, features, config).
   */
  async fetchBootstrap(): Promise<BootstrapData> {
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
   * Build system prompt for Code Agent.
   */
  private buildSystemPrompt(): string {
    return `You are Code Agent, a powerful AI assistant for software development.

You have access to multiple tools and can execute code, analyze files, and help with various programming tasks.

Always be helpful, thorough, and provide clear explanations.`;
  }

  /**
   * Set API client (for dependency injection).
   */
  setApiClient(client: any): void {
    this.apiClient = client;
  }

  setAuthTokenProvider(provider: AuthTokenProvider): void {
    this.authTokenProvider = provider;
    this.apiClient = null;
  }

  setAppConfigProvider(provider: AppConfigProvider): void {
    this.appConfigProvider = provider;
    this.apiClient = null;
    this.clearBootstrapCache();
  }

  setBootstrapProvider(provider: BootstrapProvider): void {
    this.bootstrapProvider = provider;
    this.clearBootstrapCache();
  }

  /**
   * Clear bootstrap cache.
   */
  clearBootstrapCache(): void {
    this.bootstrapData = null;
    this.bootstrapFetchTime = 0;
  }

  /**
   * Check if API is configured.
   */
  isConfigured(): boolean {
    return true;
  }

  /**
   * Get API configuration status.
   */
  getStatus() {
    return {
      configured: this.isConfigured(),
      bootstrapCached: !!this.bootstrapData,
      cacheAge: this.bootstrapData ? Date.now() - this.bootstrapFetchTime : null,
    };
  }

  private async chatAnthropic(request: ChatRequest, config: LlmRuntimeConfig): Promise<ChatResponse> {
    const client = this.getAnthropicClient(config);
    const response = await client.messages.create({
      model: config.model,
      max_tokens: config.maxTokens,
      system: this.buildSystemPrompt(),
      messages: request.messages,
      temperature: config.temperature,
    });

    return {
      content: this.extractAnthropicTextContent(response),
      model: response.model,
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      },
    };
  }

  private async streamAnthropic(
    request: ChatRequest,
    config: LlmRuntimeConfig,
    handlers: ChatStreamHandlers,
  ): Promise<ChatResponse> {
    const client = this.getAnthropicClient(config);
    const stream = client.messages.stream({
      model: config.model,
      max_tokens: config.maxTokens,
      system: this.buildSystemPrompt(),
      messages: request.messages,
      temperature: config.temperature,
    });

    stream.on('text', (textDelta: string) => {
      handlers.onDelta?.(textDelta);
    });

    const response = await stream.finalMessage();

    return {
      content: this.extractAnthropicTextContent(response),
      model: response.model,
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      },
    };
  }

  private async chatOpenAiCompatible(
    request: ChatRequest,
    config: LlmRuntimeConfig,
  ): Promise<ChatResponse> {
    const response = await fetch(this.getOpenAiChatCompletionsUrl(config.baseUrl), {
      method: 'POST',
      headers: this.getOpenAiHeaders(config),
      body: JSON.stringify({
        model: config.model,
        messages: this.toOpenAiMessages(request),
        max_tokens: config.maxTokens,
        temperature: config.temperature,
        stream: false,
      }),
    });

    if (!response.ok) {
      throw new Error(await this.formatOpenAiError(response));
    }

    const data = await response.json() as any;
    return {
      content: data.choices?.[0]?.message?.content ?? '',
      model: data.model || config.model,
      usage: {
        inputTokens: Number(data.usage?.prompt_tokens ?? 0),
        outputTokens: Number(data.usage?.completion_tokens ?? 0),
      },
    };
  }

  private async streamOpenAiCompatible(
    request: ChatRequest,
    config: LlmRuntimeConfig,
    handlers: ChatStreamHandlers,
  ): Promise<ChatResponse> {
    const response = await fetch(this.getOpenAiChatCompletionsUrl(config.baseUrl), {
      method: 'POST',
      headers: this.getOpenAiHeaders(config),
      body: JSON.stringify({
        model: config.model,
        messages: this.toOpenAiMessages(request),
        max_tokens: config.maxTokens,
        temperature: config.temperature,
        stream: true,
      }),
    });

    if (!response.ok) {
      throw new Error(await this.formatOpenAiError(response));
    }

    if (!response.body) {
      throw new Error('Streaming response did not include a response body');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let content = '';
    let inputTokens = 0;
    let outputTokens = 0;

    while (true) {
      const { value, done } = await reader.read();
      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const parsed = this.parseOpenAiStreamLine(line);
        if (!parsed) {
          continue;
        }

        if (parsed === '[DONE]') {
          continue;
        }

        const delta = parsed.choices?.[0]?.delta?.content ?? '';
        if (delta) {
          content += delta;
          handlers.onDelta?.(delta);
        }

        inputTokens = Number(parsed.usage?.prompt_tokens ?? inputTokens);
        outputTokens = Number(parsed.usage?.completion_tokens ?? outputTokens);
      }
    }

    if (buffer.trim()) {
      const parsed = this.parseOpenAiStreamLine(buffer);
      if (parsed && parsed !== '[DONE]') {
        const delta = parsed.choices?.[0]?.delta?.content ?? '';
        if (delta) {
          content += delta;
          handlers.onDelta?.(delta);
        }
      }
    }

    return {
      content,
      model: config.model,
      usage: {
        inputTokens,
        outputTokens,
      },
    };
  }

  private async resolveRuntimeConfig(request: ChatRequest): Promise<LlmRuntimeConfig> {
    const appConfig = await this.appConfigProvider?.();
    const provider = (request.provider || appConfig?.llmProvider || 'anthropic') as LlmProviderType;
    const token = await this.authTokenProvider?.(provider);
    const baseUrl = request.baseUrl || appConfig?.baseUrl || this.getDefaultBaseUrl(provider);

    const apiKey = token?.accessToken || this.getEnvironmentApiKey(provider);
    if (provider !== 'openai-compatible' && !apiKey) {
      throw new Error(`API client not initialized: configure an API key for ${this.getProviderLabel(provider)} first`);
    }

    return {
      provider,
      baseUrl,
      model: request.model || appConfig?.model || DEFAULT_MODELS[provider],
      maxTokens: Number(request.maxTokens ?? appConfig?.maxTokens ?? 4096),
      temperature: request.temperature ?? appConfig?.temperature,
      apiKey,
    };
  }

  private getAnthropicClient(config: LlmRuntimeConfig): any {
    if (this.apiClient && config.provider === 'anthropic') {
      return this.apiClient;
    }

    if (!config.apiKey) {
      throw new Error('API client not initialized: configure an API key for Anthropic first');
    }

    return new Anthropic({ apiKey: config.apiKey });
  }

  private extractAnthropicTextContent(response: any): string {
    return Array.isArray(response.content)
      ? response.content
        .filter((block: any) => block?.type === 'text')
        .map((block: any) => block.text)
        .join('')
      : '';
  }

  private toOpenAiMessages(request: ChatRequest): Array<{ role: string; content: string }> {
    return [
      { role: 'system', content: this.buildSystemPrompt() },
      ...request.messages.map(message => ({
        role: message.role,
        content: message.content,
      })),
    ];
  }

  private getOpenAiHeaders(config: LlmRuntimeConfig): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (config.apiKey) {
      headers.Authorization = `Bearer ${config.apiKey}`;
    }

    return headers;
  }

  private getOpenAiChatCompletionsUrl(baseUrl: string): string {
    const normalizedBaseUrl = baseUrl || DEFAULT_BASE_URLS['openai-compatible'];
    if (normalizedBaseUrl.endsWith('/chat/completions')) {
      return normalizedBaseUrl;
    }

    return `${normalizedBaseUrl.replace(/\/+$/, '')}/chat/completions`;
  }

  private parseOpenAiStreamLine(line: string): any | '[DONE]' | null {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith(':')) {
      return null;
    }

    const payload = trimmed.startsWith('data:')
      ? trimmed.slice('data:'.length).trim()
      : trimmed;

    if (!payload || payload === '[DONE]') {
      return payload === '[DONE]' ? '[DONE]' : null;
    }

    try {
      return JSON.parse(payload);
    } catch {
      return null;
    }
  }

  private async formatOpenAiError(response: Response): Promise<string> {
    const text = await response.text();
    if (!text) {
      return `${response.status} ${response.statusText}`;
    }

    try {
      const data = JSON.parse(text);
      return data.error?.message || text;
    } catch {
      return text;
    }
  }

  private getDefaultBaseUrl(provider: LlmProviderType): string {
    if (provider === 'openai-compatible') {
      return process.env.OPENAI_COMPATIBLE_BASE_URL ||
        process.env.LM_STUDIO_BASE_URL ||
        DEFAULT_BASE_URLS[provider];
    }

    return DEFAULT_BASE_URLS[provider];
  }

  private getEnvironmentApiKey(provider: LlmProviderType): string | undefined {
    if (provider === 'anthropic') {
      return process.env.ANTHROPIC_API_KEY;
    }

    if (provider === 'openai') {
      return process.env.OPENAI_API_KEY;
    }

    return process.env.OPENAI_COMPATIBLE_API_KEY || process.env.LM_STUDIO_API_KEY;
  }

  private getProviderLabel(provider: LlmProviderType): string {
    if (provider === 'openai-compatible') {
      return 'OpenAI-compatible';
    }

    return provider === 'openai' ? 'OpenAI' : 'Anthropic';
  }

  private async buildLocalBootstrapData(): Promise<BootstrapData> {
    const config = await this.appConfigProvider?.();
    const provider = (config?.llmProvider || 'anthropic') as LlmProviderType;
    const token = await this.authTokenProvider?.(provider);

    return {
      user: {
        authenticated: provider === 'openai-compatible' || Boolean(token?.accessToken || this.getEnvironmentApiKey(provider)),
      },
      config: {
        llmProvider: provider,
        baseUrl: config?.baseUrl || this.getDefaultBaseUrl(provider),
        model: config?.model || DEFAULT_MODELS[provider],
        temperature: config?.temperature ?? 0.7,
        maxTokens: config?.maxTokens ?? 4096,
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
