#!/usr/bin/env node
/**
 * Diagnostic script to check what's missing
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const nodeModulesDir = path.join(__dirname, 'node_modules');

console.log('📋 NPM Package Status Report\n');
console.log('=' .repeat(50));

const requiredPackages = [
  '@growthbook/growthbook',
  'diff',
  'semver',
  'strip-ansi',
  'wrap-ansi',
  'ws'
];

const installed = [];
const missing = [];

requiredPackages.forEach(pkg => {
  const pkgPath = path.join(nodeModulesDir, pkg);
  const isInstalled = fs.existsSync(pkgPath);
  
  if (isInstalled) {
    installed.push(pkg);
    console.log(`✅ ${pkg}`);
  } else {
    missing.push(pkg);
    console.log(`❌ ${pkg}`);
  }
});

console.log('\n' + '='.repeat(50));
console.log(`\n✅ Installed: ${installed.length}/${requiredPackages.length}`);
console.log(`❌ Missing: ${missing.length}/${requiredPackages.length}`);

if (missing.length > 0) {
  console.log('\n⚠️  Missing packages:');
  missing.forEach(pkg => console.log(`   - ${pkg}`));
  
  console.log('\n💡 To install missing packages, run:');
  console.log('\n   npm install --legacy-peer-deps\n');
  
  process.exit(1);
} else {
  console.log('\n✅ All packages installed! Ready to use.\n');
  process.exit(0);
}
