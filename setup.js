#!/usr/bin/env node
// Setup script to create required directories and files before build

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const projectRoot = __dirname;

// Create proactive module directory structure
const proactiveDir = path.join(projectRoot, 'proactive');
if (!fs.existsSync(proactiveDir)) {
  fs.mkdirSync(proactiveDir, { recursive: true });
  console.log(`✓ Created ${proactiveDir}`);
}

// Create bun shim directory
const bunDir = path.join(projectRoot, 'node_modules', 'bun');
if (!fs.existsSync(bunDir)) {
  fs.mkdirSync(bunDir, { recursive: true });
  console.log(`✓ Created ${bunDir}`);
}

// Write proactive/index.ts
const proactiveIndexPath = path.join(proactiveDir, 'index.ts');
const proactiveContent = `// Proactive module - provides proactive agent functionality
export interface ProactiveConfig {
  enabled: boolean;
  triggers?: Record<string, any>;
}

export function initializeProactive(config?: ProactiveConfig): void {
  // Stub implementation
}

export function isProactiveEnabled(): boolean {
  return false;
}

export default {
  initializeProactive,
  isProactiveEnabled,
};
`;

fs.writeFileSync(proactiveIndexPath, proactiveContent);
console.log(`✓ Created ${proactiveIndexPath}`);

// Write bun/index.ts shim
const bunIndexPath = path.join(bunDir, 'index.ts');
const bunIndexJsPath = path.join(bunDir, 'index.js');
const bunContent = `// Bun runtime shims for Node.js compatibility
import crypto from 'crypto';
import { execSync, spawn as childSpawn } from 'child_process';
import fs from 'fs';
import path from 'path';

// Hash function using Node.js crypto
export function hash(input) {
  const hash = crypto.createHash('sha256');
  if (typeof input === 'string') {
    hash.update(input);
  } else {
    hash.update(input);
  }
  return hash.digest('hex');
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
  read: (path) => fs.readFileSync(path),
  write: (path, data) => fs.writeFileSync(path, data),
  exists: (path) => fs.existsSync(path),
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

fs.writeFileSync(bunIndexPath, bunContent);
fs.writeFileSync(bunIndexJsPath, bunContent);
console.log(`✓ Created ${bunIndexPath}`);
console.log(`✓ Created ${bunIndexJsPath}`);

// Write bun/bundle.ts - the main bundle module
const bunBundlePath = path.join(bunDir, 'bundle.ts');
const bunBundleJsPath = path.join(bunDir, 'bundle.js');
const bunBundleContent = `// Bun bundle module - exports feature bundling utilities
export function feature(name) {
  // Stub implementation - returns a no-op feature object
  return {
    enabled: false,
    value: undefined,
  };
}

export function bundle(entries, options) {
  // Stub implementation
  return {
    outputs: [],
  };
}

export default {
  feature,
  bundle,
};
`;

fs.writeFileSync(bunBundlePath, bunBundleContent);
fs.writeFileSync(bunBundleJsPath, bunBundleContent);
console.log(`✓ Created ${bunBundlePath}`);
console.log(`✓ Created ${bunBundleJsPath}`);

// Write package.json for bun module so it can be resolved as a package
const bunPackageJsonPath = path.join(bunDir, 'package.json');
const bunPackageJsonContent = JSON.stringify({
  "name": "bun",
  "version": "1.0.0",
  "type": "module",
  "main": "./index.js",
  "exports": {
    ".": "./index.js",
    "./bundle": "./bundle.js"
  }
}, null, 2);

fs.writeFileSync(bunPackageJsonPath, bunPackageJsonContent);
console.log(`✓ Created ${bunPackageJsonPath}`);

// Create @growthbook/growthbook stub
const growthbookDir = path.join(projectRoot, 'node_modules', '@growthbook', 'growthbook');
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

const growthbookPath = path.join(growthbookDir, 'index.js');
fs.writeFileSync(growthbookPath, growthbookContent);
console.log(`✓ Created ${growthbookPath}`);

// Create @growthbook/growthbook package.json
const growthbookPackageJson = JSON.stringify({
  "name": "@growthbook/growthbook",
  "version": "1.0.0",
  "type": "module",
  "main": "./index.js"
}, null, 2);

const growthbookPackageJsonPath = path.join(growthbookDir, 'package.json');
fs.writeFileSync(growthbookPackageJsonPath, growthbookPackageJson);
console.log(`✓ Created ${growthbookPackageJsonPath}`);

console.log('\\n✅ All required directories and files created successfully!');

