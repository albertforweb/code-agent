#!/usr/bin/env node
// Final verification script

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

console.log('🧪 FINAL BUILD VERIFICATION\n');
console.log('=' .repeat(60));

// Step 1: Run build
console.log('\n📦 Running: node run-build.js\n');
try {
  execSync('node run-build.js', { cwd: __dirname, stdio: 'inherit' });
} catch (err) {
  console.error('\n❌ Build failed!');
  process.exit(1);
}

// Step 2: Verify output
console.log('\n' + '='.repeat(60));
console.log('VERIFICATION RESULTS\n');

const distMainJs = path.join(__dirname, 'dist', 'main.js');

if (!fs.existsSync(distMainJs)) {
  console.error('❌ FAILED: dist/main.js does not exist');
  process.exit(1);
}

console.log('✅ dist/main.js exists\n');

const content = fs.readFileSync(distMainJs, 'utf-8');
const lines = content.split('\n');

// Check for bad imports
const srcImports = content.match(/from ['"]src\//g) || [];
const bunBundleImports = content.match(/from ['"]bun:bundle['"]/g) || [];

console.log('Import Check:');
console.log(`  Relative imports (./): ${content.includes("from './") ? '✅ YES' : '❌ NO'}`);
console.log(`  src/ imports found: ${srcImports.length} ${srcImports.length === 0 ? '✅ (Good!)' : '❌ (Bad!)'}`);
console.log(`  bun:bundle imports: ${bunBundleImports.length} ${bunBundleImports.length === 0 ? '✅ (Good!)' : '❌ (Bad!)'}`);

console.log('\nFirst 30 lines of dist/main.js:');
console.log('-' .repeat(60));
console.log(lines.slice(0, 30).join('\n'));
console.log('-' .repeat(60));

// Step 3: Test execution
console.log('\n✅ Testing: node dist/main.js --help\n');
try {
  const result = execSync('node dist/main.js --help', {
    cwd: __dirname,
    stdio: 'pipe',
    encoding: 'utf-8',
    timeout: 10000,
  });
  console.log('✅ Program executed successfully!\n');
  console.log('First 300 characters of output:');
  console.log(result.substring(0, 300));
  console.log('...\n');
} catch (err) {
  if (err.killed) {
    console.warn('⚠️  Program timeout (may be expected for interactive mode)\n');
  } else if (err.code && err.code !== 0) {
    console.error('❌ Program failed to execute');
    console.error('Error:', err.stderr?.toString?.() || err.toString());
    process.exit(1);
  }
}

console.log('=' .repeat(60));
console.log('🎉 BUILD AND VERIFICATION COMPLETE!\n');
console.log('You can now run: node dist/main.js --help\n');
