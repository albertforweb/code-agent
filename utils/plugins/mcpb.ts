import { join } from 'path'
import { z } from 'zod/v4'

export type McpbUserConfigurationOption = {
  type: 'string' | 'number' | 'boolean' | 'directory' | 'file'
  title: string
  description: string
  required?: boolean
  default?: string | number | boolean | string[]
  multiple?: boolean
  sensitive?: boolean
  min?: number
  max?: number
  [key: string]: unknown
}

export type McpbManifest = {
  name: string
  version?: string
  description?: string
  author: {
    name: string
    [key: string]: unknown
  }
  server?: Record<string, unknown>
  user_config?: Record<string, McpbUserConfigurationOption>
  [key: string]: unknown
}

export type McpbConfigRequest = {
  manifest: McpbManifest
  extensionPath: string
  systemDirs?: Record<string, string>
  userConfig?: Record<string, string | number | boolean | string[]>
  pathSeparator?: string
}

const UserConfigOptionSchema = z
  .object({
    type: z.enum(['string', 'number', 'boolean', 'directory', 'file']),
    title: z.string(),
    description: z.string(),
    required: z.boolean().optional(),
    default: z.union([z.string(), z.number(), z.boolean(), z.array(z.string())]).optional(),
    multiple: z.boolean().optional(),
    sensitive: z.boolean().optional(),
    min: z.number().optional(),
    max: z.number().optional(),
  })
  .passthrough()

export const McpbManifestSchema = z
  .object({
    name: z.string().min(1),
    version: z.string().optional(),
    description: z.string().optional(),
    author: z
      .object({
        name: z.string().min(1),
      })
      .passthrough(),
    server: z.record(z.string(), z.unknown()).optional(),
    user_config: z.record(z.string(), UserConfigOptionSchema).optional(),
  })
  .passthrough()

export async function getMcpConfigForManifest({
  manifest,
  extensionPath,
  systemDirs = {},
  userConfig = {},
}: McpbConfigRequest): Promise<Record<string, unknown> | null> {
  const server = manifest.server
  if (!server || typeof server !== 'object') return null

  const rawConfig =
    getRecord(server.mcp_config) ??
    getRecord(server.config) ??
    getRecord(server.mcpServer) ??
    getRecord(server)

  const config = normalizeServerConfig(rawConfig, extensionPath)
  if (!config) return null

  return substituteConfigValues(config, {
    extensionPath,
    systemDirs,
    userConfig,
  })
}

function normalizeServerConfig(
  server: Record<string, unknown>,
  extensionPath: string,
): Record<string, unknown> | null {
  const type = typeof server.type === 'string' ? server.type : undefined

  if (type && ['stdio', 'sse', 'http', 'ws', 'sdk', 'hosted-proxy'].includes(type)) {
    return { ...server }
  }

  if (typeof server.url === 'string') {
    return {
      ...server,
      type: type === 'sse' || type === 'ws' ? type : 'http',
    }
  }

  if (typeof server.command === 'string') {
    return {
      type: 'stdio',
      command: server.command,
      args: Array.isArray(server.args) ? server.args : [],
      ...(getRecord(server.env) ? { env: server.env } : {}),
    }
  }

  const entryPoint =
    stringValue(server.entry_point) ??
    stringValue(server.entrypoint) ??
    stringValue(server.path)

  if (!entryPoint) return null

  const args = Array.isArray(server.args) ? server.args : []
  const resolvedEntry = join(extensionPath, entryPoint)

  switch (type) {
    case 'node':
      return {
        type: 'stdio',
        command: 'node',
        args: [resolvedEntry, ...args],
        ...(getRecord(server.env) ? { env: server.env } : {}),
      }
    case 'python':
      return {
        type: 'stdio',
        command: 'python',
        args: [resolvedEntry, ...args],
        ...(getRecord(server.env) ? { env: server.env } : {}),
      }
    case 'binary':
    case undefined:
      return {
        type: 'stdio',
        command: resolvedEntry,
        args,
        ...(getRecord(server.env) ? { env: server.env } : {}),
      }
    default:
      return null
  }
}

function substituteConfigValues(
  value: Record<string, unknown>,
  context: {
    extensionPath: string
    systemDirs: Record<string, string>
    userConfig: Record<string, string | number | boolean | string[]>
  },
): Record<string, unknown> {
  return substitute(value, context) as Record<string, unknown>
}

function substitute(
  value: unknown,
  context: {
    extensionPath: string
    systemDirs: Record<string, string>
    userConfig: Record<string, string | number | boolean | string[]>
  },
): unknown {
  if (typeof value === 'string') {
    return replaceAll(
      replaceAll(
        replaceAll(value, '${EXTENSION_ROOT}', context.extensionPath),
        '${DXT_EXTENSION_ROOT}',
        context.extensionPath,
      ),
      '${__dirname}',
      context.extensionPath,
    )
      .replace(/\$\{user_config\.([^}]+)\}/g, (match, key) => {
        const replacement = context.userConfig[key]
        if (replacement === undefined) return match
        return Array.isArray(replacement)
          ? replacement.join(' ')
          : String(replacement)
      })
      .replace(/\$\{system_dirs\.([^}]+)\}/g, (match, key) => {
        return context.systemDirs[key] ?? match
      })
  }

  if (Array.isArray(value)) {
    return value.map(item => substitute(item, context))
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, val]) => [
        key,
        substitute(val, context),
      ]),
    )
  }

  return value
}

function replaceAll(value: string, search: string, replacement: string): string {
  return value.split(search).join(replacement)
}

function getRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}
