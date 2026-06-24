#!/usr/bin/env node
// Test script to run node dist/main.js --help and capture all output

import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

console.log('='.repeat(70));
console.log('TEST: Running node dist/main.js --help');
console.log('='.repeat(70));
console.log('');

const proc = spawn('node', ['dist/main.js', '--help'], {
  cwd: __dirname,
  stdio: ['inherit', 'pipe', 'pipe'],
});

let stdout = '';
let stderr = '';

proc.stdout.on('data', (data) => {
  stdout += data.toString();
  process.stdout.write(data);
});

proc.stderr.on('data', (data) => {
  stderr += data.toString();
  process.stderr.write(data);
});

proc.on('close', (code) => {
  console.log('');
  console.log('='.repeat(70));
  console.log(`Process exited with code: ${code}`);
  console.log('='.repeat(70));
  
  if (code !== 0) {
    console.log('');
    console.log('CAPTURED STDERR:');
    console.log(stderr);
  }
  
  process.exit(code);
});

proc.on('error', (err) => {
  console.error('Failed to start process:', err);
  process.exit(1);
});
