#!/usr/bin/env node
// Comprehensive test and log script

import { execSync, spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const testLogPath = path.join(__dirname, 'test.log');
const output = [];

function log(message) {
  console.log(message);
  output.push(message);
}

function logSection(title) {
  const border = '='.repeat(70);
  log('\n' + border);
  log(title);
  log(border + '\n');
}

try {
  logSection('TEST 1: Running Build (node run-build.js)');
  log('Command: node run-build.js\n');
  
  try {
    const result = execSync('node run-build.js 2>&1', { 
      cwd: __dirname,
      encoding: 'utf-8',
      maxBuffer: 10 * 1024 * 1024
    });
    log(result);
    log('✅ Build completed\n');
  } catch (err) {
    log('❌ Build failed or had errors:\n');
    log(err.stdout?.toString?.() || err.toString());
    log('\n');
  }

  logSection('TEST 2: Checking if dist/main.js exists');
  const distMainJs = path.join(__dirname, 'dist', 'main.js');
  if (fs.existsSync(distMainJs)) {
    log(`✅ File exists: ${distMainJs}`);
    const stats = fs.statSync(distMainJs);
    log(`   Size: ${stats.size} bytes`);
    log(`   Modified: ${stats.mtime}\n`);
  } else {
    log(`❌ File NOT found: ${distMainJs}\n`);
  }

  logSection('TEST 3: First 50 lines of dist/main.js');
  if (fs.existsSync(distMainJs)) {
    const content = fs.readFileSync(distMainJs, 'utf-8');
    const lines = content.split('\n').slice(0, 50);
    log(lines.join('\n'));
    log('\n');
  } else {
    log('⚠️  Skipped - dist/main.js does not exist\n');
  }

  logSection('TEST 4: Checking for unfixed src/ imports');
  if (fs.existsSync(distMainJs)) {
    const content = fs.readFileSync(distMainJs, 'utf-8');
    const srcMatches = content.match(/from ['"]src\//g) || [];
    log(`Found ${srcMatches.length} src/ imports (should be 0)`);
    
    if (srcMatches.length > 0) {
      log('❌ BAD: src/ imports still exist!\n');
      log('First 5 matches:');
      const lines = content.split('\n');
      let count = 0;
      for (const line of lines) {
        if (/from ['"]src\//.test(line) && count < 5) {
          log(`  ${line.trim()}`);
          count++;
        }
      }
    } else {
      log('✅ GOOD: No src/ imports found\n');
    }
  } else {
    log('⚠️  Skipped - dist/main.js does not exist\n');
  }

  logSection('TEST 5: Checking for unfixed bun:bundle imports');
  if (fs.existsSync(distMainJs)) {
    const content = fs.readFileSync(distMainJs, 'utf-8');
    const bunMatches = content.match(/from ['"]bun:bundle['"]/g) || [];
    log(`Found ${bunMatches.length} bun:bundle imports (should be 0)`);
    
    if (bunMatches.length > 0) {
      log('❌ BAD: bun:bundle imports still exist!\n');
    } else {
      log('✅ GOOD: No bun:bundle imports found\n');
    }
  } else {
    log('⚠️  Skipped - dist/main.js does not exist\n');
  }

  logSection('TEST 6: Checking for any unfixed bun: imports');
  if (fs.existsSync(distMainJs)) {
    const content = fs.readFileSync(distMainJs, 'utf-8');
    const bunMatches = content.match(/from ['"]bun:[a-z-]+['"]/g) || [];
    // Filter out expected ones from node_modules
    const unfixed = bunMatches.filter(m => !m.includes('node_modules'));
    log(`Found ${unfixed.length} unfixed bun:* imports (should be 0)`);
    
    if (unfixed.length > 0) {
      log('❌ BAD: Some bun:* imports may be unfixed!\n');
    } else {
      log('✅ GOOD: All bun:* imports appear to be fixed\n');
    }
  } else {
    log('⚠️  Skipped - dist/main.js does not exist\n');
  }

  logSection('TEST 7: Verifying relative imports exist');
  if (fs.existsSync(distMainJs)) {
    const content = fs.readFileSync(distMainJs, 'utf-8');
    const relativeCount = (content.match(/from ['"]\.\//g) || []).length;
    log(`Found ${relativeCount} relative imports like from './'`);
    
    if (relativeCount > 0) {
      log('✅ GOOD: Relative imports are present\n');
    } else {
      log('❌ BAD: No relative imports found!\n');
    }
  } else {
    log('⚠️  Skipped - dist/main.js does not exist\n');
  }

  logSection('TEST 8: Executing: node dist/main.js --help');
  log('Attempting to run the compiled program...\n');
  
  if (fs.existsSync(distMainJs)) {
    try {
      const result = spawnSync('node', ['dist/main.js', '--help'], {
        cwd: __dirname,
        encoding: 'utf-8',
        timeout: 10000,
        maxBuffer: 10 * 1024 * 1024
      });
      
      if (result.error) {
        log(`❌ Execution failed: ${result.error.message}\n`);
      } else if (result.status !== 0 && result.status !== null) {
        log(`⚠️  Program exited with code ${result.status}\n`);
        if (result.stderr) {
          log('STDERR:\n' + result.stderr);
        }
        if (result.stdout) {
          log('STDOUT:\n' + result.stdout.substring(0, 2000));
        }
      } else {
        log('✅ Program executed successfully!\n');
        log('Output (first 100 lines):\n');
        const lines = (result.stdout || '').split('\n').slice(0, 100);
        log(lines.join('\n'));
      }
    } catch (err) {
      log(`❌ Execution error: ${err.message}\n`);
    }
  } else {
    log('⚠️  Skipped - dist/main.js does not exist\n');
  }

  logSection('SUMMARY');
  log('Build and test execution complete!');
  log('Check the results above to verify everything worked.\n');

} catch (err) {
  log(`\n❌ FATAL ERROR: ${err.message}\n`);
  log(err.stack);
}

// Write to test.log
fs.writeFileSync(testLogPath, output.join('\n'));
console.log(`\n\n✅ Test results saved to: ${testLogPath}`);
