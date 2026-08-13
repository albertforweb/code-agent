import { existsSync, readFileSync, readdirSync, statSync } from 'fs';
import { homedir } from 'os';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import type { FeaturePackageCliModule } from '@codeagent/feature-package-sdk';

type FeaturePackageCliRuntime = Partial<FeaturePackageCliModule>;

export async function runFeaturePackageCliCommand(
  packageId: string,
  command: string,
  args: string,
): Promise<string> {
  const runtime = await loadFeaturePackageCliRuntime(packageId);
  if (!runtime.runCliCommand) {
    throw new Error(`Feature package "${packageId}" does not export runCliCommand.`);
  }
  return runtime.runCliCommand(command, args);
}

export async function loadFeaturePackageCliRuntime(
  packageId: string,
): Promise<FeaturePackageCliRuntime> {
  assertPackageId(packageId);
  const entrypoints = resolveFeaturePackageEntrypoints(packageId);
  if (entrypoints.length === 0) {
    throw new Error([
      `Feature package "${packageId}" runtime is not installed.`,
      `Run \`code-agent platform install ${packageId}\` or build the local package repository.`,
    ].join(' '));
  }

  process.env.CODEAGENT_CORE_RUNTIME_ROOT ??= resolveCodeAgentCoreRuntimeRoot();
  const errors: string[] = [];
  for (const entrypoint of entrypoints) {
    try {
      const runtime = await import(pathToFileURL(entrypoint).href) as FeaturePackageCliRuntime;
      if (runtime.runCliCommand) {
        return runtime;
      }
      errors.push(`${entrypoint}: missing runCliCommand export`);
    } catch (error) {
      errors.push(`${entrypoint}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  throw new Error(`No usable CLI runtime found for feature package "${packageId}". ${errors.join('; ')}`);
}

function resolveFeaturePackageEntrypoints(packageId: string): string[] {
  const entrypoints: string[] = [];
  const explicit = process.env[packageEntrypointEnvironmentKey(packageId)]?.trim();
  if (explicit) {
    entrypoints.push(path.resolve(explicit));
  }

  const installed = findInstalledPackageEntrypoint(packageId);
  if (installed) {
    entrypoints.push(installed);
  }

  for (const packageRepositoryRoot of [
    path.resolve(process.cwd(), '..', 'code-agent-packages'),
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'code-agent-packages'),
  ]) {
    const packageRoot = path.join(packageRepositoryRoot, 'dist-feature-packages', packageId);
    const candidate = resolveCliEntrypoint(packageRoot);
    if (existsSync(candidate)) {
      entrypoints.push(candidate);
    }
  }

  return [...new Set(entrypoints)];
}

function findInstalledPackageEntrypoint(packageId: string): string | undefined {
  const packageRoot = path.join(getCodeAgentConfigHomeDir(), 'feature-packages', packageId);
  if (!existsSync(packageRoot)) {
    return undefined;
  }

  return readdirSync(packageRoot)
    .map(name => path.join(packageRoot, name))
    .filter(candidate => statSync(candidate).isDirectory())
    .map(resolveCliEntrypoint)
    .filter(candidate => existsSync(candidate))
    .sort((left, right) => statSync(right).mtimeMs - statSync(left).mtimeMs)[0];
}

function resolveCliEntrypoint(packageRoot: string): string {
  const manifestPath = path.join(packageRoot, 'manifest.json');
  if (existsSync(manifestPath)) {
    try {
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
        entrypoints?: { cli?: string };
      };
      const relativeEntrypoint = manifest.entrypoints?.cli?.trim();
      if (relativeEntrypoint) {
        const resolved = path.resolve(packageRoot, relativeEntrypoint);
        const relative = path.relative(packageRoot, resolved);
        if (relative && !relative.startsWith('..') && !path.isAbsolute(relative)) {
          return resolved;
        }
      }
    } catch {
      // Fall through for packages built before the dedicated CLI entrypoint.
    }
  }
  return path.join(packageRoot, 'dist', 'index.js');
}

function packageEntrypointEnvironmentKey(packageId: string): string {
  const normalizedPackageId = packageId.replace(/[^a-zA-Z0-9]+/g, '_').toUpperCase();
  return `CODEAGENT_FEATURE_PACKAGE_${normalizedPackageId}_ENTRYPOINT`;
}

function assertPackageId(packageId: string): void {
  if (!/^[a-z0-9][a-z0-9._-]*$/i.test(packageId)) {
    throw new Error(`Invalid feature package id: ${packageId}`);
  }
}

function resolveCodeAgentCoreRuntimeRoot(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
}

function getCodeAgentConfigHomeDir(): string {
  return (
    process.env.CODEAGENT_CONFIG_DIR ??
    process.env.CODE_AGENT_CONFIG_DIR ??
    path.join(homedir(), '.code-agent')
  ).normalize('NFC');
}
