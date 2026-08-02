import { existsSync, readdirSync, statSync } from 'fs';
import { homedir } from 'os';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

export interface SoftwareDeveloperCliRuntime {
  runProjectStudioCommand?: (args: string, scope?: string) => Promise<string>;
  runAutomationCommand?: (args: string) => Promise<string>;
}

export async function loadSoftwareDeveloperCliRuntime(): Promise<SoftwareDeveloperCliRuntime> {
  const entrypoints = resolveSoftwareDeveloperEntrypoints();
  if (entrypoints.length === 0) {
    throw new Error([
      'Software Developer package runtime is not installed.',
      'Run `code-agent platform install software-developer` or build the local package repo.',
    ].join(' '));
  }

  process.env.CODEAGENT_CORE_RUNTIME_ROOT ??= resolveCodeAgentCoreRuntimeRoot();
  const errors: string[] = [];
  for (const entrypoint of entrypoints) {
    try {
      const runtime = await import(pathToFileURL(entrypoint).href) as SoftwareDeveloperCliRuntime;
      if (runtime.runProjectStudioCommand || runtime.runAutomationCommand) {
        return runtime;
      }
      errors.push(`${entrypoint}: missing CLI exports`);
    } catch (error) {
      errors.push(`${entrypoint}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  throw new Error(`No usable Software Developer package runtime found. ${errors.join('; ')}`);
}

export async function runSoftwareDeveloperProjectCommand(args: string, scope: string): Promise<string> {
  const runtime = await loadSoftwareDeveloperCliRuntime();
  if (!runtime.runProjectStudioCommand) {
    throw new Error('Software Developer package runtime does not export runProjectStudioCommand.');
  }
  return runtime.runProjectStudioCommand(args, scope);
}

export async function runSoftwareDeveloperAutomationCommand(args: string): Promise<string> {
  const runtime = await loadSoftwareDeveloperCliRuntime();
  if (!runtime.runAutomationCommand) {
    throw new Error('Software Developer package runtime does not export runAutomationCommand.');
  }
  return runtime.runAutomationCommand(args);
}

function resolveSoftwareDeveloperEntrypoints(): string[] {
  const entrypoints: string[] = [];
  const explicit = process.env.CODEAGENT_SOFTWARE_DEVELOPER_PACKAGE_ENTRYPOINT?.trim();
  if (explicit) {
    entrypoints.push(path.resolve(explicit));
  }

  const installed = findInstalledPackageEntrypoint();
  if (installed) {
    entrypoints.push(installed);
  }

  const devCandidate = path.resolve(
    process.cwd(),
    '..',
    'code-agent-packages',
    'dist-feature-packages',
    'software-developer',
    'dist',
    'index.js',
  );
  if (existsSync(devCandidate)) {
    entrypoints.push(devCandidate);
  }

  const repoRelativeCandidate = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '..',
    '..',
    '..',
    'code-agent-packages',
    'dist-feature-packages',
    'software-developer',
    'dist',
    'index.js',
  );
  if (existsSync(repoRelativeCandidate)) {
    entrypoints.push(repoRelativeCandidate);
  }

  return [...new Set(entrypoints)];
}

function findInstalledPackageEntrypoint(): string | undefined {
  const packageRoot = path.join(getCodeAgentConfigHomeDir(), 'feature-packages', 'software-developer');
  if (!existsSync(packageRoot)) {
    return undefined;
  }

  const versions = readdirSync(packageRoot)
    .map(name => path.join(packageRoot, name, 'dist', 'index.js'))
    .filter(candidate => existsSync(candidate))
    .sort((left, right) => statSync(right).mtimeMs - statSync(left).mtimeMs);
  return versions[0];
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
