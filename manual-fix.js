#!/usr/bin/env node
// Manual fix runner - execute fix-imports.js

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

console.log('Running fix-imports.js manually...\n');

try {
  // Run fix-imports
  execSync('node fix-imports.js', { cwd: __dirname, stdio: 'inherit' });
  
  console.log('\n\n=== VERIFICATION ===\n');
  
  // Check first 100 lines of main.js
  const mainJs = path.join(__dirname, 'dist', 'main.js');
  const content = fs.readFileSync(mainJs, 'utf-8');
  const lines = content.split('\n');
  
  console.log('First 100 lines of dist/main.js:\n');
  console.log(lines.slice(0, 100).join('\n'));
  
  console.log('\n\n=== CHECKING FOR UNFIXED IMPORTS ===\n');
  
  const srcMatches = (content.match(/from ['"]src\//g) || []).length;
  const bunMatches = (content.match(/from ['"]bun:bundle['"]/g) || []).length;
  
  console.log(`src/ imports found: ${srcMatches} (should be 0)`);
  console.log(`bun:bundle imports found: ${bunMatches} (should be 0)`);
  
  if (srcMatches === 0 && bunMatches === 0) {
    console.log('\n✅ ALL IMPORTS FIXED!\n');
  } else {
    console.log('\n❌ SOME IMPORTS STILL UNFIXED\n');
  }
  
} catch (err) {
  console.error('Error:', err.message);
}
