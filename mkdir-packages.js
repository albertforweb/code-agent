#!/usr/bin/env node
import fs from 'fs';
import path from 'path';

const baseDir = 'c:\\git\\code-agent\\node_modules';

// Create directories
const dirs = [
  '@growthbook\\growthbook',
  'diff',
  'ws', 
  'semver',
  'strip-ansi',
  'wrap-ansi'
];

dirs.forEach(dir => {
  const fullPath = path.join(baseDir, dir);
  if (!fs.existsSync(fullPath)) {
    fs.mkdirSync(fullPath, { recursive: true });
    console.log(`Created: ${fullPath}`);
  }
});

console.log('Done creating directories');
