#!/usr/bin/env node

import { mkdirSync, readdirSync, rmSync } from 'node:fs';
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

if (result.status !== 0) {
  process.stdout.write(result.stdout ?? '');
  process.stderr.write(result.stderr ?? '');
  process.exit(result.status ?? 1);
}

const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
process.stdout.write(output);

const tarball = output
  .split('\n')
  .map(line => line.trim())
  .find(line => /^code-agent-.*\.tgz$/.test(line));

if (tarball) {
  console.log(`CLI package artifact: ${path.relative(root, path.join(outputDir, tarball))}`);
}
