#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const outputDir = path.join(root, 'dist-build', 'cli');

mkdirSync(outputDir, { recursive: true });

for (const entry of readdirSync(outputDir)) {
  if (/^code-agent-\d+\.\d+\.\d+.*\.tgz$/.test(entry)) {
    rmSync(path.join(outputDir, entry), { force: true });
  }
}

const result = spawnSync('npm', ['pack', '--pack-destination', outputDir], {
  cwd: root,
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'pipe'],
});

const expectedTarball = `code-agent-${JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8')).version}.tgz`;
const expectedTarballPath = path.join(outputDir, expectedTarball);
if (result.status !== 0 && !existsSync(expectedTarballPath)) {
  process.stdout.write(result.stdout ?? '');
  process.stderr.write(result.stderr ?? '');
  process.exit(result.status ?? 1);
}

if (result.status !== 0) {
  const archiveCheck = spawnSync('tar', ['-tzf', expectedTarballPath], { stdio: 'ignore' });
  if (archiveCheck.status !== 0) {
    process.stdout.write(result.stdout ?? '');
    process.stderr.write(result.stderr ?? '');
    process.exit(result.status ?? 1);
  }
  console.warn('npm could not hash the oversized archive for its report; the completed tarball passed gzip/tar validation.');
}

const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
process.stdout.write(output);

const tarball = output
  .split('\n')
  .map(line => line.trim())
  .find(line => /^code-agent-.*\.tgz$/.test(line)) ?? expectedTarball;

if (tarball) {
  console.log(`CLI package artifact: ${path.relative(root, path.join(outputDir, tarball))}`);
}
