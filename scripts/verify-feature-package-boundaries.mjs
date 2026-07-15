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
      const list = run('tar', ['-tzf', archivePath]);
      if (list.status !== 0) {
        failures.push(`Unable to list package archive: ${list.stderr || list.stdout}`);
      } else {
        for (const requiredEntry of ['package.json', 'manifest.json', 'artifact.json', 'dist/index.js']) {
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
  ['src/renderer/App.tsx', 'ProjectStudio'],
  ['src/renderer/App.tsx', "AppView = 'chat' | 'projects' | 'tools' | 'automation' | 'history' | 'settings'"],
  ['main.tsx', "program.command('project')"],
  ['main.tsx', "program.command('automation')"],
  ['commands.ts', "commands/project/index.js"],
  ['commands.ts', "commands/team/index.js"],
  ['cli/handlers/project-studio.ts', 'runProjectStudioCommand'],
  ['cli/handlers/automation.ts', 'AutomationServiceBridge'],
];

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
