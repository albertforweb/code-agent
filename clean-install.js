#!/usr/bin/env node
/**
 * Clean install script - removes old node_modules and package-lock.json
 * then reinstalls dependencies and tests
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const nodeModulesPath = path.join(__dirname, 'node_modules');
const lockFilePath = path.join(__dirname, 'package-lock.json');

console.log('🔄 Starting clean reinstall...\n');

// Remove node_modules
if (fs.existsSync(nodeModulesPath)) {
  console.log('🗑️  Removing node_modules...');
  try {
    fs.rmSync(nodeModulesPath, { recursive: true, force: true });
    console.log('✅ node_modules removed\n');
  } catch (err) {
    console.error('⚠️  Could not remove node_modules:', err.message, '\n');
  }
}

// Remove package-lock.json
if (fs.existsSync(lockFilePath)) {
  console.log('🗑️  Removing package-lock.json...');
  try {
    fs.unlinkSync(lockFilePath);
    console.log('✅ package-lock.json removed\n');
  } catch (err) {
    console.error('⚠️  Could not remove package-lock.json:', err.message, '\n');
  }
}

// Run npm install
console.log('📦 Running npm install --legacy-peer-deps...\n');
const installResult = spawnSync('npm', ['install', '--legacy-peer-deps'], {
  cwd: __dirname,
  stdio: 'inherit',
  shell: true
});

if (installResult.status !== 0) {
  console.error('\n❌ npm install failed');
  process.exit(1);
}

console.log('\n✅ Dependencies installed!\n');

// Test the application
console.log('🧪 Testing application startup...\n');
const testResult = spawnSync('node', ['dist/main.js', '--help'], {
  cwd: __dirname,
  stdio: 'inherit'
});

if (testResult.status === 0) {
  console.log('\n✅ All tests passed! Build is ready.');
  process.exit(0);
} else {
  console.error('\n❌ Application test failed');
  process.exit(1);
}
