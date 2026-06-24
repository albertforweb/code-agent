#!/usr/bin/env node
import { execSync } from 'child_process';
import fs from 'fs';

try {
  console.log('Installing dependencies with npm install --legacy-peer-deps...\n');
  execSync('npm install --legacy-peer-deps', { cwd: process.cwd(), stdio: 'inherit' });
  
  console.log('\n✅ Dependencies installed!\n');
  console.log('Testing the application...\n');
  
  // Test if the main file runs
  execSync('node dist/main.js --help', { cwd: process.cwd(), stdio: 'inherit' });
  
  console.log('\n✅ All tests passed!');
} catch (err) {
  console.error('\n❌ Error:', err.message);
  process.exit(1);
}
