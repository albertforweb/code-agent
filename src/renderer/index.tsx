/**
 * Renderer Process - React DOM Entry Point
 * This is the UI layer that runs in the Electron renderer process
 */

import * as React from 'react';
import ReactDOM from 'react-dom/client';
import { loadInstalledFeaturePackageRenderers } from '../features/load-feature-package-renderers';
import './styles/global.css';

/**
 * Initialize the renderer process
 */
async function initializeRenderer() {
  try {
    await loadInstalledFeaturePackageRenderers(React).catch(error => {
      console.error('Unable to load installed feature package renderers:', error);
    });
    const { App } = await import('./App');
    const root = ReactDOM.createRoot(document.getElementById('root')!);
    // Desktop startup performs real IPC, secure-session restoration, and
    // service hydration. React StrictMode intentionally replays mount effects
    // in development, which can race those one-shot operations and leave the
    // visible tree detached from the successfully loaded persisted config.
    // Service behavior is covered by explicit tests, so mount the desktop app
    // once and keep startup deterministic.
    root.render(<App />);
  } catch (error) {
    console.error('Failed to initialize renderer:', error);
    document.body.innerHTML = '<div style="padding: 20px; color: red;">Failed to initialize application</div>';
  }
}

// Wait for DOM to be ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeRenderer);
} else {
  initializeRenderer();
}
