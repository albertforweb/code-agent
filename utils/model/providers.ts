import type { AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS } from '../../services/analytics/index.js'
import { isEnvTruthy } from '../envUtils.js'
import { isOpenAICompatibleProvider } from './openaiCompatible.js'

export type APIProvider = 'firstParty' | 'bedrock' | 'vertex' | 'foundry'

export function getAPIProvider(): APIProvider {
  return isEnvTruthy(process.env.CODE_AGENT_USE_BEDROCK)
    ? 'bedrock'
    : isEnvTruthy(process.env.CODE_AGENT_USE_VERTEX)
      ? 'vertex'
      : isEnvTruthy(process.env.CODE_AGENT_USE_FOUNDRY)
        ? 'foundry'
        : 'firstParty'
}

export function getAPIProviderForStatsig(): AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS {
  return getAPIProvider() as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS
}

/**
 * Check if LLM_PROVIDER_BASE_URL is a first-party LlmProvider API URL.
 * Returns true if not set (default API) or points to api.llmProvider.com
 * (or api-staging.llmProvider.com for internal users).
 */
export function isFirstPartyLlmProviderBaseUrl(): boolean {
  if (isOpenAICompatibleProvider()) {
    return false
  }

  const baseUrl = process.env.LLM_PROVIDER_BASE_URL
  if (!baseUrl) {
    return true
  }
  try {
    const host = new URL(baseUrl).host
    const allowedHosts = ['api.llmProvider.com']
    if (process.env.USER_TYPE === 'internal') {
      allowedHosts.push('api-staging.llmProvider.com')
    }
    return allowedHosts.includes(host)
  } catch {
    return false
  }
}
