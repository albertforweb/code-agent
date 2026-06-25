#!/usr/bin/env node
// Setup script to create required directories and files before build

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const projectRoot = __dirname;

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function writeStubFile(filePath, content) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, content);
  console.log(`âœ“ Created ${filePath}`);
}

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
import semverPkg from 'semver';

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
  parse: (version) => semverPkg.parse(version, { loose: true }),
  gte: (version, target) => semverPkg.gte(version, target, { loose: true }),
  satisfies: (version, range) => semverPkg.satisfies(version, range, { loose: true }),
  order: (a, b) => semverPkg.compare(a, b, { loose: true }),
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

writeStubFile(
  path.join(projectRoot, 'node_modules', '@ant', 'claude-for-chrome-mcp', 'index.js'),
  `export const BROWSER_TOOLS = [];
export function createClaudeForChromeMcpServer() {
  return {
    setRequestHandler() {},
    async connect() {},
  };
}
`,
);
writeStubFile(
  path.join(projectRoot, 'node_modules', '@ant', 'claude-for-chrome-mcp', 'package.json'),
  JSON.stringify({
    name: '@ant/claude-for-chrome-mcp',
    version: '0.0.0-stub',
    type: 'module',
    main: './index.js',
    exports: { '.': './index.js' },
  }, null, 2),
);
writeStubFile(
  path.join(projectRoot, 'node_modules', '@ant', 'computer-use-mcp', 'index.js'),
  `export const DEFAULT_GRANT_FLAGS = {};
export const API_RESIZE_PARAMS = {};
export function targetImageSize() { return { width: 0, height: 0 }; }
export function buildComputerUseTools() { return []; }
export function bindSessionContext() {}
export function createComputerUseMcpServer() {
  return { setRequestHandler() {}, async connect() {} };
}
`,
);
writeStubFile(
  path.join(projectRoot, 'node_modules', '@ant', 'computer-use-mcp', 'sentinelApps.js'),
  `export function getSentinelCategory() { return undefined; }\n`,
);
writeStubFile(
  path.join(projectRoot, 'node_modules', '@ant', 'computer-use-mcp', 'types.js'),
  `export const DEFAULT_GRANT_FLAGS = {};\n`,
);
writeStubFile(
  path.join(projectRoot, 'node_modules', '@ant', 'computer-use-mcp', 'package.json'),
  JSON.stringify({
    name: '@ant/computer-use-mcp',
    version: '0.0.0-stub',
    type: 'module',
    main: './index.js',
    exports: {
      '.': './index.js',
      './sentinelApps': './sentinelApps.js',
      './types': './types.js',
    },
  }, null, 2),
);
writeStubFile(
  path.join(projectRoot, 'node_modules', '@ant', 'computer-use-input', 'index.js'),
  `export default {};
export function isSupported() { return false; }
`,
);
writeStubFile(
  path.join(projectRoot, 'node_modules', '@ant', 'computer-use-input', 'package.json'),
  JSON.stringify({
    name: '@ant/computer-use-input',
    version: '0.0.0-stub',
    type: 'module',
    main: './index.js',
    exports: { '.': './index.js' },
  }, null, 2),
);
writeStubFile(
  path.join(projectRoot, 'node_modules', '@ant', 'computer-use-swift', 'index.js'),
  `export default {};\n`,
);
writeStubFile(
  path.join(projectRoot, 'node_modules', '@ant', 'computer-use-swift', 'package.json'),
  JSON.stringify({
    name: '@ant/computer-use-swift',
    version: '0.0.0-stub',
    type: 'module',
    main: './index.js',
    exports: { '.': './index.js' },
  }, null, 2),
);

writeStubFile(
  path.join(projectRoot, 'node_modules', '@anthropic-ai', 'sandbox-runtime', 'index.js'),
  `class StubSandboxViolationStore {}
class StubSandboxManager {
  static checkDependencies() { return { available: false, reason: 'sandbox runtime stub' }; }
  static isSupportedPlatform() { return false; }
  static wrapWithSandbox(command) { return command; }
  static async initialize() {}
  static updateConfig() {}
  static async reset() {}
  static getFsReadConfig() { return undefined; }
  static getFsWriteConfig() { return undefined; }
  static getNetworkRestrictionConfig() { return undefined; }
  static getIgnoreViolations() { return undefined; }
  static getAllowUnixSockets() { return false; }
  static getAllowLocalBinding() { return false; }
  static getEnableWeakerNestedSandbox() { return false; }
  static getProxyPort() { return undefined; }
  static getSocksProxyPort() { return undefined; }
  static getLinuxHttpSocketPath() { return undefined; }
  static getLinuxSocksSocketPath() { return undefined; }
  static async waitForNetworkInitialization() {}
  static getSandboxViolationStore() { return undefined; }
  static annotateStderrWithSandboxFailures(stderr) { return stderr; }
  static cleanupAfterCommand() {}
}
export const SandboxManager = StubSandboxManager;
export const SandboxRuntimeConfigSchema = { parse(value) { return value; } };
export const SandboxViolationStore = StubSandboxViolationStore;
`,
);
writeStubFile(
  path.join(projectRoot, 'node_modules', '@anthropic-ai', 'sandbox-runtime', 'package.json'),
  JSON.stringify({
    name: '@anthropic-ai/sandbox-runtime',
    version: '0.0.0-stub',
    type: 'module',
    main: './index.js',
    exports: { '.': './index.js' },
  }, null, 2),
);

writeStubFile(
  path.join(projectRoot, 'node_modules', 'react', 'compiler-runtime.js'),
  `const sentinel = Symbol.for("react.memo_cache_sentinel");
export function c(size) { return new Array(size).fill(sentinel); }
`,
);
writeStubFile(
  path.join(projectRoot, 'node_modules', 'react', 'esm-wrapper.mjs'),
  `import React from './index.js';

const unsupported = name => () => {
  throw new Error(\`\${name} is unavailable in the installed React runtime\`);
};

export default React;
export const Children = React.Children;
export const Component = React.Component;
export const Fragment = React.Fragment;
export const Profiler = React.Profiler;
export const PureComponent = React.PureComponent;
export const StrictMode = React.StrictMode;
export const Suspense = React.Suspense;
export const cloneElement = React.cloneElement;
export const createContext = React.createContext;
export const createElement = React.createElement;
export const createFactory = React.createFactory;
export const createRef = React.createRef;
export const forwardRef = React.forwardRef;
export const isValidElement = React.isValidElement;
export const lazy = React.lazy;
export const memo = React.memo;
export const startTransition = React.startTransition;
export const use = React.use ?? unsupported('React.use');
export const useActionState = React.useActionState ?? unsupported('React.useActionState');
export const useCallback = React.useCallback;
export const useContext = React.useContext;
export const useDebugValue = React.useDebugValue;
export const useDeferredValue = React.useDeferredValue;
export const useEffect = React.useEffect;
export const useEffectEvent = React.useEffectEvent ?? ((fn) => fn);
export const useId = React.useId;
export const useImperativeHandle = React.useImperativeHandle;
export const useInsertionEffect = React.useInsertionEffect ?? React.useLayoutEffect;
export const useLayoutEffect = React.useLayoutEffect;
export const useMemo = React.useMemo;
export const useOptimistic = React.useOptimistic ?? ((value) => [value, () => {}]);
export const useReducer = React.useReducer;
export const useRef = React.useRef;
export const useState = React.useState;
export const useSyncExternalStore = React.useSyncExternalStore;
export const useTransition = React.useTransition;
export const version = React.version;
`,
);
writeStubFile(
  path.join(projectRoot, 'node_modules', 'color-diff-napi', 'index.js'),
  `export class ColorDiff {}
export class ColorFile {}
export function getSyntaxTheme() { return null; }
`,
);
writeStubFile(
  path.join(projectRoot, 'node_modules', 'color-diff-napi', 'package.json'),
  JSON.stringify({
    name: 'color-diff-napi',
    version: '0.0.0-stub',
    type: 'module',
    main: './index.js',
    exports: { '.': './index.js' },
  }, null, 2),
);
writeStubFile(
  path.join(projectRoot, 'node_modules', 'image-processor-napi', 'index.js'),
  `export function getNativeModule() { return null; }
export const sharp = null;
export default null;
`,
);
writeStubFile(
  path.join(projectRoot, 'node_modules', 'image-processor-napi', 'package.json'),
  JSON.stringify({
    name: 'image-processor-napi',
    version: '0.0.0-stub',
    type: 'module',
    main: './index.js',
    exports: { '.': './index.js' },
  }, null, 2),
);
writeStubFile(
  path.join(projectRoot, 'node_modules', 'url-handler-napi', 'index.js'),
  `export function waitForUrlEvent() { return null; }\n`,
);
writeStubFile(
  path.join(projectRoot, 'node_modules', 'url-handler-napi', 'package.json'),
  JSON.stringify({
    name: 'url-handler-napi',
    version: '0.0.0-stub',
    type: 'module',
    main: './index.js',
    exports: { '.': './index.js' },
  }, null, 2),
);
writeStubFile(
  path.join(projectRoot, 'node_modules', 'audio-capture-napi', 'index.js'),
  `export function isNativeAudioAvailable() { return false; }
export function startRecording() { throw new Error('audio capture unavailable'); }
export function stopRecording() { return null; }
export default { isNativeAudioAvailable, startRecording, stopRecording };
`,
);
writeStubFile(
  path.join(projectRoot, 'node_modules', 'audio-capture-napi', 'package.json'),
  JSON.stringify({
    name: 'audio-capture-napi',
    version: '0.0.0-stub',
    type: 'module',
    main: './index.js',
    exports: { '.': './index.js' },
  }, null, 2),
);
writeStubFile(
  path.join(projectRoot, 'node_modules', 'modifiers-napi', 'index.js'),
  `export function prewarm() {}
export function isModifierPressed() { return false; }
`,
);
writeStubFile(
  path.join(projectRoot, 'node_modules', 'modifiers-napi', 'package.json'),
  JSON.stringify({
    name: 'modifiers-napi',
    version: '0.0.0-stub',
    type: 'module',
    main: './index.js',
    exports: { '.': './index.js' },
  }, null, 2),
);
const reactPackageJsonPath = path.join(projectRoot, 'node_modules', 'react', 'package.json');
if (fs.existsSync(reactPackageJsonPath)) {
  try {
    const reactPackage = JSON.parse(fs.readFileSync(reactPackageJsonPath, 'utf8'));
    reactPackage.exports = reactPackage.exports || {};
    if (typeof reactPackage.exports['.'] === 'string') {
      reactPackage.exports['.'] = {
        import: './esm-wrapper.mjs',
        require: './index.js',
        default: './index.js',
      };
    } else {
      reactPackage.exports['.'] = {
        import: './esm-wrapper.mjs',
        require: './index.js',
        default: './index.js',
        ...Object.fromEntries(
          Object.entries(reactPackage.exports['.'] || {}).filter(
            ([key]) => !['import', 'require', 'default'].includes(key),
          ),
        ),
      };
    }
    reactPackage.exports['./compiler-runtime'] = './compiler-runtime.js';
    fs.writeFileSync(reactPackageJsonPath, JSON.stringify(reactPackage, null, 2));
    console.log(`âœ“ Created ${reactPackageJsonPath}`);
  } catch {}
}

console.log('\\n✅ All required directories and files created successfully!');

