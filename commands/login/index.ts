import type { Command } from '../../commands.js'
import { hasLlmProviderApiKeyAuth } from '../../utils/auth.js'
import { isEnvTruthy } from '../../utils/envUtils.js'

export default () =>
  ({
    type: 'local-jsx',
    name: 'login',
    description: hasLlmProviderApiKeyAuth()
      ? 'Switch accounts or configure a local provider'
      : 'Sign in or configure an LLM provider',
    immediate: true,
    isEnabled: () => !isEnvTruthy(process.env.DISABLE_LOGIN_COMMAND),
    load: () => import('./login.js'),
  }) satisfies Command
