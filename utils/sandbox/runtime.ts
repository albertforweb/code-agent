import { spawnSync } from 'child_process'
import { z } from 'zod/v4'

export type NetworkHostPattern = {
  host: string
  port?: number
  protocol?: string
  [key: string]: unknown
}

export type SandboxAskCallback = (
  hostPattern: NetworkHostPattern,
) => boolean | Promise<boolean>

export type SandboxDependencyCheck = {
  errors: string[]
  warnings: string[]
}

export type FsReadRestrictionConfig = {
  denyOnly: string[]
  allowWithinDeny?: string[]
}

export type FsWriteRestrictionConfig = {
  allowOnly: string[]
  denyWithinAllow: string[]
}

export type NetworkRestrictionConfig = {
  allowedHosts?: string[]
  deniedHosts?: string[]
}

export type IgnoreViolationsConfig = {
  read?: string[]
  write?: string[]
  network?: string[]
  [key: string]: unknown
}

export type SandboxViolationEvent = {
  type: string
  message?: string
  timestamp?: number
  [key: string]: unknown
}

export type SandboxRuntimeConfig = {
  filesystem?: {
    read?: FsReadRestrictionConfig
    write?: FsWriteRestrictionConfig
    [key: string]: unknown
  }
  network?: NetworkRestrictionConfig
  allowUnixSockets?: string[]
  allowLocalBinding?: boolean
  ignoreViolations?: IgnoreViolationsConfig
  enableWeakerNestedSandbox?: boolean
  proxyPort?: number
  socksProxyPort?: number
  linuxHttpSocketPath?: string
  linuxSocksSocketPath?: string
  [key: string]: unknown
}

export const SandboxRuntimeConfigSchema = z.record(z.string(), z.unknown())

export class SandboxViolationStore {
  #events: SandboxViolationEvent[] = []

  add(event: SandboxViolationEvent): void {
    this.#events.push({
      ...event,
      timestamp: event.timestamp ?? Date.now(),
    })
  }

  getRecent(limit = 20): SandboxViolationEvent[] {
    return this.#events.slice(-limit)
  }

  getAll(): SandboxViolationEvent[] {
    return [...this.#events]
  }

  clear(): void {
    this.#events = []
  }
}

let currentConfig: SandboxRuntimeConfig = {}
let violationStore = new SandboxViolationStore()

export class SandboxManager {
  static checkDependencies(options?: {
    command?: string
    args?: string[]
  }): SandboxDependencyCheck {
    const errors: string[] = []
    const warnings: string[] = [
      'OS sandbox enforcement is unavailable because the external sandbox runtime has been removed.',
    ]

    if (options?.command) {
      const result = spawnSync(options.command, options.args ?? ['--version'], {
        stdio: 'ignore',
      })
      if (result.error) {
        errors.push(`ripgrep dependency not available: ${result.error.message}`)
      }
    }

    return { errors, warnings }
  }

  static isSupportedPlatform(): boolean {
    return process.platform === 'darwin' || process.platform === 'linux'
  }

  static async initialize(config: SandboxRuntimeConfig): Promise<void> {
    currentConfig = config
  }

  static updateConfig(config: SandboxRuntimeConfig): void {
    currentConfig = config
  }

  static async reset(): Promise<void> {
    currentConfig = {}
    violationStore = new SandboxViolationStore()
  }

  static wrapWithSandbox(command: string): string {
    return command
  }

  static getFsReadConfig(): FsReadRestrictionConfig {
    return (
      currentConfig.filesystem?.read ?? {
        denyOnly: [],
        allowWithinDeny: [],
      }
    )
  }

  static getFsWriteConfig(): FsWriteRestrictionConfig {
    return (
      currentConfig.filesystem?.write ?? {
        allowOnly: [],
        denyWithinAllow: [],
      }
    )
  }

  static getNetworkRestrictionConfig(): NetworkRestrictionConfig {
    return currentConfig.network ?? {}
  }

  static getIgnoreViolations(): IgnoreViolationsConfig | undefined {
    return currentConfig.ignoreViolations
  }

  static getAllowUnixSockets(): string[] | undefined {
    return currentConfig.allowUnixSockets
  }

  static getAllowLocalBinding(): boolean | undefined {
    return currentConfig.allowLocalBinding
  }

  static getEnableWeakerNestedSandbox(): boolean | undefined {
    return currentConfig.enableWeakerNestedSandbox
  }

  static getProxyPort(): number | undefined {
    return currentConfig.proxyPort
  }

  static getSocksProxyPort(): number | undefined {
    return currentConfig.socksProxyPort
  }

  static getLinuxHttpSocketPath(): string | undefined {
    return currentConfig.linuxHttpSocketPath
  }

  static getLinuxSocksSocketPath(): string | undefined {
    return currentConfig.linuxSocksSocketPath
  }

  static async waitForNetworkInitialization(): Promise<boolean> {
    return true
  }

  static getSandboxViolationStore(): SandboxViolationStore {
    return violationStore
  }

  static annotateStderrWithSandboxFailures(
    _command: string,
    stderr: string,
  ): string {
    return stderr
  }

  static cleanupAfterCommand(): void {
    // No process-level sandbox resources are allocated by the local runtime.
  }
}
