#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const projectPath = path.join(root, 'ios/CodeAgentCompanion/CodeAgentCompanion.xcodeproj');
const projectFilePath = path.join(projectPath, 'project.pbxproj');
const scheme = 'CodeAgentCompanion';
const privacyManifestPath = path.join(
  root,
  'ios/CodeAgentCompanion/CodeAgentCompanion/PrivacyInfo.xcprivacy',
);
const outputRoot = path.join(root, 'dist-build', 'ios');
const buildRoot = path.join(outputRoot, 'build');
const objRoot = path.join(outputRoot, 'obj');
const derivedDataPath = path.join(outputRoot, 'DerivedData');
const resultBundlePath = path.join(outputRoot, 'ResultBundle.xcresult');
const simulatorAppPath = path.join(
  buildRoot,
  'Debug-iphonesimulator',
  'CodeAgentCompanion.app',
);

function cleanIntermediates() {
  rmSync(objRoot, { recursive: true, force: true });
  rmSync(derivedDataPath, { recursive: true, force: true });
  rmSync(resultBundlePath, { recursive: true, force: true });
}

function verifyPrivacyManifest() {
  if (!existsSync(privacyManifestPath)) {
    console.error(
      `Missing iOS privacy manifest: ${path.relative(root, privacyManifestPath)}`,
    );
    process.exit(1);
  }

  const manifestText = readFileSync(privacyManifestPath, 'utf8');
  if (!manifestText.includes('NSPrivacyAccessedAPICategoryUserDefaults')) {
    console.error('iOS privacy manifest must declare UserDefaults access.');
    process.exit(1);
  }
  if (!manifestText.includes('CA92.1')) {
    console.error('iOS privacy manifest must declare app-scoped UserDefaults reason CA92.1.');
    process.exit(1);
  }

  const projectText = readFileSync(projectFilePath, 'utf8');
  if (!projectText.includes('PrivacyInfo.xcprivacy in Resources')) {
    console.error('iOS privacy manifest must be included in the app resources build phase.');
    process.exit(1);
  }
}

verifyPrivacyManifest();

const destinations = spawnSync(
  'xcodebuild',
  ['-project', projectPath, '-scheme', scheme, '-showdestinations'],
  {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  },
);
const destinationsOutput = `${destinations.stdout ?? ''}${destinations.stderr ?? ''}`;
if (!destinationsOutput.includes('platform:iOS Simulator')) {
  cleanIntermediates();
  console.error(
    'iOS companion simulator build requires an installed iOS Simulator runtime. Install one from Xcode > Settings > Components, then rerun npm run verify:ios-companion.',
  );
  console.error(destinationsOutput.trim());
  process.exit(1);
}

rmSync(outputRoot, { recursive: true, force: true });
mkdirSync(outputRoot, { recursive: true });

const args = [
  '-project',
  projectPath,
  '-scheme',
  scheme,
  '-configuration',
  'Debug',
  '-sdk',
  'iphonesimulator',
  '-derivedDataPath',
  derivedDataPath,
  '-resultBundlePath',
  resultBundlePath,
  'CODE_SIGNING_ALLOWED=NO',
  `SYMROOT=${buildRoot}`,
  `OBJROOT=${objRoot}`,
  'build',
];

const result = spawnSync('xcodebuild', args, {
  cwd: root,
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'pipe'],
});

const output = `${result.stdout ?? ''}${result.stderr ?? ''}`.trim();
cleanIntermediates();

if (result.status !== 0) {
  console.error(output);
  process.exit(result.status ?? 1);
}

if (!existsSync(simulatorAppPath)) {
  console.error(
    `Expected simulator app was not created: ${path.relative(root, simulatorAppPath)}`,
  );
  process.exit(1);
}

const summaryLine = output
  .split('\n')
  .reverse()
  .find(line => line.includes('** BUILD SUCCEEDED **')) ?? '** BUILD SUCCEEDED **';
console.log(summaryLine.trim());
console.log(`iOS companion simulator app: ${path.relative(root, simulatorAppPath)}`);
console.log('iOS companion simulator build verified.');
