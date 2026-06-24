#!/usr/bin/env python3
"""
Setup script for code-agent - creates necessary directories and files
This is an alternative to the Node.js setup.js script
"""

import os
import json
from pathlib import Path

project_root = r'c:\git\code-agent'
os.chdir(project_root)

print("\n" + "="*60)
print("  CREATING SETUP FILES FOR CODE-AGENT")
print("="*60 + "\n")

# Create directories
directories = [
    r'node_modules\bun',
    r'node_modules\@growthbook\growthbook',
    'proactive',
]

for directory in directories:
    os.makedirs(directory, exist_ok=True)
    print(f"✓ Created {os.path.join(project_root, directory)}")

print()

# Create bun/index.js
bun_index_content = '''// Bun runtime shims for Node.js compatibility
import crypto from 'crypto';
import { execSync, spawn as childSpawn } from 'child_process';
import fs from 'fs';
import path from 'path';

// Feature flag system
export function feature(name) {
  // Stub implementation - returns false for all feature flags
  // This is safe because it means all optional features are disabled
  return false;
}

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
    const result = execSync(`which ${command}`, { encoding: 'utf-8' }).trim();
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
'''

with open(r'node_modules\bun\index.js', 'w', encoding='utf-8') as f:
    f.write(bun_index_content)
print(f"✓ Created node_modules\\bun\\index.js")

# Create bun/index.ts (same content)
with open(r'node_modules\bun\index.ts', 'w', encoding='utf-8') as f:
    f.write(bun_index_content)
print(f"✓ Created node_modules\\bun\\index.ts")

# Create bun/bundle.js
bundle_content = '''// Bun bundle module - exports feature bundling utilities
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
'''

with open(r'node_modules\bun\bundle.js', 'w', encoding='utf-8') as f:
    f.write(bundle_content)
print(f"✓ Created node_modules\\bun\\bundle.js")

# Create bun/bundle.ts (same content)
with open(r'node_modules\bun\bundle.ts', 'w', encoding='utf-8') as f:
    f.write(bundle_content)
print(f"✓ Created node_modules\\bun\\bundle.ts")

# Create bun/package.json
bun_package = {
    "name": "bun",
    "version": "1.0.0",
    "type": "module",
    "main": "./index.js",
    "exports": {
        ".": "./index.js",
        "./bundle": "./bundle.js"
    }
}

with open(r'node_modules\bun\package.json', 'w', encoding='utf-8') as f:
    json.dump(bun_package, f, indent=2)
print(f"✓ Created node_modules\\bun\\package.json")

# Create proactive/index.ts
proactive_content = '''// Proactive module - provides proactive agent functionality
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
'''

with open(r'proactive\index.ts', 'w', encoding='utf-8') as f:
    f.write(proactive_content)
print(f"✓ Created proactive\\index.ts")

# Create @growthbook/growthbook/index.js
growthbook_content = '''// GrowthBook stub for Node.js compatibility
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
'''

with open(r'node_modules\@growthbook\growthbook\index.js', 'w', encoding='utf-8') as f:
    f.write(growthbook_content)
print(f"✓ Created node_modules\\@growthbook\\growthbook\\index.js")

# Create @growthbook/growthbook/package.json
growthbook_package = {
    "name": "@growthbook/growthbook",
    "version": "1.0.0",
    "type": "module",
    "main": "./index.js"
}

with open(r'node_modules\@growthbook\growthbook\package.json', 'w', encoding='utf-8') as f:
    json.dump(growthbook_package, f, indent=2)
print(f"✓ Created node_modules\\@growthbook\\growthbook\\package.json")

print()
print("="*60)
print("✅ All required directories and files created successfully!")
print("="*60)
print()
print("Created files:")
print(" - node_modules/bun/index.js")
print(" - node_modules/bun/index.ts")
print(" - node_modules/bun/bundle.js")
print(" - node_modules/bun/bundle.ts")
print(" - node_modules/bun/package.json")
print(" - node_modules/@growthbook/growthbook/index.js")
print(" - node_modules/@growthbook/growthbook/package.json")
print(" - proactive/index.ts")
print()
print("The application is now ready to run!")
print()
