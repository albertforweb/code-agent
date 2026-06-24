"use strict";
/**
 * Service Bridge - API Service
 * Bridges Anthropic SDK and API operations to IPC channels
 * Handles chat, bootstrap data, and API calls
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ApiServiceBridge = void 0;
const sdk_1 = __importDefault(require("@anthropic-ai/sdk"));
/**
 * API Service Bridge - bridges API operations to IPC
 */
class ApiServiceBridge {
    constructor(apiClient) {
        this.authTokenProvider = null;
        this.bootstrapProvider = null;
        this.bootstrapData = null;
        this.bootstrapFetchTime = 0;
        this.bootstrapCacheTTL = 1000 * 60 * 60; // 1 hour
        this.apiClient = apiClient ?? null;
    }
    /**
     * Send a chat message and get response
     */
    async chat(request) {
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
        }
        catch (error) {
            throw new Error(`API Error: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    /**
     * Send a chat message and stream text deltas while collecting the final response.
     */
    async streamChat(request, handlers = {}) {
        const client = await this.getApiClient();
        try {
            const stream = client.messages.stream({
                model: request.model || 'claude-3-5-sonnet-20241022',
                max_tokens: request.maxTokens || 4096,
                system: this._buildSystemPrompt(),
                messages: request.messages,
                temperature: request.temperature,
            });
            stream.on('text', (textDelta) => {
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
        }
        catch (error) {
            throw new Error(`API Stream Error: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    /**
     * Fetch bootstrap data (user info, features, config)
     */
    async fetchBootstrap() {
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
        }
        catch (error) {
            throw new Error(`Bootstrap Error: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    /**
     * Build system prompt for Claude
     */
    _buildSystemPrompt() {
        return `You are Code Agent, a powerful AI assistant for software development.
    
You have access to multiple tools and can execute code, analyze files, and help with various programming tasks.

Always be helpful, thorough, and provide clear explanations.`;
    }
    /**
     * Set API client (for dependency injection)
     */
    setApiClient(client) {
        this.apiClient = client;
    }
    setAuthTokenProvider(provider) {
        this.authTokenProvider = provider;
        this.apiClient = null;
    }
    setBootstrapProvider(provider) {
        this.bootstrapProvider = provider;
        this.clearBootstrapCache();
    }
    /**
     * Clear bootstrap cache
     */
    clearBootstrapCache() {
        this.bootstrapData = null;
        this.bootstrapFetchTime = 0;
    }
    /**
     * Check if API is configured
     */
    isConfigured() {
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
    async getApiClient() {
        if (this.apiClient) {
            return this.apiClient;
        }
        const token = await this.authTokenProvider?.();
        const apiKey = token?.accessToken || process.env.ANTHROPIC_API_KEY;
        if (!apiKey) {
            throw new Error('API client not initialized: configure an Anthropic API key first');
        }
        this.apiClient = new sdk_1.default({ apiKey });
        return this.apiClient;
    }
    extractTextContent(response) {
        return Array.isArray(response.content)
            ? response.content
                .filter((block) => block?.type === 'text')
                .map((block) => block.text)
                .join('')
            : '';
    }
    async buildLocalBootstrapData() {
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
exports.ApiServiceBridge = ApiServiceBridge;
//# sourceMappingURL=api-service-bridge.js.map