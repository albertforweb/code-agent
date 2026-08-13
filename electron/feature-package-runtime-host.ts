import type {
  FeaturePackageAutomationProvider,
  FeaturePackageLogger,
  FeaturePackageManifest,
  FeaturePackageRuntimeModule,
} from '@codeagent/feature-package-sdk';
import { readdir, readFile, realpath } from 'fs/promises';
import { homedir } from 'os';
import * as path from 'path';
import { pathToFileURL } from 'url';

export interface FeaturePackageRuntimeHostOptions {
  registerAutomationProvider(provider: FeaturePackageAutomationProvider, packageId: string): void;
  logger?: FeaturePackageLogger;
}

const dynamicImport = new Function('specifier', 'return import(specifier)') as (
  specifier: string,
) => Promise<Record<string, unknown>>;

function getFeaturePackageRoot(): string {
  const configRoot = process.env.CODEAGENT_CONFIG_DIR
    ?? process.env.CODE_AGENT_CONFIG_DIR
    ?? path.join(homedir(), '.code-agent');
  return path.join(configRoot.normalize('NFC'), 'feature-packages');
}

function defaultLogger(packageId: string): FeaturePackageLogger {
  return {
    debug(message, metadata) { console.debug(`[feature-package:${packageId}] ${message}`, metadata ?? ''); },
    info(message, metadata) { console.info(`[feature-package:${packageId}] ${message}`, metadata ?? ''); },
    warn(message, metadata) { console.warn(`[feature-package:${packageId}] ${message}`, metadata ?? ''); },
    error(message, metadata) { console.error(`[feature-package:${packageId}] ${message}`, metadata ?? ''); },
  };
}

function compareVersionsDescending(left: string, right: string): number {
  return right.localeCompare(left, undefined, { numeric: true, sensitivity: 'base' });
}

async function resolveLatestInstalledVersion(packageDir: string): Promise<string | undefined> {
  const entries = await readdir(packageDir, { withFileTypes: true });
  return entries
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name)
    .sort(compareVersionsDescending)[0];
}

function validatePackageId(packageId: string): string {
  const normalized = packageId.trim();
  if (!normalized || !/^[a-z0-9][a-z0-9._-]*$/i.test(normalized)) {
    throw new Error(`Feature package ID is invalid: ${packageId || 'missing'}`);
  }
  return normalized;
}

async function resolveRuntimePath(packageRoot: string, relativeEntrypoint: string): Promise<string> {
  const canonicalRoot = await realpath(packageRoot);
  const canonicalRuntime = await realpath(path.resolve(packageRoot, relativeEntrypoint));
  if (canonicalRuntime !== canonicalRoot && !canonicalRuntime.startsWith(`${canonicalRoot}${path.sep}`)) {
    throw new Error(`Runtime entrypoint escapes its installed package: ${relativeEntrypoint}`);
  }
  return canonicalRuntime;
}

function readRuntimeModule(imported: Record<string, unknown>): FeaturePackageRuntimeModule {
  const candidate = (imported.default ?? imported) as Partial<FeaturePackageRuntimeModule>;
  if (!candidate || typeof candidate.activate !== 'function' || typeof candidate.packageId !== 'string') {
    throw new Error('Runtime entrypoint does not export a valid feature-package runtime module.');
  }
  return candidate as FeaturePackageRuntimeModule;
}

/**
 * Activates installed package runtimes without importing any professional workflow
 * into the core app. Packages register their own policy providers through the SDK.
 */
export async function activateInstalledFeaturePackageRuntimes(
  options: FeaturePackageRuntimeHostOptions,
): Promise<void> {
  const root = getFeaturePackageRoot();
  let packageEntries;
  try {
    packageEntries = await readdir(root, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
    throw error;
  }

  for (const packageEntry of packageEntries.filter(entry => entry.isDirectory())) {
    try {
      await activateInstalledFeaturePackageRuntime(packageEntry.name, options);
    } catch (error) {
      console.warn(`Unable to activate installed feature package ${packageEntry.name}.`, error);
    }
  }
}

/**
 * Activates one installed runtime. This is also used after Store installation so
 * a package becomes usable in the current process instead of requiring a restart.
 */
export async function activateInstalledFeaturePackageRuntime(
  packageId: string,
  options: FeaturePackageRuntimeHostOptions,
): Promise<boolean> {
  const normalizedPackageId = validatePackageId(packageId);
  const packageDir = path.join(getFeaturePackageRoot(), normalizedPackageId);
  const version = await resolveLatestInstalledVersion(packageDir);
  if (!version) return false;

  const packageRoot = path.join(packageDir, version);
  const manifest = JSON.parse(await readFile(path.join(packageRoot, 'manifest.json'), 'utf8')) as FeaturePackageManifest;
  if (manifest.id !== normalizedPackageId) {
    throw new Error(`Installed manifest id ${manifest.id} does not match package directory ${normalizedPackageId}.`);
  }
  const runtimeEntrypoint = manifest.entrypoints?.runtime;
  if (!runtimeEntrypoint || !manifest.supportedShells.includes('desktop')) return false;

  const runtimePath = await resolveRuntimePath(packageRoot, runtimeEntrypoint);
  // Reinstalling the same semantic version replaces files at the same path. A
  // cache-busting query ensures Electron loads the newly verified runtime.
  const runtimeUrl = new URL(pathToFileURL(runtimePath).href);
  runtimeUrl.searchParams.set('activation', `${Date.now()}-${Math.random().toString(36).slice(2)}`);
  const runtime = readRuntimeModule(await dynamicImport(runtimeUrl.href));
  if (runtime.packageId !== manifest.id) {
    throw new Error(`Runtime package id ${runtime.packageId} does not match manifest id ${manifest.id}.`);
  }

  await runtime.activate({
    shell: 'desktop',
    packageRoot,
    manifest,
    logger: options.logger ?? defaultLogger(manifest.id),
    registerExtension() {
      // Navigation and renderer extensions are loaded from signed manifest metadata.
    },
    registerAutomationProvider: provider => options.registerAutomationProvider(provider, manifest.id),
  });
  return true;
}
