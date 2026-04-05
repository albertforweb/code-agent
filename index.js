#!/usr/bin/env node

/**
 * This is a stub entry point for the built application.
 * After running `npm run build`, the compiled main.js will be available in dist/
 */

import('./dist/main.js').catch(err => {
  console.error('Failed to load main module:', err);
  process.exit(1);
});
