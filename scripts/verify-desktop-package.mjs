#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import plist from 'plist';

const args = process.argv.slice(2);
const options = {
  app: '',
  release: false,
  requireNotarized: false,
  skipCodesign: false,
};

for (let i = 0; i < args.length; i += 1) {
  const arg = args[i];
  if (arg === '--help' || arg === '-h') {
    printHelp();
    process.exit(0);
  }
  if (arg === '--release') {
    options.release = true;
    continue;
  }
  if (arg === '--require-notarized') {
    options.requireNotarized = true;
    continue;
  }
  if (arg === '--skip-codesign') {
    options.skipCodesign = true;
    continue;
  }
  if (arg === '--app') {
    options.app = args[i + 1] ?? '';
    i += 1;
    continue;
  }
  if (arg.startsWith('--app=')) {
    options.app = arg.slice('--app='.length);
    continue;
  }
  throw new Error(`Unknown option: ${arg}`);
}

const root = process.cwd();
const packageJsonPath = path.join(root, 'package.json');
const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
const buildConfig = packageJson.build ?? {};
const productName = buildConfig.productName ?? 'CodeAgent';
const appId = buildConfig.appId ?? 'com.albertforweb.codeagent';
const version = packageJson.version;
const failures = [];
const warnings = [];

const appPath = path.resolve(root, options.app || findMacAppPath(root, productName));
const contentsPath = path.join(appPath, 'Contents');
const resourcesPath = path.join(contentsPath, 'Resources');
const infoPlistPath = path.join(contentsPath, 'Info.plist');
const executablePath = path.join(contentsPath, 'MacOS', productName);
const appAsarPath = path.join(resourcesPath, 'app.asar');
const updateConfigPath = path.join(resourcesPath, 'app-update.yml');
const iconPath = path.join(resourcesPath, 'icon.icns');

mustExist(appPath, 'packaged macOS app');
mustExist(infoPlistPath, 'Info.plist');
mustExist(executablePath, 'app executable');
mustExist(appAsarPath, 'app.asar');
mustExist(iconPath, 'macOS app icon');

if (existsSync(infoPlistPath)) {
  verifyInfoPlist(infoPlistPath);
}

if (existsSync(executablePath)) {
  verifyExecutable(executablePath);
}

if (existsSync(appAsarPath)) {
  verifyAsar(appAsarPath);
}

if (existsSync(updateConfigPath)) {
  verifyUpdateConfig(updateConfigPath);
} else if (options.release) {
  failures.push('Release verification requires Contents/Resources/app-update.yml for electron-updater.');
} else {
  warnings.push('Contents/Resources/app-update.yml is not present; local --dir packages disable update checks.');
}

verifyNoLegacyProviderTerms([
  infoPlistPath,
  updateConfigPath,
].filter(existsSync));

if (process.platform === 'darwin' && !options.skipCodesign) {
  verifyCodesign(appPath);
  verifyGatekeeper(appPath);
}

if (warnings.length > 0) {
  for (const warning of warnings) {
    console.warn(`Warning: ${warning}`);
  }
}

if (failures.length > 0) {
  for (const failure of failures) {
    console.error(`Error: ${failure}`);
  }
  process.exit(1);
}

console.log(`Desktop package verified: ${path.relative(root, appPath)}`);
console.log(`Product: ${productName}`);
console.log(`Version: ${version}`);
console.log(`Release mode: ${options.release ? 'yes' : 'no'}`);

function printHelp() {
  console.log(`Usage: node scripts/verify-desktop-package.mjs [options]

Options:
  --app <path>           Path to CodeAgent.app. Defaults to dist-build/**/CodeAgent.app.
  --release              Require release-only metadata and Developer ID signing.
  --require-notarized    Require Gatekeeper assessment to pass.
  --skip-codesign        Skip macOS codesign and Gatekeeper checks.
  -h, --help             Show this help.
`);
}

function findMacAppPath(baseDir, expectedProductName) {
  const distBuildPath = path.join(baseDir, 'dist-build');
  const expectedAppName = `${expectedProductName}.app`;

  if (!existsSync(distBuildPath)) {
    return path.join('dist-build', 'mac-arm64', expectedAppName);
  }

  const matches = [];
  const stack = [distBuildPath];
  while (stack.length > 0) {
    const current = stack.pop();
    let entries = [];
    try {
      entries = readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      const entryPath = path.join(current, entry.name);
      if (entry.isDirectory() && entry.name === expectedAppName) {
        matches.push(entryPath);
        continue;
      }
      if (entry.isDirectory() && !entry.name.endsWith('.app')) {
        stack.push(entryPath);
      }
    }
  }

  matches.sort();
  return matches[0] ?? path.join('dist-build', 'mac-arm64', expectedAppName);
}

function mustExist(filePath, label) {
  if (!existsSync(filePath)) {
    failures.push(`Missing ${label}: ${path.relative(root, filePath)}`);
  }
}

function verifyInfoPlist(filePath) {
  const parsed = plist.parse(readFileSync(filePath, 'utf8'));
  expectEqual(parsed.CFBundleName, productName, 'CFBundleName');
  expectEqual(parsed.CFBundleDisplayName, productName, 'CFBundleDisplayName');
  expectEqual(parsed.CFBundleExecutable, productName, 'CFBundleExecutable');
  expectEqual(parsed.CFBundleIdentifier, appId, 'CFBundleIdentifier');
  expectEqual(parsed.CFBundleShortVersionString, version, 'CFBundleShortVersionString');
  expectEqual(parsed.CFBundleVersion, version, 'CFBundleVersion');

  if (!String(parsed.NSHumanReadableCopyright ?? '').includes(productName)) {
    failures.push(`NSHumanReadableCopyright must include ${productName}.`);
  }

  if (parsed.LSApplicationCategoryType !== 'public.app-category.developer-tools') {
    failures.push('LSApplicationCategoryType must be public.app-category.developer-tools.');
  }
}

function verifyExecutable(filePath) {
  const mode = statSync(filePath).mode;
  if ((mode & 0o111) === 0) {
    failures.push(`App executable is not executable: ${path.relative(root, filePath)}`);
  }
}

function verifyAsar(filePath) {
  const size = statSync(filePath).size;
  if (size < 1_000_000) {
    failures.push(`app.asar is unexpectedly small: ${size} bytes.`);
  }
}

function verifyUpdateConfig(filePath) {
  const text = readFileSync(filePath, 'utf8');
  if (!text.includes('provider: github') && !text.includes('provider: generic')) {
    failures.push('app-update.yml must include an electron-updater provider.');
  }
  if (!text.includes('code-agent')) {
    warnings.push('app-update.yml does not mention the code-agent release repository.');
  }
}

function verifyNoLegacyProviderTerms(files) {
  const terms = [
    ['Anth', 'ropic'].join(''),
    ['anth', 'ropic'].join(''),
    ['Cl', 'aude'].join(''),
    ['cl', 'aude'].join(''),
    ['@anth', 'ropic-ai'].join(''),
  ];

  for (const filePath of files) {
    const text = readFileSync(filePath, 'utf8');
    for (const term of terms) {
      if (text.includes(term)) {
        failures.push(`Legacy provider term found in ${path.relative(root, filePath)}.`);
      }
    }
  }
}

function verifyCodesign(targetPath) {
  const verify = run('codesign', ['--verify', '--deep', '--strict', '--verbose=2', targetPath]);
  if (verify.status !== 0) {
    failures.push(`codesign verification failed:\n${verify.output}`);
    return;
  }

  const details = run('codesign', ['-dv', '--verbose=4', targetPath]);
  if (details.status !== 0) {
    failures.push(`Unable to read codesign details:\n${details.output}`);
    return;
  }

  if (options.release && !details.output.includes('Authority=Developer ID Application:')) {
    failures.push('Release verification requires a Developer ID Application signature.');
  } else if (!details.output.includes('Authority=Developer ID Application:')) {
    warnings.push('App is not signed with a Developer ID Application certificate; this is acceptable for local packages only.');
  }

  if (!details.output.includes('flags=0x10000(runtime)')) {
    failures.push('Code signature must enable the hardened runtime.');
  }
}

function verifyGatekeeper(targetPath) {
  const shouldRequire = options.release || options.requireNotarized;
  const result = run('spctl', ['--assess', '--type', 'execute', '--verbose=4', targetPath]);
  if (result.status !== 0 && shouldRequire) {
    failures.push(`Gatekeeper assessment failed:\n${result.output}`);
  } else if (result.status !== 0) {
    warnings.push('Gatekeeper assessment failed; notarization is still required before public distribution.');
  }
}

function run(command, commandArgs) {
  const result = spawnSync(command, commandArgs, {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  return {
    status: result.status ?? (result.error ? 1 : 0),
    output: `${result.stdout ?? ''}${result.stderr ?? ''}`.trim(),
  };
}

function expectEqual(actual, expected, label) {
  if (actual !== expected) {
    failures.push(`${label} must be ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}.`);
  }
}
