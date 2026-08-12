import { isEnvTruthy } from '../envUtils.js'
import { getOpenAIProviderProfile, type OpenAIProviderKind } from '../../electron/shared/openai-provider-profiles.js'

export type { OpenAIProviderKind } from '../../electron/shared/openai-provider-profiles.js'

export function getOpenAICompatibleProviderKind(): OpenAIProviderKind | null {
  const raw = firstDefined(
    process.env.CODE_AGENT_LLM_PROVIDER,
    process.env.CODE_AGENT_LLM_PROVIDER,
    process.env.LLM_PROVIDER,
  )
  if (!raw) return null

  const normalized = raw.trim().toLowerCase().replace(/_/g, '-')
  if (normalized === 'openai') return 'openai'
  if (normalized === 'codeagent' || normalized === 'code-agent') return 'codeagent'
  if (
    normalized === 'openai-compatible' ||
    normalized === 'local' ||
    normalized === 'local-openai'
  ) {
    return 'openai-compatible'
  }
  return null
}

export function isOpenAICompatibleProvider(): boolean {
  return getOpenAICompatibleProviderKind() !== null
}

export function getOpenAICompatibleBaseUrl(): string {
  const provider = getOpenAICompatibleProviderKind() ?? 'openai-compatible'
  return (
    firstDefined(
      process.env.CODE_AGENT_BASE_URL,
      process.env.CODE_AGENT_LLM_BASE_URL,
      process.env.OPENAI_COMPATIBLE_BASE_URL,
      process.env.OPENAI_BASE_URL,
    ) ?? getOpenAIProviderProfile(provider).defaultBaseUrl
  )
}

export function getOpenAICompatibleModel(): string {
  const provider = getOpenAICompatibleProviderKind() ?? 'openai-compatible'
  return (
    firstDefined(
      process.env.CODE_AGENT_MODEL,
      process.env.OPENAI_COMPATIBLE_MODEL,
      process.env.OPENAI_MODEL,
      process.env.LLM_PROVIDER_MODEL,
    ) ?? getOpenAIProviderProfile(provider).defaultModel
  )
}

export function getOpenAICompatibleContextTokens(): number {
  const provider = getOpenAICompatibleProviderKind() ?? 'openai-compatible'
  return getPositiveIntEnv(
    [
      process.env.CODE_AGENT_CONTEXT_TOKENS,
      process.env.CODE_AGENT_LLM_CONTEXT_TOKENS,
      process.env.OPENAI_COMPATIBLE_CONTEXT_TOKENS,
      process.env.OPENAI_CONTEXT_TOKENS,
    ],
    getOpenAIProviderProfile(provider).contextTokens,
  )
}

export function getOpenAICompatibleMaxOutputTokens(): number {
  const provider = getOpenAICompatibleProviderKind() ?? 'openai-compatible'
  const configured = getPositiveIntEnv(
    [
      process.env.CODE_AGENT_MAX_OUTPUT_TOKENS,
      process.env.CODE_AGENT_LLM_MAX_OUTPUT_TOKENS,
      process.env.OPENAI_COMPATIBLE_MAX_OUTPUT_TOKENS,
      process.env.OPENAI_MAX_OUTPUT_TOKENS,
    ],
    getOpenAIProviderProfile(provider).maxOutputTokens,
  )
  return Math.max(1, Math.min(configured, getOpenAICompatibleContextTokens()))
}

export function shouldSendOpenAICompatibleTools(): boolean {
  if (isEnvTruthy(process.env.CODE_AGENT_DISABLE_TOOLS)) return false

  const explicit = firstDefined(
    process.env.CODE_AGENT_ENABLE_TOOLS,
    process.env.CODE_AGENT_LLM_ENABLE_TOOLS,
    process.env.OPENAI_COMPATIBLE_ENABLE_TOOLS,
    process.env.OPENAI_ENABLE_TOOLS,
  )
  if (explicit !== undefined) return isEnvTruthy(explicit)

  return true
}

function firstDefined(...values: Array<string | undefined>): string | undefined {
  return values.find(value => value !== undefined && value !== '')
}

function getPositiveIntEnv(values: Array<string | undefined>, fallback: number): number {
  for (const value of values) {
    if (value === undefined || value.trim() === '') continue
    const parsed = Number.parseInt(value, 10)
    if (Number.isFinite(parsed) && parsed > 0) return parsed
  }
  return fallback
}
