#!/usr/bin/env node
// Direct setup using Node.js file system
import fs from 'fs';
import path from 'path';

const projectRoot = 'c:\\git\\code-agent';

console.log('Creating bun shim module...');

// Create directories
const bunDir = path.join(projectRoot, 'node_modules', 'bun');
fs.mkdirSync(bunDir, { recursive: true });
console.log(`✓ Created ${bunDir}`);

// Bun index.js content
const bunContent = `// Bun runtime shims for Node.js compatibility
import crypto from 'crypto';
import { execSync, spawn as childSpawn } from 'child_process';
import fs from 'fs';
import path from 'path';

// Feature flag system
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
  read: (p) => fs.readFileSync(p),
  write: (p, data) => fs.writeFileSync(p, data),
  exists: (p) => fs.existsSync(p),
};

// String width
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

fs.writeFileSync(path.join(bunDir, 'index.js'), bunContent);
console.log(`✓ Created ${path.join(bunDir, 'index.js')}`);

// Create bundle.js
const bundleContent = `// Bun bundle module
export function feature(name) {
  return {
    enabled: false,
    value: undefined,
  };
}

export function bundle(entries, options) {
  return {
    outputs: [],
  };
}

export default {
  feature,
  bundle,
};
`;

fs.writeFileSync(path.join(bunDir, 'bundle.js'), bundleContent);
console.log(`✓ Created ${path.join(bunDir, 'bundle.js')}`);

// Create package.json for bun
const bunPackageJson = {
  "name": "bun",
  "version": "1.0.0",
  "type": "module",
  "main": "./index.js",
  "exports": {
    ".": "./index.js",
    "./bundle": "./bundle.js"
  }
};

fs.writeFileSync(path.join(bunDir, 'package.json'), JSON.stringify(bunPackageJson, null, 2));
console.log(`✓ Created ${path.join(bunDir, 'package.json')}`);

console.log('\\n✅ All required directories and files created successfully!');
