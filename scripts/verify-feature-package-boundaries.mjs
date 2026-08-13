#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const sdkRoot = process.env.CODEAGENT_FEATURE_SDK_ROOT
  ? path.resolve(process.env.CODEAGENT_FEATURE_SDK_ROOT)
  : path.resolve(repoRoot, '..', 'code-agent-sdk');
const packageRoot = process.env.CODEAGENT_FEATURE_PACKAGES_ROOT
  ? path.resolve(process.env.CODEAGENT_FEATURE_PACKAGES_ROOT)
  : path.resolve(repoRoot, '..', 'code-agent-packages');
const packageDistRoot = process.env.CODEAGENT_FEATURE_PACKAGE_DIST_ROOT
  ? path.resolve(process.env.CODEAGENT_FEATURE_PACKAGE_DIST_ROOT)
  : path.join(packageRoot, 'dist-feature-packages');
const strict = process.argv.includes('--strict');
const failures = [];
const warnings = [];

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

function run(command, args) {
  return spawnSync(command, args, {
    cwd: repoRoot,
    encoding: 'utf8',
  });
}

function requireFile(relativePath) {
  const filePath = path.join(repoRoot, relativePath);
  if (!existsSync(filePath)) {
    failures.push(`Missing ${relativePath}`);
  }
  return filePath;
}

function requireExternalFile(root, relativePath, label) {
  const filePath = path.join(root, relativePath);
  if (!existsSync(filePath)) {
    failures.push(`Missing ${label}: ${filePath}`);
  }
  return filePath;
}

const sourceManifestPath = requireExternalFile(packageRoot, 'software-developer/manifest.json', 'software-developer source manifest');
const packageJsonPath = requireExternalFile(packageRoot, 'software-developer/package.json', 'software-developer package.json');
const packageCliProjectPath = requireExternalFile(packageRoot, 'software-developer/src/cli/project-studio.ts', 'software-developer CLI project source');
const packageCliAutomationPath = requireExternalFile(packageRoot, 'software-developer/src/cli/automation.ts', 'software-developer CLI automation source');
const packageAutomationProviderPath = requireExternalFile(packageRoot, 'software-developer/src/automation-provider.ts', 'software-developer automation provider');
const sdkPath = requireExternalFile(sdkRoot, 'src/index.ts', 'feature package SDK');
const artifactManifestPath = requireExternalFile(packageDistRoot, 'software-developer/manifest.json', 'software-developer artifact manifest');
const artifactSummaryPath = requireExternalFile(packageDistRoot, 'software-developer/build-summary.json', 'software-developer artifact summary');
const catalogPath = requireFile('src/features/package-catalog/generated.ts');
const resolverPath = requireFile('src/features/feature-packages.ts');

if (failures.length === 0) {
  const sourceManifest = readJson(sourceManifestPath);
  const packageJson = readJson(packageJsonPath);
  const artifactManifest = readJson(artifactManifestPath);
  const summary = readJson(artifactSummaryPath);

  if (sourceManifest.id !== 'software-developer') {
    failures.push('software-developer source manifest has wrong id.');
  }
  if (packageJson.codeagentPackage?.packageId !== sourceManifest.id) {
    failures.push('software-developer package.json does not point at the manifest package id.');
  }
  if (sourceManifest.sdk?.name !== '@codeagent/feature-package-sdk') {
    failures.push('software-developer manifest does not declare the feature package SDK.');
  }
  if (!sourceManifest.entrypoints?.runtime) {
    failures.push('software-developer manifest does not declare a runtime entrypoint.');
  }
  if (!sourceManifest.entrypoints?.cli) {
    failures.push('software-developer manifest does not declare a separate CLI entrypoint.');
  }
  if (!Array.isArray(sourceManifest.extensions) || sourceManifest.extensions.length === 0) {
    failures.push('software-developer manifest does not declare any package extension points.');
  }
  if (artifactManifest.id !== sourceManifest.id || artifactManifest.version !== sourceManifest.version) {
    failures.push('dist-feature-packages manifest does not match the source manifest identity.');
  }
  if (!summary.archiveFile || !summary.archiveSha256) {
    failures.push('software-developer build summary is missing archive metadata.');
  } else {
    const archivePath = path.join(packageDistRoot, summary.archiveFile);
    if (!existsSync(archivePath)) {
      failures.push(`Missing package archive ${path.relative(repoRoot, archivePath)}`);
    } else if (statSync(archivePath).size === 0) {
      failures.push(`Package archive is empty: ${path.relative(repoRoot, archivePath)}`);
    } else {
      // Separate flags for portability across BSD tar (macOS) and GNU tar.
      const list = run('tar', ['-t', '-z', '-f', archivePath]);
      if (list.status !== 0) {
        failures.push(`Unable to list package archive: ${list.stderr || list.stdout}`);
      } else {
        for (const requiredEntry of ['package.json', 'manifest.json', 'artifact.json', 'dist/index.js', 'dist/cli.js']) {
          if (!list.stdout.split('\n').includes(requiredEntry)) {
            failures.push(`Package archive is missing ${requiredEntry}`);
          }
        }
      }
    }
  }
}

if (existsSync(resolverPath)) {
  const resolverText = readFileSync(resolverPath, 'utf8');
  if (resolverText.includes("displayName: 'Software Developer'")) {
    failures.push('Core resolver still embeds the Software Developer manifest body.');
  }
  if (resolverText.includes('../../package-sdk')) {
    failures.push('Core resolver still imports SDK types from the old local package-sdk folder.');
  }
}

if (existsSync(sdkPath)) {
  const sdkText = readFileSync(sdkPath, 'utf8');
  if (!sdkText.includes('FeaturePackageExtensionPoint') || !sdkText.includes('FeaturePackageRuntimeModule')) {
    failures.push('Feature package SDK is missing extension point or runtime module contracts.');
  }
}

if (existsSync(catalogPath)) {
  const catalogText = readFileSync(catalogPath, 'utf8');
  if (!catalogText.includes('Generated by scripts/generate-feature-package-catalog.mjs')) {
    failures.push('Core package catalog is not generated from package manifests.');
  }
  if (!catalogText.includes('"id": "software-developer"')) {
    failures.push('Generated package catalog is missing the software-developer manifest.');
  }
}

const oldCatalogPath = path.join(repoRoot, 'src/features/package-catalog/software-developer.ts');
if (existsSync(oldCatalogPath)) {
  failures.push('Core still has a package-specific software-developer catalog source file.');
}

for (const relativePath of ['feature-packages', 'package-sdk']) {
  if (existsSync(path.join(repoRoot, relativePath))) {
    failures.push(`Core repo still contains moved source directory: ${relativePath}`);
  }
}

const implementationMarkers = [
  ['src/renderer/App.tsx', 'function ProjectsView('],
  ['src/renderer/App.tsx', 'function ToolsView('],
  ['src/renderer/App.tsx', 'function AutomationView('],
  ['src/renderer/App.tsx', 'function HistoryView('],
];

const packagePolicyMarkers = [
  ['electron/services/automation-service-bridge.ts', 'parseTeamAssignmentPlan'],
  ['electron/services/automation-service-bridge.ts', 'createFallbackTeamAssignmentPlan'],
  ['electron/services/automation-service-bridge.ts', 'extractConfiguredProjectGoals'],
  ['electron/services/automation-service-bridge.ts', 'isPlanningRole'],
  ['electron/services/automation-service-bridge.ts', 'isReviewRole'],
  ['electron/services/automation-service-bridge.ts', 'software-developer'],
  ['electron/services/automation-service-bridge.ts', 'ASSIGNMENT.md'],
  ['electron/services-bridge.ts', 'local virtual software delivery team'],
  ['electron/services/app-state-service-bridge.ts', 'software-developer'],
  ['cli/feature-package-runtime.ts', 'SoftwareDeveloper'],
  ['cli/feature-package-runtime.ts', 'software-developer'],
  ['commands.ts', 'SOFTWARE_DEVELOPER_LOCAL_COMMANDS'],
  ['commands.ts', 'runSoftwareDeveloper'],
  ['main.tsx', 'registerSoftwareDeveloperCliCommand'],
  ['main.tsx', 'runSoftwareDeveloper'],
  ['src/renderer/App.tsx', "'software-developer'"],
];

const requiredProviderPolicyMarkers = [
  'buildPlannerPrompt(',
  'parseAssignmentPlan(',
  'validateAssignmentPlan(',
  'createFallbackAssignmentPlan(',
  'validateCompletedRun(',
];

for (const [relativePath, marker] of packagePolicyMarkers) {
  const filePath = path.join(repoRoot, relativePath);
  if (existsSync(filePath) && readFileSync(filePath, 'utf8').includes(marker)) {
    failures.push(`Core still owns package policy: ${relativePath} (${marker})`);
  }
}

if (existsSync(packageAutomationProviderPath)) {
  const providerSource = readFileSync(packageAutomationProviderPath, 'utf8');
  for (const marker of requiredProviderPolicyMarkers) {
    if (!providerSource.includes(marker)) {
      failures.push(`Software Developer package does not own required automation policy: ${marker}`);
    }
  }
}

const automationHostPath = path.join(repoRoot, 'electron/services/automation-service-bridge.ts');
if (existsSync(automationHostPath)) {
  const hostSource = readFileSync(automationHostPath, 'utf8');
  for (const delegation of [
    'provider.buildPlannerPrompt(',
    'provider.parseAssignmentPlan(',
    'provider.validateAssignmentPlan(',
    'provider.validateCompletedRun?.(',
  ]) {
    if (!hostSource.includes(delegation)) {
      failures.push(`Core workflow host is missing package-policy delegation: ${delegation}`);
    }
  }
  for (const forbidden of [
    'function parseAssignmentPlan(',
    'private parseAssignmentPlan(',
    'function buildPlannerPrompt(',
    'private buildPlannerPrompt(',
  ]) {
    if (hostSource.includes(forbidden)) {
      failures.push(`Core workflow host implements package policy instead of delegating it: ${forbidden}`);
    }
  }
}

const packageNavigationMarkers = [
  'DeveloperNavigationGroupId',
  'DEVELOPER_NAVIGATION_GROUPS',
  'PROJECTS_MENU',
  'TOOLS_MENU',
  'AUTOMATION_MENU',
  'HISTORY_MENU',
  'SOFTWARE_DEVELOPER_FEATURE_PACKAGE_ID',
];
const appRendererPath = path.join(repoRoot, 'src/renderer/App.tsx');
const resolverSource = existsSync(resolverPath) ? readFileSync(resolverPath, 'utf8') : '';
const rendererSource = existsSync(appRendererPath) ? readFileSync(appRendererPath, 'utf8') : '';
if (!resolverSource.includes('getFeatureOwnerPackageId(')) {
  failures.push('Core feature resolver is missing generic feature-owner discovery.');
}
for (const marker of packageNavigationMarkers) {
  if (rendererSource.includes(marker) || resolverSource.includes(marker)) {
    failures.push(`Core still owns Software Developer navigation metadata: ${marker}`);
  }
}

for (const [relativePath, marker] of implementationMarkers) {
  const filePath = path.join(repoRoot, relativePath);
  if (!existsSync(filePath)) {
    continue;
  }
  if (readFileSync(filePath, 'utf8').includes(marker)) {
    warnings.push(`Paid implementation marker still in core source: ${relativePath} (${marker})`);
  }
}

const distFeatureRoot = packageDistRoot;
if (existsSync(distFeatureRoot)) {
  const distEntries = readdirSync(distFeatureRoot);
  if (distEntries.length === 0) {
    failures.push('dist-feature-packages exists but is empty.');
  }
}

for (const relativePath of [
  'cli/handlers/project-studio.ts',
  'cli/handlers/automation.ts',
  'commands/project',
  'commands/role',
  'commands/employee',
  'commands/team',
]) {
  if (existsSync(path.join(repoRoot, relativePath))) {
    failures.push(`Core still contains paid CLI implementation source: ${relativePath}`);
  }
}

if (existsSync(packageCliProjectPath) && !readFileSync(packageCliProjectPath, 'utf8').includes('runProjectStudioCommand')) {
  failures.push('software-developer package CLI project source is missing runProjectStudioCommand.');
}
if (existsSync(packageCliAutomationPath) && !readFileSync(packageCliAutomationPath, 'utf8').includes('runAutomationCommand')) {
  failures.push('software-developer package CLI automation source is missing runAutomationCommand.');
}

const packageRuntimePath = path.join(packageRoot, 'software-developer/src/runtime.ts');
const packageCliPath = path.join(packageRoot, 'software-developer/src/cli.ts');
const packagedDesktopRuntimePath = path.join(packageDistRoot, 'software-developer/dist/index.js');
if (existsSync(packageRuntimePath) && readFileSync(packageRuntimePath, 'utf8').includes('runCliCommand')) {
  failures.push('software-developer desktop runtime must not import or expose CLI commands.');
}
if (!existsSync(packageCliPath) || !readFileSync(packageCliPath, 'utf8').includes('runCliCommand')) {
  failures.push('software-developer package CLI entrypoint is missing the generic runCliCommand entrypoint.');
}
if (existsSync(packagedDesktopRuntimePath)) {
  const packagedDesktopRuntime = readFileSync(packagedDesktopRuntimePath, 'utf8');
  for (const privateCoreModule of [
    'automation-service-bridge',
    'app-state-service-bridge',
    'services-bridge',
    'CODEAGENT_CORE_RUNTIME_ROOT',
  ]) {
    if (packagedDesktopRuntime.includes(privateCoreModule)) {
      failures.push(`Packaged desktop runtime imports private CodeAgent core module: ${privateCoreModule}`);
    }
  }
}

if (strict && warnings.length > 0) {
  failures.push(...warnings);
}

for (const warning of warnings) {
  console.warn(`Warning: ${warning}`);
}

if (failures.length > 0) {
  for (const failure of failures) {
    console.error(`Error: ${failure}`);
  }
  process.exit(1);
}

console.log('Feature package artifact boundary verified.');
console.log(strict ? 'Strict implementation extraction gate passed.' : 'Strict implementation extraction gate not requested.');
