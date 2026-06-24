"use strict";
/**
 * Service Bridge - API Service
 * Bridges Anthropic SDK and API operations to IPC channels
 * Handles chat, bootstrap data, and API calls
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ApiServiceBridge = void 0;
/**
 * API Service Bridge - bridges API operations to IPC
 */
class ApiServiceBridge {
    constructor() {
        this.bootstrapData = null;
        this.bootstrapFetchTime = 0;
        this.bootstrapCacheTTL = 1000 * 60 * 60; // 1 hour
        // TODO: Initialize with actual Anthropic SDK client
        // this.apiClient = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    }
    /**
     * Send a chat message and get response
     */
    async chat(request) {
        if (!this.apiClient) {
            throw new Error('API client not initialized');
        }
        const startTime = Date.now();
        try {
            // Build the request
            const response = await this.apiClient.messages.create({
                model: request.model || 'claude-3-5-sonnet-20241022',
                max_tokens: request.maxTokens || 4096,
                system: this._buildSystemPrompt(),
                messages: request.messages,
                temperature: request.temperature,
            });
            // Extract response content
            const content = response.content[0]?.type === 'text' ? response.content[0].text : '';
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
     * Fetch bootstrap data (user info, features, config)
     */
    async fetchBootstrap() {
        // Check cache
        const now = Date.now();
        if (this.bootstrapData && now - this.bootstrapFetchTime < this.bootstrapCacheTTL) {
            return this.bootstrapData;
        }
        try {
            // TODO: Fetch actual bootstrap data from API
            const data = {
                user: {
                    id: 'user-123',
                    name: 'User',
                    email: 'user@example.com',
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
        return !!this.apiClient;
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
}
exports.ApiServiceBridge = ApiServiceBridge;
//# sourceMappingURL=api-service-bridge.js.map