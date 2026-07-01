/**
 * HTTP utility constants and helpers
 */

import axios from 'axios'
import { OAUTH_BETA_HEADER } from '../constants/oauth.js'
import {
  getLlmProviderApiKey,
  getSubscriptionOAuthTokens,
  handleOAuth401Error,
  isSubscriptionAuthSubscriber,
} from './auth.js'
import { getCodeAgentUserAgent } from './userAgent.js'
import { getWorkload } from './workloadContext.js'

// WARNING: downstream log filtering may rely on this product token.
// Please do NOT change this without making sure that logging also gets updated!
export function getUserAgent(): string {
  const agentSdkVersionValue =
    process.env.CODEAGENT_AGENT_SDK_VERSION ??
    process.env.CODE_AGENT_AGENT_SDK_VERSION
  const clientAppValue =
    process.env.CODEAGENT_AGENT_SDK_CLIENT_APP ??
    process.env.CODE_AGENT_AGENT_SDK_CLIENT_APP
  const entrypoint =
    process.env.CODEAGENT_ENTRYPOINT ??
    process.env.CODE_AGENT_ENTRYPOINT ??
    'cli'
  const agentSdkVersion = agentSdkVersionValue
    ? `, agent-sdk/${agentSdkVersionValue}`
    : ''
  // SDK consumers can identify their app/library via CODEAGENT_AGENT_SDK_CLIENT_APP
  // e.g., "my-app/1.0.0" or "my-library/2.1"
  const clientApp = clientAppValue ? `, client-app/${clientAppValue}` : ''
  // Turn-/process-scoped workload tag for cron-initiated requests. 1P-only
  // observability — proxies strip HTTP headers; QoS routing uses cc_workload
  // in the billing-header attribution block instead (see constants/system.ts).
  // getLlmProviderClient (client.ts:98) calls this per-request inside withRetry,
  // so the read picks up the same setWorkload() value as getAttributionHeader.
  const workload = getWorkload()
  const workloadSuffix = workload ? `, workload/${workload}` : ''
  return `code-agent-cli/${MACRO.VERSION} (${process.env.USER_TYPE}, ${entrypoint}${agentSdkVersion}${clientApp}${workloadSuffix})`
}

export function getMCPUserAgent(): string {
  const parts: string[] = []
  const entrypoint =
    process.env.CODEAGENT_ENTRYPOINT ?? process.env.CODE_AGENT_ENTRYPOINT
  const agentSdkVersionValue =
    process.env.CODEAGENT_AGENT_SDK_VERSION ??
    process.env.CODE_AGENT_AGENT_SDK_VERSION
  const clientAppValue =
    process.env.CODEAGENT_AGENT_SDK_CLIENT_APP ??
    process.env.CODE_AGENT_AGENT_SDK_CLIENT_APP
  if (entrypoint) {
    parts.push(entrypoint)
  }
  if (agentSdkVersionValue) {
    parts.push(`agent-sdk/${agentSdkVersionValue}`)
  }
  if (clientAppValue) {
    parts.push(`client-app/${clientAppValue}`)
  }
  const suffix = parts.length > 0 ? ` (${parts.join(', ')})` : ''
  return `code-agent/${MACRO.VERSION}${suffix}`
}

// User-Agent for WebFetch requests to arbitrary sites.
export function getWebFetchUserAgent(): string {
  return `CodeAgent-User (${getCodeAgentUserAgent()}; +https://github.com/albertforweb/code-agent)`
}

export type AuthHeaders = {
  headers: Record<string, string>
  error?: string
}

/**
 * Get authentication headers for API requests
 * Returns either OAuth headers for Max/Pro users or API key headers for regular users
 */
export function getAuthHeaders(): AuthHeaders {
  if (isSubscriptionAuthSubscriber()) {
    const oauthTokens = getSubscriptionOAuthTokens()
    if (!oauthTokens?.accessToken) {
      return {
        headers: {},
        error: 'No OAuth token available',
      }
    }
    return {
      headers: {
        Authorization: `Bearer ${oauthTokens.accessToken}`,
        'llmProvider-beta': OAUTH_BETA_HEADER,
      },
    }
  }
  // TODO: this will fail if the API key is being set to an LLM Gateway key
  // should we try to query keychain / credentials for a valid LlmProvider key?
  const apiKey = getLlmProviderApiKey()
  if (!apiKey) {
    return {
      headers: {},
      error: 'No API key available',
    }
  }
  return {
    headers: {
      'x-api-key': apiKey,
    },
  }
}

/**
 * Wrapper that handles OAuth 401 errors by force-refreshing the token and
 * retrying once. Addresses clock drift scenarios where the local expiration
 * check disagrees with the server.
 *
 * The request closure is called again on retry, so it should re-read auth
 * (e.g., via getAuthHeaders()) to pick up the refreshed token.
 *
 * Note: bridgeApi.ts has its own DI-injected version — handleOAuth401Error
 * transitively pulls in config.ts (~1300 modules), which breaks the SDK bundle.
 *
 * @param opts.also403Revoked - Also retry on 403 with "OAuth token has been
 *   revoked" body (some endpoints signal revocation this way instead of 401).
 */
export async function withOAuth401Retry<T>(
  request: () => Promise<T>,
  opts?: { also403Revoked?: boolean },
): Promise<T> {
  try {
    return await request()
  } catch (err) {
    if (!axios.isAxiosError(err)) throw err
    const status = err.response?.status
    const isAuthError =
      status === 401 ||
      (opts?.also403Revoked &&
        status === 403 &&
        typeof err.response?.data === 'string' &&
        err.response.data.includes('OAuth token has been revoked'))
    if (!isAuthError) throw err
    const failedAccessToken = getSubscriptionOAuthTokens()?.accessToken
    if (!failedAccessToken) throw err
    await handleOAuth401Error(failedAccessToken)
    return await request()
  }
}
