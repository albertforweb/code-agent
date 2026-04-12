#!/usr/bin/env node
/**
 * Complete setup and test script for code-agent
 * This script:
 * 1. Creates the bun shim module (like setup.js does)
 * 2. Runs node dist/main.js --help
 * 3. Reports all output and errors
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync, spawnSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

console.log('='.repeat(80));
console.log('CODE-AGENT SETUP AND TEST');
console.log('='.repeat(80));
console.log('');

// Step 1: Create bun shim module
console.log('📁 Step 1: Creating bun shim module...');
console.log('-'.repeat(80));

const bunDir = path.join(__dirname, 'node_modules', 'bun');
fs.mkdirSync(bunDir, { recursive: true });
console.log(`✓ Created directory: ${bunDir}`);

const bunIndexContent = `// Bun runtime shims for Node.js compatibility
import crypto from 'crypto';
import { execSync, spawn as childSpawn } from 'child_process';
import fs from 'fs';
import path from 'path';

// Feature flag system - returns false for all flags
export function feature(name) {
  return false;
}

// Hash function using Node.js crypto
export function hash(input) {
  const h = crypto.createHash('sha256');
  if (typeof input === 'string') {
    h.update(input);
  } else {
    h.update(input);
  }
  return h.digest('hex');
}

// Garbage collection (no-op in Node.js)
export function gc(fullCollect) {
  if (globalThis.gc) {
    globalThis.gc(fullCollect);
  }
}

// Which - find executable in PATH
export function which(command) {
  try {
    const result = execSync(\`which \${command}\`, { encoding: 'utf-8' }).trim();
    return result || null;
  } catch {
    return null;
  }
}

// Spawn process
export function spawn(command, args, options) {
  return childSpawn(command, args || [], options || {});
}

// File system operations
export const file = {
  read: (filePath) => fs.readFileSync(filePath),
  write: (filePath, data) => fs.writeFileSync(filePath, data),
  exists: (filePath) => fs.existsSync(filePath),
};

// String width (for terminal formatting)
export function stringWidth(str) {
  return str.replace(/\\x1b\\[[0-9;]*m/g, '').length;
}

// Wrap ANSI strings
export function wrapAnsi(str, width) {
  const lines = str.split('\\n');
  return lines.map(line => {
    if (line.length <= width) return line;
    const chunks = [];
    let currentLine = '';
    for (const char of line) {
      if (currentLine.length >= width) {
        chunks.push(currentLine);
        currentLine = '';
      }
      currentLine += char;
    }
    if (currentLine) chunks.push(currentLine);
    return chunks.join('\\n');
  }).join('\\n');
}

// Semver operations
export const semver = {
  parse: (version) => {
    const match = version.match(/^(\\d+)\\.(\\d+)\\.(\\d+)/);
    if (!match) return null;
    return {
      major: parseInt(match[1]),
      minor: parseInt(match[2]),
      patch: parseInt(match[3]),
    };
  },
  gte: (version, target) => {
    const v = semver.parse(version);
    const t = semver.parse(target);
    if (!v || !t) return false;
    return (
      v.major > t.major ||
      (v.major === t.major && v.minor > t.minor) ||
      (v.major === t.major && v.minor === t.minor && v.patch >= t.patch)
    );
  },
};

// Default exports for common patterns
export default {
  feature,
  hash,
  gc,
  which,
  spawn,
  file,
  stringWidth,
  wrapAnsi,
  semver,
};

// Global Bun object
(globalThis).Bun = {
  feature,
  hash,
  gc,
  which,
  spawn,
  file,
  stringWidth,
  wrapAnsi,
  semver,
};
`;

fs.writeFileSync(path.join(bunDir, 'index.js'), bunIndexContent);
console.log(`✓ Created: ${path.join(bunDir, 'index.js')}`);

const bunPackageJson = JSON.stringify({
  "name": "bun",
  "version": "1.0.0",
  "type": "module",
  "main": "./index.js",
  "exports": {
    ".": "./index.js",
    "./bundle": "./bundle.js"
  }
}, null, 2);

fs.writeFileSync(path.join(bunDir, 'package.json'), bunPackageJson);
console.log(`✓ Created: ${path.join(bunDir, 'package.json')}`);

console.log('');

// Step 2: Create growthbook stub
console.log('📁 Step 2: Creating @growthbook/growthbook stub...');
console.log('-'.repeat(80));

const growthbookDir = path.join(__dirname, 'node_modules', '@growthbook', 'growthbook');
fs.mkdirSync(growthbookDir, { recursive: true });

const growthbookContent = `// GrowthBook stub for Node.js compatibility
export class GrowthBook {
  constructor(options) {
    this.options = options;
  }
  
  setAttributes(attrs) {
    // no-op
  }
  
  getFeatureValue(key, fallback) {
    return fallback;
  }
  
  evalFeature(key) {
    return {
      value: null,
      on: false,
      off: true,
      ruleId: null,
    };
  }
}

export default GrowthBook;
`;

fs.writeFileSync(path.join(growthbookDir, 'index.js'), growthbookContent);
console.log(`✓ Created: ${path.join(growthbookDir, 'index.js')}`);

const growthbookPackageJson = JSON.stringify({
  "name": "@growthbook/growthbook",
  "version": "1.0.0",
  "type": "module",
  "main": "./index.js"
}, null, 2);

fs.writeFileSync(path.join(growthbookDir, 'package.json'), growthbookPackageJson);
console.log(`✓ Created: ${path.join(growthbookDir, 'package.json')}`);

console.log('');

// Step 3: Run the application with --help
console.log('🚀 Step 3: Running application with --help...');
console.log('='.repeat(80));
console.log('');

try {
  const result = spawnSync('node', ['dist/main.js', '--help'], {
    cwd: __dirname,
    encoding: 'utf-8',
    stdio: 'inherit',
    timeout: 30000
  });
  
  console.log('');
  console.log('='.repeat(80));
  console.log(`EXIT CODE: ${result.status}`);
  console.log('='.repeat(80));
  
  if (result.status === 0) {
    console.log('✅ Application ran successfully!');
  } else {
    console.log('⚠️  Application exited with an error code');
    if (result.stderr) {
      console.log('');
      console.log('STDERR:');
      console.log(result.stderr);
    }
    if (result.stdout) {
      console.log('');
      console.log('STDOUT:');
      console.log(result.stdout);
    }
  }
  
  process.exit(result.status || 0);
} catch (error) {
  console.log('');
  console.log('='.repeat(80));
  console.log('❌ ERROR RUNNING APPLICATION');
  console.log('='.repeat(80));
  console.log('');
  console.log('Error:', error.message);
  process.exit(1);
}
