import { isEnvTruthy } from 'src/utils/envUtils.js'

// Default to prod config, override with test/staging if enabled
type OauthConfigType = 'prod' | 'staging' | 'local'

function getOauthConfigType(): OauthConfigType {
  if (process.env.USER_TYPE === 'internal') {
    if (isEnvTruthy(process.env.USE_LOCAL_OAUTH)) {
      return 'local'
    }
    if (isEnvTruthy(process.env.USE_STAGING_OAUTH)) {
      return 'staging'
    }
  }
  return 'prod'
}

export function fileSuffixForOauthConfig(): string {
  if (process.env.CODE_AGENT_CUSTOM_OAUTH_URL) {
    return '-custom-oauth'
  }
  switch (getOauthConfigType()) {
    case 'local':
      return '-local-oauth'
    case 'staging':
      return '-staging-oauth'
    case 'prod':
      // No suffix for production config
      return ''
  }
}

export const SUBSCRIPTION_INFERENCE_SCOPE = 'user:inference' as const
export const SUBSCRIPTION_PROFILE_SCOPE = 'user:profile' as const
const CONSOLE_SCOPE = 'org:create_api_key' as const
export const OAUTH_BETA_HEADER = 'oauth-2025-04-20' as const

// Console OAuth scopes - for API key creation via Console
export const CONSOLE_OAUTH_SCOPES = [
  CONSOLE_SCOPE,
  SUBSCRIPTION_PROFILE_SCOPE,
] as const

// CodeAgent.ai OAuth scopes - for CodeAgent.ai subscribers (Pro/Max/Team/Enterprise)
export const SUBSCRIPTION_OAUTH_SCOPES = [
  SUBSCRIPTION_PROFILE_SCOPE,
  SUBSCRIPTION_INFERENCE_SCOPE,
  'user:sessions:code_agent',
  'user:mcp_servers',
  'user:file_upload',
] as const

// All OAuth scopes - union of all scopes used in CodeAgent CLI
// When logging in, request all scopes in order to handle both Console -> CodeAgent.ai redirect
// Ensure that `OAuthConsentPage` in apps repo is kept in sync with this list.
export const ALL_OAUTH_SCOPES = Array.from(
  new Set([...CONSOLE_OAUTH_SCOPES, ...SUBSCRIPTION_OAUTH_SCOPES]),
)

type OauthConfig = {
  BASE_API_URL: string
  CONSOLE_AUTHORIZE_URL: string
  SUBSCRIPTION_AUTHORIZE_URL: string
  /**
   * The codeAgent.ai web origin. Separate from SUBSCRIPTION_AUTHORIZE_URL because
   * that now routes through codeAgent.com/cai/* for attribution — deriving
   * .origin from it would give codeAgent.com, breaking links to /code,
   * /settings/connectors, and other codeAgent.ai web pages.
   */
  SUBSCRIPTION_ORIGIN: string
  TOKEN_URL: string
  API_KEY_URL: string
  ROLES_URL: string
  CONSOLE_SUCCESS_URL: string
  SUBSCRIPTION_SUCCESS_URL: string
  MANUAL_REDIRECT_URL: string
  CLIENT_ID: string
  OAUTH_FILE_SUFFIX: string
  MCP_PROXY_URL: string
  MCP_PROXY_PATH: string
}

// Production OAuth configuration - Used in normal operation
const PROD_OAUTH_CONFIG = {
  BASE_API_URL: 'https://api.llmProvider.com',
  CONSOLE_AUTHORIZE_URL: 'https://platform.codeAgent.com/oauth/authorize',
  // Bounces through codeAgent.com/cai/* so CLI sign-ins connect to codeAgent.com
  // visits for attribution. 307s to codeAgent.ai/oauth/authorize in two hops.
  SUBSCRIPTION_AUTHORIZE_URL: 'https://codeAgent.com/cai/oauth/authorize',
  SUBSCRIPTION_ORIGIN: 'https://codeAgent.ai',
  TOKEN_URL: 'https://platform.codeAgent.com/v1/oauth/token',
  API_KEY_URL: 'https://api.llmProvider.com/api/oauth/codeAgent_cli/create_api_key',
  ROLES_URL: 'https://api.llmProvider.com/api/oauth/codeAgent_cli/roles',
  CONSOLE_SUCCESS_URL:
    'https://platform.codeAgent.com/buy_credits?returnUrl=/oauth/code/success%3Fapp%3DcodeAgent-code',
  SUBSCRIPTION_SUCCESS_URL:
    'https://platform.codeAgent.com/oauth/code/success?app=codeAgent-code',
  MANUAL_REDIRECT_URL: 'https://platform.codeAgent.com/oauth/code/callback',
  CLIENT_ID: '9d1c250a-e61b-44d9-88ed-5944d1962f5e',
  // No suffix for production config
  OAUTH_FILE_SUFFIX: '',
  MCP_PROXY_URL: 'https://mcp-proxy.llmProvider.com',
  MCP_PROXY_PATH: '/v1/mcp/{server_id}',
} as const

/**
 * Client ID Metadata Document URL for MCP OAuth (CIMD / SEP-991).
 * When an MCP auth server advertises client_id_metadata_document_supported: true,
 * CodeAgent uses this URL as its client_id instead of Dynamic Client Registration.
 * The URL must point to a JSON document hosted by the first-party provider.
 * See: https://datatracker.ietf.org/doc/html/draft-ietf-oauth-client-id-metadata-document-00
 */
export const MCP_CLIENT_METADATA_URL =
  'https://codeAgent.ai/oauth/codeAgent-code-client-metadata'

// Staging OAuth configuration - only included in internal builds with staging flag
// Uses literal check for dead code elimination
const STAGING_OAUTH_CONFIG =
  process.env.USER_TYPE === 'internal'
    ? ({
        BASE_API_URL: 'https://api-staging.llmProvider.com',
        CONSOLE_AUTHORIZE_URL:
          'https://platform.staging.codeagent.local/oauth/authorize',
        SUBSCRIPTION_AUTHORIZE_URL:
          'https://codeAgent-ai.staging.codeagent.local/oauth/authorize',
        SUBSCRIPTION_ORIGIN: 'https://codeAgent-ai.staging.codeagent.local',
        TOKEN_URL: 'https://platform.staging.codeagent.local/v1/oauth/token',
        API_KEY_URL:
          'https://api-staging.llmProvider.com/api/oauth/codeAgent_cli/create_api_key',
        ROLES_URL:
          'https://api-staging.llmProvider.com/api/oauth/codeAgent_cli/roles',
        CONSOLE_SUCCESS_URL:
          'https://platform.staging.codeagent.local/buy_credits?returnUrl=/oauth/code/success%3Fapp%3DcodeAgent-code',
        SUBSCRIPTION_SUCCESS_URL:
          'https://platform.staging.codeagent.local/oauth/code/success?app=codeAgent-code',
        MANUAL_REDIRECT_URL:
          'https://platform.staging.codeagent.local/oauth/code/callback',
        CLIENT_ID: '22422756-60c9-4084-8eb7-27705fd5cf9a',
        OAUTH_FILE_SUFFIX: '-staging-oauth',
        MCP_PROXY_URL: 'https://mcp-proxy-staging.llmProvider.com',
        MCP_PROXY_PATH: '/v1/mcp/{server_id}',
      } as const)
    : undefined

// Three local dev servers: :8000 api-proxy (`api dev start -g ccr`),
// :4000 codeAgent-ai frontend, :3000 Console frontend. Env vars let
// scripts/codeAgent-localhost override if your layout differs.
function getLocalOauthConfig(): OauthConfig {
  const api =
    process.env.CODE_AGENT_LOCAL_OAUTH_API_BASE?.replace(/\/$/, '') ??
    'http://localhost:8000'
  const apps =
    process.env.CODE_AGENT_LOCAL_OAUTH_APPS_BASE?.replace(/\/$/, '') ??
    'http://localhost:4000'
  const consoleBase =
    process.env.CODE_AGENT_LOCAL_OAUTH_CONSOLE_BASE?.replace(/\/$/, '') ??
    'http://localhost:3000'
  return {
    BASE_API_URL: api,
    CONSOLE_AUTHORIZE_URL: `${consoleBase}/oauth/authorize`,
    SUBSCRIPTION_AUTHORIZE_URL: `${apps}/oauth/authorize`,
    SUBSCRIPTION_ORIGIN: apps,
    TOKEN_URL: `${api}/v1/oauth/token`,
    API_KEY_URL: `${api}/api/oauth/codeAgent_cli/create_api_key`,
    ROLES_URL: `${api}/api/oauth/codeAgent_cli/roles`,
    CONSOLE_SUCCESS_URL: `${consoleBase}/buy_credits?returnUrl=/oauth/code/success%3Fapp%3DcodeAgent-code`,
    SUBSCRIPTION_SUCCESS_URL: `${consoleBase}/oauth/code/success?app=codeAgent-code`,
    MANUAL_REDIRECT_URL: `${consoleBase}/oauth/code/callback`,
    CLIENT_ID: '22422756-60c9-4084-8eb7-27705fd5cf9a',
    OAUTH_FILE_SUFFIX: '-local-oauth',
    MCP_PROXY_URL: 'http://localhost:8205',
    MCP_PROXY_PATH: '/v1/toolbox/shttp/mcp/{server_id}',
  }
}

// Allowed base URLs for CODE_AGENT_CUSTOM_OAUTH_URL override.
// Only FedStart/PubSec deployments are permitted to prevent OAuth tokens
// from being sent to arbitrary endpoints.
const ALLOWED_OAUTH_BASE_URLS = [
  'https://beacon.codeAgent-ai.staging.codeagent.local',
  'https://codeAgent.fedstart.com',
  'https://codeAgent-staging.fedstart.com',
]

// Default to prod config, override with test/staging if enabled
export function getOauthConfig(): OauthConfig {
  let config: OauthConfig = (() => {
    switch (getOauthConfigType()) {
      case 'local':
        return getLocalOauthConfig()
      case 'staging':
        return STAGING_OAUTH_CONFIG ?? PROD_OAUTH_CONFIG
      case 'prod':
        return PROD_OAUTH_CONFIG
    }
  })()

  // Allow overriding all OAuth URLs to point to an approved FedStart deployment.
  // Only allowlisted base URLs are accepted to prevent credential leakage.
  const oauthBaseUrl = process.env.CODE_AGENT_CUSTOM_OAUTH_URL
  if (oauthBaseUrl) {
    const base = oauthBaseUrl.replace(/\/$/, '')
    if (!ALLOWED_OAUTH_BASE_URLS.includes(base)) {
      throw new Error(
        'CODE_AGENT_CUSTOM_OAUTH_URL is not an approved endpoint.',
      )
    }
    config = {
      ...config,
      BASE_API_URL: base,
      CONSOLE_AUTHORIZE_URL: `${base}/oauth/authorize`,
      SUBSCRIPTION_AUTHORIZE_URL: `${base}/oauth/authorize`,
      SUBSCRIPTION_ORIGIN: base,
      TOKEN_URL: `${base}/v1/oauth/token`,
      API_KEY_URL: `${base}/api/oauth/codeAgent_cli/create_api_key`,
      ROLES_URL: `${base}/api/oauth/codeAgent_cli/roles`,
      CONSOLE_SUCCESS_URL: `${base}/oauth/code/success?app=codeAgent-code`,
      SUBSCRIPTION_SUCCESS_URL: `${base}/oauth/code/success?app=codeAgent-code`,
      MANUAL_REDIRECT_URL: `${base}/oauth/code/callback`,
      OAUTH_FILE_SUFFIX: '-custom-oauth',
    }
  }

  // Allow CLIENT_ID override via environment variable (e.g., for Xcode integration)
  const clientIdOverride = process.env.CODE_AGENT_OAUTH_CLIENT_ID
  if (clientIdOverride) {
    config = {
      ...config,
      CLIENT_ID: clientIdOverride,
    }
  }

  return config
}
