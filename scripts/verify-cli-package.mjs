#!/usr/bin/env node

import { spawnSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const repoRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const packageJsonPath = path.join(repoRoot, 'package.json');
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'code-agent-cli-pack-'));
const extractDir = path.join(tempDir, 'extract');

const requiredPackageFiles = [
  'package/package.json',
  'package/README.md',
  'package/dist/entrypoints/cli.js',
  'package/dist/runtime/react/esm-wrapper.js',
  'package/dist/runtime/react/compiler-runtime.js',
  'package/dist/runtime/bun/index.js',
  'package/dist/runtime/optional/color-diff-napi.js',
  'package/dist/runtime/optional/browser-control-mcp.js',
  'package/dist/runtime/optional/computer-use-mcp/index.js',
];

const forbiddenPackagePrefixes = [
  'package/.github/',
  'package/electron/',
  'package/node_modules/',
  'package/dist-build/',
  'package/dist-electron/',
  'package/dist-renderer/',
  'package/renderer/',
];

const disallowedContentTerms = [
  { label: 'legacy provider company name', value: ['anth', 'ropic'].join('') },
  { label: 'legacy model brand name', value: ['clau', 'de'].join('') },
  { label: 'legacy provider SDK namespace', value: ['@', 'anth', 'ropic-ai'].join('') },
  { label: 'legacy optional package namespace', value: ['@', 'a', 'nt/'].join('') },
];

const textExtensions = new Set([
  '.cjs',
  '.css',
  '.d.ts',
  '.html',
  '.js',
  '.json',
  '.md',
  '.mjs',
  '.txt',
]);

function fail(message) {
  console.error(`ERROR: ${message}`);
  process.exit(1);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    encoding: 'utf8',
    ...options,
  });
  if (result.status !== 0) {
    const output = [result.stdout, result.stderr].filter(Boolean).join('\n');
    fail(`${command} ${args.join(' ')} failed${output ? `\n${output}` : ''}`);
  }
  return result;
}

function parseNpmJson(stdout) {
  const start = stdout.indexOf('[');
  const end = stdout.lastIndexOf(']');
  if (start === -1 || end === -1 || end < start) {
    fail(`npm pack did not return JSON output:\n${stdout}`);
  }
  return JSON.parse(stdout.slice(start, end + 1));
}

function listFiles(root) {
  const files = [];
  function visit(current) {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const entryPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        visit(entryPath);
      } else if (entry.isFile()) {
        files.push(entryPath);
      }
    }
  }
  visit(root);
  return files;
}

function assertPackageMetadata() {
  if (packageJson.name !== 'code-agent') {
    fail(`expected package name code-agent, got ${packageJson.name}`);
  }
  if (packageJson.bin?.['code-agent'] !== 'dist/entrypoints/cli.js') {
    fail('package bin must expose code-agent at dist/entrypoints/cli.js');
  }
  if (packageJson.bin?.codeagent !== 'dist/entrypoints/cli.js') {
    fail('package bin must expose codeagent at dist/entrypoints/cli.js');
  }
  if (!packageJson.files?.some(entry => entry === 'dist' || entry === 'dist/' || entry === 'dist/**')) {
    fail('package.json files must include dist for the compiled CLI payload');
  }
}

function assertBuildOutput() {
  const cliPath = path.join(repoRoot, 'dist', 'entrypoints', 'cli.js');
  if (!fs.existsSync(cliPath)) {
    fail('dist/entrypoints/cli.js is missing. Run npm run build first.');
  }
  const firstLine = fs.readFileSync(cliPath, 'utf8').split('\n')[0];
  if (firstLine !== '#!/usr/bin/env node') {
    fail('dist/entrypoints/cli.js must start with a Node shebang');
  }
  for (const relativePath of [
    'dist/runtime/bun/index.js',
    'dist/runtime/react/esm-wrapper.js',
    'dist/runtime/react/compiler-runtime.js',
    'dist/runtime/optional/color-diff-napi.js',
    'dist/runtime/optional/browser-control-mcp.js',
    'dist/runtime/optional/computer-use-mcp/index.js',
  ]) {
    if (!fs.existsSync(path.join(repoRoot, relativePath))) {
      fail(`${relativePath} is missing from build output`);
    }
  }
}

function assertCliSmoke() {
  const result = run(process.execPath, ['dist/entrypoints/cli.js', '--version']);
  if (!result.stdout.includes(`${packageJson.version} (CodeAgent)`)) {
    fail(`unexpected CLI version output: ${result.stdout.trim()}`);
  }

  const featuresResult = run(process.execPath, ['dist/entrypoints/cli.js', 'features', 'packages']);
  if (!featuresResult.stdout.includes('software-developer') || !featuresResult.stdout.includes('locked')) {
    fail(`unexpected default CLI features output: ${featuresResult.stdout.trim()}`);
  }

  const developerFeaturesResult = run(process.execPath, ['dist/entrypoints/cli.js', 'features', 'list'], {
    env: {
      ...process.env,
      CODEAGENT_FEATURE_LOCAL_DEV_OVERRIDE: 'true',
    },
  });
  if (!developerFeaturesResult.stdout.includes('project-studio') || !developerFeaturesResult.stdout.includes('software-developer')) {
    fail(`unexpected CLI developer features output: ${developerFeaturesResult.stdout.trim()}`);
  }
}

function assertTarball(tarballPath) {
  const listResult = run('tar', ['-tzf', tarballPath]);
  const entries = listResult.stdout.trim().split('\n').filter(Boolean);
  const entrySet = new Set(entries);

  for (const requiredFile of requiredPackageFiles) {
    if (!entrySet.has(requiredFile)) {
      fail(`npm package is missing ${requiredFile}`);
    }
  }

  for (const prefix of forbiddenPackagePrefixes) {
    const match = entries.find(entry => entry.startsWith(prefix));
    if (match) {
      fail(`npm package includes forbidden path ${match}`);
    }
  }

  fs.mkdirSync(extractDir, { recursive: true });
  run('tar', ['-xzf', tarballPath, '-C', extractDir]);
  scanExtractedContent(path.join(extractDir, 'package'));
}

function assertIsolatedInstall(tarballPath) {
  const installPrefix = path.join(tempDir, 'install-prefix');
  run('npm', ['install', '-g', '--prefix', installPrefix, tarballPath], {
    cwd: tempDir,
  });

  const binPath = path.join(installPrefix, 'bin', 'code-agent');
  const versionResult = run(binPath, ['--version'], { cwd: tempDir });
  if (!versionResult.stdout.includes(`${packageJson.version} (CodeAgent)`)) {
    fail(`unexpected installed CLI version output: ${versionResult.stdout.trim()}`);
  }

  const helpResult = run(binPath, ['--help'], { cwd: tempDir });
  const firstHelpLine = helpResult.stdout.trim().split('\n')[0];
  if (!firstHelpLine?.startsWith('Usage: code-agent ')) {
    fail(`unexpected installed CLI help output: ${firstHelpLine}`);
  }

  const aliasBinPath = path.join(installPrefix, 'bin', 'codeagent');
  const aliasVersionResult = run(aliasBinPath, ['--version'], { cwd: tempDir });
  if (!aliasVersionResult.stdout.includes(`${packageJson.version} (CodeAgent)`)) {
    fail(`unexpected installed CLI alias version output: ${aliasVersionResult.stdout.trim()}`);
  }

  const featuresResult = run(binPath, ['features', 'packages'], { cwd: tempDir });
  if (!featuresResult.stdout.includes('software-developer') || !featuresResult.stdout.includes('locked')) {
    fail(`unexpected installed CLI features output: ${featuresResult.stdout.trim()}`);
  }
}

function scanExtractedContent(packageRoot) {
  for (const filePath of listFiles(packageRoot)) {
    const ext = path.extname(filePath);
    if (!textExtensions.has(ext)) continue;

    const relativePath = path.relative(packageRoot, filePath);
    const content = fs.readFileSync(filePath, 'utf8').toLowerCase();
    for (const term of disallowedContentTerms) {
      if (content.includes(term.value.toLowerCase())) {
        fail(`npm package contains ${term.label} in ${relativePath}`);
      }
    }
  }
}

try {
  assertPackageMetadata();
  assertBuildOutput();
  assertCliSmoke();

  const packResult = run('npm', [
    'pack',
    '--json',
    '--pack-destination',
    tempDir,
  ]);
  const [packInfo] = parseNpmJson(packResult.stdout);
  if (!packInfo?.filename) {
    fail('npm pack output did not include a filename');
  }

  const tarballPath = path.join(tempDir, packInfo.filename);
  assertTarball(tarballPath);
  assertIsolatedInstall(tarballPath);

  console.log(`CLI package verified: ${packInfo.filename}`);
  console.log(`Entries: ${packInfo.entryCount}, size: ${packInfo.size} bytes`);
  console.log('Isolated install smoke passed');
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}
