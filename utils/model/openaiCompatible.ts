import { isEnvTruthy } from '../envUtils.js'

export type OpenAIProviderKind = 'openai' | 'openai-compatible'

const DEFAULT_BASE_URLS: Record<OpenAIProviderKind, string> = {
  openai: 'https://api.openai.com/v1',
  'openai-compatible': 'http://127.0.0.1:1234/v1',
}

const DEFAULT_MODELS: Record<OpenAIProviderKind, string> = {
  openai: 'gpt-4o-mini',
  'openai-compatible': 'local-model',
}

const DEFAULT_CONTEXT_TOKENS: Record<OpenAIProviderKind, number> = {
  openai: 128_000,
  'openai-compatible': 8_192,
}

const DEFAULT_MAX_OUTPUT_TOKENS: Record<OpenAIProviderKind, number> = {
  openai: 4_096,
  'openai-compatible': 2_048,
}

export function getOpenAICompatibleProviderKind(): OpenAIProviderKind | null {
  const raw = firstDefined(
    process.env.CODE_AGENT_LLM_PROVIDER,
    process.env.CODE_AGENT_LLM_PROVIDER,
    process.env.LLM_PROVIDER,
  )
  if (!raw) return null

  const normalized = raw.trim().toLowerCase().replace(/_/g, '-')
  if (normalized === 'openai') return 'openai'
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
    ) ?? DEFAULT_BASE_URLS[provider]
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
    ) ?? DEFAULT_MODELS[provider]
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
    DEFAULT_CONTEXT_TOKENS[provider],
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
    DEFAULT_MAX_OUTPUT_TOKENS[provider],
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

  return getOpenAICompatibleProviderKind() === 'openai'
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
