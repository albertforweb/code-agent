#!/usr/bin/env node
/**
 * Create all necessary bun stubs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

console.log('🔧 Creating bun module stubs...\n');

// Create bun directory
const bunDir = path.join(__dirname, 'node_modules', 'bun');
fs.mkdirSync(bunDir, { recursive: true });
console.log(`✓ Created directory: ${bunDir}`);

// Create index.js
fs.writeFileSync(path.join(bunDir, 'index.js'), `// Bun runtime shims for Node.js compatibility
import crypto from 'crypto';
import { execSync, spawn as childSpawn } from 'child_process';
import fs from 'fs';

export function hash(input) {
  const hashObj = crypto.createHash('sha256');
  if (typeof input === 'string') {
    hashObj.update(input);
  } else {
    hashObj.update(input);
  }
  return hashObj.digest('hex');
}

export function gc(fullCollect) {
  if (globalThis.gc) {
    globalThis.gc(fullCollect);
  }
}

export function which(command) {
  try {
    const result = execSync(\`which \${command}\`, { encoding: 'utf-8' }).trim();
    return result || null;
  } catch {
    return null;
  }
}

export function spawn(command, args, options) {
  return childSpawn(command, args || [], options || {});
}

export const file = {
  read: (filePath) => fs.readFileSync(filePath),
  write: (filePath, data) => fs.writeFileSync(filePath, data),
  exists: (filePath) => fs.existsSync(filePath),
};

export function stringWidth(str) {
  return str.replace(/\\x1b\\[[0-9;]*m/g, '').length;
}

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
  hash,
  gc,
  which,
  spawn,
  file,
  stringWidth,
  wrapAnsi,
  semver,
};
`);
console.log('✓ Created: index.js');

// Create bundle.js
fs.writeFileSync(path.join(bunDir, 'bundle.js'), `// Bun bundle module
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
`);
console.log('✓ Created: bundle.js');

// Create package.json
fs.writeFileSync(path.join(bunDir, 'package.json'), JSON.stringify({
  name: 'bun',
  version: '1.0.0',
  type: 'module',
  main: './index.js',
  exports: {
    '.': './index.js',
    './bundle': './bundle.js'
  }
}, null, 2));
console.log('✓ Created: package.json');

console.log('\n✅ Bun module stubs created successfully!');
console.log('\n🧪 Testing application...\n');

// Test the application
import { spawnSync } from 'child_process';
const result = spawnSync('node', ['dist/main.js', '--help'], {
  cwd: __dirname,
  stdio: 'inherit'
});

if (result.status === 0) {
  console.log('\n✅ SUCCESS! Application works!\n');
  process.exit(0);
} else {
  console.log('\n❌ Application test failed with status:', result.status, '\n');
  process.exit(result.status);
}
