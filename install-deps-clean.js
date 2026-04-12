#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const lockFilePath = path.join(__dirname, 'package-lock.json');

console.log('🔄 Removing outdated package-lock.json...');
try {
  if (fs.existsSync(lockFilePath)) {
    fs.unlinkSync(lockFilePath);
    console.log('✅ Removed package-lock.json\n');
  }
} catch (err) {
  console.error('⚠️  Could not delete package-lock.json:', err.message);
}

console.log('📦 Installing dependencies with npm install --legacy-peer-deps\n');

import { spawnSync } from 'child_process';

const result = spawnSync('npm', ['install', '--legacy-peer-deps'], {
  cwd: __dirname,
  stdio: 'inherit',
  shell: true
});

if (result.status === 0) {
  console.log('\n✅ Dependencies installed successfully!\n');
  console.log('🧪 Testing application...\n');
  
  const testResult = spawnSync('node', ['dist/main.js', '--help'], {
    cwd: __dirname,
    stdio: 'inherit'
  });
  
  if (testResult.status === 0) {
    console.log('\n✅ Application test passed!');
    process.exit(0);
  } else {
    console.error('\n❌ Application test failed');
    process.exit(1);
  }
} else {
  console.error('\n❌ npm install failed');
  process.exit(1);
}
