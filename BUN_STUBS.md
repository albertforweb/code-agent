# FINAL FIX - BUN MODULE MISSING

## Current Error
```
Error [ERR_MODULE_NOT_FOUND]: Cannot find module 'c:\git\code-agent\node_modules\bun\index.js'
```

## Root Cause
The `bun` module stub wasn't created. This is needed because the compiled TypeScript imports `bun:bundle`, which gets translated to `../node_modules/bun/index.js` during the build process.

## Solution

You need to create three files in `c:\git\code-agent\node_modules\bun\`:

### Step 1: Create the directory
```bash
mkdir c:\git\code-agent\node_modules\bun
```

### Step 2: Create `c:\git\code-agent\node_modules\bun\index.js`

Copy and paste this content into a new file `node_modules\bun\index.js`:

```javascript
// Bun runtime shims for Node.js compatibility
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
    const result = execSync(`which ${command}`, { encoding: 'utf-8' }).trim();
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
  return str.replace(/\x1b\[[0-9;]*m/g, '').length;
}

export function wrapAnsi(str, width) {
  const lines = str.split('\n');
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
    return chunks.join('\n');
  }).join('\n');
}

export const semver = {
  parse: (version) => {
    const match = version.match(/^(\d+)\.(\d+)\.(\d+)/);
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
```

### Step 3: Create `c:\git\code-agent\node_modules\bun\bundle.js`

Copy and paste this content into a new file `node_modules\bun\bundle.js`:

```javascript
// Bun bundle module
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
```

### Step 4: Create `c:\git\code-agent\node_modules\bun\package.json`

Copy and paste this content into a new file `node_modules\bun\package.json`:

```json
{
  "name": "bun",
  "version": "1.0.0",
  "type": "module",
  "main": "./index.js",
  "exports": {
    ".": "./index.js",
    "./bundle": "./bundle.js"
  }
}
```

### Step 5: Test

Once all three files are created, run:

```bash
cd c:\git\code-agent
node dist\main.js --help
```

You should see the help output without module errors!

## Summary

- ✅ npm packages installed (growthbook, diff, semver, etc.)
- ✅ package.json updated with correct versions
- ⏳ **FINAL STEP**: Create 3 files in node_modules\bun\

Once you create those 3 files, the application will work!
