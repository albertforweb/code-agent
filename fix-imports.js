#!/usr/bin/env node
// Post-build script to fix ES module imports in dist/

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.join(__dirname, 'dist');

console.log('🔧 Post-build: Fixing ES module imports in dist/');

let totalFixed = 0;

function walkDir(dir) {
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walkDir(fullPath);
      } else if (entry.name.endsWith('.js')) {
        fixFile(fullPath);
      }
    }
  } catch (err) {
    console.error(`❌ Error reading directory ${dir}:`, err.message);
  }
}

function fixFile(filePath) {
  try {
    let content = fs.readFileSync(filePath, 'utf-8');
    const original = content;
    
    // Get depth of this file from dist/
    const distPath = path.normalize(distDir) + path.sep;
    const filePath_norm = path.normalize(filePath);
    const relative = path.relative(distPath, filePath_norm);
    const parts = relative.split(path.sep);
    const depth = parts.length - 1;
    
    // Build the path to go back to project root (parent of dist/)
    const goBackToDist = depth === 0 ? './' : '../'.repeat(depth);
    
    // 1. Replace src/ imports with relative paths
    // src was mapped to . in tsconfig, so src/services/foo → services/foo
    // From dist/main.js (depth 0), services/foo is at ./services/foo
    // From dist/cli/cmd.js (depth 1), services/foo is at ../services/foo
    content = content.replace(/from ['"]src\//g, `from '${goBackToDist}`);
    content = content.replace(/import\(\s*['"]src\//g, `import('${goBackToDist}`);
    
    // 2. Replace bun:bundle with path to node_modules/bun
    // e.g., from 'bun:bundle' → from '../node_modules/bun/index.js' (or ../../node_modules depending on depth)
    // depth 0 (dist/main.js) → ../ ; depth 1 (dist/cli/cmd.js) → ../../ ; etc.
    const bunBundlePath = '../'.repeat(depth + 1) + 'node_modules/bun/index.js';
    content = content.replace(/from ['"]bun:bundle['"]/g, `from '${bunBundlePath}'`);
    
    // 3. Replace other bun:* imports
    // e.g., from 'bun:fs' → from '../node_modules/bun/fs.js'
    content = content.replace(/from ['"]bun:([a-z-]+)['"]/g, (match, module) => {
      const modulePath = '../'.repeat(depth + 1) + `node_modules/bun/${module}.js`;
      return `from '${modulePath}'`;
    });

    // 4. Normalize TSX/JSX specifiers to emitted .js files for Node ESM.
    content = content.replace(/(from\s+['"][^'"]+)\.tsx(['"])/g, '$1.js$2');
    content = content.replace(/(from\s+['"][^'"]+)\.jsx(['"])/g, '$1.js$2');
    content = content.replace(/(import\s*\(\s*['"][^'"]+)\.tsx(['"]\s*\))/g, '$1.js$2');
    content = content.replace(/(import\s*\(\s*['"][^'"]+)\.jsx(['"]\s*\))/g, '$1.js$2');
    
    if (content !== original) {
      fs.writeFileSync(filePath, content);
      const srcCount =
        (original.match(/from ['"]src\//g) || []).length +
        (original.match(/import\(\s*['"]src\//g) || []).length;
      const bunBundleCount = (original.match(/from ['"]bun:bundle['"]/g) || []).length;
      const bunOtherCount = (original.match(/from ['"]bun:[a-z-]+['"]/g) || []).length;
      const tsxJsxCount =
        (original.match(/from ['"][^'"]+\.(?:tsx|jsx)['"]/g) || []).length +
        (original.match(/import\s*\(\s*['"][^'"]+\.(?:tsx|jsx)['"]\s*\)/g) || []).length;
      const count = srcCount + bunBundleCount + bunOtherCount + tsxJsxCount;
      totalFixed += count;
      if (count > 0) {
        console.log(`  ✓ Fixed ${count} imports in ${path.relative(__dirname, filePath)}`);
      }
    }
  } catch (err) {
    console.error(`❌ Error processing file ${filePath}:`, err.message);
  }
}

try {
  if (!fs.existsSync(distDir)) {
    console.log('⚠️  dist/ directory not found. Skipping import fixes.');
    process.exit(0);
  }

  walkDir(distDir);
  console.log(`\n✅ Total imports fixed: ${totalFixed}`);
} catch (err) {
  console.error('❌ Fatal error:', err.message);
  process.exit(1);
}
