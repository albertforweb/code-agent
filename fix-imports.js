#!/usr/bin/env node
// Post-build script to fix ES module imports in dist/

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.join(__dirname, 'dist');

console.log('🔧 Post-build: Fixing ES module imports in dist/');

let totalFixed = 0;

const runtimeSpecifiers = new Map([
  ['react', 'runtime/react/esm-wrapper.js'],
  ['react/compiler-runtime', 'runtime/react/compiler-runtime.js'],
  ['@codeagent/browser-control-mcp', 'runtime/optional/browser-control-mcp.js'],
  ['@codeagent/computer-use-mcp', 'runtime/optional/computer-use-mcp/index.js'],
  ['@codeagent/computer-use-mcp/sentinelApps', 'runtime/optional/computer-use-mcp/sentinelApps.js'],
  ['@codeagent/computer-use-mcp/types', 'runtime/optional/computer-use-mcp/types.js'],
  ['@codeagent/computer-use-input', 'runtime/optional/computer-use-input.js'],
  ['@codeagent/computer-use-swift', 'runtime/optional/computer-use-swift.js'],
  ['audio-capture-napi', 'runtime/optional/audio-capture-napi.js'],
  ['color-diff-napi', 'runtime/optional/color-diff-napi.js'],
  ['image-processor-napi', 'runtime/optional/image-processor-napi.js'],
  ['modifiers-napi', 'runtime/optional/modifiers-napi.js'],
  ['url-handler-napi', 'runtime/optional/url-handler-napi.js'],
]);

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function replaceModuleSpecifier(content, specifier, replacement) {
  const escaped = escapeRegExp(specifier);
  let next = content;
  next = next.replace(
    new RegExp(`from ['"]${escaped}['"]`, 'g'),
    `from '${replacement}'`,
  );
  next = next.replace(
    new RegExp(`import\\(\\s*['"]${escaped}['"]\\s*\\)`, 'g'),
    `import('${replacement}')`,
  );
  next = next.replace(
    new RegExp(`require\\(\\s*['"]${escaped}['"]\\s*\\)`, 'g'),
    `require('${replacement}')`,
  );
  return next;
}

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

    // 2. Replace bun runtime imports with package-owned runtime shims.
    const bunBundlePath = `${goBackToDist}runtime/bun/index.js`;
    content = content.replace(/from ['"]bun:bundle['"]/g, `from '${bunBundlePath}'`);

    // 3. Replace other bun:* imports
    content = content.replace(/from ['"]bun:([a-z-]+)['"]/g, (match, module) => {
      const modulePath = `${goBackToDist}runtime/bun/${module}.js`;
      return `from '${modulePath}'`;
    });

    // 4. Replace optional generated-node-module package imports with local runtime shims.
    // Runtime shims may intentionally load real dependency entrypoints with createRequire.
    if (!relative.startsWith(`runtime${path.sep}`)) {
      for (const [specifier, target] of runtimeSpecifiers) {
        content = replaceModuleSpecifier(content, specifier, `${goBackToDist}${target}`);
      }
    }

    // 5. Normalize TSX/JSX specifiers to emitted .js files for Node ESM.
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
      const runtimeSpecifierCount = Array.from(runtimeSpecifiers.keys()).reduce(
        (count, specifier) => count + (original.match(new RegExp(escapeRegExp(specifier), 'g')) || []).length,
        0,
      );
      const tsxJsxCount =
        (original.match(/from ['"][^'"]+\.(?:tsx|jsx)['"]/g) || []).length +
        (original.match(/import\s*\(\s*['"][^'"]+\.(?:tsx|jsx)['"]\s*\)/g) || []).length;
      const count = srcCount + bunBundleCount + bunOtherCount + runtimeSpecifierCount + tsxJsxCount;
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
