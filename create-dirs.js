#!/usr/bin/env node
/**
 * Create the missing package directories
 */
import fs from 'fs';
import path from 'path';

const pkgs = [
  { dir: 'c:\\git\\code-agent\\node_modules\\@growthbook\\growthbook', name: '@growthbook/growthbook' },
  { dir: 'c:\\git\\code-agent\\node_modules\\diff', name: 'diff' },
  { dir: 'c:\\git\\code-agent\\node_modules\\semver', name: 'semver' }
];

pkgs.forEach(pkg => {
  if (!fs.existsSync(pkg.dir)) {
    fs.mkdirSync(pkg.dir, { recursive: true });
    console.log(`Created: ${pkg.dir}`);
  } else {
    console.log(`Exists: ${pkg.dir}`);
  }
});

console.log('Done!');
