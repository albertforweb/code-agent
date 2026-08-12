export type OpenAIProviderKind = 'codeagent' | 'openai' | 'openai-compatible';

export interface OpenAIProviderProfile {
  kind: OpenAIProviderKind;
  label: string;
  defaultBaseUrl: string;
  defaultModel: string;
  contextTokens: number;
  maxOutputTokens: number;
  capabilities: {
    streaming: boolean;
    toolCalls: boolean;
    usageInStream: 'supported' | 'provider-dependent';
  };
  toolsEnabledByDefault: boolean;
}

export const OPENAI_PROVIDER_PROFILES: Readonly<Record<OpenAIProviderKind, Readonly<OpenAIProviderProfile>>> = {
  codeagent: {
    kind: 'codeagent',
    label: 'CodeAgent',
    defaultBaseUrl: 'http://127.0.0.1:14321/v1',
    defaultModel: 'Qwen/Qwen3-4B-GGUF',
    contextTokens: 8_192,
    maxOutputTokens: 2_048,
    capabilities: { streaming: true, toolCalls: true, usageInStream: 'provider-dependent' },
    toolsEnabledByDefault: true,
  },
  openai: {
    kind: 'openai',
    label: 'OpenAI',
    defaultBaseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o-mini',
    contextTokens: 128_000,
    maxOutputTokens: 4_096,
    capabilities: { streaming: true, toolCalls: true, usageInStream: 'supported' },
    toolsEnabledByDefault: true,
  },
  'openai-compatible': {
    kind: 'openai-compatible',
    label: 'OpenAI-compatible',
    defaultBaseUrl: 'http://127.0.0.1:1234/v1',
    defaultModel: 'local-model',
    contextTokens: 8_192,
    maxOutputTokens: 2_048,
    capabilities: { streaming: true, toolCalls: true, usageInStream: 'provider-dependent' },
    toolsEnabledByDefault: false,
  },
};

export function getOpenAIProviderProfile(kind: OpenAIProviderKind): Readonly<OpenAIProviderProfile> {
  return OPENAI_PROVIDER_PROFILES[kind];
}
