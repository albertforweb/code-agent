"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OPENAI_PROVIDER_PROFILES = void 0;
exports.getOpenAIProviderProfile = getOpenAIProviderProfile;
exports.OPENAI_PROVIDER_PROFILES = {
    codeagent: {
        kind: 'codeagent',
        label: 'CodeAgent',
        defaultBaseUrl: 'http://127.0.0.1:14321/v1',
        defaultModel: 'Qwen/Qwen3-4B-GGUF',
        contextTokens: 8192,
        maxOutputTokens: 2048,
        capabilities: { streaming: true, toolCalls: true, usageInStream: 'provider-dependent' },
        toolsEnabledByDefault: true,
    },
    openai: {
        kind: 'openai',
        label: 'OpenAI',
        defaultBaseUrl: 'https://api.openai.com/v1',
        defaultModel: 'gpt-4o-mini',
        contextTokens: 128000,
        maxOutputTokens: 4096,
        capabilities: { streaming: true, toolCalls: true, usageInStream: 'supported' },
        toolsEnabledByDefault: true,
    },
    'openai-compatible': {
        kind: 'openai-compatible',
        label: 'OpenAI-compatible',
        defaultBaseUrl: 'http://127.0.0.1:1234/v1',
        defaultModel: 'local-model',
        contextTokens: 8192,
        maxOutputTokens: 2048,
        capabilities: { streaming: true, toolCalls: true, usageInStream: 'provider-dependent' },
        toolsEnabledByDefault: false,
    },
};
function getOpenAIProviderProfile(kind) {
    return exports.OPENAI_PROVIDER_PROFILES[kind];
}
//# sourceMappingURL=openai-provider-profiles.js.map