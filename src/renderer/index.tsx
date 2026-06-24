/**
 * Renderer Process - React DOM Entry Point
 * This is the UI layer that runs in the Electron renderer process
 */

import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import './styles/global.css';

// Declare the API for TypeScript
declare global {
  interface Window {
    api: any;
  }
}

/**
 * Initialize the renderer process
 */
async function initializeRenderer() {
  try {
    // Get app info from main process
    const info = await window.api.app.getConfig();
    console.log('App config:', info);

    // Render the app
    const root = ReactDOM.createRoot(document.getElementById('root')!);
    root.render(
      <React.StrictMode>
        <App />
      </React.StrictMode>
    );
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
