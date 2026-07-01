import memoize from 'lodash-es/memoize.js'
import { join } from 'path'
import { getPlatform } from '../platform.js'

/**
 * Get the path to the managed settings directory based on the current platform.
 */
export const getManagedFilePath = memoize(function (): string {
  const override =
    process.env.CODEAGENT_MANAGED_SETTINGS_PATH ??
    process.env.CODE_AGENT_MANAGED_SETTINGS_PATH
  // Allow override for testing/demos.
  if (
    (process.env.USER_TYPE === 'ant' ||
      process.env.CODEAGENT_MANAGED_SETTINGS_PATH) &&
    override
  ) {
    return override
  }

  switch (getPlatform()) {
    case 'macos':
      return '/Library/Application Support/CodeAgent'
    case 'windows':
      return 'C:\\Program Files\\CodeAgent'
    default:
      return '/etc/code-agent'
  }
})

/**
 * Get the path to the managed-settings.d/ drop-in directory.
 * managed-settings.json is merged first (base), then files in this directory
 * are merged alphabetically on top (drop-ins override base, later files win).
 */
export const getManagedSettingsDropInDir = memoize(function (): string {
  return join(getManagedFilePath(), 'managed-settings.d')
})
