#!/usr/bin/env node
/**
 * Test the application and show exact error if it fails
 */
import { spawnSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

console.log('🧪 Testing application: node dist/main.js --help\n');
console.log('='.repeat(60) + '\n');

const result = spawnSync('node', ['dist/main.js', '--help'], {
  cwd: __dirname,
  stdio: 'inherit'
});

console.log('\n' + '='.repeat(60));

if (result.status === 0) {
  console.log('\n✅ SUCCESS! Application works without errors.\n');
} else {
  console.log(`\n❌ Application exited with status: ${result.status}\n`);
  console.log('This usually means a module is still missing.\n');
}

process.exit(result.status);
