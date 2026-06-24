#!/usr/bin/env node
// Install dependencies and test
import { execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

console.log('📦 Installing npm dependencies...\n');

try {
  execSync('npm install --legacy-peer-deps', { 
    cwd: __dirname,
    stdio: 'inherit'
  });
  console.log('\n✅ Dependencies installed successfully!\n');
} catch (err) {
  console.error('\n❌ npm install failed');
  process.exit(1);
}

console.log('🧪 Testing application startup...\n');

try {
  execSync('node dist/main.js --help', {
    cwd: __dirname,
    stdio: 'inherit'
  });
  console.log('\n✅ Application started successfully!');
} catch (err) {
  console.error('\n❌ Application test failed');
  process.exit(1);
}
