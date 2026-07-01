#!/usr/bin/env node

import { build } from 'esbuild';
import { cp, mkdir, rm } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(rootDir, 'dist-renderer');
const isProduction = process.env.NODE_ENV === 'production';

await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });

await build({
  entryPoints: [path.join(rootDir, 'src/renderer/index.tsx')],
  bundle: true,
  outfile: path.join(outDir, 'index.js'),
  platform: 'browser',
  format: 'iife',
  sourcemap: !isProduction,
  target: ['chrome120'],
  loader: {
    '.css': 'css',
    '.module.css': 'local-css',
  },
  logLevel: 'info',
});

await cp(
  path.join(rootDir, 'src/renderer/index.html'),
  path.join(outDir, 'index.html'),
);
