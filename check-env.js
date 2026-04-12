#!/usr/bin/env node
import { execSync } from 'child_process';

try {
  const version = execSync('node --version').toString();
  console.log('Node version:', version);
  
  // Try to run npm
  const npmVersion = execSync('npm --version').toString();
  console.log('npm version:', npmVersion);
  
  console.log('\n✅ Both node and npm are available!');
  console.log('\nAttempting npm install...\n');
  
  execSync('npm install --legacy-peer-deps', {
    cwd: process.cwd(),
    stdio: 'inherit'
  });
  
  console.log('\n✅ npm install completed!');
} catch (err) {
  console.error('\n❌ Error:', err.message);
}
