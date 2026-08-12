import assert from 'node:assert/strict';
import test from 'node:test';
import { getOpenAIProviderProfile, OPENAI_PROVIDER_PROFILES } from './openai-provider-profiles';
import {
  getOpenAICompatibleContextTokens,
  getOpenAICompatibleMaxOutputTokens,
  getOpenAICompatibleModel,
} from '../../utils/model/openaiCompatible';

test('provider profiles expose valid defaults and explicit capabilities', () => {
  assert.deepEqual(Object.keys(OPENAI_PROVIDER_PROFILES).sort(), ['codeagent', 'openai', 'openai-compatible']);
  for (const [kind, profile] of Object.entries(OPENAI_PROVIDER_PROFILES)) {
    assert.equal(profile.kind, kind);
    assert.ok(new URL(profile.defaultBaseUrl));
    assert.ok(profile.defaultModel);
    assert.ok(profile.contextTokens >= profile.maxOutputTokens);
    assert.equal(typeof profile.capabilities.streaming, 'boolean');
    assert.equal(typeof profile.capabilities.toolCalls, 'boolean');
  }
  assert.equal(getOpenAIProviderProfile('codeagent').defaultModel, 'Qwen/Qwen3-4B-GGUF');
  assert.equal(getOpenAIProviderProfile('openai-compatible').toolsEnabledByDefault, false);
});

test('CLI provider resolution consumes the shared profile defaults', () => {
  const previous = { ...process.env };
  try {
    delete process.env.CODE_AGENT_MODEL;
    delete process.env.OPENAI_COMPATIBLE_MODEL;
    delete process.env.OPENAI_MODEL;
    delete process.env.LLM_PROVIDER_MODEL;
    delete process.env.CODE_AGENT_CONTEXT_TOKENS;
    delete process.env.CODE_AGENT_MAX_OUTPUT_TOKENS;
    process.env.CODE_AGENT_LLM_PROVIDER = 'codeagent';

    const profile = getOpenAIProviderProfile('codeagent');
    assert.equal(getOpenAICompatibleModel(), profile.defaultModel);
    assert.equal(getOpenAICompatibleContextTokens(), profile.contextTokens);
    assert.equal(getOpenAICompatibleMaxOutputTokens(), profile.maxOutputTokens);
  } finally {
    for (const key of Object.keys(process.env)) {
      if (!(key in previous)) delete process.env[key];
    }
    Object.assign(process.env, previous);
  }
});
