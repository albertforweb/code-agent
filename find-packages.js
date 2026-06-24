#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const packages = new Set();
const importRegex = /^import .* from ['"]([^./][^'"]*)['"]/gm;

function scanDir(dir) {
  try {
    const files = fs.readdirSync(dir);
    for (const file of files) {
      const fullPath = path.join(dir, file);
      const stat = fs.statSync(fullPath);
      
      if (stat.isDirectory()) {
        if (file !== 'node_modules') {
          scanDir(fullPath);
        }
      } else if (file.endsWith('.js')) {
        try {
          const content = fs.readFileSync(fullPath, 'utf-8');
          let match;
          while ((match = importRegex.exec(content)) !== null) {
            let pkg = match[1];
            // Get package name (handle @scope/package)
            if (pkg.startsWith('@')) {
              pkg = pkg.split('/').slice(0, 2).join('/');
            } else {
              pkg = pkg.split('/')[0];
            }
            packages.add(pkg);
          }
        } catch (err) {
          // Skip read errors
        }
      }
    }
  } catch (err) {
    // Skip directory errors
  }
}

scanDir(path.join(__dirname, 'dist'));

console.log('Packages used in dist/:');
Array.from(packages)
  .sort()
  .forEach(pkg => console.log(`  - ${pkg}`));
