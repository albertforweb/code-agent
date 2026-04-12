import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Simple setup that creates all necessary files
async function setup() {
    try {
        const projectRoot = __dirname;
        
        console.log('\n' + '='.repeat(60));
        console.log('  SETTING UP CODE-AGENT ENVIRONMENT');
        console.log('='.repeat(60) + '\n');
        
        // Create directories
        const bunDir = path.join(projectRoot, 'node_modules', 'bun');
        const growthbookDir = path.join(projectRoot, 'node_modules', '@growthbook', 'growthbook');
        const proactiveDir = path.join(projectRoot, 'proactive');
        
        // Ensure directories exist
        [bunDir, growthbookDir, proactiveDir].forEach(dir => {
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
                console.log(`✓ Created ${dir}`);
            } else {
                console.log(`✓ Directory already exists: ${dir}`);
            }
        });
        
        console.log();
        
        // Create bun shim files
        const bunIndexContent = `// Bun runtime shims for Node.js compatibility
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
  read: (filePath) => fs.readFileSync(filePath),
  write: (filePath, data) => fs.writeFileSync(filePath, data),
  exists: (filePath) => fs.existsSync(filePath),
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
        
        fs.writeFileSync(path.join(bunDir, 'index.js'), bunIndexContent);
        console.log('✓ Created node_modules/bun/index.js');
        
        fs.writeFileSync(path.join(bunDir, 'index.ts'), bunIndexContent);
        console.log('✓ Created node_modules/bun/index.ts');
        
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
        console.log('✓ Created node_modules/bun/bundle.js');
        
        fs.writeFileSync(path.join(bunDir, 'bundle.ts'), bundleContent);
        console.log('✓ Created node_modules/bun/bundle.ts');
        
        const bunPackageJson = {
            name: 'bun',
            version: '1.0.0',
            type: 'module',
            main: './index.js',
            exports: {
                '.': './index.js',
                './bundle': './bundle.js'
            }
        };
        
        fs.writeFileSync(path.join(bunDir, 'package.json'), JSON.stringify(bunPackageJson, null, 2));
        console.log('✓ Created node_modules/bun/package.json');
        
        console.log();
        
        // Create proactive/index.ts
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
        
        fs.writeFileSync(path.join(proactiveDir, 'index.ts'), proactiveContent);
        console.log('✓ Created proactive/index.ts');
        
        console.log();
        
        // Create GrowthBook stub
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
        console.log('✓ Created node_modules/@growthbook/growthbook/index.js');
        
        const growthbookPackageJson = {
            name: '@growthbook/growthbook',
            version: '1.0.0',
            type: 'module',
            main: './index.js'
        };
        
        fs.writeFileSync(path.join(growthbookDir, 'package.json'), JSON.stringify(growthbookPackageJson, null, 2));
        console.log('✓ Created node_modules/@growthbook/growthbook/package.json');
        
        console.log();
        console.log('='.repeat(60));
        console.log('✅ ALL REQUIRED FILES CREATED SUCCESSFULLY!');
        console.log('='.repeat(60));
        console.log();
        console.log('Created:');
        console.log('  1. node_modules/bun/index.js');
        console.log('  2. node_modules/bun/index.ts');
        console.log('  3. node_modules/bun/bundle.js');
        console.log('  4. node_modules/bun/bundle.ts');
        console.log('  5. node_modules/bun/package.json');
        console.log('  6. node_modules/@growthbook/growthbook/index.js');
        console.log('  7. node_modules/@growthbook/growthbook/package.json');
        console.log('  8. proactive/index.ts');
        console.log();
        console.log('The application is ready to run!');
        console.log();
        
        process.exit(0);
    } catch (error) {
        console.error('\n❌ SETUP FAILED!');
        console.error('Error:', error.message);
        console.error(error.stack);
        process.exit(1);
    }
}

setup();
