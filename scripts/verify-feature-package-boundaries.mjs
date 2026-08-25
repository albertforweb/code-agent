#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const sdkRoot = path.resolve(process.env.CODEAGENT_FEATURE_SDK_ROOT ?? path.join(repoRoot, '..', 'code-agent-sdk'));
const packageRoot = path.resolve(process.env.CODEAGENT_FEATURE_PACKAGES_ROOT ?? path.join(repoRoot, '..', 'code-agent-packages'));
const packageDistRoot = path.resolve(
  process.env.CODEAGENT_FEATURE_PACKAGE_DIST_ROOT ?? path.join(packageRoot, 'dist-feature-packages'),
);
const strict = process.argv.includes('--strict');
const failures = [];

const readJson = filePath => JSON.parse(readFileSync(filePath, 'utf8'));
const readText = filePath => readFileSync(filePath, 'utf8');
const relative = filePath => path.relative(repoRoot, filePath);

function requireFile(filePath, label) {
  if (!existsSync(filePath)) failures.push(`Missing ${label}: ${filePath}`);
  return filePath;
}

function discoverPackages() {
  if (!existsSync(packageRoot)) {
    failures.push(`Feature package repository is missing: ${packageRoot}`);
    return [];
  }
  return readdirSync(packageRoot, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => ({ id: entry.name, root: path.join(packageRoot, entry.name) }))
    .filter(entry => existsSync(path.join(entry.root, 'manifest.json')))
    .map(entry => ({ ...entry, manifest: readJson(path.join(entry.root, 'manifest.json')) }))
    .sort((left, right) => left.id.localeCompare(right.id));
}

function sourcePathForEntrypoint(packageEntry, kind) {
  const extension = kind === 'renderer' ? 'tsx' : 'ts';
  return path.join(packageEntry.root, 'src', `${kind === 'runtime' ? 'runtime' : kind}.${extension}`);
}

function validateSdkContract() {
  const sdkPath = requireFile(path.join(sdkRoot, 'src', 'index.ts'), 'feature package SDK');
  if (!existsSync(sdkPath)) return;
  const sdk = readText(sdkPath);
  for (const contract of [
    'FeaturePackageManifest',
    'FeaturePackageRuntimeModule',
    'FeaturePackageCliModule',
    'FeaturePackageRendererModule',
    'FeaturePackageRendererContribution',
    'FeaturePackageAutomationProvider',
  ]) {
    if (!sdk.includes(contract)) failures.push(`Feature package SDK is missing ${contract}.`);
  }
}

function validatePackageSource(packageEntry) {
  const { id, manifest, root } = packageEntry;
  const packageJsonPath = requireFile(path.join(root, 'package.json'), `${id} package.json`);
  if (!existsSync(packageJsonPath)) return;
  const packageJson = readJson(packageJsonPath);

  if (manifest.id !== id) failures.push(`Package directory ${id} does not match manifest id ${manifest.id}.`);
  if (packageJson.codeagentPackage?.packageId !== id) failures.push(`${id} package.json does not match its manifest id.`);
  if (manifest.sdk?.name !== '@codeagent/feature-package-sdk') failures.push(`${id} does not declare the feature package SDK.`);
  if (!manifest.entrypoints?.runtime) failures.push(`${id} does not declare a runtime entrypoint.`);
  if (!Array.isArray(manifest.extensions) || manifest.extensions.length === 0) failures.push(`${id} declares no extension points.`);

  const contractByEntrypoint = {
    runtime: 'FeaturePackageRuntimeModule',
    cli: 'FeaturePackageCliModule',
    renderer: 'FeaturePackageRendererModule',
  };
  for (const [kind, contract] of Object.entries(contractByEntrypoint)) {
    if (!manifest.entrypoints?.[kind]) continue;
    const sourcePath = requireFile(sourcePathForEntrypoint(packageEntry, kind), `${id} ${kind} source`);
    if (!existsSync(sourcePath)) continue;
    const source = readText(sourcePath);
    if (!source.includes('@codeagent/feature-package-sdk') || !source.includes(contract)) {
      failures.push(`${id} ${kind} entrypoint does not implement the SDK-owned ${contract} contract.`);
    }
  }
}

function validatePackageArtifact(packageEntry) {
  const { id, manifest } = packageEntry;
  const artifactRoot = path.join(packageDistRoot, id);
  const artifactManifestPath = requireFile(path.join(artifactRoot, 'manifest.json'), `${id} artifact manifest`);
  const summaryPath = requireFile(path.join(artifactRoot, 'build-summary.json'), `${id} build summary`);
  if (!existsSync(artifactManifestPath) || !existsSync(summaryPath)) return;

  const artifactManifest = readJson(artifactManifestPath);
  const summary = readJson(summaryPath);
  if (artifactManifest.id !== manifest.id || artifactManifest.version !== manifest.version) {
    failures.push(`${id} artifact manifest does not match source identity.`);
  }
  if (!summary.archiveFile || !summary.archiveSha256) {
    failures.push(`${id} build summary is missing archive metadata.`);
    return;
  }
  const archivePath = path.join(packageDistRoot, summary.archiveFile);
  if (!existsSync(archivePath) || statSync(archivePath).size === 0) {
    failures.push(`${id} archive is missing or empty: ${archivePath}`);
    return;
  }
  const listed = spawnSync('tar', ['-t', '-z', '-f', archivePath], { encoding: 'utf8' });
  if (listed.status !== 0) {
    failures.push(`Unable to list ${id} archive: ${listed.stderr || listed.stdout}`);
    return;
  }
  const entries = new Set(listed.stdout.split('\n').filter(Boolean));
  const requiredEntries = [
    'package.json',
    'manifest.json',
    'artifact.json',
    ...Object.values(manifest.entrypoints ?? {}).filter(value => typeof value === 'string'),
  ];
  for (const entry of requiredEntries) {
    if (!entries.has(entry)) failures.push(`${id} archive is missing ${entry}.`);
  }
}

function validateGeneratedRegistries(packages) {
  const catalogPath = requireFile(
    path.join(repoRoot, 'src', 'features', 'package-catalog', 'generated.ts'),
    'generated package catalog',
  );
  if (existsSync(catalogPath)) {
    const catalog = readText(catalogPath);
    if (!catalog.includes('Generated by scripts/generate-feature-package-catalog.mjs')) {
      failures.push('Core package catalog is not generated from package manifests.');
    }
    for (const { id } of packages) {
      if (!catalog.includes(JSON.stringify(id))) failures.push(`Generated catalog is missing ${id}.`);
    }
  }
  const rendererRegistryPath = path.join(repoRoot, 'src', 'features', 'package-renderers', 'generated.ts');
  if (existsSync(rendererRegistryPath)) {
    failures.push('Core must not generate static imports for feature package renderers.');
  }
  const rendererLoaderPath = requireFile(
    path.join(repoRoot, 'src', 'features', 'load-feature-package-renderers.ts'),
    'runtime feature package renderer loader',
  );
  if (existsSync(rendererLoaderPath)) {
    const loader = readText(rendererLoaderPath);
    if (!loader.includes('registerFeaturePackageRendererModule')) {
      failures.push('Runtime renderer loader does not register modules through the SDK host.');
    }
    if (loader.includes('code-agent-packages') || loader.includes('dist-feature-packages')) {
      failures.push('Runtime renderer loader directly references the package repository or distribution tree.');
    }
  }
}

function walkSourceFiles(root) {
  if (!existsSync(root)) return [];
  const files = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const filePath = path.join(root, entry.name);
    if (entry.isDirectory()) files.push(...walkSourceFiles(filePath));
    else if (/\.(?:ts|tsx|js|mjs)$/.test(entry.name) && !/\.test\./.test(entry.name)) files.push(filePath);
  }
  return files;
}

function validateCoreSeparation(packages) {
  const corePackageJson = readJson(path.join(repoRoot, 'package.json'));
  const embeddedPackageResources = (corePackageJson.build?.extraResources ?? [])
    .filter(entry => typeof entry?.from === 'string' && /code-agent-packages|dist-feature-packages/.test(entry.from));
  if (embeddedPackageResources.length > 0) {
    failures.push('Base desktop packaging embeds separately distributed feature package artifacts.');
  }
  const generatedRoots = [
    path.join(repoRoot, 'src', 'features', 'package-catalog', 'generated.ts'),
  ];
  const coreFiles = [
    ...walkSourceFiles(path.join(repoRoot, 'src')),
    ...walkSourceFiles(path.join(repoRoot, 'electron')),
    ...walkSourceFiles(path.join(repoRoot, 'cli')),
    ...walkSourceFiles(path.join(repoRoot, 'services')),
    ...walkSourceFiles(path.join(repoRoot, 'tools')),
    ...walkSourceFiles(path.join(repoRoot, 'utils')),
    path.join(repoRoot, 'main.tsx'),
    path.join(repoRoot, 'commands.ts'),
  ].filter(filePath => existsSync(filePath) && !generatedRoots.includes(filePath));

  for (const filePath of coreFiles) {
    const source = readText(filePath);
    if (/from\s+['"][^'"]*code-agent-packages\//.test(source)) {
      failures.push(`Core imports a feature package implementation directly: ${relative(filePath)}.`);
    }
    for (const { id, manifest } of packages) {
      const packageIdentityMarkers = [JSON.stringify(id), JSON.stringify(manifest.displayName)];
      if (packageIdentityMarkers.some(marker => marker !== 'undefined' && source.includes(marker))) {
        failures.push(`Core hard-codes package identity ${id}: ${relative(filePath)}.`);
      }
    }
  }

  const rendererHostPath = path.join(repoRoot, 'src', 'features', 'feature-package-renderers.ts');
  if (!existsSync(rendererHostPath) || !readText(rendererHostPath).includes('FeaturePackageRendererContribution')) {
    failures.push('Core renderer host does not consume the SDK-owned renderer contribution contract.');
  }
  const rendererBundlePath = path.join(repoRoot, 'dist-renderer', 'index.js');
  if (existsSync(rendererBundlePath) && readText(rendererBundlePath).includes('code-agent-packages/dist-feature-packages')) {
    failures.push('Core renderer bundle contains a statically linked feature package artifact.');
  }
  const automationHostPath = path.join(repoRoot, 'electron', 'services', 'automation-service-bridge.ts');
  if (existsSync(automationHostPath)) {
    const host = readText(automationHostPath);
    for (const delegation of ['provider.buildPlannerPrompt(', 'provider.parseAssignmentPlan(', 'provider.validateAssignmentPlan(']) {
      if (!host.includes(delegation)) failures.push(`Core workflow host is missing SDK provider delegation: ${delegation}`);
    }
  }
}

const packages = discoverPackages();
if (packages.length === 0) failures.push('No feature packages were discovered.');
validateSdkContract();
for (const packageEntry of packages) {
  validatePackageSource(packageEntry);
  validatePackageArtifact(packageEntry);
}
validateGeneratedRegistries(packages);
validateCoreSeparation(packages);

if (failures.length > 0) {
  for (const failure of failures) console.error(`Error: ${failure}`);
  process.exit(1);
}

console.log(`Feature package SDK boundary verified for ${packages.length} package(s).`);
console.log(strict ? 'Strict core/package separation gate passed.' : 'Strict separation gate not requested.');
