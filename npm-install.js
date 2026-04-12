#!/usr/bin/env node
/**
 * Direct npm installation using npm CLI
 */
import { execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

try {
  console.log('📦 Installing dependencies...\n');
  
  // Use execSync with cmd shell
  const command = 'npm install --legacy-peer-deps';
  execSync(command, {
    cwd: __dirname,
    stdio: 'inherit',
    shell: 'cmd.exe'
  });
  
  console.log('\n✅ Installation complete!');
  
  // Test
  console.log('\n🧪 Testing application...');
  execSync('node dist\\main.js --help', {
    cwd: __dirname,
    stdio: 'inherit',
    shell: 'cmd.exe'
  });
  
  console.log('\n✅ All tests passed!');
} catch (err) {
  console.error('\n❌ Error:', err.message);
  process.exit(1);
}
