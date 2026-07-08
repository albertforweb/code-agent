#!/usr/bin/env node

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const packageJson = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));

const options = {
  strictIos: false,
};

for (const arg of process.argv.slice(2)) {
  if (arg === '--strict-ios') {
    options.strictIos = true;
    continue;
  }
  if (arg === '--help' || arg === '-h') {
    printHelp();
    process.exit(0);
  }
  throw new Error(`Unknown option: ${arg}`);
}

const warnings = [];
const failures = [];
const checks = [];

function record(name, status, detail = '') {
  checks.push({ name, status, detail });
}

function fail(message) {
  failures.push(message);
}

function warn(message) {
  warnings.push(message);
}

function runCheck(name, command, args) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`.trim();

  if ((result.status ?? 1) !== 0) {
    record(name, 'failed', output);
    fail(`${name} failed${output ? `:\n${output}` : ''}`);
    return false;
  }

  record(name, 'passed', lastNonEmptyLine(output));
  return true;
}

function runProbe(command, args) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return {
    status: result.status ?? (result.error ? 1 : 0),
    output: `${result.stdout ?? ''}${result.stderr ?? ''}`.trim(),
  };
}

function lastNonEmptyLine(output) {
  return output
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .pop() ?? '';
}

function findFiles(baseDir, predicate) {
  const matches = [];
  if (!existsSync(baseDir)) return matches;

  function visit(current) {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const entryPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        visit(entryPath);
      } else if (entry.isFile() && predicate(entryPath, entry.name)) {
        matches.push(entryPath);
      }
    }
  }

  visit(baseDir);
  return matches;
}

function verifyArtifactLayout() {
  const distBuildPath = path.join(root, 'dist-build');
  if (!existsSync(distBuildPath)) {
    fail('dist-build/ is missing. Run npm run pack:phase5 or the individual pack commands first.');
    record('artifact layout', 'failed', 'dist-build/ missing');
    return;
  }

  const finderMetadata = findFiles(distBuildPath, (_filePath, fileName) => fileName === '.DS_Store');
  if (finderMetadata.length > 0) {
    fail(
      `Generated artifact tree contains Finder metadata:\n${finderMetadata
        .map(filePath => `- ${path.relative(root, filePath)}`)
        .join('\n')}`,
    );
  }

  const cliTarball = path.join(
    distBuildPath,
    'cli',
    `code-agent-${packageJson.version}.tgz`,
  );
  if (!existsSync(cliTarball)) {
    fail(`Missing CLI tarball: ${path.relative(root, cliTarball)}`);
  } else if (statSync(cliTarball).size < 1_000_000) {
    fail(`CLI tarball is unexpectedly small: ${path.relative(root, cliTarball)}`);
  }

  const desktopApp = path.join(distBuildPath, 'mac-arm64', 'CodeAgent.app');
  if (!existsSync(desktopApp)) {
    fail(`Missing macOS desktop app: ${path.relative(root, desktopApp)}`);
  }

  const releaseNotes = path.join(
    distBuildPath,
    'release-notes',
    `CodeAgent-v${packageJson.version}.md`,
  );
  if (!existsSync(releaseNotes)) {
    fail(`Missing release notes artifact: ${path.relative(root, releaseNotes)}`);
  } else {
    const releaseNotesText = readFileSync(releaseNotes, 'utf8');
    const expectedHeading = `# CodeAgent v${packageJson.version} Release Notes`;
    if (
      !releaseNotesText.includes(expectedHeading) ||
      !releaseNotesText.includes('## Verification Checklist') ||
      !releaseNotesText.includes('## Deferred Public Distribution Gates')
    ) {
      fail(`Release notes artifact is malformed: ${path.relative(root, releaseNotes)}`);
    }
  }

  record(
    'artifact layout',
    failures.length === 0 ? 'passed' : 'failed',
    'dist-build/ contains CLI, desktop, and release-note outputs',
  );
}

function verifyIosReadiness() {
  const privacyManifest = path.join(
    root,
    'ios',
    'CodeAgentCompanion',
    'CodeAgentCompanion',
    'PrivacyInfo.xcprivacy',
  );
  if (!existsSync(privacyManifest)) {
    fail(`Missing iOS privacy manifest: ${path.relative(root, privacyManifest)}`);
  } else {
    const manifestText = readFileSync(privacyManifest, 'utf8');
    if (
      !manifestText.includes('NSPrivacyAccessedAPICategoryUserDefaults') ||
      !manifestText.includes('CA92.1')
    ) {
      fail('iOS privacy manifest must declare app-scoped UserDefaults usage.');
    }
  }

  const simulatorApp = path.join(
    root,
    'dist-build',
    'ios',
    'build',
    'Debug-iphonesimulator',
    'CodeAgentCompanion.app',
  );

  if (existsSync(simulatorApp)) {
    record('iOS simulator artifact', 'passed', path.relative(root, simulatorApp));
    return;
  }

  const projectPath = path.join(root, 'ios/CodeAgentCompanion/CodeAgentCompanion.xcodeproj');
  const destinations = runProbe('xcodebuild', [
    '-project',
    projectPath,
    '-scheme',
    'CodeAgentCompanion',
    '-showdestinations',
  ]);

  if (destinations.output.includes('platform:iOS Simulator')) {
    const passed = runCheck('iOS companion verifier', 'npm', [
      'run',
      'verify:ios-companion',
    ]);
    if (!passed && options.strictIos) {
      fail('Strict iOS verification failed.');
    }
    return;
  }

  const message =
    'No iOS Simulator runtime is installed, so the simulator app cannot be built on this machine.';
  if (options.strictIos) {
    fail(message);
    record('iOS simulator artifact', 'failed', message);
  } else {
    warn(`${message} Install a runtime in Xcode > Settings > Components, then run npm run verify:ios-companion.`);
    record('iOS simulator artifact', 'skipped', 'missing local iOS Simulator runtime');
  }
}

function printHelp() {
  console.log(`Usage: node scripts/verify-phase5.mjs [options]

Options:
  --strict-ios   Fail when the iOS simulator artifact cannot be built locally.
  -h, --help     Show this help.
`);
}

verifyArtifactLayout();
runCheck('CLI package verifier', 'npm', ['run', 'verify:cli-package']);
runCheck('desktop package verifier', 'npm', ['run', 'verify:desktop-package']);
runCheck('remote-control scope verifier', 'npm', [
  'run',
  'verify:remote-control-scope',
]);
runCheck('remote-control local API smoke', 'npm', [
  'run',
  'verify:remote-control-smoke',
]);
verifyIosReadiness();

for (const check of checks) {
  const suffix = check.detail ? ` - ${check.detail}` : '';
  console.log(`${check.status.toUpperCase()}: ${check.name}${suffix}`);
}

if (warnings.length > 0) {
  console.warn('\nWarnings:');
  for (const warning of warnings) {
    console.warn(`- ${warning}`);
  }
}

if (failures.length > 0) {
  console.error('\nPhase 5 verification failed:');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log('\nPhase 5 local package verification passed.');
