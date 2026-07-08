#!/usr/bin/env node

import { mkdir, writeFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const distElectronDir = path.join(rootDir, 'dist-electron');

await mkdir(distElectronDir, { recursive: true });
await writeFile(
  path.join(distElectronDir, 'package.json'),
  `${JSON.stringify({ type: 'commonjs', main: 'main.js' }, null, 2)}\n`,
);
